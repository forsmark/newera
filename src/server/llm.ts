import type { Job, Preferences } from './types';
import { LLAMACPP_BASE_URL } from './config';
import { getPreferences, getSetting } from './settings';
import { computePrefsHash } from './utils/hash';

const LLAMA_URL = `${LLAMACPP_BASE_URL}/completion`;
const LLAMA_HEALTH_URL = `${LLAMACPP_BASE_URL}/health`;
const TIMEOUT_MS = 3 * 60_000;
const COVER_LETTER_TIMEOUT_MS = 8 * 60_000;

export function resolveBaseUrl(provider: string, storedUrl: string): string {
  if (storedUrl) return storedUrl;
  switch (provider) {
    case 'ollama': return 'http://localhost:11434';
    case 'lmstudio': return 'http://localhost:1234';
    default: return LLAMACPP_BASE_URL;
  }
}

let llmAvailable: boolean | null = null;

export function getOllamaAvailable(): boolean | null {
  return llmAvailable;
}

export async function checkOllamaHealth(): Promise<boolean> {
  try {
    const res = await fetch(LLAMA_HEALTH_URL, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      llmAvailable = false;
      console.warn('[llm] llama.cpp health check failed — HTTP', res.status);
      return false;
    }
    const json = (await res.json()) as { status?: string };
    llmAvailable = json.status === 'ok';
    if (!llmAvailable) console.warn('[llm] llama.cpp not ready — status:', json.status);
    else console.log('[llm] llama.cpp is reachable');
  } catch (err) {
    llmAvailable = false;
    console.warn('[llm] llama.cpp not reachable:', (err as Error).message);
  }
  return llmAvailable ?? false;
}

export interface AnalysisResult {
  match_score: number;
  match_reasoning: string;
  match_summary: string;
  tags: string[];
  work_type: 'remote' | 'hybrid' | 'onsite' | null;
  prefs_hash: string;
}

function formatPreferences(p: Preferences): string {
  const lines: string[] = [];
  if (p.location) lines.push(`Preferred location: ${p.location}`);
  if (p.commutableLocations) lines.push(`Also commutable to: ${p.commutableLocations}`);
  if (Array.isArray(p.remote) && p.remote.length > 0) lines.push(`Work style preference: ${p.remote.join(' or ')}`);
  if (p.seniority && p.seniority !== 'any') lines.push(`Target seniority: ${p.seniority}`);
  if (p.minSalaryDkk) lines.push(`Min salary: ${p.minSalaryDkk.toLocaleString('da-DK')} DKK/month`);
  if (p.techInterests) lines.push(`Tech interests: ${p.techInterests}`);
  if (p.techAvoid) lines.push(`Tech to avoid: ${p.techAvoid}`);
  if (p.companyBlacklist) {
    const list = p.companyBlacklist.split('\n').map(s => s.trim()).filter(Boolean).join(', ');
    if (list) lines.push(`Blacklisted companies: ${list}`);
  }
  if (p.knownLanguages) lines.push(`Spoken languages: ${p.knownLanguages}`);
  if (p.notes) lines.push(`Additional notes: ${p.notes}`);
  return lines.length > 0 ? lines.join('\n') : 'No specific preferences set.';
}

function buildLocationRules(p: Preferences): string {
  const primary = p.location || 'Copenhagen / Greater Copenhagen';
  const commutable = p.commutableLocations
    ? `${p.commutableLocations} = minor penalty (5–10 pts — commutable).`
    : 'Malmö, Sweden = minor penalty (5–10 pts — short train commute).';
  return `- ${primary} = no penalty.\n- ${commutable}\n- Elsewhere in Denmark (Jutland, Funen, Aarhus, Odense, etc.) = subtract 25–35 points.\n- Outside Denmark = subtract 40+ points unless fully remote.`;
}

