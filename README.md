# New Era — Job Aggregator

Personal job aggregation and tracking app. Fetches jobs from LinkedIn and Jobindex, scores them with a local LLM, and tracks applications via a kanban board.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) + Docker Compose v2
- A local LLM server — see [LLM Providers](#llm-providers) below

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

# llama.cpp fallback URL — used when provider is llamacpp and no URL is saved in Settings
# Docker Compose sets this to http://host.docker.internal:8080 automatically
LLAMACPP_BASE_URL=http://localhost:8080
```

`LLAMACPP_BASE_URL` is set automatically by Docker Compose to reach llama.cpp on the host via `host.docker.internal:8080`. Override it if the server runs elsewhere.

## LLM Providers

The app supports three local LLM providers. Configure the provider, base URL, and model from **Settings → LLM Provider** — no server restart needed after saving.

| Provider | Default URL | Recommended model |
|---|---|---|
| **Ollama** (default) | `http://localhost:11434` | `gemma4:26b` |
| **LM Studio** | `http://localhost:1234` | `google/gemma-3-27b-it` |
| **llama.cpp** | `http://localhost:8080` | `unsloth/gemma-4-26B-A4B-it-GGUF` |

### Ollama (recommended)

```bash
# Install (Linux/macOS)
curl -fsSL https://ollama.com/install.sh | sh

# Pull the model and start serving
ollama pull gemma4:26b
ollama serve
```

### LM Studio

1. Download from [lmstudio.ai](https://lmstudio.ai) and install
2. In the Discover tab, search for `google/gemma-3-27b-it` and download it
3. Load the model, open the **Local Server** tab, and click **Start Server** (default port 1234)

### llama.cpp

```bash
# Adjust -ngl (GPU layers) and --ctx-size to fit your VRAM
llama-server \
  --model /path/to/gemma-4-26B-A4B-it.gguf \
  --port 8080 \
  --ctx-size 8192 \
  -ngl 99
```

llama.cpp uses a Gemma chat template and grammar-based JSON sampling automatically.

### LLAMACPP_BASE_URL (legacy env var)

`LLAMACPP_BASE_URL` is still honoured as the fallback base URL when using the llama.cpp provider and no URL is saved in Settings. Docker Compose sets it to `http://host.docker.internal:8080` automatically.

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
