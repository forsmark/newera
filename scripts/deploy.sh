#!/usr/bin/env bash
set -euo pipefail

# Run from repo root regardless of where the script is invoked from
cd "$(dirname "$0")/.."

echo "→ Pulling latest master..."
git pull origin master

echo "→ Building image..."
docker compose build

echo "→ Restarting container..."
docker compose up -d

echo "✓ Deployed. Logs: docker compose logs -f"
