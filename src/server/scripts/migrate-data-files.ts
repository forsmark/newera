/**
 * One-time migration: read data/resume.md and data/preferences.md into the DB settings table.
 * Safe to run multiple times — skips if settings already exist.
 *
 * Usage:  bun run src/server/scripts/migrate-data-files.ts
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import db from '../db';
import type { Preferences } from '../types';
import { DEFAULT_PREFERENCES } from '../types';

const DATA_DIR = join(import.meta.dir, '../../../data');

function getSetting(key: string): string | null {
  return (db.query<{ value: string }, [string]>('SELECT value FROM settings WHERE key = ?').get(key))?.value ?? null;
}

function setSetting(key: string, value: string) {
  db.run(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    [key, value, new Date().toISOString()],
  );
}

function parseList(block: string): string {
  return block
    .split('\n')
    .map(l => l.replace(/^#+.*$/, '').replace(/^\s*[-*]\s*/, '').replace(/^#.*$/, '').trim())
    .filter(l => l.length > 0)
    .join('\n');
}

function section(text: string, heading: string): string | null {
  const re = new RegExp(`##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i');
  return text.match(re)?.[1]?.trim() ?? null;
}

// ─── Resume ────────────────────────────────────────────────────────────────

const resumePath = join(DATA_DIR, 'resume.md');
if (!existsSync(resumePath)) {
  console.log('resume.md not found — skipping resume migration');
} else if (getSetting('resume')) {
  console.log('resume already in DB — skipping (delete the row to re-run)');
} else {
  const content = readFileSync(resumePath, 'utf8');
  setSetting('resume', content);
  console.log(`✓ Migrated resume.md (${content.length} chars)`);
}

// ─── Preferences ───────────────────────────────────────────────────────────

const prefsPath = join(DATA_DIR, 'preferences.md');
if (!existsSync(prefsPath)) {
  console.log('preferences.md not found — skipping preferences migration');
} else if (getSetting('preferences')) {
  console.log('preferences already in DB — skipping (delete the row to re-run)');
} else {
  const text = readFileSync(prefsPath, 'utf8');
  const prefs: Preferences = { ...DEFAULT_PREFERENCES };

  // Location + remote
  const locationBlock = section(text, 'Location');
  if (locationBlock) {
    const lines = locationBlock
      .split('\n')
      .map(l => l.replace(/^#+.*$/, '').replace(/^\s*[-*]\s*/, '').trim())
      .filter(l => l.length > 0 && !l.startsWith('#'));

    // First non-comment line that looks like a location
    const locLine = lines.find(l => /copenhagen|københavn|denmark|aarhus|odense/i.test(l));
    if (locLine) prefs.location = locLine.replace(/,\s*(denmark|danmark)$/i, '').trim() + ', Denmark';

    // Remote preference
    const remoteLine = lines.find(l => /remote|hybrid|on.?site/i.test(l));
    if (remoteLine) {
      if (/on.?site or hybrid|hybrid or on.?site/i.test(remoteLine)) prefs.remote = 'hybrid';
      else if (/on.?site/i.test(remoteLine)) prefs.remote = 'onsite';
      else if (/remote/i.test(remoteLine)) prefs.remote = 'remote';
      else if (/hybrid/i.test(remoteLine)) prefs.remote = 'hybrid';
    }
  }

  // Seniority
  const senBlock = section(text, 'Seniority');
  if (senBlock) {
    const s = senBlock.toLowerCase();
    if (/lead|principal|staff/i.test(s)) prefs.seniority = 'lead';
    else if (/senior/i.test(s)) prefs.seniority = 'senior';
    else if (/mid|middle/i.test(s)) prefs.seniority = 'mid';
    else if (/junior/i.test(s)) prefs.seniority = 'junior';
  }

  // Minimum salary — treat raw number as annual DKK, convert to monthly
  const salBlock = section(text, 'Minimum Salary');
  if (salBlock) {
    const num = parseInt(salBlock.replace(/\D/g, ''), 10);
    if (!isNaN(num) && num > 0) {
      // Heuristic: values ≥ 100,000 are likely annual (DKK); divide by 12
      prefs.minSalary = num >= 100_000 ? Math.round(num / 12) : num;
      console.log(`  salary: ${num} → ${prefs.minSalary} DKK/month`);
    }
  }

  // Tech interests from ## Preferred Stack
  const stackBlock = section(text, 'Preferred Stack');
  if (stackBlock) {
    const items = stackBlock
      .split('\n')
      .flatMap(l => {
        const clean = l.replace(/^\s*[-*]\s*(Frontend:|Backend:|Other:)?\s*/i, '').trim();
        return clean ? clean.split(/[,;]+/).map(s => s.trim()).filter(Boolean) : [];
      });
    prefs.techInterests = [...new Set(items)].join(', ');
  }

  // Tech/company avoid
  const avoidBlock = section(text, 'Avoid');
  if (avoidBlock) {
    // Keywords: ["PHP", "Laravel"] → PHP, Laravel
    const kwMatch = avoidBlock.match(/Keywords?:\s*\[([^\]]*)\]/i);
    if (kwMatch) {
      prefs.techAvoid = kwMatch[1]
        .split(',')
        .map(s => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean)
        .join(', ');
    }
    // Companies: ["Foo"] → blacklist
    const coMatch = avoidBlock.match(/Compan(?:y|ies):\s*\[([^\]]*)\]/i);
    if (coMatch && coMatch[1].trim()) {
      prefs.companyBlacklist = coMatch[1]
        .split(',')
        .map(s => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean)
        .join('\n');
    }
  }

  // Search terms (unified — strip trailing location suffixes)
  const liBlock = section(text, 'Search Terms');
  if (liBlock) {
    const terms = parseList(liBlock)
      .split('\n')
      .map(l => l.replace(/\s+(Copenhagen|København|Denmark|Danmark).*$/i, '').trim())
      .filter(Boolean);
    prefs.searchTerms = terms.join('\n');
  }

  setSetting('preferences', JSON.stringify(prefs));
  console.log('✓ Migrated preferences.md:');
  console.log('  location:', prefs.location);
  console.log('  remote:', prefs.remote);
  console.log('  seniority:', prefs.seniority);
  console.log('  minSalary:', prefs.minSalary);
  console.log('  techInterests:', prefs.techInterests);
  console.log('  techAvoid:', prefs.techAvoid);
  console.log('  searchTerms:', prefs.searchTerms.split('\n').join(', '));
}

console.log('\nDone. Open Settings in the app to review and adjust.');
