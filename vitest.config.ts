import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig(({ mode }) => {
  // Load .env.test (and .env.test.local) with no prefix filter so NEXT_PUBLIC_* and
  // SUPABASE_* vars are all available as process.env in tests.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [tsconfigPaths()],
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
      passWithNoTests: true,
      env,
      globalSetup: ['./vitest.global-setup.ts'],
    },
  }
})
