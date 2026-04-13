# Graph Report - .  (2026-04-10)

## Corpus Check
- Corpus is ~42,610 words - fits in a single context window. You may not need a graph.

## Summary
- 322 nodes · 487 edges · 31 communities detected
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 26 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `Database Module (SQLite)` - 19 edges
2. `Server Entry Point (Hono App)` - 14 edges
3. `Job Fetch Scheduler` - 13 edges
4. `Settings Module` - 12 edges
5. `Settings Route` - 11 edges
6. `JobRow Component` - 11 edges
7. `LLM Client (Ollama)` - 10 edges
8. `App Root Component` - 9 edges
9. `Test DB Helpers` - 8 edges
10. `KanbanCard Component` - 8 edges

## Surprising Connections (you probably didn't know these)
- `patchStatus()` --conceptually_related_to--> `Async LLM Scoring Pattern`  [INFERRED]
  src/client/src/components/JobRow.tsx → CLAUDE.md
- `JobRow Component` --implements--> `Reduced Motion Accessibility (framer-motion)`  [EXTRACTED]
  src/client/src/components/JobRow.tsx → docs/superpowers/specs/2026-04-03-tailwind-logo-animations-design.md
- `KanbanCard Tests` --semantically_similar_to--> `E2E Kanban Spec`  [INFERRED] [semantically similar]
  src/client/src/tests/KanbanCard.test.tsx → e2e/kanban.spec.ts
- `JobRow Tests` --semantically_similar_to--> `E2E Jobs Spec`  [INFERRED] [semantically similar]
  src/client/src/tests/JobRow.test.tsx → e2e/jobs.spec.ts
- `E2E Settings Spec` --semantically_similar_to--> `SettingsView Tests`  [INFERRED] [semantically similar]
  e2e/settings.spec.ts → src/client/src/tests/SettingsView.test.tsx

## Hyperedges (group relationships)
- **Job Fetch, Analyze and Store Pipeline** — scheduler_fetchJobs, sources_jobindex, sources_linkedin, llm_analyzeJob, db_jobs_table [EXTRACTED 0.95]
- **LLM Prompt Assembly from Resume and Preferences** — llm_analyzeJob, server_settings, types_Preferences, types_Job [EXTRACTED 0.92]
- **Auth Session Lifecycle** — routes_auth, server_auth, auth_inMemorySessions, server_index [EXTRACTED 0.90]
- **Job Status Lifecycle** — server_routes_jobs, server_routes_kanban, jobs_integration_test, jobs_bulk_test, view_jobsview, view_kanbanview, client_types [INFERRED 0.88]
- **Auth Guard Flow** — server_auth, server_routes_auth, auth_integration_test, concept_auth_secret, concept_session_cookie, client_app [INFERRED 0.85]
- **Async LLM Scoring Pipeline** — server_llm, server_scheduler, concept_auto_reject, concept_score_polling, concept_rescore_all [INFERRED 0.82]
- **Kanban Drag-and-Drop System** — kanbancard_dragstart, kanbancolumn_dropzone, kanbancolumn_kanbancolumn, kanbancard_kanbancard, concept_kanban_dnd [EXTRACTED 0.95]
- **Job Score Display Pipeline** — jobrow_jobrow, jobdetail_jobdetail, concept_score_color_coding, concept_llm_async_scoring, jobdetail_rescore [INFERRED 0.88]
- **Settings Feature (Spec + Plan + Tests)** — spec_settings, plan_settings, tests_settingsview, e2e_settings [INFERRED 0.92]

## Communities

### Community 0 - "Server Infrastructure and Tests"
Cohesion: 0.09
Nodes (40): In-Memory Session Store, Backups Integration Tests, Auto-Reject Low Score Feature, Backup Path Traversal Protection, Preferences File to DB Migration, application_artifacts SQLite Table, applications SQLite Table, jobs SQLite Table (+32 more)

### Community 1 - "Architecture Design Decisions"
Cohesion: 0.07
Nodes (37): CLAUDE.md Project Instructions, Deduplication by source+external_id, Reduced Motion Accessibility (framer-motion), Job Status Lifecycle (new->saved->applied->kanban), Kanban Drag-and-Drop Pattern, Async LLM Scoring Pattern, Monolith Architecture with SQLite, Score Color Coding (green>=80, amber 50-79, grey<50) (+29 more)

### Community 2 - "Kanban and Bulk Job Operations"
Cohesion: 0.08
Nodes (14): Bulk Job Operations, Cover Letter Generation on Applications, Kanban Saved Column (pre-applied tracking), Rescore All Jobs Endpoint, Jobs Route Integration Tests, Kanban Route Integration Tests, formatArgs(), writeLog() (+6 more)

### Community 3 - "Frontend Views and App Shell"
Cohesion: 0.07
Nodes (0): 

### Community 4 - "JobDetail and Client Tests"
Cohesion: 0.07
Nodes (4): makeApplication(), makeJob(), handleToggleArtifacts(), loadArtifacts()

### Community 5 - "Web Scraping and Content Extraction"
Cohesion: 0.16
Nodes (13): extractJsonLd(), extractNuxtData(), fetchPageText(), extractResults(), extractStash(), fetchJobindex(), fetchPage(), loadJobindexSearch() (+5 more)

### Community 6 - "Settings UI Components"
Cohesion: 0.12
Nodes (0): 

