# Docker & Deploy Script — Design Spec

**Date:** 2026-04-10

## Goal

Containerise the app with Docker so it runs reproducibly, and provide a one-command deploy script that pulls the latest master, rebuilds the image, and restarts the container with zero data loss.

---

## Architecture

The app is a single Hono server that serves both the API and the built React frontend as static files. Everything fits in one container. Runtime dependencies (Ollama, the SQLite DB, resume/preferences files) live outside the container and are provided via mounts or network access.

```
Host machine
├── new-era/
│   ├── data/          ← resume.md + preferences.md (mounted read-only)
│   ├── db/            ← jobs.db (mounted read-write)
│   ├── backups/       ← backup files (mounted read-write)
│   └── .env           ← JSEARCH_API_KEY, AUTH_SECRET
│
└── Docker container
    ├── /app/src/      ← source (baked in)
    ├── /app/dist/     ← built React client (baked in)
    ├── /app/data/     ← ← mounted from host ./data (ro)
    ├── /app/db/       ← ← mounted from host ./db
    └── /app/backups/  ← ← mounted from host ./backups
```

Ollama runs on the host at port 11434. The container reaches it via `host.docker.internal` (enabled by `extra_hosts: host.docker.internal:host-gateway` in Compose).

---

## Files

### `Dockerfile`

```
FROM oven/bun:1
WORKDIR /app

# Install dependencies first (layer-cached)
COPY package.json bun.lockb* ./
COPY src/client/package.json ./src/client/
COPY src/server/package.json ./src/server/
RUN bun install --frozen-lockfile

# Copy source and build client
COPY . .
RUN bun run build

EXPOSE 3000
CMD ["bun", "run", "src/server/index.ts"]
```

Dep installation is a separate layer from source copy so it's cached on rebuilds unless `package.json` changes.

### `docker-compose.yml`

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data:ro
      - ./db:/app/db
      - ./backups:/app/backups
    env_file: .env
    environment:
      - OLLAMA_BASE_URL=http://host.docker.internal:11434
    extra_hosts:
      - "host.docker.internal:host-gateway"
    restart: unless-stopped
```

`env_file` injects `JSEARCH_API_KEY` and `AUTH_SECRET` from the host `.env`. The `OLLAMA_BASE_URL` override is set directly in Compose so it doesn't need to be in `.env`.

### `.dockerignore`

```
node_modules/
dist/
db/
backups/
data/
.env
.git/
graphify-out/
test-results/
*.png
```

Keeps the build context small — runtime directories (db, data, backups) are excluded since they're mounted at runtime.

### `scripts/deploy.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "→ Pulling latest master..."
git pull origin master

echo "→ Building image..."
docker compose build

echo "→ Restarting container..."
docker compose up -d

echo "✓ Deployed."
```

`cd "$(dirname "$0")/.."` ensures the script works from any working directory. `set -euo pipefail` stops on any error. The DB and data volumes are untouched across restarts.

---

## Data Safety

- `./db/` is bind-mounted — the SQLite file stays on the host across container stops, restarts, and image rebuilds. No data is lost on deploy.
- `./data/` is read-only — the container can never modify resume or preferences files.
- `./backups/` is bind-mounted — backup files persist and are accessible directly on the host.

---

## Usage

**First run:**
```bash
docker compose up -d
```

**Deploy latest master:**
```bash
./scripts/deploy.sh
```

**View logs:**
```bash
docker compose logs -f
```

**Stop:**
```bash
docker compose down
```
