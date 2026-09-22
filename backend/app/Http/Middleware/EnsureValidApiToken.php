<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureValidApiToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user || $user->disabled_at || ! $user->api_token_expires_at || $user->api_token_expires_at->isPast()) {
            return response()->json(['message' => 'Your session has expired. Please sign in again.'], 401);
        }

        return $next($request);
    }
}
