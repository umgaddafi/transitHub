<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use App\Models\User;
use App\Models\Terminal;
use App\Models\Route;
use App\Models\Bus;
use App\Models\Trip;
use App\Models\Ticket;
use App\Models\AuditLog;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            throw new \RuntimeException('Demo data may only be seeded in local or testing environments.');
        }

        $demoPassword = env('DEMO_USER_PASSWORD');
        if (! is_string($demoPassword) || strlen($demoPassword) < 12) {
            throw new \RuntimeException('Set DEMO_USER_PASSWORD to a password of at least 12 characters before seeding demo accounts.');
        }

        // 1. Users for all 7 roles
        $users = [
            ['name' => 'Amina Adebayo', 'email' => 'passenger@transithub.com', 'role' => 'passenger', 'phone' => '+234 803 111 2233'],
            ['name' => 'Capt. Tunde Ojo', 'email' => 'driver@transithub.com', 'role' => 'driver', 'phone' => '+234 802 222 3344'],
            ['name' => 'Grace Effiong', 'email' => 'pos@transithub.com', 'role' => 'pos', 'phone' => '+234 805 333 4455'],
            ['name' => 'Chief Inspector Yakubu', 'email' => 'marshal@transithub.com', 'role' => 'marshal', 'phone' => '+234 807 444 5566'],
            ['name' => 'Controller Emeka Vance', 'email' => 'dispatch@transithub.com', 'role' => 'dispatch', 'phone' => '+234 809 555 6677'],
            ['name' => 'Treasurer Sola Ogunleye', 'email' => 'finance@transithub.com', 'role' => 'finance', 'phone' => '+234 808 666 7788'],
            ['name' => 'System Director Antigravity', 'email' => 'admin@transithub.com', 'role' => 'admin', 'phone' => '+234 800 000 9999'],
        ];

        foreach ($users as $u) {
            User::updateOrCreate(
                ['email' => $u['email']],
                [
                    'name' => $u['name'],
                    'password' => Hash::make($demoPassword),
                    'role' => $u['role'],
                    'phone' => $u['phone'],
                ]
            );
        }

        // 2. Terminals
        $terminals = [
            ['name' => 'Lagos (Jibowu Terminus)', 'code' => 'LOS-JIB', 'city' => 'Lagos', 'state' => 'Lagos', 'address' => 'Jibowu Motor Park, Yaba'],
            ['name' => 'Abuja (Utako Main Terminal)', 'code' => 'ABJ-UTK', 'city' => 'Abuja', 'state' => 'FCT', 'address' => 'Utako District Park'],
            ['name' => 'Port Harcourt (Waterlines)', 'code' => 'PHC-WTL', 'city' => 'Port Harcourt', 'state' => 'Rivers', 'address' => 'Aba Road Waterlines'],
            ['name' => 'Benin City (Ramat Park)', 'code' => 'BNN-RMT', 'city' => 'Benin City', 'state' => 'Edo', 'address' => 'Ramat Park Interchange'],
            ['name' => 'Kano (Naibawa Terminal)', 'code' => 'KNO-NBA', 'city' => 'Kano', 'state' => 'Kano', 'address' => 'Naibawa Expressway Hub'],
        ];

        foreach ($terminals as $t) {
            Terminal::updateOrCreate(['code' => $t['code']], $t);
        }

        // 3. Routes
        $routes = [
            ['origin' => 'Lagos (Jibowu Terminus)', 'destination' => 'Abuja (Utako Park)', 'distance_km' => 750, 'duration_hours' => '9.5 hrs', 'base_fare' => 22500],
            ['origin' => 'Abuja (Utako Park)', 'destination' => 'Port Harcourt (Waterlines)', 'distance_km' => 620, 'duration_hours' => '8.0 hrs', 'base_fare' => 28000],
            ['origin' => 'Lagos (Jibowu Terminus)', 'destination' => 'Benin City (Ramat Park)', 'distance_km' => 320, 'duration_hours' => '4.5 hrs', 'base_fare' => 14500],
            ['origin' => 'Lagos (Jibowu Terminus)', 'destination' => 'Kano (Naibawa Terminal)', 'distance_km' => 980, 'duration_hours' => '13.0 hrs', 'base_fare' => 32000],
        ];

        foreach ($routes as $r) {
            Route::updateOrCreate(['origin' => $r['origin'], 'destination' => $r['destination']], $r);
        }

        // 4. Buses
        $buses = [
            ['reg_number' => 'TH-104', 'model' => 'Toyota HiAce Executive', 'vehicle_type' => '14-Seater', 'capacity' => 14, 'driver_name' => 'Capt. Tunde Ojo', 'status' => 'Active / En Route'],
            ['reg_number' => 'TH-208', 'model' => 'Toyota Sienna Luxury', 'vehicle_type' => '7-Seater', 'capacity' => 7, 'driver_name' => 'Kole Adeleke', 'status' => 'Ready at Bay 2'],
            ['reg_number' => 'TH-305', 'model' => 'Toyota HiAce Prime', 'vehicle_type' => '14-Seater', 'capacity' => 14, 'driver_name' => 'Babatunde Raji', 'status' => 'Maintenance Audit'],
        ];

        foreach ($buses as $b) {
            Bus::updateOrCreate(['reg_number' => $b['reg_number']], $b);
        }

        // 5. Scheduled Trips for Today and Next 7 Days
        $driver = User::where('role', 'driver')->first();
        $passenger = User::where('role', 'passenger')->first();
        $busHiAce = Bus::where('reg_number', 'TH-104')->first();
        $busSienna = Bus::where('reg_number', 'TH-208')->first();
        $routeLagosAbuja = Route::where('origin', 'like', '%Lagos%')->where('destination', 'like', '%Abuja%')->first();
        $routeAbujaPH = Route::where('origin', 'like', '%Abuja%')->where('destination', 'like', '%Port Harcourt%')->first();
        $routeLagosBenin = Route::where('origin', 'like', '%Lagos%')->where('destination', 'like', '%Benin%')->first();
        $routeLagosKano = Route::where('origin', 'like', '%Lagos%')->where('destination', 'like', '%Kano%')->first();

        $sampleTrip = null;

        if ($routeLagosAbuja && $busHiAce) {
            for ($d = 0; $d <= 7; $d++) {
                $baseDate = now()->addDays($d);
                $depHour = ($d === 0) ? max(15, (int) now()->addHours(2)->format('H')) : 7;
                $depTime = $baseDate->copy()->setTime($depHour, 30, 0);
                $arrTime = $depTime->copy()->addHours(9)->addMinutes(30);

                $trip = Trip::updateOrCreate([
                    'route_id' => $routeLagosAbuja->id,
                    'bus_id' => $busHiAce->id,
                    'departure_time' => $depTime->format('Y-m-d H:i:s'),
                ], [
                    'driver_id' => $driver?->id,
                    'arrival_time' => $arrTime->format('Y-m-d H:i:s'),
                    'fare' => 22500,
                    'status' => 'Scheduled',
                ]);

                if (! $sampleTrip) {
                    $sampleTrip = $trip;
                }

                if ($busSienna) {
                    $siennaHour = ($d === 0) ? max(18, (int) now()->addHours(4)->format('H')) : 14;
                    $siennaDep = $baseDate->copy()->setTime($siennaHour, 0, 0);
                    Trip::updateOrCreate([
                        'route_id' => $routeLagosAbuja->id,
                        'bus_id' => $busSienna->id,
                        'departure_time' => $siennaDep->format('Y-m-d H:i:s'),
                    ], [
                        'driver_id' => $driver?->id,
                        'arrival_time' => $siennaDep->copy()->addHours(9)->format('Y-m-d H:i:s'),
                        'fare' => 26000,
                        'status' => 'Scheduled',
                    ]);
                }

                if ($routeAbujaPH && $busHiAce) {
                    $phHour = ($d === 0) ? max(16, (int) now()->addHours(3)->format('H')) : 8;
                    $phDep = $baseDate->copy()->setTime($phHour, 0, 0);
                    Trip::updateOrCreate([
                        'route_id' => $routeAbujaPH->id,
                        'bus_id' => $busHiAce->id,
                        'departure_time' => $phDep->format('Y-m-d H:i:s'),
                    ], [
                        'driver_id' => $driver?->id,
                        'arrival_time' => $phDep->copy()->addHours(8)->format('Y-m-d H:i:s'),
                        'fare' => 28000,
                        'status' => 'Scheduled',
                    ]);
                }

                if ($routeLagosBenin && $busSienna) {
                    $bnHour = ($d === 0) ? max(17, (int) now()->addHours(3)->format('H')) : 10;
                    $bnDep = $baseDate->copy()->setTime($bnHour, 0, 0);
                    Trip::updateOrCreate([
                        'route_id' => $routeLagosBenin->id,
                        'bus_id' => $busSienna->id,
                        'departure_time' => $bnDep->format('Y-m-d H:i:s'),
                    ], [
                        'driver_id' => $driver?->id,
                        'arrival_time' => $bnDep->copy()->addHours(4)->addMinutes(30)->format('Y-m-d H:i:s'),
                        'fare' => 14500,
                        'status' => 'Scheduled',
                    ]);
                }
            }
        }

        // 6. Initial Sample Tickets
        Ticket::updateOrCreate(
            ['pnr_code' => 'TH-849201'],
            [
                'user_id' => $passenger?->id,
                'trip_id' => $sampleTrip?->id,
                'passenger_name' => 'Amina Adebayo',
                'passenger_phone' => '+234 803 111 2233',
                'nok_name' => 'Dr. Ibrahim Adebayo',
                'nok_phone' => '+234 803 999 8877',
                'vehicle_type' => '14-Seater',
                'seat_number' => 5,
                'active_seat' => 5,
                'route_name' => 'Lagos → Abuja Express',
                'fare_paid' => 22500,
                'payment_method' => 'Visa Card (*4829)',
                'status' => 'Confirmed',
            ]
        );

        Ticket::updateOrCreate(
            ['pnr_code' => 'TH-REF79102'],
            [
                'user_id' => $passenger?->id,
                'trip_id' => $sampleTrip?->id,
                'passenger_name' => 'Chinedu Eze',
                'passenger_phone' => '+234 802 443 1902',
                'nok_name' => 'Ngozi Eze',
                'nok_phone' => '+234 802 443 9900',
                'vehicle_type' => '14-Seater',
                'seat_number' => 8,
                'active_seat' => 8,
                'route_name' => 'Abuja → Port Harcourt Express',
                'fare_paid' => 28000,
                'payment_method' => 'Paystack',
                'status' => 'Cancellation Requested',
            ]
        );

        Ticket::updateOrCreate(
            ['pnr_code' => 'TH-REV55201'],
            [
                'user_id' => $passenger?->id,
                'trip_id' => $sampleTrip?->id,
                'passenger_name' => 'Fatima Bello',
                'passenger_phone' => '+234 806 881 4421',
                'nok_name' => 'Usman Bello',
                'nok_phone' => '+234 806 881 1100',
                'vehicle_type' => '7-Seater',
                'seat_number' => 3,
                'active_seat' => 3,
                'route_name' => 'Lagos → Benin City Inter-State',
                'fare_paid' => 14500,
                'payment_method' => 'Cash',
                'status' => 'Payment Review',
            ]
        );

        // 7. Audit Logs
        AuditLog::create([
            'user_name' => 'Grace Effiong',
            'role' => 'pos',
            'action' => 'Cash handover submitted',
            'amount' => 185000,
            'details' => 'Counter Terminal 3 closing shift balance reconciled successfully.',
            'event_key' => 'handover:pos:demo-init-1',
        ]);
    }
}
