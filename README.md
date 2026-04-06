# New Era — Job Aggregator

Personal job aggregation and tracking app. Fetches jobs from LinkedIn and Jobindex, scores them with a local LLM, and tracks applications via a kanban board.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.1
- [Ollama](https://ollama.com) running locally with `gemma4:26b` pulled

## Quick Start

```bash
# 1. Install dependencies
bun install

# 2. Copy the example env file and fill it in
cp .env.example .env

# 3. Start in development mode (server + Vite dev server)
bun run dev
```

- Frontend (Vite): http://localhost:5173
- API server: http://localhost:3000

## Environment Variables

Create a `.env` file in the project root (see `.env.example`):

```env
# Authentication — set this to enable password protection
# If not set, the app is accessible without a password (fine for local-only use)
AUTH_SECRET=choose_a_strong_password

# Optional overrides (defaults shown)
# OLLAMA_BASE_URL=http://localhost:11434
# DB_PATH=./db/jobs.db
# BACKUP_DIR=./backups
```

## Ollama Setup

```bash
# Install Ollama — see https://ollama.com/download
ollama pull gemma4:26b

# Verify it's running
curl http://localhost:11434/api/tags
```

The navbar shows an `ollama ✗` badge if Ollama is unreachable. Job scoring is skipped until it's available.

## Authentication

Set `AUTH_SECRET` in `.env` to enable password protection. A login screen appears on first load and sessions last 30 days (in-memory — server restart requires re-login).

Without `AUTH_SECRET`, the app is unprotected. Fine for local use, but **do not expose it to the internet without setting a password**.

## First-Time Setup

1. Open http://localhost:5173
2. Go to **Settings**
3. Fill in your **Preferences** — location, tech stack, salary floor, and search terms for each source
4. Add your **Resume** — paste it as markdown, or use "Ingest resume" to have the AI parse raw text from a PDF/Word copy-paste
5. Click **Fetch now** in the navbar to pull the first batch of jobs

## Project Structure

```
src/server/       Hono API, scheduler, scrapers, Ollama client
src/client/       React frontend (Vite)
db/               SQLite database (gitignored)
backups/          Automatic database backups (gitignored)
e2e/              Playwright end-to-end tests
```

## Running in Production

```bash
# Build the React frontend
bun run build

# Start the production server (serves built assets + API on port 3000)
bun run start
```

Point a reverse proxy at port 3000. Example Caddyfile:

```
yourdomain.com {
    reverse_proxy localhost:3000
}
```

For systemd, create `/etc/systemd/system/new-era.service`:

```ini
[Unit]
Description=New Era Job Aggregator
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/new-era
EnvironmentFile=/path/to/new-era/.env
ExecStart=/home/youruser/.bun/bin/bun run start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now new-era
```

## Database

SQLite at `db/jobs.db`. Automatic backups run every 6 hours to `backups/` (last 10 kept). Trigger a manual backup from **Settings → Database Backups**, or download/delete individual backups from there.

To reset the database entirely:

```bash
bun run db:reset
```

> **Warning:** this deletes all jobs, applications, settings, resume, and preferences.

## Testing

```bash
# Unit + integration tests (uses in-memory DB — safe to run anytime)
bun run test

# End-to-end tests (requires dev server running)
bun run dev         # in one terminal
bun run test:e2e    # in another
```

## Job Sources

| Source   | Method              | Notes                                   |
|----------|---------------------|-----------------------------------------|
| LinkedIn | Guest API (no auth) | Rate-limited — 3–5s delay per keyword   |
| Jobindex | HTML scraping       | Danish job board (jobindex.dk)          |

Search terms are configured per-source in **Settings → Preferences**. The LLM scores each job 0–100 based on your resume and preferences. Jobs scoring below 20 are hidden by default.

## Logs

Server logs (timestamped, with levels) are persisted to the database and viewable at **/logs**. Filter by level, search by text, export to a file, or archive-and-clear from there. Logs are also printed to the terminal as usual.
