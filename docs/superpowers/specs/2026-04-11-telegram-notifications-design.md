# Telegram Notifications — Design Spec

**Date:** 2026-04-11

---

## Problem

The app is primarily used on mobile. Browser notifications don't reach the phone reliably (especially iOS). The user needs a push notification channel for high-score job matches discovered during automated fetch runs.

## Solution

Integrate Telegram Bot API to send a batch summary message after each fetch run completes. Messages include high-scoring jobs with details and a count of other new jobs below the notification threshold.

---

## Message Format

Telegram MarkdownV2 message, sent once per fetch run:

```
🟢 *Frontend Developer* — Stripe (92)
Strong React/TS match, remote-friendly
→ https://100.x.x.x:3000

🟢 *Senior UI Engineer* — Pleo (85)
Good fintech fit, hybrid in CPH
→ https://100.x.x.x:3000

\+ 8 other new jobs below threshold
```

- Each high-score job shows: title, company, score, match_summary, and link to the app
- The link uses a configurable `appBaseUrl` (Tailscale IP) so it works from the phone
- The footer line shows the count of jobs that scored below the notify threshold
- **No message is sent** if zero new jobs were found, or if none scored above the threshold and there are no other new jobs

---

## Integration Points

### 1. New module: `src/server/telegram.ts`

Single-purpose module with two exported functions:

- **`sendFetchSummary(scoredJobs: Array<{ job: Job; score: number }>)`**
  - Reads Telegram settings from preferences
  - If disabled or credentials missing, returns silently
  - Splits jobs into above-threshold and below-threshold groups
  - Formats MarkdownV2 message
  - POSTs to `https://api.telegram.org/bot<token>/sendMessage`
  - Logs success/failure to console (no crash on failure — fire-and-forget)

- **`sendTestMessage()`**
  - Sends a short "New Era notifications active" message
  - Returns success/error for the Settings UI to display
  - Used by the "Send test" button

No external dependencies — just `fetch()`.

### 2. Scheduler hook: `src/server/scheduler.ts`

After the background scoring loop completes (both post-fetch and retry-unscored paths):

- Collect all jobs that were scored during this run (already available in the loop)
- Call `sendFetchSummary()` with the batch
- This sits alongside the existing `maybeAutoReject()` call pattern

### 3. Preferences extension: `src/server/types.ts`

Add to the `Preferences` interface:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `telegramBotToken` | `string` | `''` | Bot API token from BotFather |
| `telegramChatId` | `string` | `''` | Target chat/user ID |
| `telegramEnabled` | `boolean` | `false` | Master toggle |
| `telegramNotifyThreshold` | `number` | `80` | Minimum score to include in detail |
| `appBaseUrl` | `string` | `'http://localhost:3000'` | Base URL for links in messages (Tailscale IP) |

### 4. Settings API: `src/server/routes/settings.ts`

Add one new endpoint:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/settings/telegram-test` | Send test message, returns `{ ok: boolean, error?: string }` |

Preferences save (existing `PUT /api/settings/preferences`) handles the new fields automatically since they're part of the Preferences object.

### 5. Settings UI: `src/client/src/views/SettingsView.tsx`

New "Notifications" section (collapsible, like existing sections):

- **Telegram bot token** — text input (type=password for masking)
- **Chat ID** — text input
- **Enable notifications** — toggle/checkbox
- **Notify threshold** — number input (0–100), default 80
- **App base URL** — text input, default `http://localhost:3000`
- **Send test message** — button, shows success/error inline
- **Save** — standard save button (same pattern as other sections)

---

## Telegram Bot Setup

Not part of the code — user does this manually:

1. Message @BotFather on Telegram → `/newbot` → get bot token
2. Message the bot → get chat ID via `https://api.telegram.org/bot<token>/getUpdates`
3. Paste token + chat ID into Settings

---

## What's NOT included

- Per-job immediate notifications (batch only)
- Digest/scheduled summary (e.g., daily)
- Multiple notification channels (Slack, email, etc.)
- Rich media (images, inline keyboards)
- Notification history/log

---

## Verification

1. Configure a Telegram bot token and chat ID in Settings
2. Click "Send test message" — receive message on phone
3. Trigger a manual fetch with jobs that score above the threshold
4. Receive a Telegram summary with job details and app link
5. Verify no message is sent when all jobs score below threshold
6. Verify no message is sent when Telegram is disabled
7. All existing tests still pass (`bun run test:all`)
