<?php

namespace App\Notifications;

use Illuminate\Auth\Notifications\ResetPassword;

class FrontendResetPassword extends ResetPassword
{
    protected function resetUrl($notifiable): string
    {
        return rtrim(config('services.frontend_url'), '/').'/reset-password?'.http_build_query([
            'token' => $this->token,
            'email' => $notifiable->getEmailForPasswordReset(),
        ], '', '&', PHP_QUERY_RFC3986);
    }
}