function buildPrompt(resume: string, preferences: Preferences, job: Job): string {
  const truncResume = resume.length > 4_000 ? resume.slice(0, 4_000) + '\n[truncated]' : resume;
  const desc = job.description ?? 'Not provided';
  const truncDesc = desc.length > 6_000 ? desc.slice(0, 6_000) + '\n[truncated]' : desc;

  return `You are a job matching assistant. Score how well the job posting below fits the person's resume and preferences, then write your assessment directly to them.

## Your Resume
${truncResume || 'Not provided'}

## Your Preferences
${formatPreferences(preferences)}

## Job Posting
Title: ${job.title}
Company: ${job.company}
Location: ${job.location ?? 'Not specified'}
Description: ${truncDesc}

## Scoring rules
- Location is a hard constraint:
${buildLocationRules(preferences)}
- Apply the location penalty first, then score skills and experience fit on the remainder.
${preferences.knownLanguages ? `- Language: if the job clearly requires communication in a spoken language not in [${preferences.knownLanguages}], subtract 30–40 points.` : ''}
${preferences.companyBlacklist && preferences.companyBlacklist.includes(job.company) ? '- This company is on your blacklist — score must be 0.' : ''}

## Task
Respond with ONLY a single JSON object. No prose, no markdown, no code fences, no explanation before or after. Start your response with { and end with }.

{"match_score": <0-100>, "match_reasoning": "<1-2 sentences addressed directly to you explaining why you are or aren't a fit>", "summary": "<2-3 sentence factual overview of what the role involves and who it's for>", "tags": ["<tech1>", "<tech2>"], "work_type": "<remote|hybrid|onsite|null>"}

summary: factual description of the role — what the job is about, not an opinion.
match_reasoning: direct second-person assessment (use "you"/"your", not "the candidate"). If location is outside your preferred area, say so explicitly.
tags: up to 8 specific technologies, languages, frameworks, or tools mentioned in the job (e.g. "React", "TypeScript", "Node.js", "AWS"). Empty array if none identifiable.
work_type: one of "remote", "hybrid", "onsite", or null if the posting does not clearly indicate the work arrangement.`;
}

export function extractJson(raw: string): AnalysisResult {
  const stripped = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();

  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`No JSON object found in model response: ${raw.slice(0, 200)}`);
  }

  // Sanitize common model JSON quirks before parsing
  let sanitized = match[0]
    .replace(/:\s*NaN\b/g, ': null')
    .replace(/:\s*Infinity\b/g, ': null')
    .replace(/:\s*-Infinity\b/g, ': null')
    .replace(/:\s*\+(\d)/g, ': $1')               // leading + e.g. +75 → 75
    .replace(/(\d)\.\s*([,}\]])/g, '$1$2')         // trailing decimal e.g. 75. → 75
    .replace(/([{,]\s*)([a-zA-Z_]\w*)\s*:/g, '$1"$2":') // unquoted keys
    .replace(/,\s*([}\]])/g, '$1');                // trailing commas

  // If JSON is truncated (unterminated string/object), close it out
  try {
    JSON.parse(sanitized);
  } catch {
    // Strip back to last complete key-value pair then close the object
    sanitized = sanitized.replace(/,?\s*"[^"]*"?\s*:\s*[^,}\]]*$/, '').replace(/,\s*$/, '') + '}';
  }

  const parsed = JSON.parse(sanitized) as Record<string, unknown>;

  const match_score = Number(parsed['match_score']);
  const match_reasoning = String(parsed['match_reasoning'] ?? '');
  const match_summary = String(parsed['summary'] ?? '');
  const rawTags = parsed['tags'];
  const tags = Array.isArray(rawTags)
    ? rawTags.map(t => String(t).trim()).filter(t => t.length > 0).slice(0, 8)
    : [];

  const rawWorkType = parsed['work_type'];
  const VALID_WORK_TYPES = new Set(['remote', 'hybrid', 'onsite']);
  const work_type = typeof rawWorkType === 'string' && VALID_WORK_TYPES.has(rawWorkType)
    ? rawWorkType as 'remote' | 'hybrid' | 'onsite'
    : null;

  if (Number.isNaN(match_score) || match_score < 0 || match_score > 100) {
    throw new Error(`Invalid match_score: ${parsed['match_score']}`);
  }
  if (!match_reasoning) {
    throw new Error('Empty match_reasoning');
  }

  return { match_score, match_reasoning, match_summary, tags, work_type, prefs_hash: '' };
}


function applyGemmaTemplate(userMessage: string): string {
  // Gemma 4 IT chat template with <think></think> prefill to skip CoT reasoning
  return `<start_of_turn>user\n${userMessage}<end_of_turn>\n<start_of_turn>model\n<think>\n</think>\n`;
}

