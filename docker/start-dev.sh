#!/bin/sh
set -eu
mkdir -p /workspace/tmp
export TMPDIR=/workspace/tmp
export npm_config_cache=/workspace/tmp/npm-cache
if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi
npm run db:init
exec npm run dev
