<?php

use Illuminate\Support\Facades\Route;

Route::get('/{path?}', function () {
    $index = public_path('app.html');
    abort_unless(is_file($index), 503, 'The frontend build is not installed. Build the release or use the Vite development server.');
    return response()->file($index, ['Cache-Control' => 'no-cache']);
})->where('path', '^(?!api(?:/|$)|up(?:/|$)|assets(?:/|$)|images(?:/|$)).*$');
