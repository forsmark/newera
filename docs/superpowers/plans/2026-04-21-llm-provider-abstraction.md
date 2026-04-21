# LLM Provider Abstraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add selectable LLM providers (Ollama, LM Studio, llama.cpp) with per-provider API format, settings UI with help modal, updated tests, and updated README.

**Architecture:** Two new preference fields (`llmProvider`, `llmBaseUrl`) stored in DB drive a dispatch layer in `llm.ts`. A `resolveBaseUrl` helper picks the default URL when none is stored. Three private completion functions (`llamaComplete`, `ollamaComplete`, `lmstudioComplete`) handle provider-specific HTTP shapes; `llmComplete` dispatches to the right one. Settings UI gains a new "LLM Provider" accordion with a `?` button that opens a per-provider help modal.

**Tech Stack:** Bun, Hono, SQLite (`bun:test` for server tests), React, Vitest (client tests)

---

## File Map

| File | Change |
|---|---|
| `src/server/types.ts` | Add `llmProvider`, `llmBaseUrl` to `Preferences`; change `model` default to `gemma4:26b` |
| `src/server/llm.ts` | Add `resolveBaseUrl` export; add `ollamaComplete`, `lmstudioComplete`, `llmComplete`; update `llamaComplete` signature; rename health fns; remove module-level URL constants |
| `src/server/index.ts` | Update imports: `checkOllamaHealth` → `checkLLMHealth`, `getOllamaAvailable` → `getLLMAvailable` |
| `src/client/src/components/SettingsShared.tsx` | Mirror new fields in `Preferences` + `EMPTY_PREFS`; change `model` default |
| `src/client/src/views/SettingsView.tsx` | Add LLM Provider accordion + help modal; dynamic provider label in System accordion |
| `src/server/tests/unit/llm.test.ts` | Add `resolveBaseUrl` unit tests |
| `src/server/tests/settings.test.ts` | Add round-trip tests for new preference fields |
| `src/client/src/tests/SettingsView.test.tsx` | Update provider label test; add accordion + modal tests |
| `README.md` | Rewrite LLM setup section; add provider table |

---

### Task 1: Add `llmProvider` and `llmBaseUrl` to server `Preferences`

**Files:**
- Modify: `src/server/types.ts`
- Test: `src/server/tests/settings.test.ts`

- [ ] **Step 1: Write failing tests**

Add to the end of `src/server/tests/settings.test.ts`:

```typescript
describe('GET / — LLM provider defaults', () => {
  beforeEach(clearSettings);

  it('defaults llmProvider to ollama', async () => {
    const res = await app.request('/');
    const data = await res.json() as { preferences: Record<string, unknown> };
    expect(data.preferences.llmProvider).toBe('ollama');
  });

  it('defaults llmBaseUrl to empty string', async () => {
    const res = await app.request('/');
    const data = await res.json() as { preferences: Record<string, unknown> };
    expect(data.preferences.llmBaseUrl).toBe('');
  });

  it('defaults model to gemma4:26b', async () => {
    const res = await app.request('/');
    const data = await res.json() as { preferences: Record<string, unknown> };
    expect(data.preferences.model).toBe('gemma4:26b');
  });
});

describe('PUT /preferences — LLM provider fields', () => {
  beforeEach(clearSettings);

  it('persists llmProvider and llmBaseUrl', async () => {
    await app.request('/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ llmProvider: 'lmstudio', llmBaseUrl: 'http://localhost:1234' }),
    });
    const get = await app.request('/');
    const data = await get.json() as { preferences: Record<string, unknown> };
    expect(data.preferences.llmProvider).toBe('lmstudio');
    expect(data.preferences.llmBaseUrl).toBe('http://localhost:1234');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
bun test src/server/tests/settings.test.ts
```
Expected: the three new `GET /` tests fail (field not in defaults), the `PUT` test fails.

- [ ] **Step 3: Add fields to `src/server/types.ts`**

