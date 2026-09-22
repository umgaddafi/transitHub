#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Change to script directory (project root)
cd "$(dirname "$0")"

echo "==================================="
echo "🚀 Starting TransitHub Deployment Process..."
echo "==================================="

# 1. Backup the database
echo ""
echo "🗄️  Backing up database in root directory..."

MYSQLDUMP="mysqldump"
if ! command -v mysqldump &> /dev/null; then
    if [ -x /opt/lampp/bin/mysqldump ]; then
        MYSQLDUMP="/opt/lampp/bin/mysqldump"
    fi
fi

DB_CONN="mysql"
DB_NAME="transithub"

if [ -f backend/.env ]; then
    ENV_CONN=$(grep -E '^DB_CONNECTION=' backend/.env | head -n 1 | cut -d '=' -f2 | tr -d ' "\r\n')
    if [ -n "$ENV_CONN" ]; then
        DB_CONN="$ENV_CONN"
    fi
    ENV_DB=$(grep -E '^DB_DATABASE=' backend/.env | head -n 1 | cut -d '=' -f2 | tr -d ' "\r\n')
    if [ -n "$ENV_DB" ]; then
        DB_NAME="$ENV_DB"
    fi
fi

if [ "$DB_CONN" = "sqlite" ]; then
    if [ -f "backend/database/database.sqlite" ]; then
        cp "backend/database/database.sqlite" "transithub_sqlite.backup"
        echo "✅ SQLite database backup complete: transithub_sqlite.backup"
    fi
else
    # Check if bus_ticketing_system or detected DB exists in local MySQL
    if command -v "$MYSQLDUMP" &> /dev/null || [ -x "$MYSQLDUMP" ]; then
        BACKUP_FILE="${DB_NAME}.sql"
        echo "📦 Attempting dump of MySQL database '$DB_NAME' using 'mysql -u root'..."
        if $MYSQLDUMP -u root "$DB_NAME" > "$BACKUP_FILE" 2>/dev/null; then
            echo "✅ Database backup complete: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
        elif $MYSQLDUMP -u root "bus_ticketing_system" > "bus_ticketing_system.sql" 2>/dev/null; then
            echo "✅ Database backup complete: bus_ticketing_system.sql ($(du -h "bus_ticketing_system.sql" | cut -f1))"
        else
            echo "⚠️  MySQL dump skipped or database not found. Continuing deployment..."
        fi
    fi
fi

# 2. Build the frontend
echo ""
echo "📦 Building frontend with Vite..."
cd frontend
npm run build
cd ..

# 3. Copy frontend build files to root
echo ""
echo "📂 Copying frontend build files to root..."
cp -r frontend/dist/* .

# 4. Stage changes (Secrets / .env / .sql files are strictly excluded)
echo ""
echo "📝 Staging changes for git..."
git add index.html assets/ images/ videos/ favicon* icons* .htaccess package.json README.md docs/ backend/ frontend/ .gitignore deploy.sh 2>/dev/null || true
git add .

# Strict security safeguard: Never stage or commit any .env or .sql file
git reset HEAD backend/.env* frontend/.env* .env* *.local_backup *.sql *.sql.gz *.dump transithub_sqlite.backup 2>/dev/null || true
git reset HEAD frontend/node_modules backend/storage/framework/cache/data backend/storage/logs/*.log 2>/dev/null || true
git add -f backend/.env.example frontend/.env.example 2>/dev/null || true

# Force add backend/vendor if it exists for cPanel / Bluehost hosts lacking composer CLI
if [ -d backend/vendor ]; then
    echo "📦 Staging backend/vendor dependencies for server hosting..."
    git add -f backend/vendor
fi

# 5. Commit changes
echo ""
echo "💾 Committing changes..."
# We use || true so the script doesn't fail if there's nothing to commit
git commit -m "Deploy update to host - $(date +'%Y-%m-%d %H:%M:%S')" || true

# 6. Push to GitHub
echo ""
echo "☁️  Pushing to GitHub..."
git pull origin HEAD --rebase || true
git push origin HEAD

echo ""
echo "================================================================"
echo "✅ Deployment pushed to GitHub successfully! (No secrets included)"
echo "ℹ️  Remember: upload backend/.env.host to cPanel / Bluehost as backend/.env"
echo "ℹ️  GitHub Actions FTP Deploy will automatically sync files to server."
echo "================================================================"
