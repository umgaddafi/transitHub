<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('buses', function (Blueprint $table) {
            $table->id();
            $table->string('reg_number')->unique();
            $table->string('model');
            $table->enum('vehicle_type', ['14-Seater', '7-Seater'])->default('14-Seater');
            $table->integer('capacity')->default(14);
            $table->string('driver_name')->default('Unassigned');
            $table->string('status')->default('Active / Operational');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('buses');
    }
};
