<?php

namespace Tests\Feature;

use App\Models\Bus;
use App\Models\Route;
use App\Models\Ticket;
use App\Models\Trip;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class OperationsTest extends TestCase
{
    use RefreshDatabase;

    public function test_finance_and_dispatch_cannot_be_called_anonymously(): void
    {
        $this->getJson('/api/finance/audits')->assertUnauthorized();
        $this->postJson('/api/dispatch/assign', ['trip_name' => 'Fake', 'bus_reg' => 'MISSING', 'crew_name' => 'Fake'])->assertUnauthorized();
    }

    public function test_passenger_cannot_view_manifests_or_create_staff(): void
    {
        $this->staff('passenger');
        $this->getJson('/api/operations')->assertForbidden();
        $this->postJson('/api/admin/users', [])->assertForbidden();
    }

    public function test_trip_scheduling_rejects_overlapping_bus_or_driver(): void
    {
        $this->staff('dispatch');
        $driver = User::factory()->create(['role' => 'driver']);
        $route = Route::create(['origin' => 'Lagos', 'destination' => 'Abuja', 'base_fare' => 22000]);
        $bus = Bus::create(['reg_number' => 'TEST-001', 'model' => 'Hiace', 'vehicle_type' => '14-Seater', 'capacity' => 14]);
        $payload = ['route_id' => $route->id, 'bus_id' => $bus->id, 'driver_id' => $driver->id,
            'departure_time' => now()->addDay()->format('Y-m-d H:i:s'), 'arrival_time' => now()->addDay()->addHours(10)->format('Y-m-d H:i:s'), 'fare' => 22000];
        $this->postJson('/api/dispatch/trips', $payload)->assertCreated();
        $this->postJson('/api/dispatch/trips', $payload)->assertConflict();
        $this->assertDatabaseCount('trips', 1);
    }

    public function test_boarding_is_single_use_and_requires_a_paid_ticket_on_the_correct_trip(): void
    {
        $this->staff('marshal');
        $trip = $this->trip();
        $ticket = Ticket::create(['trip_id' => $trip->id, 'pnr_code' => 'TH-'.Str::upper(Str::random(16)), 'passenger_name' => 'Passenger',
            'nok_name' => 'Contact', 'nok_phone' => '08012345678', 'seat_number' => '1', 'fare_paid' => 22000, 'status' => 'Confirmed']);
        $this->postJson('/api/operations/board', ['trip_id' => $trip->id, 'pnr_code' => $ticket->pnr_code])->assertOk()->assertJsonPath('ticket.status', 'Boarded');
        $this->postJson('/api/operations/board', ['trip_id' => $trip->id, 'pnr_code' => $ticket->pnr_code])->assertConflict();
        $ticket->update(['status' => 'Pending Payment', 'fare_paid' => 0]);
        $this->postJson('/api/operations/board', ['trip_id' => $trip->id, 'pnr_code' => $ticket->pnr_code])->assertConflict();
    }

    public function test_driver_cannot_read_or_depart_another_drivers_trip(): void
    {
        $this->staff('driver');
        $trip = $this->trip();
        $this->getJson('/api/operations/trips/'.$trip->id.'/manifest')->assertForbidden();
        $this->postJson('/api/operations/trips/'.$trip->id.'/status', ['status' => 'Departed'])->assertForbidden();
    }

    public function test_handover_uses_authenticated_identity_and_cannot_record_negative_amounts(): void
    {
        $user = $this->staff('pos');
        $this->postJson('/api/finance/handover', ['staff_name' => 'Impersonated', 'amount' => -1, 'idempotency_key' => (string) Str::uuid()])->assertUnprocessable();
        $payload = ['staff_name' => 'Impersonated', 'amount' => 22000, 'notes' => 'Till counted', 'idempotency_key' => (string) Str::uuid()];
        $this->postJson('/api/finance/handover', $payload)->assertCreated()->assertJsonPath('log.user_name', $user->name)->assertJsonPath('log.action', 'Cash handover submitted');
        $this->postJson('/api/finance/handover', $payload)->assertOk();
        $this->assertDatabaseCount('audit_logs', 1);
    }

    private function staff(string $role): User
    {
        $user = User::factory()->create(['role' => $role]);
        $user->forceFill(['api_token_expires_at' => now()->addHour()])->save();
        $this->actingAs($user, 'api');
        return $user;
    }

    private function trip(): Trip
    {
        $route = Route::create(['origin' => 'Lagos', 'destination' => 'Abuja', 'base_fare' => 22000]);
        $bus = Bus::create(['reg_number' => Str::random(8), 'model' => 'Hiace', 'vehicle_type' => '14-Seater', 'capacity' => 14]);
        return Trip::create(['route_id' => $route->id, 'bus_id' => $bus->id, 'departure_time' => now()->addHour()->format('Y-m-d H:i:s'), 'arrival_time' => now()->addHours(10)->format('Y-m-d H:i:s'), 'fare' => 22000, 'status' => 'Scheduled']);
    }
}
