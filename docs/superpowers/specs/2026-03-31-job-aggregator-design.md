# Job Aggregator — Design Spec
**Date:** 2026-03-31  
**Author:** Copenhagen web developer, personal use

---

## Overview

A personal job aggregation and tracking app that collects job postings from multiple sources, scores them against a resume using a local LLM, and provides a UI to review matches and track applications.

Runs entirely locally in a single Docker container. No external accounts or subscriptions beyond the JSearch API key and Ollama.

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Runtime | Bun |
| Backend | Hono |
| Frontend | React (served by Hono) |
| Database | SQLite (via Bun's built-in driver) |
| Container | Single Docker container |
| LLM | Ollama — qwen3.5:9b (local, HTTP) |

---

## Job Sources

1. **JSearch API** — covers LinkedIn, Indeed, and other major job boards. Queried with configurable search terms (e.g. "frontend developer Copenhagen").
2. **jobindex.dk** — scraped directly (HTML scraper). Denmark's primary job board.

New jobs are deduplicated by `source + external_id` before storage.

---

## User Input

Two markdown files mounted into the container at `data/`:

- `data/resume.md` — the user's CV
- `data/preferences.md` — preferences such as preferred stack, min salary, remote/hybrid preference, seniority level, and companies/keywords to skip

These are read at analysis time by the LLM, not at startup.

---

## LLM Match Analysis

Each new job is sent to Ollama (qwen3.5:9b) along with `resume.md` and `preferences.md`. The LLM returns:

- `match_score` — integer 0–100
- `match_reasoning` — one or two sentence explanation (e.g. "Strong React/TS match. Missing: Go experience.")

Analysis runs asynchronously after job ingestion. Jobs appear in the list immediately with a pending score indicator, updating once analysis completes.

---

## Scheduling

- Jobs are fetched automatically on a configurable interval (default: every 6 hours).
- A **"Fetch now"** button in the UI triggers an immediate fetch.
- The last fetch timestamp is shown in the footer of the jobs list.

---

## UI

### Navigation
Persistent top nav bar with two views: **Jobs** and **Kanban**.

---

### Jobs List View

The primary view. Shows all non-rejected jobs ranked by match score descending.

**Each row displays:**
- Match score badge (colour-coded: green ≥80, amber 50–79, grey <50)
- Job title, company, location, work arrangement
- Source (JSearch / jobindex.dk) and posted date
- Action buttons: **Save**, **Reject**, **Applied →**

**Interaction:**
- Clicking a row expands it inline to show the LLM's match reasoning
- Low-score jobs are visually dimmed
- Rejected jobs are hidden by default; a "Show all" toggle reveals them
- Filter bar at the top for searching by title or company
- Tabs to filter by status: All | New | Saved

---

### Kanban Board View

Tracks jobs the user has marked as applied. Four columns:

| Column | Colour accent |
|--------|--------------|
| Applied | Blue |
| Interview | Purple |
| Rejected | Red |
| Offer | Green |

**Each card shows:**
- Job title and company
- Application date
- Match score badge
- Notes field (free text, editable inline)
- Interview date (if set, shown in purple)

Cards are draggable between columns. Clicking a card opens it for note editing.

---

## Job Status Lifecycle

```
new → saved → applied → [kanban pipeline]
             ↓
           rejected (hidden from list by default)
```

---

## Project Structure (intended)

```
new-era/
├── data/
│   ├── resume.md
│   └── preferences.md
├── src/
│   ├── server/       # Hono API + scheduler + scrapers + Ollama client
│   └── client/       # React frontend
├── Dockerfile
└── docker-compose.yml
```

---

## Out of Scope

- User accounts / authentication (personal use only)
- Email/push notifications
- CV generation or application writing assistance
- Multi-user support
