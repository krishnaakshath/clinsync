import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // Test files share one live, persistent Neon database (no per-test DB
    // isolation — see Task 4's review ruling). tests/db/seed.test.ts
    // destructively truncates and reseeds it, which races with any other
    // file reading real rows concurrently (e.g. tests/api/patients.test.ts).
    // Run files sequentially to keep the shared-state suite deterministic.
    fileParallelism: false,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
