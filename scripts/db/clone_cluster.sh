#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.dev.yml"
SERVICE="db"

# Remote SSH target (required) in the form user@host
SSH_URL="${SSH_URL:-}"
REMOTE_DUMP_DIR="${REMOTE_DUMP_DIR:-/tmp}"
REMOTE_DUMP_FILE_NAME="${REMOTE_DUMP_FILE_NAME:-pg_cluster_dump.sql}"
REMOTE_DUMP_PATH="$REMOTE_DUMP_DIR/$REMOTE_DUMP_FILE_NAME"

if [[ -z "$SSH_URL" ]]; then
  echo "ERROR: Provide SSH_URL (e.g., SSH_URL=ubuntu@3.16.158.221)"
  exit 1
fi

# Dump file location (local)
DUMP_FILE="${DUMP_FILE:-$REPO_ROOT/tmp/pg_cluster_dump.sql}"

# Local Postgres connection (inside container)
TARGET_USER="${TARGET_USER:-postgres}"
TARGET_PASSWORD="${TARGET_PASSWORD:-password}"

mkdir -p "$(dirname "$DUMP_FILE")"

# 1) Dump on remote as postgres into a file
echo "[1/4] Dumping remote cluster to $REMOTE_DUMP_PATH"
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ServerAliveInterval=30 "$SSH_URL" \
  "sudo -n -u postgres bash -lc 'pg_dumpall > \"$REMOTE_DUMP_PATH\"'"

# 2) Rsync the dump back locally with compression
echo "[2/4] Rsync dump to local: $DUMP_FILE"
rsync -az --progress -e "ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null" \
  "$SSH_URL:$REMOTE_DUMP_PATH" "$DUMP_FILE"

# 3) Recreate local Postgres for a clean restore
echo "[3/4] Recreating local Postgres container (this wipes local data)"
docker compose -f "$COMPOSE_FILE" down -v || true
docker compose -f "$COMPOSE_FILE" up -d "$SERVICE"

echo "Waiting for local Postgres to be healthy..."
until docker compose -f "$COMPOSE_FILE" exec -T "$SERVICE" pg_isready -U "$TARGET_USER" >/dev/null 2>&1; do
  sleep 1
done

# 4) Restore locally from the file
echo "[4/4] Restoring dump into local Postgres from: $DUMP_FILE"
cat "$DUMP_FILE" | docker compose -f "$COMPOSE_FILE" exec -T "$SERVICE" bash -lc "PGPASSWORD='$TARGET_PASSWORD' psql -U '$TARGET_USER' -d postgres"

echo "Done. Cluster cloned via rsync. Dump kept at: $DUMP_FILE" 