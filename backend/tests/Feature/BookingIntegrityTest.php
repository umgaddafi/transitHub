<?php

namespace Tests\Feature;

use App\Models\Bus;
use App\Models\Route;
use App\Models\Ticket;
use App\Models\Trip;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class BookingIntegrityTest extends TestCase
{
    use RefreshDatabase;

    public function test_anonymous_visitor_cannot_mint_a_confirmed_ticket_with_client_fare(): void
    {
        $this->postJson('/api/tickets/book', [
            'passenger_name' => 'Test Person', 'nok_name' => 'Emergency Contact',
            'nok_phone' => '+2348012345678', 'vehicle_type' => '14-Seater',
            'seat_number' => '1', 'fare_paid' => 1,
        ])->assertUnauthorized();
        $this->assertDatabaseCount('tickets', 0);
    }

    public function test_booking_uses_server_fare_and_cannot_double_book_a_seat(): void
    {
        $trip = $this->trip();
        $this->actingAs(User::factory()->create(['api_token_expires_at' => now()->addHour()]), 'api');
        $payload = $this->payload($trip);
        $this->postJson('/api/tickets/book', $payload + ['fare_paid' => 1])
            ->assertCreated()->assertJsonPath('ticket.status', 'Pending Payment')
            ->assertJsonPath('ticket.amount_due', '22500.00')->assertJsonPath('ticket.fare_paid', '0.00');
        $this->postJson('/api/tickets/book', array_replace($payload, ['idempotency_key' => (string) Str::uuid()]))
            ->assertConflict();
        $this->assertDatabaseCount('tickets', 1);
    }

    public function test_search_requires_a_date_and_returns_scheduled_trips(): void
    {
        $trip = $this->trip();
        $this->getJson('/api/search?origin=Lagos&destination=Abuja')->assertUnprocessable();
        $this->getJson('/api/search?origin=Lagos&destination=Abuja&date='.$trip->departure_time->format('Y-m-d'))
            ->assertOk()->assertJsonPath('results.0.trip_id', $trip->id)->assertJsonPath('results.0.seats_left', 14);
    }

    public function test_booking_replay_is_idempotent_and_changed_details_are_rejected(): void
    {
        $trip = $this->trip();
        $this->login();
        $payload = $this->payload($trip);
        $pnr = $this->postJson('/api/tickets/book', $payload)->assertCreated()->json('ticket.pnr_code');
        $this->postJson('/api/tickets/book', $payload)->assertOk()->assertJsonPath('ticket.pnr_code', $pnr);
        $this->postJson('/api/tickets/book', array_replace($payload, ['seat_number' => 2]))->assertConflict();
        $this->assertDatabaseCount('tickets', 1);
    }

    public function test_invalid_seat_departed_trip_and_maintenance_vehicle_cannot_be_booked(): void
    {
        $trip = $this->trip();
        $this->login();
        $this->postJson('/api/tickets/book', array_replace($this->payload($trip), ['seat_number' => 15]))->assertUnprocessable();
        $trip->update(['status' => 'Departed']);
        $this->postJson('/api/tickets/book', $this->payload($trip))->assertConflict();
        $trip->update(['status' => 'Scheduled']);
        $trip->bus->update(['status' => 'Maintenance']);
        $this->postJson('/api/tickets/book', $this->payload($trip))->assertConflict();
        $this->assertDatabaseCount('tickets', 0);
    }

    public function test_expired_hold_is_released_and_search_omits_passenger_details(): void
    {
        $trip = $this->trip();
        $this->login();
        $pnr = $this->postJson('/api/tickets/book', $this->payload($trip))->assertCreated()->json('ticket.pnr_code');
        $search = '/api/search?origin=Lagos&destination=Abuja&date='.$trip->departure_time->format('Y-m-d');
        $this->getJson($search)->assertOk()->assertJsonPath('results.0.seats_left', 13)
            ->assertJsonPath('results.0.occupied_seats', [1])->assertDontSee('Emergency Contact');
        $this->travel(16)->minutes();
        $this->getJson($search)->assertOk()->assertJsonPath('results.0.seats_left', 14);
        $this->assertDatabaseHas('tickets', ['pnr_code' => $pnr, 'status' => 'Expired', 'active_seat' => null]);
        $this->postJson('/api/tickets/book', $this->payload($trip))->assertCreated();
    }

    public function test_ticket_ownership_protects_lookup_cancel_list_and_payments(): void
    {
        $this->login();
        $pnr = $this->postJson('/api/tickets/book', $this->payload($this->trip()))->assertCreated()->json('ticket.pnr_code');
        Ticket::where('pnr_code', $pnr)->update(['payment_reference' => 'THP-owner-only']);
        $this->login();
        $this->getJson('/api/tickets/lookup/'.$pnr)->assertNotFound();
        $this->postJson('/api/tickets/cancel/'.$pnr)->assertNotFound();
        $this->getJson('/api/tickets')->assertOk()->assertJsonPath('tickets', []);
        $this->postJson('/api/payments/initialize', ['pnr_code' => $pnr])->assertNotFound();
        $this->postJson('/api/payments/verify', ['reference' => 'THP-owner-only'])->assertNotFound();
        $this->assertDatabaseHas('tickets', ['pnr_code' => $pnr, 'status' => 'Pending Payment', 'active_seat' => 1]);
    }

    public function test_unpaid_cancellation_releases_inventory_but_paid_cancellation_retains_it(): void
    {
        $trip = $this->trip();
        $this->login();
        $pnr = $this->postJson('/api/tickets/book', $this->payload($trip))->assertCreated()->json('ticket.pnr_code');
        $this->postJson('/api/tickets/cancel/'.$pnr)->assertOk()->assertJsonPath('ticket.status', 'Cancelled')->assertJsonPath('ticket.active_seat', null);
        $pnr = $this->postJson('/api/tickets/book', $this->payload($trip))->assertCreated()->json('ticket.pnr_code');
        Ticket::where('pnr_code', $pnr)->update(['status' => 'Confirmed', 'fare_paid' => 22500, 'expires_at' => null, 'payment_verified_at' => now()]);
        $this->postJson('/api/tickets/cancel/'.$pnr)->assertOk()->assertJsonPath('ticket.status', 'Cancellation Requested')->assertJsonPath('ticket.active_seat', 1);
        $this->postJson('/api/tickets/book', $this->payload($trip))->assertConflict();
    }

    public function test_payment_initialization_uses_server_amount_and_reuses_reference(): void
    {
        config(['services.paystack.secret_key' => 'sk_test_local']);
        $user = $this->login();
        $pnr = $this->postJson('/api/tickets/book', $this->payload($this->trip()))->assertCreated()->json('ticket.pnr_code');
        Http::fake(['api.paystack.co/transaction/initialize' => fn ($request) => Http::response(['status' => true, 'data' => ['reference' => $request['reference'], 'authorization_url' => 'https://checkout.paystack.com/test-session']])]);
        $reference = $this->postJson('/api/payments/initialize', ['pnr_code' => $pnr, 'amount' => 1])->assertOk()->json('reference');
        $this->postJson('/api/payments/initialize', ['pnr_code' => $pnr])->assertOk()->assertJsonPath('reference', $reference);
        Http::assertSentCount(1);
        Http::assertSent(fn ($request) => $request['amount'] === 2250000 && $request['currency'] === 'NGN' && $request['email'] === $user->email);
        $this->assertDatabaseHas('tickets', ['pnr_code' => $pnr, 'status' => 'Pending Payment', 'fare_paid' => 0]);
    }

    public function test_payment_verification_rejects_wrong_amount_currency_reference_and_failed_status(): void
    {
        config(['services.paystack.secret_key' => 'sk_test_local']);
        $ticket = $this->unpaidTicket();
        foreach ([['amount' => 1], ['currency' => 'USD'], ['reference' => 'someone-else'], ['status' => 'failed']] as $override) {
            Http::fake(['api.paystack.co/transaction/verify/*' => Http::response(['status' => true, 'data' => array_replace($this->payment($ticket), $override)])]);
            $this->postJson('/api/payments/verify', ['reference' => $ticket->payment_reference])->assertConflict();
        }
        $this->assertDatabaseHas('tickets', ['id' => $ticket->id, 'status' => 'Pending Payment', 'fare_paid' => 0]);
    }

    public function test_signed_payment_webhook_and_verify_replay_confirm_only_once(): void
    {
        config(['services.paystack.secret_key' => 'sk_test_local']);
        $ticket = $this->unpaidTicket();
        $event = ['event' => 'charge.success', 'data' => $this->payment($ticket)];
        $this->postJson('/api/payments/webhook', $event)->assertUnauthorized();
        $this->webhook($event)->assertOk();
        $this->webhook($event)->assertOk();
        Http::fake();
        $this->postJson('/api/payments/verify', ['reference' => $ticket->payment_reference])->assertOk()->assertJsonPath('ticket.status', 'Confirmed')->assertJsonPath('ticket.fare_paid', '22500.00');
        Http::assertNothingSent();
        $this->assertDatabaseCount('audit_logs', 1);
        $this->assertDatabaseHas('tickets', ['id' => $ticket->id, 'active_seat' => 1]);
    }

    public function test_late_payment_is_flagged_for_refund_without_stealing_rebooked_seat(): void
    {
        config(['services.paystack.secret_key' => 'sk_test_local']);
        $ticket = $this->unpaidTicket();
        $this->travel(16)->minutes();
        $newPnr = $this->postJson('/api/tickets/book', $this->payload($ticket->trip))->assertCreated()->json('ticket.pnr_code');
        $this->webhook(['event' => 'charge.success', 'data' => $this->payment($ticket)])->assertOk();
        $this->assertDatabaseHas('tickets', ['id' => $ticket->id, 'status' => 'Payment Review', 'active_seat' => null, 'fare_paid' => 22500]);
        $this->assertDatabaseHas('tickets', ['pnr_code' => $newPnr, 'status' => 'Pending Payment', 'active_seat' => 1]);
    }

    public function test_full_refund_is_idempotent_and_only_processed_event_releases_paid_seat(): void
    {
        config(['services.paystack.secret_key' => 'sk_test_local']);
        $ticket = $this->unpaidTicket();
        $this->webhook(['event' => 'charge.success', 'data' => $this->payment($ticket)])->assertOk();
        $this->postJson('/api/tickets/cancel/'.$ticket->pnr_code)->assertOk();
        $this->postJson('/api/finance/refund/'.$ticket->pnr_code, ['reason' => 'Passenger cancellation'])->assertForbidden();
        $this->login('finance');
        $refund = ['id' => 8765, 'transaction' => ['reference' => $ticket->payment_reference], 'amount' => 2250000, 'currency' => 'NGN', 'status' => 'pending'];
        Http::fake(['api.paystack.co/refund' => Http::response(['status' => true, 'data' => $refund])]);
        $this->postJson('/api/finance/refund/'.$ticket->pnr_code, ['reason' => 'Passenger cancellation'])->assertOk()->assertJsonPath('ticket.status', 'Refund Pending')->assertJsonPath('ticket.active_seat', 1);
        $this->postJson('/api/finance/refund/'.$ticket->pnr_code, ['reason' => 'Passenger cancellation'])->assertOk();
        Http::assertSentCount(1);
        $this->webhook(['event' => 'refund.processed', 'data' => array_replace($refund, ['status' => 'processed'])])->assertOk();
        $this->webhook(['event' => 'refund.processed', 'data' => array_replace($refund, ['status' => 'processed'])])->assertOk();
        $this->assertDatabaseHas('tickets', ['id' => $ticket->id, 'status' => 'Refunded', 'active_seat' => null]);
        $this->assertSame(1, \App\Models\AuditLog::where('action', 'Refund completed')->count());
    }

    public function test_cash_pos_requires_collection_confirmation_and_uses_same_inventory(): void
    {
        $this->login('pos');
        $trip = $this->trip();
        $payload = $this->payload($trip) + ['payment_method' => 'Cash', 'fare_paid' => 1];
        $this->postJson('/api/pos/issue', $payload)->assertUnprocessable();
        $this->postJson('/api/pos/issue', $payload + ['cash_received' => true])->assertCreated()->assertJsonPath('ticket.status', 'Confirmed')->assertJsonPath('ticket.fare_paid', '22500.00');
        $this->postJson('/api/tickets/book', $this->payload($trip))->assertConflict();
    }

    private function login(string $role = 'passenger'): User
    {
        $user = User::factory()->create(['role' => $role, 'api_token_expires_at' => now()->addHours(4)]);
        $this->actingAs($user, 'api');
        return $user;
    }

    private function unpaidTicket(): Ticket
    {
        $this->login();
        $pnr = $this->postJson('/api/tickets/book', $this->payload($this->trip()))->assertCreated()->json('ticket.pnr_code');
        $ticket = Ticket::where('pnr_code', $pnr)->firstOrFail();
        $ticket->update(['payment_reference' => 'THP-'.Str::uuid()]);
        return $ticket;
    }

    private function payment(Ticket $ticket): array
    {
        return ['id' => 12345678, 'reference' => $ticket->payment_reference, 'amount' => 2250000, 'currency' => 'NGN', 'status' => 'success'];
    }

    private function webhook(array $payload): \Illuminate\Testing\TestResponse
    {
        $body = json_encode($payload, JSON_THROW_ON_ERROR);
        return $this->call('POST', '/api/payments/webhook', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json', 'HTTP_X_PAYSTACK_SIGNATURE' => hash_hmac('sha512', $body, 'sk_test_local')], $body);
    }

    private function trip(): Trip
    {
        $route = Route::create(['origin' => 'Lagos', 'destination' => 'Abuja', 'base_fare' => 22500]);
        $bus = Bus::create(['reg_number' => 'TEST-'.Str::random(8), 'model' => 'Hiace', 'capacity' => 14, 'vehicle_type' => '14-Seater']);
        return Trip::create(['route_id' => $route->id, 'bus_id' => $bus->id, 'departure_time' => now()->addDay()->setHour(10)->format('Y-m-d H:i:s'), 'fare' => 22500]);
    }

    private function payload(Trip $trip): array
    {
        return ['trip_id' => $trip->id, 'seat_number' => 1, 'passenger_name' => 'Test Person',
            'passenger_phone' => '+2348012345678', 'nok_name' => 'Emergency Contact',
            'nok_phone' => '+2348012345679', 'idempotency_key' => (string) Str::uuid()];
    }
}
