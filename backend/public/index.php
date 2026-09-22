<?php

use Illuminate\Foundation\Application;
use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

// Load essential polyfills for hosting environments missing mbstring regex
if (file_exists(__DIR__.'/../bootstrap/polyfills.php')) {
    require_once __DIR__.'/../bootstrap/polyfills.php';
}

// Direct diagnostic ping
if (isset($_GET['api_ping'])) {
    header('Content-Type: application/json');
    echo json_encode([
        'status' => 'ok',
        'app' => 'TransitHub API',
        'php' => PHP_VERSION,
        'time' => date('Y-m-d H:i:s')
    ]);
    exit;
}

try {
    // Determine if the application is in maintenance mode...
    if (file_exists($maintenance = __DIR__.'/../storage/framework/maintenance.php')) {
        require $maintenance;
    }

    // Register the Composer autoloader...
    require __DIR__.'/../vendor/autoload.php';

    // Bootstrap Laravel and handle the request...
    /** @var Application $app */
    $app = require_once __DIR__.'/../bootstrap/app.php';

    // Support subfolder deployments (e.g. /transit/api in XAMPP/LAMPP)
    if (isset($_SERVER['REQUEST_URI']) && str_starts_with($_SERVER['REQUEST_URI'], '/transit/api')) {
        $_SERVER['REQUEST_URI'] = substr($_SERVER['REQUEST_URI'], 8);
        $_SERVER['SCRIPT_NAME'] = '/index.php';
    }

    $app->handleRequest(Request::capture());
} catch (\Throwable $e) {
    header('Content-Type: application/json');
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => $e->getMessage(),
        'file' => basename($e->getFile()),
        'line' => $e->getLine(),
    ]);
    exit;
}