In the `Preferences` interface, add after `model: string;`:
```typescript
llmProvider: 'ollama' | 'lmstudio' | 'llamacpp';
llmBaseUrl: string;
```

In `DEFAULT_PREFERENCES`, change `model` and add the two new fields:
```typescript
model: 'gemma4:26b',
llmProvider: 'ollama',
llmBaseUrl: '',
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
bun test src/server/tests/settings.test.ts
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/types.ts src/server/tests/settings.test.ts
git commit -m "feat: add llmProvider and llmBaseUrl preference fields"
```

---

### Task 2: Mirror new fields in client `SettingsShared.tsx`

**Files:**
- Modify: `src/client/src/components/SettingsShared.tsx`

- [ ] **Step 1: Add fields to `Preferences` interface**

In the `Preferences` interface in `SettingsShared.tsx`, add after `model: string;`:
```typescript
llmProvider: 'ollama' | 'lmstudio' | 'llamacpp';
llmBaseUrl: string;
```

- [ ] **Step 2: Update `EMPTY_PREFS`**

Change the `model` line and add the two new fields:
```typescript
model: 'gemma4:26b',
llmProvider: 'ollama',
llmBaseUrl: '',
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd src/client && bun run build 2>&1 | head -30
```
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/client/src/components/SettingsShared.tsx
git commit -m "feat: mirror llmProvider and llmBaseUrl in client Preferences"
```

---

### Task 3: Export `resolveBaseUrl` with unit tests

**Files:**
- Modify: `src/server/llm.ts`
- Modify: `src/server/tests/unit/llm.test.ts`

- [ ] **Step 1: Update import in test file and add failing tests**

Change the import at the top of `src/server/tests/unit/llm.test.ts`:
```typescript
import { extractJson, resolveBaseUrl } from '../../llm';
```

Add at the end of the file:
```typescript
describe('resolveBaseUrl', () => {
  it('returns stored URL when non-empty, regardless of provider', () => {
    expect(resolveBaseUrl('ollama', 'http://custom:11434')).toBe('http://custom:11434');
    expect(resolveBaseUrl('lmstudio', 'http://other:1234')).toBe('http://other:1234');
    expect(resolveBaseUrl('llamacpp', 'http://myserver:8080')).toBe('http://myserver:8080');
  });

  it('returns ollama default when stored URL is empty', () => {
    expect(resolveBaseUrl('ollama', '')).toBe('http://localhost:11434');
  });

  it('returns lmstudio default when stored URL is empty', () => {
    expect(resolveBaseUrl('lmstudio', '')).toBe('http://localhost:1234');
  });

  it('returns http://localhost:8080 when llamacpp and stored URL is empty', () => {
    expect(resolveBaseUrl('llamacpp', '')).toBe('http://localhost:8080');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
bun test src/server/tests/unit/llm.test.ts
```
Expected: `resolveBaseUrl` not exported error.

- [ ] **Step 3: Add `resolveBaseUrl` to `src/server/llm.ts`**

Add after line 9 (after `const COVER_LETTER_TIMEOUT_MS = 8 * 60_000;`):

```typescript
export function resolveBaseUrl(provider: string, storedUrl: string): string {
  if (storedUrl) return storedUrl;
  switch (provider) {
    case 'ollama': return 'http://localhost:11434';
    case 'lmstudio': return 'http://localhost:1234';
    default: return LLAMACPP_BASE_URL;
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
bun test src/server/tests/unit/llm.test.ts
```
Expected: all pass including `extractJson` tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/llm.ts src/server/tests/unit/llm.test.ts
git commit -m "feat: export resolveBaseUrl with unit tests"
```

---

### Task 4: Add provider completion functions and `llmComplete` dispatcher

**Files:**
- Modify: `src/server/llm.ts`

- [ ] **Step 1: Remove module-level URL constants and update `llamaComplete` signature**

Remove these two lines near the top of `llm.ts`:
```typescript
const LLAMA_URL = `${LLAMACPP_BASE_URL}/completion`;
const LLAMA_HEALTH_URL = `${LLAMACPP_BASE_URL}/health`;
```

Update the `llamaComplete` function signature and the fetch URL:
```typescript
async function llamaComplete(baseUrl: string, prompt: string, nPredict: number, signal: AbortSignal): Promise<string> {
  const response = await fetch(`${baseUrl}/completion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: applyGemmaTemplate(prompt),
      n_predict: nPredict,
      temperature: 0.1,
      cache_prompt: true,
    }),
    signal,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`llama.cpp returned HTTP ${response.status}: ${body.slice(0, 200)}`);
  }
  const json = (await response.json()) as { content?: string };
  return json.content?.trim() ?? '';
}
```

- [ ] **Step 2: Add `ollamaComplete` after `llamaComplete`**

```typescript
async function ollamaComplete(baseUrl: string, model: string, prompt: string, nPredict: number, signal: AbortSignal): Promise<string> {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      options: { temperature: 0.1, num_predict: nPredict },
    }),
    signal,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Ollama returned HTTP ${response.status}: ${body.slice(0, 200)}`);
  }
  const json = (await response.json()) as { message?: { content?: string } };
  return json.message?.content?.trim() ?? '';
}
```

