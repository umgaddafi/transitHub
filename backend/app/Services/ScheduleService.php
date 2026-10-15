<?php

namespace App\Services;

use App\Models\Bus;
use App\Models\Route;
use App\Models\Ticket;
use App\Models\Trip;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\Hash;

class ScheduleService
{
    /**
     * Standard Nigerian Interstate Corridors
     */
    public function ensureCoreRoutes(): array
    {
        $corridors = [
            [
                'origin' => 'Lagos (Jibowu Terminus)',
                'destination' => 'Abuja (Utako Park)',
                'distance_km' => 750,
                'duration_hours' => '9.5 hrs',
                'base_fare' => 22500,
            ],
            [
                'origin' => 'Abuja (Utako Park)',
                'destination' => 'Lagos (Jibowu Terminus)',
                'distance_km' => 750,
                'duration_hours' => '9.5 hrs',
                'base_fare' => 22500,
            ],
            [
                'origin' => 'Abuja (Utako Park)',
                'destination' => 'Port Harcourt (Waterlines)',
                'distance_km' => 620,
                'duration_hours' => '8.0 hrs',
                'base_fare' => 28000,
            ],
            [
                'origin' => 'Port Harcourt (Waterlines)',
                'destination' => 'Abuja (Utako Park)',
                'distance_km' => 620,
                'duration_hours' => '8.0 hrs',
                'base_fare' => 28000,
            ],
            [
                'origin' => 'Lagos (Jibowu Terminus)',
                'destination' => 'Benin City (Ramat Park)',
                'distance_km' => 320,
                'duration_hours' => '4.5 hrs',
                'base_fare' => 14500,
            ],
            [
                'origin' => 'Benin City (Ramat Park)',
                'destination' => 'Lagos (Jibowu Terminus)',
                'distance_km' => 320,
                'duration_hours' => '4.5 hrs',
                'base_fare' => 14500,
            ],
            [
                'origin' => 'Lagos (Jibowu Terminus)',
                'destination' => 'Kano (Naibawa Terminal)',
                'distance_km' => 980,
                'duration_hours' => '13.0 hrs',
                'base_fare' => 32000,
            ],
            [
                'origin' => 'Kano (Naibawa Terminal)',
                'destination' => 'Lagos (Jibowu Terminus)',
                'distance_km' => 980,
                'duration_hours' => '13.0 hrs',
                'base_fare' => 32000,
            ],
            [
                'origin' => 'Lagos (Jibowu Terminus)',
                'destination' => 'Port Harcourt (Waterlines)',
                'distance_km' => 610,
                'duration_hours' => '8.5 hrs',
                'base_fare' => 25000,
            ],
            [
                'origin' => 'Port Harcourt (Waterlines)',
                'destination' => 'Lagos (Jibowu Terminus)',
                'distance_km' => 610,
                'duration_hours' => '8.5 hrs',
                'base_fare' => 25000,
            ],
        ];

        $created = [];
        foreach ($corridors as $c) {
            $created[] = Route::updateOrCreate(
                ['origin' => $c['origin'], 'destination' => $c['destination']],
                $c
            );
        }

        return $created;
    }

