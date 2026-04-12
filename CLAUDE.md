# New Era — Job Aggregator

Personal job aggregation and tracking app. Fetches jobs from LinkedIn (via RapidAPI) + jobindex.dk,
scores them with a local LLM, and tracks applications via a kanban board.

## Tech Stack
- Runtime: Bun
- Backend: Hono (API + static file serving)
- Frontend: React (Vite for dev, built assets served by Hono in prod)
- Database: SQLite (Bun built-in)
- LLM: Ollama — gemma4:26b (http://localhost:11434)

## Project Structure
```
src/server/   — Hono API, scheduler, scrapers, Ollama client
src/client/   — React frontend
data/         — resume.md + preferences.md (user-provided, gitignored)
docs/         — design specs
```

## Running Locally
```
bun run dev
```
Server at http://localhost:3000, Vite dev server at http://localhost:5173

## Testing
- Tests MUST use in-memory SQLite, never the production DB. `db.ts` switches to `:memory:` when `NODE_ENV=test` (set automatically by `bunfig.toml`). If you add a new DB module or change the db import path, verify tests still hit `:memory:`.
- When writing new test files that touch the database, import `db` from `../../db` — it will automatically use the in-memory instance during `bun test`.

## Key Decisions
- Monolith architecture with SQLite
- Jobs deduplicated by source + external_id
- LLM analysis is async — jobs appear immediately with a pending score, scores fill in after
- RapidAPI key for LinkedIn scraping in .env (JSEARCH_API_KEY)
- Ollama runs locally at http://localhost:11434

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

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"` to keep the graph current
