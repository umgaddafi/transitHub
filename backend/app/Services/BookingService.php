<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Ticket;
use App\Models\Trip;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

class BookingService
{
    public static function rules(): array
    {
        return [
            'trip_id' => 'required|integer|exists:trips,id',
            'seat_number' => 'required|integer|min:1|max:1000',
            'passenger_name' => 'required|string|max:120',
            'passenger_phone' => ['required', 'string', 'regex:/^\+?[0-9 ()-]{7,25}$/'],
            'nok_name' => 'required|string|max:120',
            'nok_phone' => ['required', 'string', 'regex:/^\+?[0-9 ()-]{7,25}$/'],
            'idempotency_key' => 'required|uuid',
        ];
    }

    public function reserve(User $user, array $data, bool $cash = false): Ticket
    {
        $fingerprint = hash('sha256', json_encode([
            (int) $data['trip_id'], (int) $data['seat_number'], $data['passenger_name'],
            $data['passenger_phone'], $data['nok_name'], $data['nok_phone'], $cash,
        ], JSON_THROW_ON_ERROR));

        try {
            return DB::transaction(function () use ($user, $data, $cash, $fingerprint) {
                // All inventory changes take the trip lock before the ticket lock.
                $trip = Trip::with(['route', 'bus'])->lockForUpdate()->findOrFail($data['trip_id']);
                $this->expireHolds($trip->id);
                $existing = Ticket::where('user_id', $user->id)->where('idempotency_key', $data['idempotency_key'])->first();
                if ($existing) {
                    abort_unless(hash_equals((string) $existing->booking_fingerprint, $fingerprint), 409, 'This request key was already used for different booking details.');
                    return $existing;
                }
                abort_unless($trip->status === 'Scheduled' && $trip->departure_time->isFuture(), 409, 'This trip is no longer available for booking.');
                abort_unless($trip->bus && !in_array($trip->bus->status, ['Maintenance', 'Out of Service'], true), 409, 'This trip has no available vehicle.');
                abort_unless((int) $data['seat_number'] <= $trip->bus->capacity, 422, 'This seat does not exist on the assigned bus.');
                abort_unless((float) $trip->fare > 0, 409, 'The trip fare must be configured before booking.');
                abort_if(Ticket::where('trip_id', $trip->id)->where('active_seat', $data['seat_number'])->exists(), 409, 'This seat has just been reserved. Please select another seat.');

                $ticket = Ticket::create([
                    'user_id' => $user->id,
                    'trip_id' => $trip->id,
                    'pnr_code' => 'TH-'.strtoupper(bin2hex(random_bytes(8))),
                    'passenger_name' => $data['passenger_name'],
                    'passenger_phone' => $data['passenger_phone'],
                    'nok_name' => $data['nok_name'],
                    'nok_phone' => $data['nok_phone'],
                    'seat_number' => (string) (int) $data['seat_number'],
                    'active_seat' => (int) $data['seat_number'],
                    'vehicle_type' => $trip->bus->vehicle_type,
                    'route_name' => $trip->route->origin.' → '.$trip->route->destination,
                    'amount_due' => $trip->fare,
                    'fare_paid' => $cash ? $trip->fare : 0,
                    'payment_method' => $cash ? 'Cash' : 'Paystack',
                    'status' => $cash ? 'Confirmed' : 'Pending Payment',
                    'expires_at' => $cash ? null : now()->addMinutes(max(1, min(30, (int) config('services.booking.hold_minutes', 15))))->min($trip->departure_time),
                    'idempotency_key' => $data['idempotency_key'],
                    'booking_fingerprint' => $fingerprint,
                    'payment_verified_at' => $cash ? now() : null,
                ]);
                if ($cash) {
                    AuditLog::create(['user_name' => $user->name, 'role' => $user->role, 'action' => 'Cash ticket issued', 'amount' => $ticket->fare_paid, 'details' => $ticket->pnr_code]);
                }
                return $ticket;
            }, 3);

            if ($ticket->status === 'Confirmed') {
                try {
                    $user->notify(new \App\Notifications\TicketConfirmedNotification($ticket->load(['trip.route', 'trip.bus'])));
                } catch (\Throwable) {}
            }

            return $ticket;
        } catch (QueryException $exception) {
            if (in_array((string) $exception->getCode(), ['23000', '23505'], true)) {
                abort(409, 'The seat or request key is already reserved. Refresh your tickets before trying again.');
            }
            throw $exception;
        }
    }

    public function expireHolds(?int $tripId = null): int
    {
        return Ticket::where('status', 'Pending Payment')
            ->where('expires_at', '<=', now())
            ->when($tripId, fn ($query) => $query->where('trip_id', $tripId))
            ->update(['status' => 'Expired', 'active_seat' => null, 'updated_at' => now()]);
    }

    public function cancel(User $user, string $pnr): Ticket
    {
        $ticket = Ticket::where('pnr_code', strtoupper($pnr))->where('user_id', $user->id)->firstOrFail();

        return DB::transaction(function () use ($ticket, $user) {
            $trip = Trip::lockForUpdate()->find($ticket->trip_id);
            $this->expireHolds($ticket->trip_id);
            $ticket = Ticket::lockForUpdate()->findOrFail($ticket->id);
            if (in_array($ticket->status, ['Cancelled', 'Expired', 'Cancellation Requested', 'Refund Pending', 'Refund Review', 'Refunded'], true)) {
                return $ticket;
            }
            abort_unless($trip && $trip->status === 'Scheduled' && $trip->departure_time->isFuture(), 409, 'Tickets can only be cancelled before departure.');
            if ($ticket->status === 'Pending Payment') {
                $ticket->update(['status' => 'Cancelled', 'active_seat' => null]);
            } elseif ($ticket->status === 'Confirmed') {
                // Paid inventory is retained until finance confirms the refund.
                $ticket->update(['status' => 'Cancellation Requested']);
            } else {
                abort(409, 'This ticket cannot be cancelled in its current state.');
            }
            AuditLog::create(['user_name' => $user->name, 'role' => $user->role, 'action' => 'Ticket '.$ticket->status, 'details' => $ticket->pnr_code]);
            return $ticket;
        }, 3);
    }
}