- [ ] **Step 3: Add `lmstudioComplete` after `ollamaComplete`**

```typescript
async function lmstudioComplete(baseUrl: string, model: string, prompt: string, nPredict: number, signal: AbortSignal): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: nPredict,
      temperature: 0.1,
      stream: false,
    }),
    signal,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`LM Studio returned HTTP ${response.status}: ${body.slice(0, 200)}`);
  }
  const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content?.trim() ?? '';
}
```

- [ ] **Step 4: Add `llmComplete` dispatcher after `lmstudioComplete`**

```typescript
async function llmComplete(prompt: string, nPredict: number, signal: AbortSignal): Promise<string> {
  const prefs = getPreferences();
  const provider = prefs.llmProvider ?? 'ollama';
  const baseUrl = resolveBaseUrl(provider, prefs.llmBaseUrl ?? '');
  const model = prefs.model;
  switch (provider) {
    case 'ollama': return ollamaComplete(baseUrl, model, prompt, nPredict, signal);
    case 'lmstudio': return lmstudioComplete(baseUrl, model, prompt, nPredict, signal);
    default: return llamaComplete(baseUrl, prompt, nPredict, signal);
  }
}
```

- [ ] **Step 5: Replace all `llamaComplete(prompt, ...)` callsites with `llmComplete`**

There are five callsites inside `llm.ts`. Replace each:

In `extractTagsFromDescription`:
```typescript
const raw = await llmComplete(prompt, 256, controller.signal);
```

In `extractJobDescription`:
```typescript
const text = await llmComplete(prompt, 2048, controller.signal);
```

In `parseResume`:
```typescript
const text = await llmComplete(prompt, 2048, controller.signal);
```

In `generateCoverLetter`:
```typescript
const text = await llmComplete(prompt, 1024, controller.signal);
```

In `analyzeJob`:
```typescript
const raw = await llmComplete(prompt, 2048, controller.signal);
```

Also update two error messages in `analyzeJob` to be provider-agnostic:
- `'llama.cpp response missing content'` → `'LLM response missing content'`
- `'[llm] llama.cpp unreachable for job'` → `'[llm] LLM unreachable for job'`

- [ ] **Step 6: Run LLM unit tests**

