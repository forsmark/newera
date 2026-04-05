import { readFile } from 'fs/promises';
import { join } from 'path';
import type { Job } from './types';
import { DATA_DIR, OLLAMA_BASE_URL } from './config';

const OLLAMA_URL = `${OLLAMA_BASE_URL}/api/generate`;
const OLLAMA_HEALTH_URL = `${OLLAMA_BASE_URL}/api/tags`;
const MODEL = 'gemma4:26b';
const TIMEOUT_MS = 60_000;

let ollamaAvailable: boolean | null = null; // null = not yet checked

export function getOllamaAvailable(): boolean | null {
  return ollamaAvailable;
}

export async function checkOllamaHealth(): Promise<boolean> {
  try {
    const res = await fetch(OLLAMA_HEALTH_URL, {
      signal: AbortSignal.timeout(5000),
    });
    ollamaAvailable = res.ok;
    if (!res.ok) console.warn('[llm] Ollama health check failed — HTTP', res.status);
    else console.log('[llm] Ollama is reachable');
  } catch (err) {
    ollamaAvailable = false;
    console.warn('[llm] Ollama is not reachable:', (err as Error).message);
  }
  return ollamaAvailable;
}

const RESUME_PATH = join(DATA_DIR, 'resume.md');
const PREFERENCES_PATH = join(DATA_DIR, 'preferences.md');

export interface AnalysisResult {
  match_score: number;      // 0–100
  match_reasoning: string;  // 1-2 sentence explanation of fit
  match_summary: string;    // 2-3 sentence factual overview of the role
  tags: string[];           // tech stack tags extracted from the job posting
}

function buildPrompt(resume: string, preferences: string, job: Job): string {
  return `You are evaluating a job posting for a job seeker. Score how well this job matches the candidate's profile.

## Candidate Resume
${resume}

## Candidate Preferences
${preferences}

## Job Posting
Title: ${job.title}
Company: ${job.company}
Location: ${job.location ?? 'Not specified'}
Description: ${job.description ?? 'Not provided'}

## Scoring rules
- Location is a hard constraint. Copenhagen / Greater Copenhagen = no penalty. Anywhere else in Denmark (Jutland, Funen, Aarhus, Odense, etc.) = subtract 25–35 points. Outside Denmark = subtract 40+ points unless fully remote.
- Apply the location penalty first, then score skills and experience fit on the remainder.

## Task
Return ONLY a JSON object with this exact format (no markdown, no explanation):
{"match_score": <0-100>, "match_reasoning": "<1-2 sentences on why this candidate is or isn't a fit>", "summary": "<2-3 sentence factual overview of what the role involves and who it's for>", "tags": ["<tech1>", "<tech2>"]}

summary: factual description of the role — what the job is about, not an opinion on the candidate.
match_reasoning: personalised assessment of fit for this specific candidate. If location is outside Copenhagen, say so explicitly.
tags: up to 8 specific technologies, languages, frameworks, or tools mentioned in the job (e.g. "React", "TypeScript", "Node.js", "AWS"). Empty array if none identifiable.`;
}

export function extractJson(raw: string): AnalysisResult {
  // Strip markdown code fences if the model wrapped its response
  const stripped = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();

  // Find the first {...} block
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`No JSON object found in model response: ${raw.slice(0, 200)}`);
  }

  const parsed = JSON.parse(match[0]) as Record<string, unknown>;

  const match_score = Number(parsed['match_score']);
  const match_reasoning = String(parsed['match_reasoning'] ?? '');
  const match_summary = String(parsed['summary'] ?? '');
  const rawTags = parsed['tags'];
  const tags = Array.isArray(rawTags)
    ? rawTags.map(t => String(t).trim()).filter(t => t.length > 0).slice(0, 8)
    : [];

  if (Number.isNaN(match_score) || match_score < 0 || match_score > 100) {
    throw new Error(`Invalid match_score: ${parsed['match_score']}`);
  }
  if (!match_reasoning) {
    throw new Error('Empty match_reasoning');
  }

  return { match_score, match_reasoning, match_summary, tags };
}

