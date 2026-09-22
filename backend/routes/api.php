<?php

use App\Http\Controllers\AiController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\BookingController;
use App\Http\Controllers\DispatchController;
use App\Http\Controllers\FinanceController;
use App\Http\Controllers\OperationsController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\PosController;
use Illuminate\Support\Facades\Route;

Route::middleware('throttle:auth')->group(function () {
    Route::post('/auth/login', [AuthController::class, 'login']);
    Route::post('/auth/register', [AuthController::class, 'register']);
    Route::post('/auth/forgot-password', [AuthController::class, 'forgotPassword']);
    Route::post('/auth/reset-password', [AuthController::class, 'resetPassword']);
});
Route::middleware('throttle:public-api')->group(function () {
    Route::get('/routes', [BookingController::class, 'getRoutes']);
    Route::get('/states', [BookingController::class, 'getStates']);
    Route::get('/search', [BookingController::class, 'search']);
    Route::post('/ai/chat', [AiController::class, 'chat']);
});
Route::post('/payments/webhook', [PaymentController::class, 'webhook']);
Route::middleware(['auth:api', 'token.valid', 'throttle:api'])->group(function () {
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/tickets', [BookingController::class, 'myTickets']);
    Route::post('/tickets/book', [BookingController::class, 'bookTicket']);
    Route::get('/tickets/lookup/{pnr}', [BookingController::class, 'lookupTicket']);
    Route::post('/tickets/cancel/{pnr}', [BookingController::class, 'cancelTicket']);
    Route::post('/payments/initialize', [PaymentController::class, 'initialize']);
    Route::post('/payments/verify', [PaymentController::class, 'verify']);
    Route::post('/pos/issue', [PosController::class, 'issueTicket'])->middleware('role:admin,pos');
    Route::post('/pos/luggage-tags', [PosController::class, 'printLuggageTags'])->middleware('role:admin,pos');
    Route::middleware('role:admin,dispatch,pos,marshal,driver,finance')->group(function () {
        Route::get('/operations', [OperationsController::class, 'index']);
        Route::get('/operations/trips/{trip}/manifest', [OperationsController::class, 'manifest']);
    });
    Route::post('/operations/board', [OperationsController::class, 'board'])->middleware('role:admin,marshal');
    Route::post('/operations/trips/{trip}/status', [OperationsController::class, 'transition'])->middleware('role:admin,dispatch,driver');
    Route::middleware('role:admin,dispatch')->group(function () {
        Route::get('/dispatch/fleet', [DispatchController::class, 'getFleet']);
        Route::post('/dispatch/assign', [DispatchController::class, 'assignTrip']);
        Route::post('/dispatch/trips', [OperationsController::class, 'createTrip']);
        Route::post('/admin/routes', [OperationsController::class, 'createRoute']);
        Route::post('/admin/buses', [OperationsController::class, 'createBus']);
        Route::post('/admin/buses/{bus}/status', [OperationsController::class, 'updateBusStatus']);
    });
    Route::post('/admin/users', [OperationsController::class, 'createUser'])->middleware('role:admin');
    Route::get('/admin/users', [OperationsController::class, 'users'])->middleware('role:admin');
    Route::post('/admin/users/{user}/access', [OperationsController::class, 'userAccess'])->middleware('role:admin');
    Route::post('/finance/handover', [FinanceController::class, 'submitHandover'])->middleware('role:admin,pos,finance');
    Route::middleware('role:admin,finance')->group(function () {
        Route::get('/finance/audits', [FinanceController::class, 'getAuditLogs']);
        Route::get('/finance/summary', [FinanceController::class, 'summary']);
        Route::post('/finance/refund/{pnr}', [PaymentController::class, 'refund']);
    });
});
