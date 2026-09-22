<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('routes', function (Blueprint $table) {
            $table->id();
            $table->string('origin');
            $table->string('destination');
            $table->integer('distance_km')->default(500);
            $table->string('duration_hours')->default('8-10 hrs');
            $table->decimal('base_fare', 10, 2);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('routes');
    }
};
