# Docker & Deploy Script — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Containerise the app with a `Dockerfile` + `docker-compose.yml` and add a `scripts/deploy.sh` that pulls latest master, rebuilds, and restarts in one command.

**Architecture:** Single `oven/bun:1` container builds the React client at image-build time and serves it via the Hono server at runtime. Runtime state (DB, data files, backups) is provided through host bind-mounts so it survives deploys. Ollama is reached via `host.docker.internal`.

**Tech Stack:** Docker, Docker Compose v5, Bun, Hono (already in codebase)

---

## File Map

| File | Action |
|------|--------|
| `.dockerignore` | Create — exclude runtime dirs and noise from build context |
| `Dockerfile` | Create — install deps, build client, expose 3000, run server |
| `docker-compose.yml` | Create — ports, bind-mounts, env, Ollama host routing |
| `scripts/deploy.sh` | Create — pull, build, up -d |

---

## Task 1: `.dockerignore`

**Files:**
- Create: `.dockerignore`

- [ ] **Step 1: Create `.dockerignore`**

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
src/server/mobile-before.png
```

- [ ] **Step 2: Commit**

```bash
git add .dockerignore
git commit -m "chore: add .dockerignore"
```

---

## Task 2: `Dockerfile`

**Files:**
- Create: `Dockerfile`

- [ ] **Step 1: Create `Dockerfile`**

```dockerfile
FROM oven/bun:1
WORKDIR /app

# Install dependencies (layer-cached — only re-runs when package files change)
COPY package.json bun.lock ./
COPY src/client/package.json ./src/client/
COPY src/server/package.json ./src/server/
RUN bun install --frozen-lockfile

# Copy source and build the React client into dist/
COPY . .
RUN bun run build

EXPOSE 3000
CMD ["bun", "run", "src/server/index.ts"]
```

- [ ] **Step 2: Verify the image builds**

```bash
docker build -t new-era-test .
```

Expected: build completes, final line is something like `=> exporting to image`.

If it fails on `bun install --frozen-lockfile`, the lockfile may be out of sync — run `bun install` locally first, commit the updated `bun.lock`, then retry.

- [ ] **Step 3: Smoke-test the image in isolation**

```bash
docker run --rm -p 3001:3000 new-era-test
```

Expected: server starts and logs something like `[server] Listening on http://0.0.0.0:3000`. The API will be reachable at `http://localhost:3001/api/status` (it'll error on DB access since no volumes are mounted — that's fine, a 500 or JSON error is expected; a running server is what matters).

Press Ctrl-C to stop.

- [ ] **Step 4: Clean up test image**

```bash
docker rmi new-era-test
```

- [ ] **Step 5: Commit**

```bash
git add Dockerfile
git commit -m "feat: Dockerfile — bun install + vite build + hono server"
```

---

## Task 3: `docker-compose.yml`

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Create `docker-compose.yml`**

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

- [ ] **Step 2: Build and start the container**

```bash
docker compose up -d --build
```

Expected: image builds, container starts, output ends with `Container new-era-app-1 Started` (name may vary).

- [ ] **Step 3: Verify the server responds**

```bash
curl -s http://localhost:3000/api/status | head -c 200
```

Expected: JSON response with `last_fetch_at`, `counts`, etc. No 502 or connection refused.

- [ ] **Step 4: Verify the frontend is served**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
```

Expected: `200`

- [ ] **Step 5: Check logs look healthy**

```bash
docker compose logs --tail=20
```

Expected: no crash/panic lines. WAL journal mode log and scheduler startup messages are normal.

- [ ] **Step 6: Stop the container**

```bash
docker compose down
```

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: docker-compose.yml — volumes, env, Ollama host routing"
```

---

## Task 4: `scripts/deploy.sh`

**Files:**
- Create: `scripts/deploy.sh`

- [ ] **Step 1: Create `scripts/` directory and deploy script**

```bash
mkdir -p scripts
```

```bash
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
```

Save as `scripts/deploy.sh`.

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/deploy.sh
```

- [ ] **Step 3: Test a dry run (start container first)**

```bash
docker compose up -d
./scripts/deploy.sh
```

Expected output:
```
→ Pulling latest master...
Already up to date.
→ Building image...
...
→ Restarting container...
Container new-era-app-1  Started
✓ Deployed. Logs: docker compose logs -f
```

- [ ] **Step 4: Verify the container is still running after deploy**

```bash
docker compose ps
```

Expected: one container, status `running`.

- [ ] **Step 5: Commit**

```bash
git add scripts/deploy.sh
git commit -m "feat: deploy script — git pull, docker compose build + up -d"
```
