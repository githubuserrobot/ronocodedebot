#!/usr/bin/env bash
set -euo pipefail

# Full local development setup script
# This script combines down.sh, up.sh, and clone_cluster.sh for complete local dev setup

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

echo "🚀 Starting full local development setup..."
echo "This will:"
echo "  1. Shut down existing containers"
echo "  2. Start fresh Postgres container"
echo "  3. Clone data from remote cluster"
echo "  4. Install dependencies and bootstrap"
echo "  5. Start production server"
echo ""

# Check if SSH_URL is provided
if [[ -z "${SSH_URL:-}" ]]; then
  echo "❌ ERROR: SSH_URL is required for cloning remote cluster data"
  echo "Usage: SSH_URL=user@host pnpm run local:setup"
  exit 1
fi

# Step 1: Run down.sh
echo "📝 [1/5] Shutting down existing containers..."
bash ./scripts/dev/down.sh

# Step 2: Run up.sh
echo "📝 [2/5] Starting fresh Postgres container..."
bash ./scripts/dev/up.sh

# Step 3: Run clone_cluster.sh
echo "📝 [3/5] Cloning data from remote cluster..."
bash ./scripts/db/clone_cluster.sh

# Step 4: Install dependencies and bootstrap
echo "📝 [4/5] Installing dependencies..."
pnpm i

echo "📝 [4/5] Running bootstrap..."
pnpm bootstrap

# Export environment variables for NocoDB development
echo "📝 Setting up environment variables..."
export NC_DB="pg://localhost?u=nocodb&p=nocodbpassword&d=nocodb-dev"
export NC_ENABLE_ALL_API_ERROR_LOGGING=true
export NUXT_PUBLIC_NC_BACKEND_URL=http://localhost:8080
export PORT=8080

echo ""
echo "🎯 Your local development environment is ready!"
echo "   Database: dev_db"
echo "   Host: localhost:5432"
echo "   User: postgres"
echo "   Password: password"
echo ""
echo "🔧 Environment variables set:"
echo "   NC_DB=$NC_DB"
echo "   NC_ENABLE_ALL_API_ERROR_LOGGING=$NC_ENABLE_ALL_API_ERROR_LOGGING"
echo "   NUXT_PUBLIC_NC_BACKEND_URL=$NUXT_PUBLIC_NC_BACKEND_URL"
echo "   PORT=$PORT"

# Step 5: Start server
echo ""
echo "📝 [5/5] Starting server..."
echo "🚀 Running pnpm start:prod..."
pnpm start:prod
