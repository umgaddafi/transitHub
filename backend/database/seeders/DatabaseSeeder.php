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

        // 3. Delegate Routes, Fleet, Drivers & Live Departure Schedules to ScheduleService
        $scheduler = app(\App\Services\ScheduleService::class);
        $scheduler->ensureCoreRoutes();
        $scheduler->ensureFleet();
        $scheduler->ensureDrivers();
        $scheduler->generateRollingSchedules(14);

        $passenger = User::where('role', 'passenger')->first();
        $sampleTrip = Trip::where('status', 'Scheduled')->where('departure_time', '>', now())->first();

        // 6. Initial Sample Tickets
        if ($sampleTrip) {
            Ticket::updateOrCreate(
                ['pnr_code' => 'TH-849201'],
                [
                    'user_id' => $passenger?->id,
                    'trip_id' => $sampleTrip->id,
                    'passenger_name' => 'Amina Adebayo',
                    'passenger_phone' => '+234 803 111 2233',
                    'nok_name' => 'Dr. Ibrahim Adebayo',
                    'nok_phone' => '+234 803 999 8877',
                    'vehicle_type' => '14-Seater',
                    'seat_number' => 5,
                    'active_seat' => 5,
                    'route_name' => $sampleTrip->route?->origin . ' → ' . $sampleTrip->route?->destination,
                    'fare_paid' => $sampleTrip->fare,
                    'payment_method' => 'Visa Card (*4829)',
                    'status' => 'Confirmed',
                ]
            );

            Ticket::updateOrCreate(
                ['pnr_code' => 'TH-REF79102'],
                [
                    'user_id' => $passenger?->id,
                    'trip_id' => $sampleTrip->id,
                    'passenger_name' => 'Chinedu Eze',
                    'passenger_phone' => '+234 802 443 1902',
                    'nok_name' => 'Ngozi Eze',
                    'nok_phone' => '+234 802 443 9900',
                    'vehicle_type' => '14-Seater',
                    'seat_number' => 8,
                    'active_seat' => 8,
                    'route_name' => $sampleTrip->route?->origin . ' → ' . $sampleTrip->route?->destination,
                    'fare_paid' => $sampleTrip->fare,
                    'payment_method' => 'Paystack',
                    'status' => 'Cancellation Requested',
                ]
            );

            Ticket::updateOrCreate(
                ['pnr_code' => 'TH-REV55201'],
                [
                    'user_id' => $passenger?->id,
                    'trip_id' => $sampleTrip->id,
                    'passenger_name' => 'Fatima Bello',
                    'passenger_phone' => '+234 806 881 4421',
                    'nok_name' => 'Usman Bello',
                    'nok_phone' => '+234 806 881 1100',
                    'vehicle_type' => '7-Seater',
                    'seat_number' => 3,
                    'active_seat' => 3,
                    'route_name' => $sampleTrip->route?->origin . ' → ' . $sampleTrip->route?->destination,
                    'fare_paid' => $sampleTrip->fare,
                    'payment_method' => 'Cash',
                    'status' => 'Payment Review',
                ]
            );
        }

        // 7. Audit Logs
        AuditLog::firstOrCreate(
            ['event_key' => 'handover:pos:demo-init-1'],
            [
                'user_name' => 'Grace Effiong',
                'role' => 'pos',
                'action' => 'Cash handover submitted',
                'amount' => 185000,
                'details' => 'Counter Terminal 3 closing shift balance reconciled successfully.',
            ]
        );
    }
}