```bash
bun test src/server/tests/unit/llm.test.ts
```
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/server/llm.ts
git commit -m "feat: add ollamaComplete, lmstudioComplete, llmComplete provider dispatch"
```

---

### Task 5: Rename health functions and update `index.ts`

**Files:**
- Modify: `src/server/llm.ts`
- Modify: `src/server/index.ts`

- [ ] **Step 1: Rename `getOllamaAvailable` → `getLLMAvailable` in `llm.ts`**

```typescript
export function getLLMAvailable(): boolean | null {
  return llmAvailable;
}
```

- [ ] **Step 2: Replace `checkOllamaHealth` with `checkLLMHealth` in `llm.ts`**

Remove the existing `checkOllamaHealth` function and replace with:

```typescript
export async function checkLLMHealth(): Promise<boolean> {
  const prefs = getPreferences();
  const provider = prefs.llmProvider ?? 'ollama';
  const baseUrl = resolveBaseUrl(provider, prefs.llmBaseUrl ?? '');

  let healthUrl: string;
  switch (provider) {
    case 'ollama': healthUrl = `${baseUrl}/`; break;
    case 'lmstudio': healthUrl = `${baseUrl}/v1/models`; break;
    default: healthUrl = `${baseUrl}/health`; break;
  }

  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      llmAvailable = false;
      console.warn(`[llm] ${provider} health check failed — HTTP`, res.status);
      return false;
    }
    if (provider === 'llamacpp') {
      const json = (await res.json()) as { status?: string };
      llmAvailable = json.status === 'ok';
      if (!llmAvailable) console.warn('[llm] llama.cpp not ready — status:', json.status);
      else console.log('[llm] llama.cpp is reachable');
    } else {
      llmAvailable = true;
      console.log(`[llm] ${provider} is reachable`);
    }
  } catch (err) {
    llmAvailable = false;
    console.warn(`[llm] ${provider} not reachable:`, (err as Error).message);
  }
  return llmAvailable ?? false;
}
```

- [ ] **Step 3: Update `src/server/index.ts`**

Change the import (line 15):
```typescript
import { checkLLMHealth, getLLMAvailable } from './llm';
```

Change the `/api/status` handler:
```typescript
llm_available: getLLMAvailable(),
```

Change startup calls and comment (lines 98–100):
```typescript
// Start LLM health check, job scheduler, and backup scheduler
checkLLMHealth().catch(console.error);
setInterval(() => checkLLMHealth().catch(console.error), 30_000);
```

- [ ] **Step 4: Run all server tests**

```bash
bun test src/server/tests/
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/llm.ts src/server/index.ts
git commit -m "feat: rename health fns to checkLLMHealth/getLLMAvailable, per-provider health check"
```

---

### Task 6: Add LLM Provider accordion to `SettingsView.tsx`

**Files:**
- Modify: `src/client/src/views/SettingsView.tsx`

- [ ] **Step 1: Add `showLLMHelp` state and provider lookup maps**

Inside `SettingsView`, after the existing state declarations, add:

```typescript
const [showLLMHelp, setShowLLMHelp] = useState(false);

const LLM_PROVIDER_LABELS: Record<string, string> = {
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
  llamacpp: 'llama.cpp',
};

const LLM_DEFAULT_URLS: Record<string, string> = {
  ollama: 'http://localhost:11434',
  lmstudio: 'http://localhost:1234',
  llamacpp: 'http://localhost:8080',
};

const LLM_DEFAULT_MODELS: Record<string, string> = {
  ollama: 'gemma4:26b',
  lmstudio: 'google/gemma-3-27b-it',
  llamacpp: 'unsloth/gemma-4-26B-A4B-it-GGUF',
};
```

- [ ] **Step 2: Remove `model` field from App config accordion and change its grid to 2 columns**

Remove this `Field` block from the App config accordion:
```tsx
<Field label="llama.cpp model">
  <input className={inputClass}
    value={prefs.model}
    onChange={e => updatePref('model', e.target.value)}
    placeholder="unsloth/gemma-4-26B-A4B-it-GGUF" />
</Field>
```

Change the grid wrapper from `sm:grid-cols-3` to `sm:grid-cols-2`:
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
```

- [ ] **Step 3: Add LLM Provider accordion between App config and Sources**

Insert this block after the closing `</Accordion>` of App config and before `{/* Sources */}`:

