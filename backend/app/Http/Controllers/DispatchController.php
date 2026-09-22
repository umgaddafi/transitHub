<?php

namespace App\Http\Controllers;

use App\Models\Bus;
use App\Models\Ticket;
use App\Models\Trip;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class DispatchController extends Controller
{
    public function getFleet()
    {
        return response()->json(['status' => 'success', 'buses' => Bus::orderBy('reg_number')->get()]);
    }

    public function assignTrip(Request $request, OperationsController $operations)
    {
        $data = $request->validate(['trip_id' => 'required|integer|exists:trips,id', 'bus_id' => 'required|integer|exists:buses,id',
            'driver_id' => ['required', 'integer', Rule::exists('users', 'id')->where('role', 'driver')]]);
        $trip = DB::transaction(function () use ($data, $request, $operations) {
            $bus = Bus::whereKey($data['bus_id'])->lockForUpdate()->firstOrFail();
            User::whereKey($data['driver_id'])->lockForUpdate()->firstOrFail();
            $trip = Trip::whereKey($data['trip_id'])->lockForUpdate()->firstOrFail();
            abort_unless($bus->status === 'Active / Operational' && $trip->status === 'Scheduled' && $trip->departure_time->isFuture(), 409, 'Only a future scheduled trip and operational bus can be assigned.');
            abort_if(Ticket::where('trip_id', $trip->id)->whereNotIn('status', ['Cancelled', 'Expired', 'Refunded'])->exists(), 409, 'Trips with reservations require assisted rebooking before a bus change.');
            abort_unless($trip->arrival_time, 422, 'Set a valid arrival time before assigning this trip.');
            $operations->checkSchedule($data + ['departure_time' => $trip->departure_time->format('Y-m-d H:i:s'), 'arrival_time' => $trip->arrival_time->format('Y-m-d H:i:s')], $trip->id);
            $trip->forceFill(['bus_id' => $data['bus_id'], 'driver_id' => $data['driver_id']])->save();
            $operations->audit($request, 'Trip assignment changed', 'Trip #'.$trip->id);
            return $trip->load(['route', 'bus']);
        }, 3);
        return response()->json(['status' => 'success', 'trip' => $trip]);
    }
}
