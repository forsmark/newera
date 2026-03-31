# New Era — Job Aggregator

Personal job aggregation and tracking app. Fetches jobs from JSearch API + jobindex.dk,
scores them with a local LLM, and tracks applications via a kanban board.

## Tech Stack
- Runtime: Bun
- Backend: Hono (API + static file serving)
- Frontend: React (Vite for dev, built assets served by Hono in prod)
- Database: SQLite (Bun built-in)
- Container: Single Docker container
- LLM: Ollama — qwen3.5:9b (http://host.docker.internal:11434)

## Project Structure
```
src/server/   — Hono API, scheduler, scrapers, Ollama client
src/client/   — React frontend
data/         — resume.md + preferences.md (user-provided, gitignored)
docs/         — design specs
```

## Running Locally
```
docker compose up
```
App available at http://localhost:3000

## Key Decisions
- Single container, monolith architecture with SQLite
- Jobs deduplicated by source + external_id
- LLM analysis is async — jobs appear immediately with a pending score, scores fill in after
- data/ folder mounted as read-only volume into the container
- JSearch API key in .env (JSEARCH_API_KEY)
- Ollama runs on the host, accessed via host.docker.internal

## Data Files (user-provided, not committed)
- `data/resume.md` — CV in markdown
- `data/preferences.md` — preferred stack, min salary, remote/hybrid, seniority, blacklist

## UI
- **Jobs view** — ranked list by match score (green ≥80, amber 50–79, grey <50)
  - Actions per job: Save, Reject, Applied →
  - Click to expand inline LLM reasoning
  - Filter bar + All/New/Saved tabs
  - Rejected jobs hidden by default
- **Kanban view** — 4 columns: Applied → Interview → Offer → Rejected
  - Drag and drop between columns
  - Notes + interview date per card

## Job Status Lifecycle
```
new → saved → applied → [kanban: applied | interview | offer | rejected]
           ↓
         rejected (hidden from jobs list)
```

## API Routes
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/jobs | All jobs, sorted by match_score desc. Params: status, q |
| PATCH | /api/jobs/:id | Update status |
| GET | /api/kanban | Applications with job data joined |
| PATCH | /api/kanban/:id | Update column, notes, interview_at |
| POST | /api/fetch | Trigger immediate fetch from all sources |
| GET | /api/status | Last fetch time, job counts |

## Implementation Plan
Full step-by-step plan at: `/home/forsmark/.claude/plans/radiant-marinating-rabbit.md`
Design spec at: `docs/superpowers/specs/2026-03-31-job-aggregator-design.md`