```tsx
{/* LLM Provider */}
<Accordion
  title="LLM Provider"
  defaultOpen={false}
  action={
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setShowLLMHelp(true)}
        title="Setup guide"
        className="w-5 h-5 rounded-full border border-border text-text-3 text-[0.625rem] font-bold flex items-center justify-center cursor-pointer hover:text-text-2 hover:border-text-3 shrink-0"
      >
        ?
      </button>
      {saveBtn(prefsDirty, savingPrefs, savePrefs)}
    </div>
  }
>
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
    <Field label="Provider">
      <select
        className={inputClass}
        value={prefs.llmProvider}
        onChange={e => updatePref('llmProvider', e.target.value as 'ollama' | 'lmstudio' | 'llamacpp')}
      >
        <option value="ollama">Ollama</option>
        <option value="lmstudio">LM Studio</option>
        <option value="llamacpp">llama.cpp</option>
      </select>
    </Field>
    <Field label="Base URL" hint="(leave empty for default)">
      <input
        className={inputClass}
        value={prefs.llmBaseUrl}
        onChange={e => updatePref('llmBaseUrl', e.target.value)}
        placeholder={LLM_DEFAULT_URLS[prefs.llmProvider] ?? 'http://localhost:11434'}
      />
    </Field>
    <Field
      label="Model"
      hint={prefs.llmProvider === 'llamacpp' ? '(informational only)' : undefined}
    >
      <input
        className={inputClass}
        value={prefs.model}
        onChange={e => updatePref('model', e.target.value)}
        placeholder={LLM_DEFAULT_MODELS[prefs.llmProvider] ?? 'gemma4:26b'}
      />
    </Field>
  </div>
  {prefs.llmProvider === 'llamacpp' && (
    <p className="text-[0.75rem] text-text-3 m-0">
      Model loads at server start — this name is for reference only.
    </p>
  )}
</Accordion>
```

- [ ] **Step 4: Smoke-check client tests**

```bash
cd src/client && bun run test 2>&1 | tail -20
```
Expected: no new failures introduced.

- [ ] **Step 5: Commit**

```bash
git add src/client/src/views/SettingsView.tsx
git commit -m "feat: add LLM Provider accordion to settings"
```

---

### Task 7: Add help modal to `SettingsView.tsx`

**Files:**
- Modify: `src/client/src/views/SettingsView.tsx`

- [ ] **Step 1: Add modal JSX before the final `</div>` of the `return` statement**

