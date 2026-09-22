<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Ticket;
use App\Models\Trip;
use App\Models\User;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class PaymentService
{
    public function __construct(private BookingService $booking) {}

    public function secret(): string
    {
        $secret = (string) config('services.paystack.secret_key');
        abort_if($secret === '', 503, 'Online payments are not configured. Please contact the operator.');
        return $secret;
    }

    private function client(): PendingRequest
    {
        return Http::withToken($this->secret())
            ->acceptJson()
            ->connectTimeout(5)
            ->timeout(20)
            ->baseUrl((string) config('services.paystack.base_url', 'https://api.paystack.co'));
    }

    public static function minorAmount(string $amount): int
    {
        [$whole, $fraction] = array_pad(explode('.', $amount, 2), 2, '00');
        return ((int) $whole * 100) + (int) str_pad(substr($fraction, 0, 2), 2, '0');
    }

    public function initialize(Ticket $ticket, User $user): Ticket
    {
        $this->secret();
        $ticket = DB::transaction(function () use ($ticket) {
            $trip = Trip::lockForUpdate()->find($ticket->trip_id);
            $this->booking->expireHolds($ticket->trip_id);
            $ticket = Ticket::lockForUpdate()->findOrFail($ticket->id);
            abort_unless($trip && $trip->status === 'Scheduled' && $trip->departure_time->isFuture(), 409, 'This trip is no longer available for payment.');
            abort_unless($ticket->status === 'Pending Payment' && $ticket->active_seat !== null, 409, 'This reservation is no longer awaiting payment.');
            if (!$ticket->payment_reference) {
                // Persist the reference before contacting the gateway so a timeout
                // cannot create a payment that our webhook cannot reconcile.
                $ticket->update(['payment_reference' => 'THP-'.Str::uuid()]);
            }
            return $ticket;
        }, 3);
        if ($ticket->payment_authorization_url) {
            return $ticket;
        }
        try {
            $response = $this->client()->post('/transaction/initialize', [
                'email' => $user->email,
                'amount' => self::minorAmount($ticket->amount_due),
                'currency' => 'NGN',
                'reference' => $ticket->payment_reference,
                'callback_url' => config('services.paystack.callback_url'),
                'metadata' => ['ticket_id' => $ticket->id, 'pnr_code' => $ticket->pnr_code],
            ]);
        } catch (ConnectionException) {
            abort(503, 'The payment provider could not be reached. Your reservation and payment reference are saved; check payment status before retrying.');
        }
        $url = $response->json('data.authorization_url');
        abort_unless($response->successful() && $response->json('status') === true && $response->json('data.reference') === $ticket->payment_reference && is_string($url) && filter_var($url, FILTER_VALIDATE_URL) && parse_url($url, PHP_URL_SCHEME) === 'https' && parse_url($url, PHP_URL_HOST) === 'checkout.paystack.com', 502, 'Payment initialization was not completed. Check payment status before retrying.');
        Ticket::whereKey($ticket->id)->update(['payment_authorization_url' => $url]);
        return $ticket->fresh();
    }

    public function verify(Ticket $ticket): Ticket
    {
        if ($ticket->payment_verified_at) {
            return $ticket;
        }
        try {
            $response = $this->client()->get('/transaction/verify/'.rawurlencode($ticket->payment_reference));
        } catch (ConnectionException) {
            abort(503, 'Payment verification is temporarily unavailable. Your payment will also be checked automatically.');
        }
        abort_unless($response->successful() && $response->json('status') === true && is_array($response->json('data')), 502, 'The payment provider could not verify this reference.');
        return $this->confirm($ticket, $response->json('data'));
    }

    public function confirm(Ticket $ticket, array $payment): Ticket
    {
        abort_unless(($payment['status'] ?? null) === 'success', 409, 'The payment has not succeeded. Please check again after completing checkout.');
        abort_unless(($payment['reference'] ?? null) === $ticket->payment_reference, 409, 'The payment reference does not match this reservation.');
        abort_unless(filter_var($payment['amount'] ?? null, FILTER_VALIDATE_INT) !== false && (int) $payment['amount'] === self::minorAmount($ticket->amount_due) && ($payment['currency'] ?? null) === 'NGN', 409, 'The payment amount or currency does not match this reservation. Contact support.');
        abort_unless(isset($payment['id']) && ctype_digit((string) $payment['id']), 409, 'The payment provider transaction ID is missing.');

        $ticket = DB::transaction(function () use ($ticket, $payment) {
            $trip = Trip::lockForUpdate()->find($ticket->trip_id);
            $this->booking->expireHolds($ticket->trip_id);
            $ticket = Ticket::lockForUpdate()->findOrFail($ticket->id);
            if ($ticket->payment_verified_at) {
                return $ticket;
            }
            $canConfirm = $ticket->status === 'Pending Payment' && $ticket->active_seat !== null
                && $trip && $trip->status === 'Scheduled' && $trip->departure_time->isFuture();
            $ticket->update([
                'payment_provider_id' => (string) $payment['id'],
                'payment_verified_at' => now(),
                'fare_paid' => $ticket->amount_due,
                'payment_method' => 'Paystack',
                'status' => $canConfirm ? 'Confirmed' : 'Payment Review',
                'active_seat' => $canConfirm ? $ticket->active_seat : null,
                'expires_at' => null,
            ]);
            AuditLog::create(['user_name' => 'Paystack', 'role' => 'system', 'action' => $canConfirm ? 'Payment confirmed' : 'Late payment requires refund', 'amount' => $ticket->fare_paid, 'details' => $ticket->pnr_code.' / '.$ticket->payment_reference]);
            return $ticket;
        }, 3);

        if ($ticket->status === 'Confirmed') {
            try {
                $ticket->user?->notify(new \App\Notifications\TicketConfirmedNotification($ticket->load(['trip.route', 'trip.bus'])));
            } catch (\Throwable) {}
        }

        return $ticket;
    }

    public function refund(Ticket $ticket, User $actor, array $data): Ticket
    {
        if ($ticket->payment_method !== 'Cash') {
            $this->secret();
        }
        $shouldRequest = false;
        $ticket = DB::transaction(function () use ($ticket, $actor, $data, &$shouldRequest) {
            Trip::lockForUpdate()->find($ticket->trip_id);
            $ticket = Ticket::lockForUpdate()->findOrFail($ticket->id);
            if (in_array($ticket->status, ['Refunded', 'Refund Pending', 'Refund Review'], true)) {
                return $ticket;
            }
            abort_unless(in_array($ticket->status, ['Cancellation Requested', 'Payment Review'], true) && self::minorAmount($ticket->fare_paid) > 0, 409, 'This ticket has no eligible refund request.');
            if ($ticket->payment_method === 'Cash') {
                abort_unless(($data['cash_refund_confirmed'] ?? false) === true, 422, 'Confirm that cash was returned to the passenger before recording a refund.');
                $ticket->update(['status' => 'Refunded', 'refund_status' => 'processed', 'refunded_at' => now(), 'active_seat' => null]);
            } else {
                abort_unless($ticket->payment_reference && $ticket->payment_verified_at, 409, 'This ticket has no verified gateway payment.');
                // Persist before the external operation; ambiguous failures stay in
                // review and cannot accidentally trigger a second refund.
                $ticket->update(['status' => 'Refund Pending', 'refund_status' => 'requested']);
                $shouldRequest = true;
            }
            AuditLog::create(['user_name' => $actor->name, 'role' => $actor->role, 'action' => $ticket->status === 'Refunded' ? 'Cash refund recorded' : 'Refund requested', 'amount' => $ticket->fare_paid, 'details' => $ticket->pnr_code.' / '.$data['reason']]);
            return $ticket;
        }, 3);
        if (!$shouldRequest) {
            return $ticket;
        }
        try {
            $response = $this->client()->post('/refund', ['transaction' => $ticket->payment_reference, 'amount' => self::minorAmount($ticket->fare_paid), 'currency' => 'NGN', 'merchant_note' => $data['reason']]);
        } catch (ConnectionException) {
            Ticket::whereKey($ticket->id)->where('status', 'Refund Pending')->update(['status' => 'Refund Review', 'refund_status' => 'unknown']);
            return $ticket->fresh();
        }
        if (!$response->successful() || $response->json('status') !== true || !is_array($response->json('data'))) {
            Ticket::whereKey($ticket->id)->where('status', 'Refund Pending')->update(['status' => 'Refund Review', 'refund_status' => 'needs-attention']);
            return $ticket->fresh();
        }
        return $this->updateRefund($ticket, $response->json('data'));
    }

    public function updateRefund(Ticket $ticket, array $refund, ?string $eventStatus = null): Ticket
    {
        abort_unless(filter_var($refund['amount'] ?? null, FILTER_VALIDATE_INT) !== false && (int) $refund['amount'] === self::minorAmount($ticket->fare_paid) && ($refund['currency'] ?? null) === 'NGN', 409, 'The refund amount or currency does not match this ticket.');
        abort_unless(isset($refund['id']) && ctype_digit((string) $refund['id']), 409, 'The refund provider ID is missing.');
        $reference = data_get($refund, 'transaction.reference');
        if ($reference !== null) {
            abort_unless($reference === $ticket->payment_reference, 409, 'The refund transaction reference does not match.');
        }
        $status = $eventStatus ?? ($refund['status'] ?? 'pending');

        return DB::transaction(function () use ($ticket, $refund, $status) {
            Trip::lockForUpdate()->find($ticket->trip_id);
            $ticket = Ticket::lockForUpdate()->findOrFail($ticket->id);
            if ($ticket->status === 'Refunded') {
                return $ticket;
            }
            if ($ticket->refund_provider_id) {
                abort_unless($ticket->refund_provider_id === (string) $refund['id'], 409, 'This ticket has a different refund reference.');
            }
            abort_unless($ticket->payment_verified_at && in_array($ticket->status, ['Cancellation Requested', 'Payment Review', 'Refund Pending', 'Refund Review'], true), 409, 'This ticket is not awaiting a refund.');
            $ticket->refund_provider_id = (string) $refund['id'];
            $ticket->refund_status = $status;
            if ($status === 'processed') {
                $ticket->status = 'Refunded';
                $ticket->active_seat = null;
                $ticket->refunded_at = now();
                AuditLog::create(['user_name' => 'Paystack', 'role' => 'system', 'action' => 'Refund completed', 'amount' => $ticket->fare_paid, 'details' => $ticket->pnr_code.' / '.$ticket->refund_provider_id]);
            } else {
                $ticket->status = in_array($status, ['failed', 'needs-attention'], true) ? 'Refund Review' : 'Refund Pending';
            }
            $ticket->save();
            return $ticket;
        }, 3);
    }
}