    /**
     * Ensure adequate operational fleet of vehicles
     */
    public function ensureFleet(): array
    {
        $fleet = [
            ['reg_number' => 'TH-104', 'model' => 'Toyota HiAce Executive', 'vehicle_type' => '14-Seater', 'capacity' => 14, 'driver_name' => 'Capt. Tunde Ojo', 'status' => 'Active / Operational'],
            ['reg_number' => 'TH-208', 'model' => 'Toyota Sienna Luxury', 'vehicle_type' => '7-Seater', 'capacity' => 7, 'driver_name' => 'Capt. Musa Danladi', 'status' => 'Active / Operational'],
            ['reg_number' => 'TH-305', 'model' => 'Toyota HiAce Prime', 'vehicle_type' => '14-Seater', 'capacity' => 14, 'driver_name' => 'Capt. Emeka Okafor', 'status' => 'Active / Operational'],
            ['reg_number' => 'TH-412', 'model' => 'Toyota Sienna Premier', 'vehicle_type' => '7-Seater', 'capacity' => 7, 'driver_name' => 'Capt. Ibrahim Bello', 'status' => 'Active / Operational'],
            ['reg_number' => 'TH-520', 'model' => 'Toyota HiAce Royal Cruiser', 'vehicle_type' => '14-Seater', 'capacity' => 14, 'driver_name' => 'Capt. Segun Adeleke', 'status' => 'Active / Operational'],
            ['reg_number' => 'TH-633', 'model' => 'Toyota Coaster Executive', 'vehicle_type' => '14-Seater', 'capacity' => 14, 'driver_name' => 'Capt. Chidi Anyanwu', 'status' => 'Active / Operational'],
            ['reg_number' => 'TH-714', 'model' => 'Toyota Sienna Elegance', 'vehicle_type' => '7-Seater', 'capacity' => 7, 'driver_name' => 'Capt. Aliyu Garba', 'status' => 'Active / Operational'],
            ['reg_number' => 'TH-825', 'model' => 'Toyota HiAce Diamond VIP', 'vehicle_type' => '14-Seater', 'capacity' => 14, 'driver_name' => 'Capt. Dayo Ogundipe', 'status' => 'Active / Operational'],
        ];

        $buses = [];
        foreach ($fleet as $b) {
            $buses[] = Bus::updateOrCreate(
                ['reg_number' => $b['reg_number']],
                $b
            );
        }

        return $buses;
    }

    /**
     * Ensure certified drivers exist for fleet dispatching
     */
    public function ensureDrivers(): array
    {
        $demoPassword = env('DEMO_USER_PASSWORD', 'TransitHub@2026!');
        $drivers = [
            ['name' => 'Capt. Tunde Ojo', 'email' => 'driver@transithub.com', 'phone' => '+234 802 222 3344'],
            ['name' => 'Capt. Musa Danladi', 'email' => 'musa.driver@transithub.com', 'phone' => '+234 803 444 1122'],
            ['name' => 'Capt. Emeka Okafor', 'email' => 'emeka.driver@transithub.com', 'phone' => '+234 805 555 7788'],
            ['name' => 'Capt. Ibrahim Bello', 'email' => 'ibrahim.driver@transithub.com', 'phone' => '+234 807 666 9900'],
            ['name' => 'Capt. Segun Adeleke', 'email' => 'segun.driver@transithub.com', 'phone' => '+234 809 777 3311'],
            ['name' => 'Capt. Chidi Anyanwu', 'email' => 'chidi.driver@transithub.com', 'phone' => '+234 808 888 4422'],
            ['name' => 'Capt. Aliyu Garba', 'email' => 'aliyu.driver@transithub.com', 'phone' => '+234 806 999 5533'],
            ['name' => 'Capt. Dayo Ogundipe', 'email' => 'dayo.driver@transithub.com', 'phone' => '+234 801 333 6644'],
        ];

        $driverModels = [];
        foreach ($drivers as $d) {
            $driverModels[] = User::updateOrCreate(
                ['email' => $d['email']],
                [
                    'name' => $d['name'],
                    'password' => Hash::make($demoPassword),
                    'role' => 'driver',
                    'phone' => $d['phone'],
                ]
            );
        }

        return $driverModels;
    }

