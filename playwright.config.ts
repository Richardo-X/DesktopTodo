import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 240_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  outputDir: 'test-results'
})