### Community 7 - "LinkedIn Scraper"
Cohesion: 0.23
Nodes (10): buildSearchUrl(), decodeHtmlEntities(), extractText(), fetchJobs(), fetchLinkedIn(), fetchOnePage(), loadKeywords(), parseJobCards() (+2 more)

### Community 8 - "LLM Analysis Engine"
Cohesion: 0.23
Nodes (7): analyzeJob(), buildLocationRules(), buildPrompt(), extractJson(), extractTagsFromDescription(), formatPreferences(), generateCoverLetter()

### Community 9 - "React App Bootstrap"
Cohesion: 0.22
Nodes (13): App Root Component, React Entry Point, Client TypeScript Types, Logo Component, Infinite Scroll with IntersectionObserver, Client-Side Score Polling (pending jobs), App Status Polling (adaptive interval), Sticky Filter Snapshot (pinnedIds) (+5 more)

### Community 10 - "Backup System"
Cohesion: 0.36
Nodes (6): createBackup(), deleteBackup(), ensureBackupDir(), getBackupDir(), listBackups(), pruneBackups()

### Community 11 - "Auth and Session Management"
Cohesion: 0.25
Nodes (0): 

### Community 12 - "Settings Feature Documentation"
Cohesion: 0.33
Nodes (6): Rationale: Settings Page Replaces Manual File Editing, E2E Settings Spec, Settings Page Implementation Plan, Settings Page Design Spec, SettingsView Tests, Vitest Test Setup

### Community 13 - "Core Domain Types"
Cohesion: 0.5
Nodes (4): AnalysisResult Interface, Application Interface, ApplicationWithJob Interface, Job Interface

### Community 14 - "Auth Integration Tests"
Cohesion: 1.0
Nodes (3): Auth Route Integration Tests, AUTH_SECRET Environment Variable Auth, Session Cookie Authentication

### Community 15 - "LinkedIn Playwright Strategy"
Cohesion: 1.0
Nodes (3): Playwright->Guest API Fallback Strategy, Rationale: Playwright Scraper Uses Real Browser Profile, LinkedIn Playwright Scraper Implementation Plan

### Community 16 - "Page Text Extraction Utility"
Cohesion: 1.0
Nodes (2): Structured Content Extraction Strategy (JSON-LD, Nuxt, OG meta), fetchPageText Utility

### Community 17 - "Resume Data"
Cohesion: 1.0
Nodes (2): User Resume (data/resume.md), Resume Example Template

### Community 18 - "User Preferences Data"
Cohesion: 1.0
Nodes (2): User Preferences (data/preferences.md), Preferences Example Template

### Community 19 - "Playwright Config"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "Client Test Setup"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "Vite Config"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Vite Env Types"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "E2E Settings"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "E2E Jobs"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "E2E Kanban"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "parseResume Function"
Cohesion: 1.0
Nodes (1): parseResume Function

### Community 27 - "extractJobDescription Function"
Cohesion: 1.0
Nodes (1): extractJobDescription Function

### Community 28 - "checkOllamaHealth Function"
Cohesion: 1.0
Nodes (1): checkOllamaHealth Function

### Community 29 - "LinkedIn Parser Tests"
Cohesion: 1.0
Nodes (1): LinkedIn Parser Unit Tests

### Community 30 - "Client Vite Config"
Cohesion: 1.0
Nodes (1): Client Vite Config

## Knowledge Gaps
- **36 isolated node(s):** `Test Environment Setup`, `Application Interface`, `AnalysisResult Interface`, `parseResume Function`, `extractJobDescription Function` (+31 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Page Text Extraction Utility`** (2 nodes): `Structured Content Extraction Strategy (JSON-LD, Nuxt, OG meta)`, `fetchPageText Utility`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Resume Data`** (2 nodes): `User Resume (data/resume.md)`, `Resume Example Template`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `User Preferences Data`** (2 nodes): `User Preferences (data/preferences.md)`, `Preferences Example Template`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Playwright Config`** (1 nodes): `playwright.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Client Test Setup`** (1 nodes): `setup.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vite Config`** (1 nodes): `vite.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vite Env Types`** (1 nodes): `vite-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `E2E Settings`** (1 nodes): `settings.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `E2E Jobs`** (1 nodes): `jobs.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `E2E Kanban`** (1 nodes): `kanban.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `parseResume Function`** (1 nodes): `parseResume Function`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `extractJobDescription Function`** (1 nodes): `extractJobDescription Function`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `checkOllamaHealth Function`** (1 nodes): `checkOllamaHealth Function`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `LinkedIn Parser Tests`** (1 nodes): `LinkedIn Parser Unit Tests`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Client Vite Config`** (1 nodes): `Client Vite Config`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database Module (SQLite)` connect `Server Infrastructure and Tests` to `Kanban and Bulk Job Operations`?**
  _High betweenness centrality (0.116) - this node is a cross-community bridge._
- **Why does `Bulk Job Operations` connect `Kanban and Bulk Job Operations` to `React App Bootstrap`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `Database Module (SQLite)` (e.g. with `Config Module` and `Test Environment Setup`) actually correct?**
  _`Database Module (SQLite)` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `Job Fetch Scheduler` (e.g. with `Backup Module` and `Auto-Reject Low Score Feature`) actually correct?**
  _`Job Fetch Scheduler` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `Settings Module` (e.g. with `Auto-Reject Low Score Feature` and `Preferences File to DB Migration`) actually correct?**
  _`Settings Module` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Test Environment Setup`, `Application Interface`, `AnalysisResult Interface` to the rest of the system?**
  _36 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Server Infrastructure and Tests` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._