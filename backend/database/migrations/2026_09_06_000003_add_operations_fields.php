<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('trips', function (Blueprint $table) {
            $table->foreignId('driver_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->index(['status', 'departure_time']);
        });
        Schema::table('tickets', fn (Blueprint $table) => $table->timestamp('boarded_at')->nullable());
        Schema::table('audit_logs', fn (Blueprint $table) => $table->string('event_key')->nullable()->unique());
    }

    public function down(): void
    {
        Schema::table('audit_logs', fn (Blueprint $table) => $table->dropColumn('event_key'));
        Schema::table('tickets', fn (Blueprint $table) => $table->dropColumn('boarded_at'));
        Schema::table('trips', function (Blueprint $table) {
            $table->dropForeign(['driver_id']);
            $table->dropColumn('driver_id');
            $table->dropIndex(['status', 'departure_time']);
        });
    }
};
