import { readFile } from 'fs/promises';
import { join } from 'path';
import type { Job } from './types';
import { DATA_DIR, OLLAMA_BASE_URL } from './config';

const OLLAMA_URL = `${OLLAMA_BASE_URL}/api/generate`;
const OLLAMA_HEALTH_URL = `${OLLAMA_BASE_URL}/api/tags`;
const MODEL = 'qwen3.5:9b';
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
  match_reasoning: string;  // 1-2 sentence explanation
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

## Task
Return ONLY a JSON object with this exact format (no markdown, no explanation):
{"match_score": <0-100>, "match_reasoning": "<1-2 sentences>"}`;
}

function extractJson(raw: string): AnalysisResult {
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

  if (Number.isNaN(match_score) || match_score < 0 || match_score > 100) {
    throw new Error(`Invalid match_score: ${parsed['match_score']}`);
  }
  if (!match_reasoning) {
    throw new Error('Empty match_reasoning');
  }

  return { match_score, match_reasoning };
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

    return extractJson(raw);
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