```tsx
{/* LLM Provider help modal */}
{showLLMHelp && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    onClick={() => setShowLLMHelp(false)}
  >
    <div
      className="bg-surface max-w-lg w-full mx-4 rounded border border-border p-5 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-text font-semibold text-sm m-0">
          {LLM_PROVIDER_LABELS[prefs.llmProvider] ?? 'LLM'} Setup Guide
        </h2>
        <button
          type="button"
          onClick={() => setShowLLMHelp(false)}
          className="text-text-3 text-xl leading-none cursor-pointer bg-transparent border-none"
        >
          ×
        </button>
      </div>

      {prefs.llmProvider === 'ollama' && (
        <div className="flex flex-col gap-3 text-sm text-text-2">
          <p className="m-0">Ollama runs models locally via a simple REST API.</p>
          <div>
            <p className="text-[0.75rem] text-text-3 font-medium mb-1">1. Install Ollama</p>
            <p className="m-0">Download from ollama.com or run:</p>
            <pre className="bg-surface-deep text-text-2 text-xs rounded p-2 mt-1 overflow-x-auto">curl -fsSL https://ollama.com/install.sh | sh</pre>
          </div>
          <div>
            <p className="text-[0.75rem] text-text-3 font-medium mb-1">2. Start the server and pull the model</p>
            <pre className="bg-surface-deep text-text-2 text-xs rounded p-2 overflow-x-auto">{"ollama serve\nollama pull gemma4:26b"}</pre>
          </div>
          <div>
            <p className="text-[0.75rem] text-text-3 font-medium mb-1">3. Configure</p>
            <p className="m-0">Set <strong>Model</strong> to <code className="text-accent bg-surface-deep px-1 rounded text-xs">gemma4:26b</code>. Leave URL empty to use the default (<code className="text-xs">http://localhost:11434</code>).</p>
          </div>
          <p className="m-0 text-text-3 text-xs">Recommended: gemma4:26b — 26B params, good balance of speed and quality.</p>
        </div>
      )}

      {prefs.llmProvider === 'lmstudio' && (
        <div className="flex flex-col gap-3 text-sm text-text-2">
          <p className="m-0">LM Studio provides an OpenAI-compatible local API with a graphical model manager.</p>
          <div>
            <p className="text-[0.75rem] text-text-3 font-medium mb-1">1. Install LM Studio</p>
            <p className="m-0">Download from lmstudio.ai and install it.</p>
          </div>
          <div>
            <p className="text-[0.75rem] text-text-3 font-medium mb-1">2. Download a model</p>
            <p className="m-0">In the Discover tab, search for <code className="text-accent bg-surface-deep px-1 rounded text-xs">google/gemma-3-27b-it</code> and download it.</p>
          </div>
          <div>
            <p className="text-[0.75rem] text-text-3 font-medium mb-1">3. Start the local server</p>
            <p className="m-0">Load your model, then open the <strong>Local Server</strong> tab and click <strong>Start Server</strong>. Default port is 1234.</p>
          </div>
          <div>
            <p className="text-[0.75rem] text-text-3 font-medium mb-1">4. Configure</p>
            <p className="m-0">Set <strong>Model</strong> to <code className="text-accent bg-surface-deep px-1 rounded text-xs">google/gemma-3-27b-it</code>. Leave URL empty to use the default (<code className="text-xs">http://localhost:1234</code>).</p>
          </div>
          <p className="m-0 text-text-3 text-xs">Recommended: google/gemma-3-27b-it</p>
        </div>
      )}

      {prefs.llmProvider === 'llamacpp' && (
        <div className="flex flex-col gap-3 text-sm text-text-2">
          <p className="m-0">llama.cpp runs GGUF models with optional GPU acceleration and grammar-based JSON sampling.</p>
          <div>
            <p className="text-[0.75rem] text-text-3 font-medium mb-1">1. Build or download llama-server</p>
            <p className="m-0">See github.com/ggml-org/llama.cpp for build instructions, or download a prebuilt release.</p>
          </div>
          <div>
            <p className="text-[0.75rem] text-text-3 font-medium mb-1">2. Download a GGUF model</p>
            <p className="m-0">Recommended: <code className="text-accent bg-surface-deep px-1 rounded text-xs">unsloth/gemma-4-26B-A4B-it-GGUF</code> from HuggingFace.</p>
          </div>
          <div>
            <p className="text-[0.75rem] text-text-3 font-medium mb-1">3. Start the server</p>
            <pre className="bg-surface-deep text-text-2 text-xs rounded p-2 overflow-x-auto">{"llama-server \\\n  --model /path/to/model.gguf \\\n  --port 8080 \\\n  --ctx-size 8192 \\\n  -ngl 99"}</pre>
          </div>
          <div>
            <p className="text-[0.75rem] text-text-3 font-medium mb-1">4. Configure</p>
            <p className="m-0">Leave URL empty to use the default (<code className="text-xs">http://localhost:8080</code>). The model name in settings is informational — it loads at server start.</p>
          </div>
          <p className="m-0 text-text-3 text-xs">Note: JSON grammar sampling is applied automatically for structured output.</p>
        </div>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 2: Smoke-check client tests**

```bash
cd src/client && bun run test 2>&1 | tail -20
```
Expected: no new failures.

- [ ] **Step 3: Commit**

```bash
git add src/client/src/views/SettingsView.tsx
git commit -m "feat: add LLM provider help modal"
```

---

### Task 8: Update System accordion label and fix/add SettingsView tests

**Files:**
- Modify: `src/client/src/views/SettingsView.tsx`
- Modify: `src/client/src/tests/SettingsView.test.tsx`

- [ ] **Step 1: Update the provider label in the System accordion**

Find:
```tsx
<span className="text-text-2">llama.cpp {system.llm_available ? "Connected" : "Unavailable"}</span>
```
Replace with:
```tsx
<span className="text-text-2">
  {LLM_PROVIDER_LABELS[prefs.llmProvider] ?? 'LLM'} {system.llm_available ? "Connected" : "Unavailable"}
