# New Era — Job Aggregator

Personal job aggregation and tracking app. Fetches jobs from LinkedIn and Jobindex, scores them with a local LLM, and tracks applications via a kanban board.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) + Docker Compose v2
- [llama.cpp](https://github.com/ggml-org/llama.cpp) server running on the host, port `8080`

For local development only:
- [Bun](https://bun.sh) ≥ 1.1

## Quick Start (Docker — recommended)

```bash
# 1. Copy the example env file and fill it in
cp .env.example .env

# 2. Create runtime directories if they don't exist
mkdir -p db backups data

# 3. Add your resume and preferences
cp data/resume.example.md data/resume.md        # edit to match your CV
cp data/preferences.example.md data/preferences.md  # edit your preferences

# 4. Start
docker compose up -d
```

App is at **http://localhost:3000**.

## Deploying Latest Master

```bash
./scripts/deploy.sh
```

Pulls latest master, rebuilds the image, and restarts the container. Data is untouched.

## Environment Variables

Create a `.env` file in the project root (see `.env.example`):

```env
# Authentication — set this to enable password protection
# If not set, the app is accessible without a password (fine for local-only use)
AUTH_SECRET=choose_a_strong_password

# llama.cpp server URL (default: http://localhost:8080)
# Docker Compose sets this to http://host.docker.internal:8080 automatically
LLAMACPP_BASE_URL=http://localhost:8080
```

`LLAMACPP_BASE_URL` is set automatically by Docker Compose to reach llama.cpp on the host via `host.docker.internal:8080`. Override it if the server runs elsewhere.

## llama.cpp Setup

Download and build llama.cpp, then start the server with a compatible model (Gemma 4 27B recommended):

```bash
# Start the server — adjust -ngl (GPU layers) and --ctx-size to fit your VRAM
llama-server \
  --model /path/to/gemma-4-27b-q4.gguf \
  --port 8080 \
  --ctx-size 8192 \
  -ngl 99

# Verify it's running
curl http://localhost:8080/health
```

The server exposes an OpenAI-compatible API at `/completion`. The app uses `LLAMACPP_BASE_URL` (default: `http://localhost:8080`) to reach it.

The navbar shows an `llm ✗` badge if the server is unreachable. Job scoring is skipped until it's available.

## Authentication

Set `AUTH_SECRET` in `.env` to enable password protection. A login screen appears on first load and sessions last 30 days (in-memory — server restart requires re-login).

Without `AUTH_SECRET`, the app is unprotected. Fine for local/VPN use, but **do not expose it to the internet without setting a password**.

## First-Time Setup

1. Open http://localhost:3000
2. Go to **Settings**
3. Fill in your **Preferences** — location, tech stack, salary floor, and search terms for each source
4. Add your **Resume** — paste it as markdown, or use "Ingest resume" to have the AI parse raw text from a PDF/Word copy-paste
5. Click **Fetch now** in the navbar to pull the first batch of jobs

## Data & Persistence

Runtime data lives on the host and is bind-mounted into the container — it survives image rebuilds and container restarts:

| Host path   | Mount             | Notes                              |
|-------------|-------------------|------------------------------------|
| `./db/`     | `/app/db`         | SQLite database (read-write)       |
| `./data/`   | `/app/data`       | resume.md + preferences.md (read-only) |
| `./backups/`| `/app/backups`    | Automatic backups (read-write)     |

Automatic backups run every 6 hours to `backups/` (last 10 kept). Trigger a manual backup or download/delete individual backups from **Settings → Database Backups**.

To reset the database:

```bash
docker compose down
rm db/jobs.db db/jobs.db-wal db/jobs.db-shm 2>/dev/null; true
docker compose up -d
```

> **Warning:** this deletes all jobs, applications, settings, resume, and preferences.

## Docker Reference

```bash
# Start
docker compose up -d

# Stop
docker compose down

# View logs
docker compose logs -f

# Deploy latest master
./scripts/deploy.sh

# Rebuild without pulling (local changes)
docker compose up -d --build
```

## Local Development (without Docker)

```bash
# Install dependencies
bun install

# Start dev server (server + Vite hot-reload)
bun run dev
```

- Frontend (Vite): http://localhost:5173
- API server: http://localhost:3000

## Project Structure

```
src/server/       Hono API, scheduler, scrapers, llama.cpp client
src/client/       React frontend (Vite)
db/               SQLite database (gitignored)
backups/          Automatic database backups (gitignored)
data/             resume.md + preferences.md (gitignored)
scripts/          deploy.sh
e2e/              Playwright end-to-end tests
```

## Testing

```bash
# Server unit + integration tests (uses in-memory DB)
bun run test

# Client component tests
cd src/client && bun run test

# End-to-end tests (requires dev server running)
bun run dev         # in one terminal
bun run test:e2e    # in another
```

## Job Sources

| Source   | Method              | Notes                                   |
|----------|---------------------|-----------------------------------------|
| LinkedIn | Guest API (no auth) | Rate-limited — 3–5s delay per keyword   |
| Jobindex | HTML scraping       | Danish job board (jobindex.dk)          |

Search terms are configured per-source in **Settings → Preferences**. The LLM scores each job 0–100 based on your resume and preferences.

## Logs

Server logs are persisted to the database and viewable at **/logs**. Filter by level, search by text, export to a file, or archive-and-clear from there.
