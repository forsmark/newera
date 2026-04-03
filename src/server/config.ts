import { resolve } from 'path';

const PROJECT_ROOT = resolve(import.meta.dir, '../../');

export const DATA_DIR = process.env.DATA_DIR ?? resolve(PROJECT_ROOT, 'data');
export const DB_PATH = process.env.DB_PATH ?? resolve(PROJECT_ROOT, 'db/jobs.db');
export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