</span>
```

- [ ] **Step 2: Run existing SettingsView tests — observe current state**

```bash
cd src/client && bun run test src/tests/SettingsView.test.tsx 2>&1
```
The test `'shows Ollama Connected when ollama_available is true'` was previously failing because the code said `'llama.cpp Connected'`. With the change in Step 1, it should now pass (default `llmProvider` is `ollama`).

- [ ] **Step 3: Add new tests to `SettingsView.test.tsx`**

Add these tests inside the existing `describe('SettingsView', ...)` block:

```typescript
it('renders LLM Provider accordion', async () => {
  render(<SettingsView />);
  await waitFor(() => {
    expect(screen.getByText('LLM Provider')).toBeInTheDocument();
  });
});

it('shows LM Studio Connected when llmProvider is lmstudio', async () => {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url === '/api/settings') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ resume: '', preferences: { llmProvider: 'lmstudio' } }),
      });
    }
    if (url === '/api/status') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ llm_available: true, unscored_jobs: 0 }),
      });
    }
    if (url === '/api/backups') {
      return Promise.resolve({ ok: true, json: async () => ({ backups: [] }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  }));

  render(<SettingsView />);
  await waitFor(() => screen.getByText('System'));
  fireEvent.click(screen.getByText('System'));
  await waitFor(() => {
    expect(screen.getByText('LM Studio Connected')).toBeInTheDocument();
  });
});

it('opens help modal when ? button is clicked', async () => {
  render(<SettingsView />);
  await waitFor(() => screen.getByText('LLM Provider'));
  fireEvent.click(screen.getByText('LLM Provider'));
  await waitFor(() => screen.getByTitle('Setup guide'));
  fireEvent.click(screen.getByTitle('Setup guide'));
  await waitFor(() => {
    expect(screen.getByText('Ollama Setup Guide')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run client tests**

```bash
cd src/client && bun run test 2>&1 | tail -30
```
Expected: new tests pass; `'shows Ollama Connected'` now passes.

- [ ] **Step 5: Commit**

```bash
git add src/client/src/views/SettingsView.tsx src/client/src/tests/SettingsView.test.tsx
git commit -m "feat: dynamic provider label in System status, add provider accordion tests"
```

---

### Task 9: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update Prerequisites section**

Replace:
```markdown
## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) + Docker Compose v2
- [llama.cpp](https://github.com/ggml-org/llama.cpp) server running on the host, port `8080`

For local development only:
- [Bun](https://bun.sh) ≥ 1.1
```
With:
```markdown
## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) + Docker Compose v2
- A local LLM server — see [LLM Providers](#llm-providers) below

For local development only:
- [Bun](https://bun.sh) ≥ 1.1
```

- [ ] **Step 2: Replace `## llama.cpp Setup` section with `## LLM Providers`**

Remove the entire `## llama.cpp Setup` section and replace with:

````markdown
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
````

- [ ] **Step 3: Update the `LLAMACPP_BASE_URL` description in the Environment Variables section**

Change:
```markdown
# llama.cpp server URL (default: http://localhost:8080)
# Docker Compose sets this to http://host.docker.internal:8080 automatically
LLAMACPP_BASE_URL=http://localhost:8080
```
To:
```markdown
# llama.cpp fallback URL — used when provider is llamacpp and no URL is saved in Settings
# Docker Compose sets this to http://host.docker.internal:8080 automatically
LLAMACPP_BASE_URL=http://localhost:8080
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: update README with multi-provider LLM setup"
```
