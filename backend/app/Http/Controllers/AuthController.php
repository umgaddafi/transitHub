<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $this->normalizeEmail($request);
        $credentials = $request->validate([
            'email' => 'required|string|email|max:255',
            'password' => 'required|string|max:1024',
        ]);

        $user = User::whereRaw('LOWER(email) = ?', [$credentials['email']])->first();
        if (! $user || $user->disabled_at || ! Hash::check($credentials['password'], $user->password)) {
            return response()->json(['message' => 'Invalid email or password.'], 401);
        }

        if (Hash::needsRehash($user->password)) {
            $user->password = Hash::make($credentials['password']);
        }

        return $this->issueToken($user);
    }

    public function register(Request $request): JsonResponse
    {
        $this->normalizeEmail($request);
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users,email',
            'password' => 'required|string|min:12|max:1024|confirmed',
            'phone' => 'nullable|string|max:30',
        ]);

        return DB::transaction(function () use ($validated) {
            $user = User::create([
                'name' => $validated['name'],
                'email' => $validated['email'],
                'password' => Hash::make($validated['password']),
                'phone' => $validated['phone'] ?? null,
                'role' => 'passenger',
            ]);

            return $this->issueToken($user, 201);
        });
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $request->user()]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->forceFill(['api_token' => null, 'api_token_expires_at' => null])->save();

        return response()->json(['message' => 'Logged out successfully.']);
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $this->normalizeEmail($request);
        $credentials = $request->validate(['email' => 'required|string|email|max:255']);
        Password::sendResetLink($credentials);

        // Keep the response identical for unknown accounts and throttled requests.
        return response()->json(['message' => 'If an account exists for this email, a password reset link has been sent.']);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $this->normalizeEmail($request);
        $credentials = $request->validate([
            'email' => 'required|string|email|max:255',
            'token' => 'required|string|max:255',
            'password' => 'required|string|min:12|max:1024|confirmed',
        ]);

        $status = Password::reset($credentials, function (User $user, string $password) {
            $user->forceFill([
                'password' => Hash::make($password),
                'remember_token' => Str::random(60),
                'api_token' => null,
                'api_token_expires_at' => null,
            ])->save();
            event(new PasswordReset($user));
        });

        if ($status !== Password::PASSWORD_RESET) {
            return response()->json(['message' => 'This password reset link is invalid or expired. Please request a new link.'], 422);
        }

        return response()->json(['message' => 'Your password has been reset. You can now sign in.']);
    }

    private function issueToken(User $user, int $status = 200): JsonResponse
    {
        $token = bin2hex(random_bytes(32));
        $expiresAt = now()->addMinutes(max(1, (int) config('auth.api_token_ttl_minutes', 720)));
        $user->forceFill([
            'api_token' => hash('sha256', $token),
            'api_token_expires_at' => $expiresAt,
        ])->save();

        return response()->json([
            'user' => $user,
            'token' => $token,
            'token_type' => 'Bearer',
            'expires_at' => $expiresAt->toIso8601String(),
        ], $status);
    }

    private function normalizeEmail(Request $request): void
    {
        if (is_string($request->input('email'))) {
            $request->merge(['email' => Str::lower(trim($request->input('email')))]);
        }
    }
}
