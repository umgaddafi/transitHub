<?php

namespace Tests\Feature;

use App\Models\User;
use App\Notifications\FrontendResetPassword;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class SecurityTest extends TestCase
{
    use RefreshDatabase;

    public function test_registration_cannot_grant_a_privileged_role_and_hides_token_hash(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'name' => 'Test Passenger', 'email' => 'PASSENGER@example.com',
            'password' => 'a-long-test-password', 'password_confirmation' => 'a-long-test-password',
            'role' => 'admin',
        ])->assertCreated()->assertJsonPath('user.role', 'passenger')
            ->assertJsonPath('user.email', 'passenger@example.com')
            ->assertJsonPath('token_type', 'Bearer');

        $user = User::firstOrFail();
        $this->assertSame(hash('sha256', $response->json('token')), $user->api_token);
        $this->assertArrayNotHasKey('api_token', $response->json('user'));
        $this->assertArrayNotHasKey('password', $response->json('user'));
        $this->assertTrue($user->api_token_expires_at->isFuture());
    }

    public function test_registration_requires_a_confirmed_password_of_at_least_twelve_characters(): void
    {
        $this->postJson('/api/auth/register', [
            'name' => 'Test Passenger', 'email' => 'test@example.com', 'password' => 'password',
        ])->assertUnprocessable()->assertJsonValidationErrors('password');
        $this->assertDatabaseCount('users', 0);
    }

    public function test_credentials_are_required_and_quick_login_is_removed(): void
    {
        $user = $this->user();
        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'wrong'])
            ->assertUnauthorized();
        $this->postJson('/api/auth/quick-login', ['role' => 'admin'])->assertNotFound();
        $this->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_bearer_token_authenticates_then_logout_revokes_it(): void
    {
        $user = $this->user();
        $token = $this->login($user);
        $this->withToken($token)->getJson('/api/auth/me')->assertOk()->assertJsonPath('user.id', $user->id);
        $this->withToken($token)->postJson('/api/auth/logout')->assertOk();
        Auth::forgetGuards();
        $this->withToken($token)->getJson('/api/auth/me')->assertUnauthorized();
        $this->assertNull($user->fresh()->api_token);
    }

    public function test_expired_tokens_are_rejected(): void
    {
        $user = $this->user();
        $token = $this->login($user);
        $user->forceFill(['api_token_expires_at' => now()->subMinute()])->save();
        Auth::forgetGuards();
        $this->withToken($token)->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_a_new_login_revokes_the_previous_token(): void
    {
        $user = $this->user();
        $oldToken = $this->login($user);
        $newToken = $this->login($user);
        $this->assertNotSame($oldToken, $newToken);
        Auth::forgetGuards();
        $this->withToken($oldToken)->getJson('/api/auth/me')->assertUnauthorized();
        Auth::forgetGuards();
        $this->withToken($newToken)->getJson('/api/auth/me')->assertOk();
    }

    public function test_repeated_login_attempts_are_throttled(): void
    {
        $user = $this->user();
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'incorrect'])
                ->assertUnauthorized();
        }
        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'incorrect'])
            ->assertStatus(429)->assertHeader('Retry-After');
    }

    public function test_production_environment_refuses_demo_seeding(): void
    {
        app()->detectEnvironment(fn () => 'production');
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Demo data may only be seeded');
        (new DatabaseSeeder)->run();
    }

    public function test_passengers_cannot_access_staff_finance_data(): void
    {
        $this->withToken($this->login($this->user()))->getJson('/api/finance/audits')->assertForbidden();
    }

    public function test_password_recovery_uses_frontend_link_and_revokes_existing_tokens(): void
    {
        Notification::fake();
        config(['services.frontend_url' => 'https://tickets.example.com']);
        $user = $this->user();
        $oldToken = $this->login($user);
        $this->postJson('/api/auth/forgot-password', ['email' => $user->email])->assertOk();

        $resetToken = null;
        Notification::assertSentTo($user, FrontendResetPassword::class, function ($notification) use ($user, &$resetToken) {
            $resetToken = $notification->token;
            $this->assertStringStartsWith('https://tickets.example.com/reset-password?', $notification->toMail($user)->actionUrl);
            return true;
        });
        $this->postJson('/api/auth/reset-password', [
            'email' => $user->email, 'token' => 'invalid',
            'password' => 'new-long-test-password', 'password_confirmation' => 'new-long-test-password',
        ])->assertUnprocessable();
        $this->postJson('/api/auth/reset-password', [
            'email' => $user->email, 'token' => $resetToken,
            'password' => 'new-long-test-password', 'password_confirmation' => 'new-long-test-password',
        ])->assertOk();
        $this->assertTrue(Hash::check('new-long-test-password', $user->fresh()->password));
        Auth::forgetGuards();
        $this->withToken($oldToken)->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_password_recovery_does_not_disclose_whether_an_email_exists(): void
    {
        Notification::fake();
        $user = $this->user();
        $known = $this->postJson('/api/auth/forgot-password', ['email' => $user->email])->assertOk();
        $unknown = $this->postJson('/api/auth/forgot-password', ['email' => 'unknown@example.com'])->assertOk();
        $this->assertSame($known->json(), $unknown->json());
    }

    private function user(): User
    {
        return User::factory()->create(['password' => Hash::make('a-long-test-password')]);
    }

    private function login(User $user): string
    {
        return $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'a-long-test-password'])
            ->assertOk()->json('token');
    }
}
