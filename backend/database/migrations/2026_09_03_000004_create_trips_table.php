<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('trips', function (Blueprint $table) {
            $table->id();
            $table->foreignId('route_id')->constrained('routes')->onDelete('cascade');
            $table->foreignId('bus_id')->nullable()->constrained('buses')->onDelete('set null');
            $table->string('departure_time');
            $table->string('arrival_time')->nullable();
            $table->decimal('fare', 10, 2);
            $table->string('status')->default('Scheduled');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('trips');
    }
};
