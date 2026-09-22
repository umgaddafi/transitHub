<?php

namespace App\Console\Commands;

use App\Models\Ticket;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class Readiness extends Command
{
    protected $signature = 'app:readiness';
    protected $description = 'Check local production configuration; external launch checks remain mandatory';

    public function handle(): int
    {
        $checks = [];
        $checks['Production environment'] = app()->environment('production');
        $checks['Debug disabled'] = ! config('app.debug');
        $key = (string) config('app.key');
        $checks['Application encryption key configured'] = str_starts_with($key, 'base64:') && strlen((string) base64_decode(substr($key, 7), true)) === 32;
        $appUrl = rtrim((string) config('app.url'), '/');
        $frontendUrl = rtrim((string) config('services.frontend_url'), '/');
        $checks['HTTPS application and same-origin frontend'] = str_starts_with($appUrl, 'https://') && $frontendUrl === $appUrl;
        $checks['Live Paystack key configured'] = str_starts_with((string) config('services.paystack.secret_key'), 'sk_live_');
        $callback = (string) config('services.paystack.callback_url');
        $checks['Payment callback matches application'] = $callback === $frontendUrl.'/client';
        $checks['Delivery mail transport configured'] = in_array(config('mail.default'), ['smtp', 'ses', 'postmark', 'resend'], true)
            && ! str_ends_with((string) config('mail.from.address'), '@example.com');
        $checks['Built frontend present'] = is_file(public_path('app.html')) && is_dir(public_path('assets'));
        $checks['Storage writable'] = is_writable(storage_path('framework')) && is_writable(storage_path('logs'));
        try {
            DB::connection()->getPdo();
            $checks['Production database uses MySQL or PostgreSQL'] = in_array(DB::connection()->getDriverName(), ['mysql', 'pgsql'], true);
            $required = ['api_token', 'api_token_expires_at', 'disabled_at'];
            $checks['Current schema installed'] = Schema::hasColumns('users', $required) && Schema::hasColumns('tickets', ['active_seat', 'refund_status', 'boarded_at']) && Schema::hasColumn('trips', 'driver_id');
            if ($checks['Current schema installed']) {
                $checks['Admin account exists'] = User::where('role', 'admin')->whereNull('disabled_at')->exists();
                $checks['No legacy unassigned paid tickets'] = ! Ticket::where('fare_paid', '>', 0)->where(fn ($query) => $query->whereNull('trip_id')->orWhereNull('user_id'))->exists();
                $checks['No demo accounts'] = ! User::whereIn('email', array_map(fn ($role) => $role.'@transithub.com', ['admin', 'passenger', 'driver', 'pos', 'marshal', 'finance', 'dispatch']))->exists();
            }
        } catch (\Throwable $exception) {
            $checks['Database and schema available'] = false;
        }
        foreach ($checks as $label => $ok) {
            $this->line(($ok ? 'PASS ' : 'FAIL ').$label);
        }
        $this->warn('This checks local configuration only. Verify HTTPS, document root, email delivery, gateway settlement/refunds, webhook retries, backups/restore, monitoring and concurrent booking in staging.');
        return in_array(false, $checks, true) ? self::FAILURE : self::SUCCESS;
    }
}
