# TransitHub Production Deployment & Operations Guide

TransitHub is an enterprise smart mobility and bus ticketing platform built with a high-performance **Laravel 12 REST API backend** and a modern **React 19 / TypeScript / Vite Single-Page Application (SPA)**.

---

## 1. System Requirements

| Component | Minimum Specification |
|---|---|
| Operating System | Ubuntu 22.04 LTS / Debian 12 / RHEL 9 |
| Web Server | Nginx 1.22+ or Apache 2.4.52+ (with `mod_rewrite` & `mod_headers`) |
| PHP Runtime | PHP 8.2 or 8.3 with `bcmath`, `curl`, `dom`, `fileinfo`, `mbstring`, `openssl`, `pdo_mysql`, `xml`, `zip` |
| Database | MySQL 8.0+ / MariaDB 10.11+ / PostgreSQL 14+ (InnoDB engine required) |
| Process Manager | Supervisor 4.2+ (for queue processing) |
| Cron Daemon | Standard system cron (`crond`) |
| Memory & CPU | Minimum 2 vCPU, 4GB RAM, 20GB SSD |

---

## 2. Production Environment Configuration (`.env`)

Deploy your environment variables into `backend/.env`. Never commit `.env` into version control.

```dotenv
APP_NAME="TransitHub"
APP_ENV=production
APP_KEY=base64:YOUR_GENERATED_32_BYTE_KEY=
APP_DEBUG=false
APP_URL=https://tickets.yourdomain.com
FRONTEND_URL=https://tickets.yourdomain.com
APP_LOCALE=en
APP_FALLBACK_LOCALE=en
APP_MAINTENANCE_DRIVER=file

LOG_CHANNEL=stack
LOG_STACK=daily
LOG_LEVEL=warning

# Database Configuration
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=transithub_prod
DB_USERNAME=transithub_app
DB_PASSWORD=YOUR_STRONG_DATABASE_PASSWORD

CACHE_STORE=database
QUEUE_CONNECTION=database
SESSION_DRIVER=database
SESSION_LIFETIME=120
SESSION_ENCRYPT=true
SESSION_SECURE_COOKIE=true
SESSION_HTTP_ONLY=true
SESSION_SAME_SITE=lax

BCRYPT_ROUNDS=12
API_TOKEN_TTL_MINUTES=720
BOOKING_HOLD_MINUTES=15
FILESYSTEM_DISK=local

# Outbound Email Delivery
MAIL_MAILER=smtp
MAIL_SCHEME=smtp
MAIL_HOST=smtp.sendgrid.net
MAIL_PORT=587
MAIL_USERNAME=apikey
MAIL_PASSWORD=YOUR_SENDGRID_API_KEY
MAIL_FROM_ADDRESS=support@yourdomain.com
MAIL_FROM_NAME="TransitHub Ticketing"

# Live Payment Gateway (Paystack)
PAYSTACK_SECRET_KEY=sk_live_YOUR_PAYSTACK_LIVE_KEY
PAYSTACK_CALLBACK_URL=https://tickets.yourdomain.com/client

# Optional Gemini AI Assistant API Key
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
```

---

## 3. Production Web Server Setup

In production, Laravel's `backend/public` is the single web root. Laravel handles API endpoints under `/api/*` and delivers the compiled React SPA (`app.html`) for all front-facing paths.

### Nginx Virtual Host Configuration (`/etc/nginx/sites-available/transithub`)

```nginx
server {
    listen 80;
    server_name tickets.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name tickets.yourdomain.com;
    root /var/www/transithub/backend/public;

    # SSL Certificates
    ssl_certificate /etc/letsencrypt/live/tickets.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tickets.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    index index.php app.html;
    charset utf-8;

    # Static Asset Caching
    location ~* \.(?:ico|css|js|gif|jpe?g|png|woff2?|eot|ttf|svg)$ {
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    # Main Router
    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    # PHP-FPM Processor
    location ~ \.php$ {
        fastcgi_pass unix:/run/php/php8.2-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
        fastcgi_hide_header X-Powered-By;
    }

    location ~ /\.(?!well-known).* {
        deny all;
    }
}
```

---

## 4. Deployment Steps

Run the following commands on the deployment target:

```bash
# 1. Extract the release artifact
mkdir -p /var/www/transithub
tar -xzf transithub-release.tar.gz -C /var/www/transithub

# 2. Set directory permissions
chown -R www-data:www-data /var/www/transithub/backend/storage /var/www/transithub/backend/bootstrap/cache
chmod -R 775 /var/www/transithub/backend/storage /var/www/transithub/backend/bootstrap/cache

# 3. Enter backend directory
cd /var/www/transithub/backend

# 4. Execute database migrations
php artisan migrate --force

# 5. Optimize configuration and routes
php artisan config:cache
php artisan route:cache
php artisan view:cache

# 6. Create the initial administrative operator account
php artisan app:create-user

# 7. Run production readiness verification
php artisan app:readiness
```

---

## 5. Scheduled Tasks (Cron)

TransitHub automatically releases unpaid seat holds every minute. Register Laravel's schedule runner in crontab (`crontab -e -u www-data`):

```cron
* * * * * cd /var/www/transithub/backend && php artisan schedule:run >> /dev/null 2>&1
```

Tasks executed automatically:
- `tickets:expire-holds` (every minute, releases expired reservations)
- `auth:clear-resets` (hourly, clears expired password tokens)

---

## 6. Background Queue Workers (Supervisor)

Create `/etc/supervisor/conf.d/transithub-worker.conf`:

```ini
[program:transithub-worker]
process_name=%(program_name)s_%(process_num)02d
command=php /var/www/transithub/backend/artisan queue:work database --sleep=3 --tries=3 --max-time=3600
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
user=www-data
numprocs=2
redirect_stderr=true
stdout_logfile=/var/www/transithub/backend/storage/logs/worker.log
stopwaitsecs=3600
```

Apply supervisor settings:
```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start transithub-worker:*
```

---

## 7. Paystack Webhook Configuration

1. Log in to the [Paystack Dashboard](https://dashboard.paystack.com/#/settings/developer).
2. Set the **Live Webhook URL** to:
   ```
   https://tickets.yourdomain.com/api/payments/webhook
   ```
3. Copy your **Live Secret Key** into `PAYSTACK_SECRET_KEY` in `backend/.env`.
4. The system validates all incoming webhooks using HMAC SHA-512 against `PAYSTACK_SECRET_KEY` to prevent fraudulent payment confirmation.

---

## 8. Backup & Maintenance Runbook

- **Database Backup**: Run nightly mysqldump with transaction consistency:
  ```bash
  mysqldump --single-transaction --quick --lock-tables=false -u transithub_app -p transithub_prod > /backup/transithub_$(date +%F).sql
  ```
- **Audit Logs**: The `audit_logs` table records every financial transaction, ticket boarding event, and role modification for regulatory compliance.