async function llamaComplete(prompt: string, nPredict: number, signal: AbortSignal): Promise<string> {
  const response = await fetch(LLAMA_URL, {
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
    const raw = await llamaComplete(prompt, 256, controller.signal);
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

export async function extractJobDescription(pageText: string): Promise<string | null> {
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
    const text = await llamaComplete(prompt, 2048, controller.signal);
    return text.length > 0 ? text : null;
  } catch (err) {
    if (err instanceof Error && err.name !== 'AbortError') {
      console.warn('[llm] extractJobDescription failed:', (err as Error).message);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function parseResume(rawText: string): Promise<string | null> {
  const truncated = rawText.length > 15_000 ? rawText.slice(0, 15_000) + '\n[truncated]' : rawText;
  const prompt = `You are processing a CV/resume for a job matching system.
Reformat the following CV into clean, structured markdown with clear sections (Summary, Work Experience, Skills, Education, etc.).
Preserve all relevant professional information. Remove personal contact details (phone, email, home address).
Return only the formatted markdown — no commentary, no preamble.

CV text:
${truncated}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const text = await llamaComplete(prompt, 2048, controller.signal);
    return text.length > 50 ? text : null;
  } catch (err) {
    console.warn('[llm] parseResume failed:', (err as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateCoverLetter(job: Job, archivedDescription?: string | null): Promise<string | null> {
  const { getResume, getPreferences } = await import('./routes/settings');
  const resume = getResume();
  const preferences = getPreferences();

  if (!resume) {
    console.warn('[llm] No resume set — skipping cover letter for job', job.id);
    return null;
  }

  const description = archivedDescription ?? job.description ?? 'Not provided';
  const truncatedDesc = description.length > 8_000 ? description.slice(0, 8_000) + '\n[truncated]' : description;

  const prompt = `You are writing a cover letter on behalf of a job applicant.

## Candidate Resume
${resume}

## Candidate Preferences / Context
${formatPreferences(preferences)}

## Job Posting
Title: ${job.title}
Company: ${job.company}
Location: ${job.location ?? 'Not specified'}
Description:
${truncatedDesc}

## Instructions
Write a professional cover letter for this specific role. Requirements:
- Sound natural and human — avoid AI-sounding phrases, buzzwords, and corporate jargon
- Do NOT use em-dashes (—) anywhere in the letter
- Keep it concise: 3-4 short paragraphs
- Opening: express genuine interest in this specific role and company
- Middle: connect 2-3 concrete experiences or skills from the resume to the job requirements
- Closing: brief call to action, no hollow sign-off phrases
- Do not invent experience not in the resume
- Address it as a letter (no "Dear Hiring Manager" if you can personalise it)

Return only the cover letter text, no commentary or metadata.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COVER_LETTER_TIMEOUT_MS);

  try {
    const text = await llamaComplete(prompt, 1024, controller.signal);
    return text.length > 50 ? text : null;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.error(`[llm] generateCoverLetter timed out for job ${job.id}`);
    } else {
      console.error('[llm] generateCoverLetter failed for job', job.id, ':', err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function analyzeJob(job: Job): Promise<AnalysisResult | null> {
  const { getResume, getPreferences } = await import('./routes/settings');
  const resume = getResume();
  const preferences = getPreferences();

  if (!resume) {
    console.warn('[llm] No resume set — skipping analysis for job', job.id);
    return null;
  }

  const prefsJson = getSetting('preferences') ?? '{}';
  const prefs_hash = computePrefsHash(resume, prefsJson);
  const prompt = buildPrompt(resume, preferences, job);

  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const raw = await llamaComplete(prompt, 2048, controller.signal);
      clearTimeout(timer);

      if (!raw) throw new Error('llama.cpp response missing content');

      const result = extractJson(raw);
      result.prefs_hash = prefs_hash;

      if (result.tags.length === 0 && job.description && job.description.length > 50) {
        console.log(`[llm] No tags from main pass for job ${job.id}, running tag extraction pass`);
        result.tags = await extractTagsFromDescription(job.description);
        if (result.tags.length > 0) {
          console.log(`[llm] Tag pass found: ${result.tags.join(', ')}`);
        }
      }

      return result;
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === 'AbortError') {
        console.error(`[llm] analyzeJob timed out after ${TIMEOUT_MS}ms for job ${job.id}`);
        llmAvailable = false;
        return null;
      }
      if (err instanceof Error && (err.message.includes('ECONNREFUSED') || err.message.includes('fetch failed') || err.message.includes('Unable to connect'))) {
        llmAvailable = false;
        console.error('[llm] llama.cpp unreachable for job', job.id, ':', err.message);
        return null;
      }
      if (attempt < MAX_ATTEMPTS) {
        console.warn(`[llm] analyzeJob attempt ${attempt} failed for job ${job.id}, retrying:`, (err as Error).message);
        continue;
      }
      console.error('[llm] analyzeJob failed for job', job.id, ':', err);
      return null;
    }
  }
  return null;
}
