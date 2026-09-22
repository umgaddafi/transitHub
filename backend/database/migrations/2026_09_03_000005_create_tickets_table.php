<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tickets', function (Blueprint $table) {
            $table->id();
            $table->string('pnr_code')->unique();
            $table->foreignId('trip_id')->nullable()->constrained('trips')->onDelete('set null');
            $table->foreignId('user_id')->nullable()->constrained('users')->onDelete('set null');
            $table->string('passenger_name');
            $table->string('passenger_phone')->nullable();
            $table->string('nok_name');
            $table->string('nok_phone');
            $table->string('vehicle_type')->default('14-Seater');
            $table->string('seat_number');
            $table->string('route_name')->default('Lagos → Abuja Express');
            $table->decimal('fare_paid', 10, 2);
            $table->string('payment_method')->default('Card / Instant');
            $table->string('status')->default('Confirmed');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tickets');
    }
};
