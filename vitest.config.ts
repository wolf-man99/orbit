import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // The engine is held to a higher standard than the rest of the codebase
      // because it is the product. (PRD ENG-04)
      thresholds: {
        'src/domain/engine/**': { branches: 95, functions: 95, lines: 95, statements: 95 },
      },
    },
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
