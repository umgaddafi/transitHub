<?php

use App\Services\BookingService;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('tickets:expire-holds', function (BookingService $bookings) {
    $this->info('Expired '.$bookings->expireHolds().' unpaid reservations.');
})->purpose('Release unpaid reservations whose payment window has expired');

Artisan::command('trips:generate-schedules {--days=14 : Number of days ahead to generate schedules}', function (\App\Services\ScheduleService $scheduler) {
    $days = (int) $this->option('days');
    $this->info("Generating interstate live departure schedules for the next {$days} days...");
    $count = $scheduler->generateRollingSchedules($days);
    $this->info("Successfully generated/verified {$count} scheduled trips.");
})->purpose('Generate rolling interstate departures for all active corridors');

Schedule::command('tickets:expire-holds')->everyMinute()->withoutOverlapping();
Schedule::command('trips:generate-schedules')->dailyAt('00:05');
Schedule::command('auth:clear-resets')->hourly();

