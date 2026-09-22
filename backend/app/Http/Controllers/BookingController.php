<?php

namespace App\Http\Controllers;

use App\Models\Route;
use App\Models\Ticket;
use App\Models\Trip;
use App\Services\BookingService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class BookingController extends Controller
{
    public function getRoutes()
    {
        return response()->json(['status' => 'success', 'routes' => Route::orderBy('origin')->orderBy('destination')->get()]);
    }

    public function getStates()
    {
        $states = Cache::remember('nigeria_states_api_v2', 86400, function () {
            try {
                $response = Http::timeout(4)->get('https://countriesnow.space/api/v0.1/countries/states/q?country=Nigeria');
                if ($response->successful() && !empty($response->json('data.states'))) {
                    return collect($response->json('data.states'))->map(function ($s) {
                        return [
                            'name' => trim(str_ireplace(' State', '', $s['name'])),
                            'full_name' => $s['name'],
                            'state_code' => $s['state_code'] ?? null,
                        ];
                    })->sortBy('name')->values()->all();
                }
            } catch (\Throwable $e) {
                // Ignore and try fallback
            }

            try {
                $response = Http::timeout(4)->get('https://nga-states-lga.onrender.com/fetch');
                if ($response->successful() && is_array($response->json())) {
                    return collect($response->json())->map(function ($name) {
                        return [
                            'name' => trim(str_ireplace([' State', 'State'], '', $name)),
                            'full_name' => $name . (str_contains($name, 'State') || $name === 'FCT' ? '' : ' State'),
                            'state_code' => null,
                        ];
                    })->sortBy('name')->values()->all();
                }
            } catch (\Throwable $e) {
                // Ignore and use static fallback
            }

            // High-reliability static fallback for all 36 Nigerian states + FCT
            $defaultStates = [
                'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
                'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'Federal Capital Territory',
                'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara',
                'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers',
                'Sokoto', 'Taraba', 'Yobe', 'Zamfara'
            ];

            return array_map(fn ($s) => [
                'name' => $s,
                'full_name' => $s === 'Federal Capital Territory' ? $s : $s . ' State',
                'state_code' => null,
            ], $defaultStates);
        });

        // Map known terminals and active routes
        $terminalMap = [
            'Lagos' => 'Lagos (Jibowu Terminus)',
            'Federal Capital Territory' => 'Abuja (Utako Park)',
            'Abuja' => 'Abuja (Utako Park)',
            'FCT' => 'Abuja (Utako Park)',
            'Rivers' => 'Port Harcourt (Waterlines)',
            'Edo' => 'Benin City (Ramat Park)',
            'Kano' => 'Kano (Naibawa Terminal)',
        ];

        $routes = Route::all(['origin', 'destination']);
        $activeOrigins = $routes->pluck('origin')->all();
        $activeDests = $routes->pluck('destination')->all();

        $enriched = array_map(function ($state) use ($terminalMap, $activeOrigins, $activeDests) {
            $name = $state['name'];
            $terminal = $terminalMap[$name] ?? ($name . ' Central Terminal');
            $hasRoute = in_array($terminal, $activeOrigins) || in_array($terminal, $activeDests)
                || in_array($name, ['Lagos', 'Federal Capital Territory', 'Rivers', 'Edo', 'Kano']);

            return [
                'name' => $name,
                'full_name' => $state['full_name'],
                'state_code' => $state['state_code'],
                'terminal' => $terminal,
                'has_active_routes' => $hasRoute,
            ];
        }, $states);

        return response()->json([
            'status' => 'success',
            'country' => 'Nigeria',
            'source' => 'Online Country API (countriesnow.space / nga-states-lga)',
            'count' => count($enriched),
            'states' => $enriched,
        ]);
    }

    public function search(Request $request, BookingService $booking)
    {
        $data = $request->validate([
            'origin' => 'required|string|max:120', 'destination' => 'required|string|max:120|different:origin',
            'date' => 'required|date_format:Y-m-d|after_or_equal:today', 'vehicle_type' => 'nullable|string|max:60',
        ]);
        $booking->expireHolds();

        $normalizeCity = function (string $input) {
            $raw = trim(explode('(', $input)[0]);
            $clean = trim(str_ireplace([' State', ' state'], '', $raw));
            $aliases = [
                'Federal Capital Territory' => 'Abuja',
                'FCT' => 'Abuja',
                'Rivers' => 'Port Harcourt',
                'Edo' => 'Benin City',
            ];
            return $aliases[$clean] ?? $clean;
        };

        $originCity = $normalizeCity($data['origin']);
        $destCity = $normalizeCity($data['destination']);

        $trips = Trip::with(['route', 'bus', 'tickets' => fn ($query) => $query->whereNotNull('active_seat')->select(['id', 'trip_id', 'active_seat'])])
            ->where('status', 'Scheduled')->where('departure_time', '>', now()->format('Y-m-d H:i:s'))
            ->whereDate('departure_time', $data['date'])
            ->whereHas('route', function ($query) use ($data, $originCity, $destCity) {
                $query->where(function ($q) use ($data, $originCity) {
                    $q->where('origin', $data['origin'])
                      ->orWhere('origin', 'like', '%' . $originCity . '%');
                })->where(function ($q) use ($data, $destCity) {
                    $q->where('destination', $data['destination'])
                      ->orWhere('destination', 'like', '%' . $destCity . '%');
                });
            })
            ->whereHas('bus', function ($query) use ($data) {
                $query->whereNotIn('status', ['Maintenance', 'Out of Service']);
                if (!empty($data['vehicle_type'])) {
                    $query->where('vehicle_type', $data['vehicle_type']);
                }
            })->orderBy('departure_time')->limit(100)->get();

        return response()->json(['status' => 'success', 'results' => $trips->map(function ($trip) {
            $occupied = $trip->tickets->pluck('active_seat')->map(fn ($seat) => (int) $seat)->sort()->values()->all();
            $available = array_values(array_diff(range(1, $trip->bus->capacity), $occupied));
            return ['trip_id' => $trip->id, 'origin' => $trip->route->origin, 'destination' => $trip->route->destination,
                'departure_time' => $trip->departure_time->toIso8601String(), 'arrival_time' => $trip->arrival_time?->toIso8601String(),
                'vehicle_type' => $trip->bus->vehicle_type, 'capacity' => $trip->bus->capacity,
                'fare' => $trip->fare, 'seats_left' => count($available), 'occupied_seats' => $occupied, 'available_seats' => $available];
        })]);
    }

    public function bookTicket(Request $request, BookingService $booking)
    {
        abort_unless($request->user(), 401);
        $ticket = $booking->reserve($request->user(), $request->validate(BookingService::rules()));
        return response()->json(['status' => 'success', 'message' => 'Seat held. Complete payment before the reservation expires.', 'ticket' => $ticket->load('trip.route', 'trip.bus')], $ticket->wasRecentlyCreated ? 201 : 200);
    }

    public function myTickets(Request $request, BookingService $booking)
    {
        $booking->expireHolds();
        return response()->json(['status' => 'success', 'tickets' => Ticket::with('trip.route', 'trip.bus')->where('user_id', $request->user()->id)->latest()->limit(100)->get()]);
    }

    public function lookupTicket(Request $request, string $pnr, BookingService $booking)
    {
        $booking->expireHolds();
        $query = Ticket::with('trip.route', 'trip.bus')->where('pnr_code', strtoupper($pnr));
        $user = $request->user();
        abort_unless($user, 401);
        if (!in_array($user->role, ['admin', 'pos', 'marshal', 'finance', 'dispatch'], true)) {
            $query->where(function ($query) use ($user) {
                $query->where('user_id', $user->id);
                if ($user->role === 'driver') {
                    $query->orWhereHas('trip', fn ($trip) => $trip->where('driver_id', $user->id));
                }
            });
        }
        return response()->json(['status' => 'success', 'ticket' => $query->firstOrFail()]);
    }

    public function cancelTicket(Request $request, string $pnr, BookingService $booking)
    {
        $ticket = $booking->cancel($request->user(), $pnr);
        return response()->json(['status' => 'success', 'ticket' => $ticket, 'message' => $ticket->status === 'Cancellation Requested' ? 'Cancellation requested. Finance will review your refund.' : 'Reservation cancelled or already closed.']);
    }

    public function getForecastData()
    {
        // Forecasting is not configured; never present fabricated prices or demand.
        return response()->json(['status' => 'success', 'forecast' => [], 'message' => 'Search scheduled trips for live prices and availability.']);
    }
}
