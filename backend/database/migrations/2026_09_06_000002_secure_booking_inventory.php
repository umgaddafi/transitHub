<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Validate old assigned tickets before changing the schema: never silently
        // hide an existing reservation when introducing the inventory constraint.
        $occupied = [];
        foreach (DB::table('tickets')->whereNotNull('trip_id')->whereNotIn('status', ['Cancelled', 'Expired', 'Refunded'])->get() as $ticket) {
            if (!ctype_digit((string) $ticket->seat_number) || (int) $ticket->seat_number < 1) {
                throw new RuntimeException('Reconcile invalid legacy seat on ticket '.$ticket->id.' before migration.');
            }
            $key = $ticket->trip_id.':'.(int) $ticket->seat_number;
            if (isset($occupied[$key])) {
                throw new RuntimeException('Reconcile duplicate legacy seat '.$key.' before migration.');
            }
            $occupied[$key] = true;
        }

        Schema::table('tickets', function (Blueprint $table) {
            $table->decimal('amount_due', 10, 2)->default(0);
            // NULL releases inventory; SQL permits many NULLs but one active
            // reservation for each concrete trip/seat pair, even under races.
            $table->unsignedInteger('active_seat')->nullable();
            $table->timestamp('expires_at')->nullable()->index();
            $table->uuid('idempotency_key')->nullable();
            $table->string('booking_fingerprint', 64)->nullable();
            $table->string('payment_reference')->nullable()->unique();
            $table->text('payment_authorization_url')->nullable();
            $table->string('payment_provider_id')->nullable()->unique();
            $table->timestamp('payment_verified_at')->nullable();
            $table->string('refund_provider_id')->nullable()->unique();
            $table->string('refund_status')->nullable();
            $table->timestamp('refunded_at')->nullable();
            $table->unique(['trip_id', 'active_seat']);
            $table->unique(['user_id', 'idempotency_key']);
        });

        DB::table('tickets')->update(['amount_due' => DB::raw('fare_paid')]);
        foreach (DB::table('tickets')->whereNotNull('trip_id')->whereNotIn('status', ['Cancelled', 'Expired', 'Refunded'])->get() as $ticket) {
            DB::table('tickets')->where('id', $ticket->id)->update(['active_seat' => (int) $ticket->seat_number]);
        }
    }

    public function down(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            $table->dropUnique(['trip_id', 'active_seat']);
            $table->dropUnique(['user_id', 'idempotency_key']);
            $table->dropUnique(['payment_reference']);
            $table->dropUnique(['payment_provider_id']);
            $table->dropUnique(['refund_provider_id']);
            $table->dropColumn(['amount_due', 'active_seat', 'expires_at', 'idempotency_key', 'booking_fingerprint', 'payment_reference', 'payment_authorization_url', 'payment_provider_id', 'payment_verified_at', 'refund_provider_id', 'refund_status', 'refunded_at']);
        });
    }
};
