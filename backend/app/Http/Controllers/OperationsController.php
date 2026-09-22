<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\Bus;
use App\Models\Route;
use App\Models\Ticket;
use App\Models\Trip;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class OperationsController extends Controller
{
    public function index(Request $request)
    {
        $trips = Trip::with(['route', 'bus'])->where('departure_time', '>=', now()->subDays(7)->format('Y-m-d H:i:s'));
        if ($request->user()->role === 'driver') {
            $trips->where('driver_id', $request->user()->id);
        }
        $trips = $trips->orderBy('departure_time')->limit(200)->get();
        $counts = Ticket::whereIn('trip_id', $trips->modelKeys())->whereIn('status', ['Confirmed', 'Boarded'])
            ->selectRaw('trip_id, status, count(*) as total')->groupBy('trip_id', 'status')->get()->groupBy('trip_id');
        $trips->each(function ($trip) use ($counts) {
            $rows = $counts->get($trip->id, collect());
            $trip->setAttribute('confirmed_count', (int) $rows->where('status', 'Confirmed')->sum('total'));
            $trip->setAttribute('boarded_count', (int) $rows->where('status', 'Boarded')->sum('total'));
        });
        $driver = $request->user()->role === 'driver';
        return response()->json(['status' => 'success', 'trips' => $trips,
            'routes' => $driver ? [] : Route::orderBy('origin')->get(),
            'buses' => $driver ? [] : Bus::orderBy('reg_number')->get(),
            'drivers' => in_array($request->user()->role, ['admin', 'dispatch']) ? User::where('role', 'driver')->get(['id', 'name']) : [],
        ]);
    }

    public function createRoute(Request $request)
    {
        $data = $request->validate(['origin' => 'required|string|max:100', 'destination' => 'required|string|max:100|different:origin',
            'distance_km' => 'required|integer|min:1|max:10000', 'duration_hours' => 'required|string|max:40', 'base_fare' => 'required|numeric|min:1|max:10000000|decimal:0,2']);
        abort_if(strcasecmp(trim($data['origin']), trim($data['destination'])) === 0, 422, 'Origin and destination must differ.');
        $route = DB::transaction(function () use ($request, $data) {
            $route = Route::create($data);
            $this->audit($request, 'Route created', 'Route #'.$route->id);
            return $route;
        });
        return response()->json(['status' => 'success', 'route' => $route], 201);
    }

    public function createBus(Request $request)
    {
        $request->merge(['reg_number' => is_string($request->reg_number) ? strtoupper(trim($request->reg_number)) : $request->reg_number]);
        $data = $request->validate(['reg_number' => 'required|string|max:30|unique:buses,reg_number', 'model' => 'required|string|max:100',
            'vehicle_type' => ['required', Rule::in(['7-Seater', '14-Seater'])], 'capacity' => 'required|integer|in:7,14']);
        if ((int) $data['capacity'] !== (int) $data['vehicle_type']) {
            throw ValidationException::withMessages(['capacity' => 'Capacity must match the vehicle type.']);
        }
        $bus = DB::transaction(function () use ($request, $data) {
            $bus = Bus::create($data);
            $this->audit($request, 'Bus registered', 'Bus #'.$bus->id);
            return $bus;
        });
        return response()->json(['status' => 'success', 'bus' => $bus], 201);
    }

    public function createTrip(Request $request)
    {
        $data = $request->validate(['route_id' => 'required|integer|exists:routes,id', 'bus_id' => 'required|integer|exists:buses,id',
            'driver_id' => ['required', 'integer', Rule::exists('users', 'id')->where('role', 'driver')],
            'departure_time' => 'required|date|after:now', 'arrival_time' => 'required|date|after:departure_time',
            'fare' => 'required|numeric|min:1|max:10000000|decimal:0,2']);
        $data['departure_time'] = Carbon::parse($data['departure_time'])->utc()->format('Y-m-d H:i:s');
        $data['arrival_time'] = Carbon::parse($data['arrival_time'])->utc()->format('Y-m-d H:i:s');
        $trip = DB::transaction(function () use ($request, $data) {
            $bus = Bus::whereKey($data['bus_id'])->lockForUpdate()->firstOrFail();
            User::whereKey($data['driver_id'])->lockForUpdate()->firstOrFail();
            abort_unless($bus->status === 'Active / Operational', 409, 'This bus is not operational.');
            $this->checkSchedule($data);
            $trip = new Trip;
            $trip->forceFill($data + ['status' => 'Scheduled'])->save();
            $this->audit($request, 'Trip scheduled', 'Trip #'.$trip->id);
            return $trip->load(['route', 'bus']);
        }, 3);
        return response()->json(['status' => 'success', 'trip' => $trip], 201);
    }

    public function checkSchedule(array $data, ?int $except = null): void
    {
        $conflict = Trip::whereNotIn('status', ['Completed', 'Cancelled'])
            ->when($except, fn ($query) => $query->where('id', '!=', $except))
            ->where(fn ($query) => $query->where('bus_id', $data['bus_id'])->orWhere('driver_id', $data['driver_id']))
            ->where('departure_time', '<', $data['arrival_time'])
            ->where(fn ($query) => $query->whereNull('arrival_time')->orWhere('arrival_time', '>', $data['departure_time']))->exists();
        abort_if($conflict, 409, 'The bus or driver already has an overlapping trip.');
    }

    public function createUser(Request $request)
    {
        $request->merge(['email' => is_string($request->email) ? strtolower(trim($request->email)) : $request->email]);
        $data = $request->validate(['name' => 'required|string|max:255', 'email' => 'required|email|max:255|unique:users,email',
            'password' => 'required|string|min:12|max:128|confirmed', 'phone' => 'nullable|string|max:30',
            'role' => ['required', Rule::in(['passenger', 'driver', 'admin', 'pos', 'marshal', 'dispatch', 'finance'])]]);
        $user = DB::transaction(function () use ($request, $data) {
            $user = User::create($data);
            $this->audit($request, 'Staff account created', 'Account #'.$user->id.' role '.$user->role);
            return $user;
        });
        return response()->json(['status' => 'success', 'user' => $user], 201);
    }

    public function users(Request $request)
    {
        $request->validate(['page' => 'sometimes|integer|min:1', 'search' => 'sometimes|string|max:100']);
        $users = User::when($request->filled('search'), function ($query) use ($request) {
            $search = '%'.addcslashes($request->string('search')->toString(), '%_\\').'%';
            $query->where(fn ($query) => $query->where('email', 'like', $search)->orWhere('name', 'like', $search));
        })->orderBy('id')->paginate(100);
        return response()->json(['users' => $users->items(), 'current_page' => $users->currentPage(), 'last_page' => $users->lastPage()]);
    }

    public function userAccess(Request $request, User $user)
    {
        $data = $request->validate(['enabled' => 'required|boolean']);
        abort_if($user->id === $request->user()->id, 422, 'You cannot suspend your own account.');
        $user = DB::transaction(function () use ($request, $user, $data) {
            $locked = User::where('role', 'admin')->orWhere('id', $user->id)->orderBy('id')->lockForUpdate()->get();
            $user = $locked->firstWhere('id', $user->id);
            abort_if(! $data['enabled'] && $user->role === 'admin' && $locked->where('role', 'admin')->whereNull('disabled_at')->count() <= 1, 409, 'At least one active administrator is required.');
            $user->forceFill(['disabled_at' => $data['enabled'] ? null : now(), 'api_token' => null, 'api_token_expires_at' => null])->save();
            $this->audit($request, $data['enabled'] ? 'Account reactivated' : 'Account suspended', 'Account #'.$user->id);
            return $user;
        }, 3);
        return response()->json(['status' => 'success', 'user' => $user]);
    }

    public function manifest(Request $request, Trip $trip)
    {
        $this->authorizeDriver($request, $trip);
        $tickets = Ticket::where('trip_id', $trip->id)->whereIn('status', ['Confirmed', 'Boarded'])
            ->get(['pnr_code', 'passenger_name', 'passenger_phone', 'nok_name', 'nok_phone', 'seat_number', 'status', 'boarded_at'])
            ->sortBy(fn ($ticket) => (int) $ticket->seat_number)->values();
        return response()->json(['status' => 'success', 'trip' => $trip->load(['route', 'bus']), 'tickets' => $tickets]);
    }

    public function board(Request $request)
    {
        $data = $request->validate(['trip_id' => 'required|integer|exists:trips,id', 'pnr_code' => 'required|string|max:80']);
        $ticket = DB::transaction(function () use ($request, $data) {
            $trip = Trip::whereKey($data['trip_id'])->lockForUpdate()->firstOrFail();
            abort_unless($trip->status === 'Scheduled', 409, 'Boarding is closed for this trip.');
            abort_if(Carbon::parse($trip->departure_time)->isAfter(now()->addHours(3)), 409, 'Boarding opens three hours before departure.');
            $ticket = Ticket::where('trip_id', $trip->id)->where('pnr_code', strtoupper(trim($data['pnr_code'])))->lockForUpdate()->firstOrFail();
            abort_unless($ticket->status === 'Confirmed' && (float) $ticket->fare_paid > 0, 409, 'Only a paid, confirmed ticket can board once.');
            $ticket->forceFill(['status' => 'Boarded', 'boarded_at' => now()])->save();
            $this->audit($request, 'Passenger boarded', 'Trip #'.$trip->id.' ticket '.$ticket->pnr_code);
            return $ticket;
        }, 3);
        return response()->json(['status' => 'success', 'ticket' => $ticket]);
    }

    public function transition(Request $request, Trip $trip)
    {
        $this->authorizeDriver($request, $trip);
        $data = $request->validate(['status' => ['required', Rule::in(['Departed', 'Completed'])]]);
        $trip = DB::transaction(function () use ($request, $trip, $data) {
            $trip = Trip::whereKey($trip->id)->lockForUpdate()->firstOrFail();
            $this->authorizeDriver($request, $trip);
            $expected = $data['status'] === 'Departed' ? 'Scheduled' : 'Departed';
            abort_unless($trip->status === $expected, 409, 'Invalid trip status transition.');
            abort_if($data['status'] === 'Departed' && Carbon::parse($trip->departure_time)->isFuture(), 409, 'A trip cannot depart before its scheduled time.');
            abort_if($data['status'] === 'Departed' && ! $trip->driver_id, 409, 'Assign a driver before departure.');
            $trip->update(['status' => $data['status']]);
            $this->audit($request, 'Trip '.$data['status'], 'Trip #'.$trip->id);
            return $trip;
        }, 3);
        return response()->json(['status' => 'success', 'trip' => $trip]);
    }

    public function updateBusStatus(Request $request, Bus $bus)
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(['Active / Operational', 'Maintenance', 'Out of Service'])],
        ]);

        $bus = DB::transaction(function () use ($request, $bus, $data) {
            $bus = Bus::whereKey($bus->id)->lockForUpdate()->firstOrFail();
            if ($data['status'] !== 'Active / Operational') {
                $hasActiveTrips = Trip::where('bus_id', $bus->id)
                    ->where('status', 'Scheduled')
                    ->where('departure_time', '>', now())
                    ->whereHas('tickets', fn ($query) => $query->whereNotIn('status', ['Cancelled', 'Expired', 'Refunded']))
                    ->exists();
                abort_if($hasActiveTrips, 409, 'This bus has scheduled trips with booked passengers. Reassign the trips before changing status.');
            }
            $bus->update(['status' => $data['status']]);
            $this->audit($request, 'Bus status changed to '.$data['status'], 'Bus #'.$bus->id.' ('.$bus->reg_number.')');
            return $bus;
        }, 3);

        return response()->json(['status' => 'success', 'bus' => $bus]);
    }

    private function authorizeDriver(Request $request, Trip $trip): void
    {
        abort_if($request->user()->role === 'driver' && (int) $trip->driver_id !== $request->user()->id, 403, 'This trip is not assigned to you.');
    }

    public function audit(Request $request, string $action, string $details): void
    {
        AuditLog::create(['user_name' => $request->user()->name, 'role' => $request->user()->role, 'action' => $action, 'details' => $details]);
    }
}
