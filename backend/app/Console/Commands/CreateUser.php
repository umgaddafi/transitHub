<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class CreateUser extends Command
{
    protected $signature = 'app:create-user';
    protected $description = 'Create the initial operator account securely using interactive prompts';

    public function handle(): int
    {
        if (! $this->input->isInteractive()) {
            $this->error('Use an interactive terminal. Passwords must not be supplied in command history.');
            return self::FAILURE;
        }
        $data = ['name' => $this->ask('Full name'), 'email' => strtolower(trim((string) $this->ask('Email address'))),
            'role' => $this->choice('Role', ['admin', 'dispatch', 'pos', 'marshal', 'finance', 'driver'], 'admin'),
            'password' => $this->secret('Password (at least 12 characters)'), 'password_confirmation' => $this->secret('Confirm password')];
        $validator = Validator::make($data, ['name' => 'required|string|max:255', 'email' => 'required|email|max:255|unique:users,email',
            'role' => ['required', Rule::in(['admin', 'dispatch', 'pos', 'marshal', 'finance', 'driver'])], 'password' => 'required|string|min:12|max:128|confirmed']);
        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $message) {
                $this->error($message);
            }
            return self::FAILURE;
        }
        DB::transaction(function () use ($data) {
            $user = User::create($data);
            AuditLog::create(['user_name' => 'Server operator', 'role' => 'system', 'action' => 'Account provisioned through CLI', 'details' => 'Account #'.$user->id.' role '.$user->role]);
        });
        $this->info('Account created. Sign in with the email address and password you supplied.');
        return self::SUCCESS;
    }
}
