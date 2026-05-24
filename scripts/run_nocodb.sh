#!/bin/bash

export NC_DB="pg://localhost?u=nocodb&p=nocodbpassword&d=nocodb-dev"
export NC_ENABLE_ALL_API_ERROR_LOGGING=true
export NUXT_PUBLIC_NC_BACKEND_URL=http://localhost:8080
export PORT=8080
export NC_REDIS_URL=redis://127.0.0.1:6379
export NC_ATTACHMENT_EXPIRE_SECONDS=86400
export NC_KEEP_CACHE=true
export NC_MEMORY=712
export REDIS_MEM=128MB

export NODE_VERSION=22

if [[ -f "$HOME/.nvm/nvm.sh" ]]; then
  source "$HOME/.nvm/nvm.sh"
  # Install the required Node version if not already installed
  nvm install "$NODE_VERSION" 2>/dev/null || true
  nvm use "$NODE_VERSION" 2>/dev/null || true
  export PATH="$HOME/.nvm/versions/node/$(nvm current)/bin:$PATH"
fi

echo "NC MEM $NC_MEMORY REDIS MEM $REDIS_MEM"
echo "Node: $(node -v)  Pnpm: $(pnpm -v 2>/dev/null || echo 'not found')"
redis-cli config set maxmemory $REDIS_MEM

cd /home/ubuntu/repos/nocodb

# Use pnpm from PATH (set up by nvm's npm global bin or corepack)
pnpm start:prod
