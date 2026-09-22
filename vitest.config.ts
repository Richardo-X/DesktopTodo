import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/component/**/*.test.ts'],
    environment: 'happy-dom',
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/core/**/*.ts'],
      reportsDirectory: 'coverage'
    }
  }
})
