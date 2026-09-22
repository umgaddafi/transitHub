<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class AiController extends Controller
{
    public function chat(Request $request)
    {
        $prompt = $request->input('prompt', '');
        $apiKey = env('GEMINI_API_KEY');

        if (empty($prompt)) {
            return response()->json(['status' => 'error', 'message' => 'Prompt is required.'], 400);
        }

        // System prompt context
        $systemPrompt = "You are TransitHub AI Copilot, a helpful transit assistant for inter-state coach travel in Nigeria. Routes include Lagos, Abuja, Port Harcourt, Benin City, Kano. Vehicle choices include 14-seater HiAce and 7-seater Sienna. Always require Next of Kin contact details for emergency safety compliance. Answer concisely in friendly bullet points.";

        if (!empty($apiKey)) {
            try {
                $response = Http::post("https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key={$apiKey}", [
                    'contents' => [
                        [
                            'parts' => [
                                ['text' => "{$systemPrompt}\n\nUser Question: {$prompt}"]
                            ]
                        ]
                    ]
                ]);

                if ($response->successful()) {
                    $json = $response->json();
                    $reply = $json['candidates'][0]['content']['parts'][0]['text'] ?? "Thank you for reaching out! Our coaches operate daily schedules with 14-seater and 7-seater vehicles.";
                    return response()->json(['status' => 'success', 'reply' => $reply]);
                }
            } catch (\Exception $e) {
                // Fallback mock answer if internet or key issue
            }
        }

        // Intelligent local response matching
        $lower = strtolower($prompt);
        $reply = "⚡ **TransitHub AI Assistant**: ";
        if (str_contains($lower, 'book') || str_contains($lower, 'ticket') || str_contains($lower, 'seat')) {
            $reply .= "To book a ticket:\n1. Select your **Origin**, **Destination**, and **Vehicle Type** (14-seater vs 7-seater).\n2. Pick your seat from the interactive grid.\n3. Enter mandatory **Next of Kin** emergency details.\n4. Complete payment to get your instant QR Boarding Pass!";
        } else if (str_contains($lower, 'vehicle') || str_contains($lower, '7') || str_contains($lower, '14')) {
            $reply .= "We offer two premium vehicle configurations:\n• **14-Seater HiAce Coach**: Spacious aisle seat layout.\n• **7-Seater Sienna SUV**: Executive legroom and personalized comfort.";
        } else if (str_contains($lower, 'kin') || str_contains($lower, 'emergency')) {
            $reply .= "For safety compliance across all state highway corridors, every passenger must provide a **Next of Kin Name** and **Phone Number** during seat reservation.";
        } else {
            $reply .= "TransitHub offers daily inter-state departures connecting Lagos, Abuja, Port Harcourt, Benin City, and Kano with zero booking fees and instant QR boarding pass validation.";
        }

        return response()->json(['status' => 'success', 'reply' => $reply]);
    }
}