    /**
     * Ensure rolling schedules exist for today and future days
     */
    public function generateRollingSchedules(int $daysAhead = 14): int
    {
        $this->ensureCoreRoutes();
        $buses = $this->ensureFleet();
        $drivers = $this->ensureDrivers();
        $routes = Route::all();

        $passenger = User::where('role', 'passenger')->first();
        $tripsCreated = 0;

        // Common schedule template: departure hours and vehicle pairing
        $scheduleTemplates = [
            // Lagos -> Abuja
            ['route' => ['Lagos', 'Abuja'], 'hour' => 6, 'min' => 30, 'dur_h' => 9, 'dur_m' => 30, 'bus_idx' => 0, 'driver_idx' => 0, 'fare' => 22500],
            ['route' => ['Lagos', 'Abuja'], 'hour' => 8, 'min' => 30, 'dur_h' => 9, 'dur_m' => 0, 'bus_idx' => 1, 'driver_idx' => 1, 'fare' => 26000],
            ['route' => ['Lagos', 'Abuja'], 'hour' => 14, 'min' => 0, 'dur_h' => 9, 'dur_m' => 30, 'bus_idx' => 2, 'driver_idx' => 2, 'fare' => 22500],
            ['route' => ['Lagos', 'Abuja'], 'hour' => 17, 'min' => 0, 'dur_h' => 9, 'dur_m' => 0, 'bus_idx' => 3, 'driver_idx' => 3, 'fare' => 26000],

            // Abuja -> Lagos (Return)
            ['route' => ['Abuja', 'Lagos'], 'hour' => 7, 'min' => 0, 'dur_h' => 9, 'dur_m' => 30, 'bus_idx' => 4, 'driver_idx' => 4, 'fare' => 22500],
            ['route' => ['Abuja', 'Lagos'], 'hour' => 15, 'min' => 30, 'dur_h' => 9, 'dur_m' => 0, 'bus_idx' => 5, 'driver_idx' => 5, 'fare' => 26000],

            // Abuja -> Port Harcourt
            ['route' => ['Abuja', 'Port Harcourt'], 'hour' => 8, 'min' => 0, 'dur_h' => 8, 'dur_m' => 0, 'bus_idx' => 6, 'driver_idx' => 6, 'fare' => 28000],
            ['route' => ['Abuja', 'Port Harcourt'], 'hour' => 16, 'min' => 0, 'dur_h' => 8, 'dur_m' => 0, 'bus_idx' => 7, 'driver_idx' => 7, 'fare' => 28000],

            // Port Harcourt -> Abuja (Return)
            ['route' => ['Port Harcourt', 'Abuja'], 'hour' => 7, 'min' => 30, 'dur_h' => 8, 'dur_m' => 0, 'bus_idx' => 0, 'driver_idx' => 0, 'fare' => 28000],
            ['route' => ['Port Harcourt', 'Abuja'], 'hour' => 14, 'min' => 30, 'dur_h' => 8, 'dur_m' => 0, 'bus_idx' => 1, 'driver_idx' => 1, 'fare' => 28000],

            // Lagos -> Benin City
            ['route' => ['Lagos', 'Benin'], 'hour' => 7, 'min' => 30, 'dur_h' => 4, 'dur_m' => 30, 'bus_idx' => 2, 'driver_idx' => 2, 'fare' => 14500],
            ['route' => ['Lagos', 'Benin'], 'hour' => 11, 'min' => 0, 'dur_h' => 4, 'dur_m' => 30, 'bus_idx' => 3, 'driver_idx' => 3, 'fare' => 14500],
            ['route' => ['Lagos', 'Benin'], 'hour' => 16, 'min' => 30, 'dur_h' => 4, 'dur_m' => 30, 'bus_idx' => 4, 'driver_idx' => 4, 'fare' => 14500],

            // Benin City -> Lagos (Return)
            ['route' => ['Benin', 'Lagos'], 'hour' => 8, 'min' => 0, 'dur_h' => 4, 'dur_m' => 30, 'bus_idx' => 5, 'driver_idx' => 5, 'fare' => 14500],
            ['route' => ['Benin', 'Lagos'], 'hour' => 14, 'min' => 0, 'dur_h' => 4, 'dur_m' => 30, 'bus_idx' => 6, 'driver_idx' => 6, 'fare' => 14500],

            // Lagos -> Kano
            ['route' => ['Lagos', 'Kano'], 'hour' => 6, 'min' => 0, 'dur_h' => 13, 'dur_m' => 0, 'bus_idx' => 7, 'driver_idx' => 7, 'fare' => 32000],
            ['route' => ['Lagos', 'Kano'], 'hour' => 17, 'min' => 30, 'dur_h' => 13, 'dur_m' => 0, 'bus_idx' => 0, 'driver_idx' => 0, 'fare' => 32000],

            // Kano -> Lagos (Return)
            ['route' => ['Kano', 'Lagos'], 'hour' => 6, 'min' => 30, 'dur_h' => 13, 'dur_m' => 0, 'bus_idx' => 1, 'driver_idx' => 1, 'fare' => 32000],

            // Lagos -> Port Harcourt Direct
            ['route' => ['Lagos', 'Port Harcourt'], 'hour' => 7, 'min' => 0, 'dur_h' => 8, 'dur_m' => 30, 'bus_idx' => 2, 'driver_idx' => 2, 'fare' => 25000],
            ['route' => ['Lagos', 'Port Harcourt'], 'hour' => 15, 'min' => 0, 'dur_h' => 8, 'dur_m' => 30, 'bus_idx' => 3, 'driver_idx' => 3, 'fare' => 25000],

            // Port Harcourt -> Lagos (Return)
            ['route' => ['Port Harcourt', 'Lagos'], 'hour' => 7, 'min' => 30, 'dur_h' => 8, 'dur_m' => 30, 'bus_idx' => 4, 'driver_idx' => 4, 'fare' => 25000],
        ];

        $now = now();
        $todayDate = Carbon::today();

        for ($dayOffset = 0; $dayOffset <= $daysAhead; $dayOffset++) {
            $targetDate = $todayDate->copy()->addDays($dayOffset);

            foreach ($scheduleTemplates as $tpl) {
                $routeMatch = $routes->first(function ($r) use ($tpl) {
                    return str_contains($r->origin, $tpl['route'][0])
                        && str_contains($r->destination, $tpl['route'][1]);
                });

                if (! $routeMatch) {
                    continue;
                }

                $bus = $buses[$tpl['bus_idx'] % count($buses)];
                $driver = $drivers[$tpl['driver_idx'] % count($drivers)];

                $depTime = $targetDate->copy()->setTime($tpl['hour'], $tpl['min'], 0);
                $arrTime = $depTime->copy()->addHours($tpl['dur_h'])->addMinutes($tpl['dur_m']);

                // Calculate realistic live status
                $status = 'Scheduled';
                if ($depTime->isPast()) {
                    if ($now->diffInHours($depTime, false) < -6) {
                        $status = 'Completed';
                    } else {
                        $status = 'Departed';
                    }
                } elseif ($depTime->diffInMinutes($now, false) >= -90) {
                    // Departs in less than 90 mins: Boarding at bay
                    $status = 'Boarding';
                }

                $trip = Trip::updateOrCreate(
                    [
                        'route_id' => $routeMatch->id,
                        'bus_id' => $bus->id,
                        'departure_time' => $depTime->format('Y-m-d H:i:s'),
                    ],
                    [
                        'driver_id' => $driver->id,
                        'arrival_time' => $arrTime->format('Y-m-d H:i:s'),
                        'fare' => $tpl['fare'],
                        'status' => $status,
                    ]
                );

                $tripsCreated++;

                // If trip was recently created or has no tickets, add 1-3 sample occupied seats for realism
                if ($trip->tickets()->count() === 0 && in_array($status, ['Scheduled', 'Boarding', 'Departed'])) {
                    $seatsToBook = $bus->capacity === 7 ? [2, 5] : [3, 7, 11];
                    foreach ($seatsToBook as $seatNum) {
                        $pnr = 'TH-'.strtoupper(substr(md5($trip->id.'-seat-'.$seatNum), 0, 6));
                        Ticket::firstOrCreate(
                            ['pnr_code' => $pnr],
                            [
                                'user_id' => $passenger?->id,
                                'trip_id' => $trip->id,
                                'passenger_name' => 'Adebayo Johnson',
                                'passenger_phone' => '+234 803 111 2233',
                                'nok_name' => 'Folake Johnson',
                                'nok_phone' => '+234 802 333 4455',
                                'vehicle_type' => $bus->vehicle_type,
                                'seat_number' => $seatNum,
                                'active_seat' => $seatNum,
                                'route_name' => $routeMatch->origin.' → '.$routeMatch->destination,
                                'fare_paid' => $tpl['fare'],
                                'payment_method' => 'Paystack',
                                'status' => $status === 'Departed' ? 'Boarded' : 'Confirmed',
                            ]
                        );
                    }
                }
            }
        }

        return $tripsCreated;
    }
}
