import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env.DB_PATH = ':memory:';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'new-era-test-'));
