# LLM Provider Abstraction Design

**Date:** 2026-04-21  
**Status:** Approved

## Overview

Add support for three LLM providers — Ollama (default), LM Studio, and llama.cpp — selectable from the Settings UI. Each provider has a different HTTP API shape and health check endpoint. Provider config is stored in the settings DB alongside existing preferences.

---

## 1. Data Model

### New fields in `Preferences` (both `src/server/types.ts` and `src/client/src/components/SettingsShared.tsx`)

```typescript
llmProvider: 'ollama' | 'lmstudio' | 'llamacpp';
llmBaseUrl: string;  // empty string = use provider default URL
```

**Defaults:**
- `llmProvider: 'ollama'`
- `llmBaseUrl: ''`
- `model` default changes from `'unsloth/gemma-4-26B-A4B-it-GGUF'` → `'gemma4:26b'`

**Provider default URLs** (used when `llmBaseUrl` is empty):
- `ollama` → `http://localhost:11434`
- `lmstudio` → `http://localhost:1234`
- `llamacpp` → `LLAMACPP_BASE_URL` env var (default `http://localhost:8080`)

The existing `model` field is sent in request bodies for Ollama and LM Studio. For llama.cpp the model is loaded at server start and the field is informational only.

---

## 2. Backend: `src/server/llm.ts`

### Provider dispatch

New exported helper:
```typescript
function resolveBaseUrl(provider: string, storedUrl: string): string
```
Returns `storedUrl` if non-empty, otherwise the provider's default URL. Exported so it can be unit-tested.

New private `llmComplete(prompt, nPredict, signal)` replaces the direct `llamaComplete` calls throughout the file. Reads `getPreferences()`, resolves base URL, dispatches to the provider function.

Three private provider functions:

**`llamaComplete(baseUrl, prompt, nPredict, signal)`**
- Applies Gemma 4 chat template (`applyGemmaTemplate`) before sending
- `POST {baseUrl}/completion`
- Body: `{prompt, n_predict, temperature: 0.1, cache_prompt: true}`
- Response: `json.content`

**`ollamaComplete(baseUrl, model, prompt, nPredict, signal)`**
- No chat template — Ollama handles templating server-side
- `POST {baseUrl}/api/chat`
- Body: `{model, messages: [{role:"user", content: prompt}], stream: false, options: {temperature: 0.1, num_predict: nPredict}}`
- Response: `json.message.content`

**`lmstudioComplete(baseUrl, model, prompt, nPredict, signal)`**
- No chat template
- `POST {baseUrl}/v1/chat/completions`
- Body: `{model, messages: [{role:"user", content: prompt}], max_tokens: nPredict, temperature: 0.1, stream: false}`
- Response: `json.choices[0].message.content`

### Health check

`checkOllamaHealth()` renamed → `checkLLMHealth()`.  
`getOllamaAvailable()` renamed → `getLLMAvailable()`.  
All callers updated (scheduler, index.ts, routes).

Health check endpoint per provider:
- `llamacpp`: `GET {baseUrl}/health` → `{status: "ok"}`
- `ollama`: `GET {baseUrl}/` → HTTP 200
- `lmstudio`: `GET {baseUrl}/v1/models` → HTTP 200

---

## 3. Settings UI

### New "LLM Provider" accordion

Placed between "App config" and "Sources" in `SettingsView.tsx`. Saved with the same save button pattern as other accordions.

Controls:
1. **Provider select** — `<select>` with options: Ollama, LM Studio, llama.cpp
2. **Base URL** — text input; placeholder shows the provider's default URL; cleared when provider changes if it matches the old provider's default
3. **Model** — text input; for `llamacpp` shows muted hint "loaded at server start, informational only"; placeholder updates per provider (gemma4:26b / google/gemma-3-27b-it / unsloth/gemma-4-26B-A4B-it-GGUF)
4. **`?` help button** — small icon button in the accordion header beside the title; opens the help modal

### Help modal

Single modal component. Shows content for the currently selected provider (no tabs — just the relevant provider).

**Ollama content:**
- Recommended model: `gemma4:26b`
- Setup: install Ollama, run `ollama serve`, pull model with `ollama pull gemma4:26b`
- Default URL: `http://localhost:11434`

**LM Studio content:**
- Recommended model: `google/gemma-3-27b-it`
- Setup: download LM Studio, load the model, enable Local Server (port 1234)
- Default URL: `http://localhost:1234`

**llama.cpp content:**
- Recommended model: `unsloth/gemma-4-26B-A4B-it-GGUF`
- Setup: build or download llama-server, start with `--model <path> --port 8080 --n-gpu-layers -1`
- Note: JSON grammar sampling enabled automatically for structured output
- Default URL: `http://localhost:8080`

### System accordion update

"llama.cpp Connected / Unavailable" → `"{ProviderLabel} Connected / Unavailable"` where label comes from the current `llmProvider` setting.

---

## 4. Tests

### `src/server/tests/unit/llm.test.ts`

New test groups:
- `resolveBaseUrl` — empty URL returns provider default; explicit URL returned as-is; all three providers covered
- Gemma template: applied for `llamacpp`, **not** applied for `ollama`/`lmstudio` — tested via the exported `applyGemmaTemplate` function (already exists, just assert it is only invoked in the llama.cpp path by testing the prompt strings directly)

### `src/server/tests/settings.test.ts` (or unit)

- `llmProvider` and `llmBaseUrl` survive `getPreferences()` round-trip with DB
- Default values correct when key absent

### `src/client/src/tests/SettingsView.test.tsx`

- LLM Provider accordion renders
- Changing provider select updates base URL placeholder
- Help modal opens on `?` button click

---

## 5. README

New **"LLM Providers"** section added to `README.md`.

| Provider | Default URL | Recommended model |
|---|---|---|
| Ollama (default) | `http://localhost:11434` | `gemma4:26b` |
| LM Studio | `http://localhost:1234` | `google/gemma-3-27b-it` |
| llama.cpp | `http://localhost:8080` | `unsloth/gemma-4-26B-A4B-it-GGUF` |

Notes:
- Provider and URL configurable from Settings UI; no restart needed
- `LLAMACPP_BASE_URL` env var still honoured as fallback for llama.cpp when base URL is empty in settings

---

## Files Changed

| File | Change |
|---|---|
| `src/server/types.ts` | Add `llmProvider`, `llmBaseUrl` to `Preferences` + defaults |
| `src/server/llm.ts` | Add provider dispatch, `ollamaComplete`, `lmstudioComplete`, rename health fns, export `resolveBaseUrl` |
| `src/server/config.ts` | No change — `LLAMACPP_BASE_URL` stays as env var fallback |
| `src/client/src/components/SettingsShared.tsx` | Mirror new fields in client `Preferences` + `EMPTY_PREFS` |
| `src/client/src/views/SettingsView.tsx` | Add LLM Provider accordion + help modal component |
| `src/server/tests/unit/llm.test.ts` | New tests for `resolveBaseUrl`, template dispatch |
| `src/server/tests/settings.test.ts` | Round-trip tests for new pref fields |
| `src/client/src/tests/SettingsView.test.tsx` | Provider accordion + modal tests |
| `README.md` | Add LLM Providers section |
