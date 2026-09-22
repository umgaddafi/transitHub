<?php

namespace App\Http\Controllers;

use App\Models\Ticket;
use App\Services\PaymentService;
use Illuminate\Http\Request;

class PaymentController extends Controller
{
    public function initialize(Request $request, PaymentService $payments)
    {
        $data = $request->validate(['pnr_code' => 'required|string|max:40']);
        $ticket = Ticket::where('pnr_code', strtoupper($data['pnr_code']))->where('user_id', $request->user()->id)->firstOrFail();
        $ticket = $payments->initialize($ticket, $request->user());
        return response()->json(['status' => 'success', 'authorization_url' => $ticket->payment_authorization_url, 'reference' => $ticket->payment_reference, 'ticket' => $ticket]);
    }

    public function verify(Request $request, PaymentService $payments)
    {
        $data = $request->validate(['reference' => 'required|string|max:100']);
        $ticket = Ticket::where('payment_reference', $data['reference'])->where('user_id', $request->user()->id)->firstOrFail();
        return response()->json(['status' => 'success', 'ticket' => $payments->verify($ticket)->load('trip.route', 'trip.bus')]);
    }

    public function webhook(Request $request, PaymentService $payments)
    {
        abort_unless(hash_equals(hash_hmac('sha512', $request->getContent(), $payments->secret()), (string) $request->header('x-paystack-signature')), 401, 'Invalid payment signature.');
        $data = $request->validate(['event' => 'required|string|max:80', 'data' => 'required|array']);
        if ($data['event'] === 'charge.success') {
            $reference = $data['data']['reference'] ?? null;
            $ticket = is_string($reference) ? Ticket::where('payment_reference', $reference)->first() : null;
            if ($ticket) {
                $payments->confirm($ticket, $data['data']);
            }
        } elseif (in_array($data['event'], ['refund.processed', 'refund.failed', 'refund.pending', 'refund.processing'], true)) {
            $refund = $data['data'];
            $reference = data_get($refund, 'transaction.reference');
            $id = $refund['id'] ?? null;
            $ticket = is_string($reference) ? Ticket::where('payment_reference', $reference)->first() : null;
            if (!$ticket && is_scalar($id)) {
                $ticket = Ticket::where('refund_provider_id', (string) $id)->first();
            }
            if (!$ticket && is_scalar($refund['transaction'] ?? null)) {
                $ticket = Ticket::where('payment_provider_id', (string) $refund['transaction'])->first();
            }
            if ($ticket) {
                $payments->updateRefund($ticket, $refund, substr($data['event'], 7));
            }
        }
        return response()->json(['status' => 'success']);
    }

    public function refund(Request $request, string $pnr, PaymentService $payments)
    {
        $data = $request->validate(['reason' => 'required|string|min:5|max:500', 'cash_refund_confirmed' => 'sometimes|boolean']);
        $ticket = Ticket::where('pnr_code', strtoupper($pnr))->firstOrFail();
        $ticket = $payments->refund($ticket, $request->user(), $data);
        return response()->json(['status' => 'success', 'ticket' => $ticket, 'message' => $ticket->status === 'Refunded' ? 'Refund recorded.' : ($ticket->status === 'Refund Review' ? 'Finance must reconcile this refund with the payment provider before taking further action.' : 'Refund submitted. Awaiting confirmation from the payment provider.')]);
    }
}
