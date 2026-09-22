<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Ticket extends Model
{
    use HasFactory;

    protected $fillable = [
        'pnr_code',
        'trip_id',
        'user_id',
        'passenger_name',
        'passenger_phone',
        'nok_name',
        'nok_phone',
        'vehicle_type',
        'seat_number',
        'route_name',
        'fare_paid',
        'payment_method',
        'status',
        'amount_due',
        'active_seat',
        'expires_at',
        'idempotency_key',
        'booking_fingerprint',
        'payment_reference',
        'payment_authorization_url',
        'payment_provider_id',
        'payment_verified_at',
        'refund_provider_id',
        'refund_status',
        'refunded_at',
        'boarded_at',
    ];

    protected $hidden = ['booking_fingerprint', 'idempotency_key', 'payment_authorization_url'];

    protected $casts = [
        'fare_paid' => 'decimal:2',
        'amount_due' => 'decimal:2',
        'active_seat' => 'integer',
        'expires_at' => 'datetime',
        'payment_verified_at' => 'datetime',
        'refunded_at' => 'datetime',
        'boarded_at' => 'datetime',
    ];

    public function trip()
    {
        return $this->belongsTo(Trip::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
