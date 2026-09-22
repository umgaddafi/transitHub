<?php

namespace App\Models;

use App\Notifications\FrontendResetPassword;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    use HasFactory, Notifiable;

    protected $fillable = [
        'name',
        'email',
        'password',
        'phone',
        'role',
        'avatar',
    ];

    protected $hidden = [
        'password',
        'remember_token',
        'api_token',
        'api_token_expires_at',
    ];

    protected $casts = [
        'email_verified_at' => 'datetime',
        'password' => 'hashed',
        'api_token_expires_at' => 'datetime',
    ];

    public function sendPasswordResetNotification($token): void
    {
        $this->notify(new FrontendResetPassword($token));
    }
}
