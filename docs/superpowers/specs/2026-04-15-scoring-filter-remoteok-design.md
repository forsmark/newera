# Scoring Improvements, Work-Type Filter & RemoteOK Source

**Date:** 2026-04-15  
**Status:** Approved

## Overview

Three improvements to job discovery quality:

1. **Language penalty** — LLM scores jobs requiring unknown languages lower
2. **Work-type filter** — filter jobs by Remote / Hybrid / On-site in the UI
3. **RemoteOK source** — new remote-focused job source with public API

---

## 1. Language Penalty

### Preferences

Add `knownLanguages: string` to the `Preferences` interface and `DEFAULT_PREFERENCES` (default: `"English"`). It appears as a text field in the Settings/Preferences UI alongside the existing notes/preferences fields — comma-separated list of languages the candidate is proficient in (e.g. "English, Danish").

### LLM Prompt

Add one rule to the `## Scoring rules` section in `buildPrompt()`:

> "If the job posting requires proficiency in a language not listed in the candidate's known languages (`{knownLanguages}`), subtract 30–40 points."

`formatPreferences()` also includes the field so it appears in the candidate context block.

No language detection, no pre-screening. The LLM reads the description and applies the penalty itself.

---

## 2. Work-Type Filter

### Backend

`GET /api/jobs` accepts a new `work_type` query param — comma-separated values from `remote`, `hybrid`, `onsite`. When present, adds `work_type IN (...)` to the SQL `WHERE` clause. Omitting the param returns all jobs regardless of work type (existing behaviour preserved).

`work_type` is already stored in the `jobs` table and populated by the LLM scoring pass — no schema changes needed.

### Frontend

A new `WorkTypeFilter` component mirrors the existing `SourceFilter` multi-select dropdown. Options: Remote, Hybrid, On-site. Selecting none = no filter. Multiple values can be selected simultaneously.

The dropdown sits in the filter bar next to the source filter. Selection persists in `localStorage` alongside existing filter state. The `work_type[]` param is appended to the `GET /api/jobs` fetch when values are selected.

---

## 3. RemoteOK Source

### API

Public endpoint: `https://remoteok.com/api` (no auth, no API key). Returns a JSON array; the first element is a legal notice object, subsequent elements are job objects.

Verified job object fields:
- `id` (string) → `external_id`
- `position` → `title`
- `company` → `company`
- `location` → `location` (empty string for fully remote jobs → normalise to `null`)
- `url` → `url`
- `description` (HTML) → strip tags → `description`
- `date` (ISO string) → `posted_at`
- `tags` — category labels ("web dev", "ops"), not tech stack; LLM scoring will extract tech tags as usual

`salary_min` / `salary_max` are annual USD — not stored (no salary field in schema).

### Implementation

**`src/server/sources/remoteok.ts`** — exports `fetchRemoteOK(): Promise<Omit<Job, 'id' | 'match_score' | ...>[]>`. Fetches the API with a `User-Agent` header, skips the first element, maps job objects to the internal schema, strips HTML from descriptions.

**`src/server/types.ts`** — add `'remoteok'` to the `source` union.

**`src/server/sources/fetch.ts`** — wire `fetchRemoteOK()` into the fetch pipeline alongside existing sources.

**`src/server/sources/__tests__/remoteok.test.ts`** — unit tests using in-memory SQLite (follows existing source test patterns).

### Notes

- All RemoteOK jobs are remote by nature; set `work_type: 'remote'` at ingest time in `fetchRemoteOK()` rather than waiting for the async LLM scoring pass (so the work-type filter works immediately on new jobs)
- Rate limiting: single fetch per scheduler interval, no pagination needed (API returns the full recent listing)

---

## What's Not In Scope

- Auto-rejecting jobs based on language (too strict — penalty is sufficient)
- Salary filtering UI (no salary field in schema)
- Language detection heuristics (LLM handles this)
- RemoteOK logo or attribution in UI (API terms only require linking back to job URLs, which we already do)
