<?php

use App\Services\BookingService;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('tickets:expire-holds', function (BookingService $bookings) {
    $this->info('Expired '.$bookings->expireHolds().' unpaid reservations.');
})->purpose('Release unpaid reservations whose payment window has expired');

Schedule::command('tickets:expire-holds')->everyMinute()->withoutOverlapping();
Schedule::command('auth:clear-resets')->hourly();