/** Focused second-pass tag extraction when the main analysis returned no tags. */
async function extractTagsFromDescription(description: string): Promise<string[]> {
  const truncated = description.length > 6_000 ? description.slice(0, 6_000) + '\n[truncated]' : description;

  const prompt = `Extract all specific technologies, programming languages, frameworks, tools, and platforms explicitly mentioned in the job description below.
Return ONLY a JSON array of tag strings, nothing else. Maximum 8 tags. Empty array if none found.
Example output: ["Java", ".NET", "Spring Boot", "Azure"]

Job Description:
${truncated}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, prompt, stream: false, think: false }),
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);

    const json = (await response.json()) as { response?: string };
    const raw = json.response?.trim() ?? '';

    // Strip markdown fences and find the array
    const stripped = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
    const match = stripped.match(/\[[\s\S]*\]/);
    if (!match) return [];

    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((t: unknown) => String(t).trim()).filter(t => t.length > 0).slice(0, 8);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Ask the LLM to pull out the job description text from a raw webpage dump. */
export async function extractJobDescription(pageText: string): Promise<string | null> {
  // Truncate to avoid overloading context — 12 000 chars is plenty for most postings
  const truncated = pageText.length > 12_000 ? pageText.slice(0, 12_000) + '\n[truncated]' : pageText;

  const prompt = `Below is the raw text content scraped from a job posting webpage.
Extract ONLY the actual job description / posting content — including role summary, responsibilities, requirements, and any salary/benefits info.
Remove all navigation, cookie notices, ads, boilerplate footer text, and unrelated content.
Return the extracted text only, no commentary.

---
${truncated}
---`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, prompt, stream: false, think: false }),
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);

    const json = (await response.json()) as { response?: string };
    const text = json.response?.trim();
    return text && text.length > 0 ? text : null;
  } catch (err) {
    if (err instanceof Error && err.name !== 'AbortError') {
      console.warn('[llm] extractJobDescription failed:', (err as Error).message);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function analyzeJob(job: Job): Promise<AnalysisResult | null> {
  let resume: string;
  let preferences: string;

  try {
    [resume, preferences] = await Promise.all([
      readFile(RESUME_PATH, 'utf-8'),
      readFile(PREFERENCES_PATH, 'utf-8'),
    ]);
  } catch (err) {
    console.warn('[llm] Could not read data files (resume.md / preferences.md):', err);
    return null;
  }

  const prompt = buildPrompt(resume, preferences, job);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        prompt,
        stream: false,
        think: false,   // disable extended thinking — reduces latency from 60s+ to <5s
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama returned HTTP ${response.status}`);
    }

    const json = (await response.json()) as { response?: string };
    const raw = json.response;

    if (!raw) {
      throw new Error('Ollama response missing "response" field');
    }

    const result = extractJson(raw);

    // Second pass: if no tags were extracted but description exists, try a focused extraction
    if (result.tags.length === 0 && job.description && job.description.length > 50) {
      console.log(`[llm] No tags from main pass for job ${job.id}, running tag extraction pass`);
      result.tags = await extractTagsFromDescription(job.description);
      if (result.tags.length > 0) {
        console.log(`[llm] Tag pass found: ${result.tags.join(', ')}`);
      }
    }

    return result;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.error(`[llm] analyzeJob timed out after ${TIMEOUT_MS}ms for job ${job.id}`);
      ollamaAvailable = false;
    } else if (err instanceof Error && (err.message.includes('ECONNREFUSED') || err.message.includes('fetch failed'))) {
      ollamaAvailable = false;
      console.error('[llm] Ollama unreachable for job', job.id, ':', err.message);
    } else {
      console.error('[llm] analyzeJob failed for job', job.id, ':', err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}
