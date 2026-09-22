<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Trip extends Model
{
    use HasFactory;

    protected $fillable = ['route_id', 'bus_id', 'driver_id', 'departure_time', 'arrival_time', 'fare', 'status'];

    protected $casts = ['departure_time' => 'datetime', 'arrival_time' => 'datetime', 'fare' => 'decimal:2'];

    public function tickets()
    {
        return $this->hasMany(Ticket::class);
    }

    public function route()
    {
        return $this->belongsTo(Route::class);
    }

    public function bus()
    {
        return $this->belongsTo(Bus::class);
    }

    public function driver()
    {
        return $this->belongsTo(User::class, 'driver_id');
    }
}
