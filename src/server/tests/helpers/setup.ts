// Runs before every test file. Makes db.ts open an in-memory SQLite database
// instead of writing to disk. Each test file gets a fresh module registry
// (bun test isolates files), so each file gets its own clean in-memory DB.
process.env.DB_PATH = ':memory:';
