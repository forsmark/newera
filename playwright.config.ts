import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Start both servers if not already running; reuse existing for dev workflow.
  webServer: [
    {
      command: 'bun run dev:server',
      port: 3000,
      reuseExistingServer: true,
      timeout: 15_000,
    },
    {
      command: 'bun run dev:client',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 20_000,
    },
  ],
});
