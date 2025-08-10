#!/usr/bin/env bash
set -euo pipefail

# Start only the Postgres dev container
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

docker compose -f ./docker-compose.dev.yml up -d db

echo "Postgres is up at localhost:5432"
echo "Database: dev_db | User: postgres | Password: password"