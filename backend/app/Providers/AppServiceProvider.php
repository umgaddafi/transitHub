<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        \Illuminate\Support\Facades\RateLimiter::for('auth', function ($request) {
            $email = is_string($request->input('email')) ? strtolower(trim($request->input('email'))) : '';
            return [
                \Illuminate\Cache\RateLimiting\Limit::perMinute(20)->by($request->ip()),
                \Illuminate\Cache\RateLimiting\Limit::perMinute(5)->by($email.'|'.$request->ip()),
            ];
        });
        \Illuminate\Support\Facades\RateLimiter::for('public-api', fn ($request) =>
            \Illuminate\Cache\RateLimiting\Limit::perMinute(120)->by($request->ip()));
        \Illuminate\Support\Facades\RateLimiter::for('api', fn ($request) =>
            \Illuminate\Cache\RateLimiting\Limit::perMinute(120)->by($request->user()?->id ?: $request->ip()));
    }
}
