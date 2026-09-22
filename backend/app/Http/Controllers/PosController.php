<?php

namespace App\Http\Controllers;

use App\Models\Ticket;
use App\Services\BookingService;
use Illuminate\Http\Request;

class PosController extends Controller
{
    public function issueTicket(Request $request, BookingService $booking)
    {
        $data = $request->validate(BookingService::rules() + ['payment_method' => 'required|in:Cash', 'cash_received' => 'required|accepted']);
        $ticket = $booking->reserve($request->user(), $data, true);
        return response()->json(['status' => 'success', 'message' => 'Cash payment recorded and ticket issued.', 'ticket' => $ticket->load('trip.route', 'trip.bus')], $ticket->wasRecentlyCreated ? 201 : 200);
    }

    public function printLuggageTags(Request $request)
    {
        $data = $request->validate(['pnr_code' => 'required|string|max:40', 'count' => 'required|integer|min:1|max:10']);
        $ticket = Ticket::where('pnr_code', strtoupper($data['pnr_code']))->whereIn('status', ['Confirmed', 'Boarded'])->firstOrFail();
        $tags = collect(range(1, $data['count']))->map(fn ($number) => 'TAG-'.$ticket->pnr_code.'-'.$number);
        return response()->json(['status' => 'success', 'tag_codes' => $tags, 'count' => $data['count']]);
    }
}
