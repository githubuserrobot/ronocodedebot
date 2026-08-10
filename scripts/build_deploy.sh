#!/bin/bash
#
# build_deploy.sh — build everything needed to run NocoDB on a bare-metal
# server (no Docker) and optionally rsync the result to a host.
#
# Produces:
#   packages/nc-lib-gui/lib/dist/   the statically-generated GUI
#   packages/nocodb/dist/main.js    the backend, precompiled TS -> JS (rspack)
#
# The precompiled backend runs with plain `node dist/main.js` (no swc-node
# register / no TS source needed at runtime). node_modules are external to the
# bundle, so the target still needs `pnpm install`.
#
# Usage:
#   scripts/build_deploy.sh [rsync-target]
#
#   rsync-target   optional `user@host:/path/to/nocodb` to rsync the repo
#                  (minus .git / node_modules / GUI build caches) to. If given,
#                  also runs `pnpm install --frozen-lockfile` on the server.
#
# Requires on the server (matches scripts/run_nocodb.sh):
#   - node via nvm (NODE_VERSION=24)
#   - pnpm
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RSYNC_TARGET="${1:-}"

# Allow node to use 8 GB of ram (preserve existing NODE_OPTIONS if present)
export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=8192"

echo "Building nocodb-sdk..."
pnpm --dir "$ROOT_DIR" --filter=nocodb-sdk run build

echo "Linking local nocodb-sdk into consumers..."
pnpm --dir "$ROOT_DIR" run install:local-sdk

echo "Cleaning previous GUI build artifacts..."
rm -rf "$ROOT_DIR/packages/nc-gui/.nuxt" "$ROOT_DIR/packages/nc-gui/.output" "$ROOT_DIR/packages/nc-gui/dist"

echo "Building GUI and copying to nc-lib-gui..."
pnpm --dir "$ROOT_DIR/packages/nc-gui" run build:copy

echo "Compiling backend to packages/nocodb/dist/main.js..."
pnpm --dir "$ROOT_DIR/packages/nocodb" run build:prod

echo
echo "Done. Artifacts:"
echo "  packages/nc-lib-gui/lib/dist/   (GUI)"
echo "  packages/nocodb/dist/main.js     (backend)"
echo "Start locally with:"
echo "  (cd packages/nocodb && node dist/main.js)"
echo

if [[ -n "$RSYNC_TARGET" ]]; then
  REMOTE_HOST="${RSYNC_TARGET%%:*}"
  REMOTE_DIR="${RSYNC_TARGET#*:}"
  echo "Rsyncing repo (excluding .git, node_modules, GUI build caches) to $RSYNC_TARGET ..."
  rsync -rvzh --delete \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude 'packages/nc-gui/.nuxt' \
    --exclude 'packages/nc-gui/.output' \
    --exclude 'packages/nc-gui/dist' \
    "$ROOT_DIR/" "$RSYNC_TARGET/"
  echo
  echo "Installing deps on the server..."
  ssh "$REMOTE_HOST" "set -euo pipefail; cd '$REMOTE_DIR' && pnpm install --frozen-lockfile"
  echo
  echo "Deployed to $REMOTE_HOST:$REMOTE_DIR"
  echo "Start the compiled backend on the server with:"
  echo "  cd '$REMOTE_DIR/packages/nocodb' && node dist/main.js"
  echo "(restart your existing service/systemd unit if you manage it that way.)"
else
  echo "To deploy to a server, pass an rsync target, e.g.:"
  echo "  scripts/build_deploy.sh ubuntu@server:/home/ubuntu/repos/nocodb"
fi
