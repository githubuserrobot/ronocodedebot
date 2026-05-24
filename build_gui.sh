#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUI_DIR="$ROOT_DIR/packages/nc-gui"
NOCODB_PKG="$ROOT_DIR/packages/nocodb/package.json"

# Allow node to use 8 GB of ram (preserve existing NODE_OPTIONS if present)
export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=8192"

# Ensure nocodb uses the locally built GUI instead of the published version
if grep -q '"nc-lib-gui": "link:' "$NOCODB_PKG"; then
  echo "nc-lib-gui already linked locally."
else
  echo "Patching nocodb/package.json to link local nc-lib-gui..."
  sed -i.bak 's|"nc-lib-gui": "[^"]*"|"nc-lib-gui": "link:../nc-lib-gui"|' "$NOCODB_PKG"
  rm -f "$NOCODB_PKG.bak"
fi

echo "Building nocodb-sdk..."
pnpm --dir "$ROOT_DIR" --filter=nocodb-sdk run build

echo "Linking local nocodb-sdk into consumers..."
pnpm --dir "$ROOT_DIR" run install:local-sdk

echo "Cleaning previous GUI build artifacts..."
rm -rf "$GUI_DIR/.nuxt" "$GUI_DIR/.output" "$GUI_DIR/dist"

echo "Building GUI and copying to nc-lib-gui..."
pnpm --dir "$GUI_DIR" run build:copy

echo "Restarting nocodb service..."
sudo systemctl restart nocodb.service

echo "Done."
