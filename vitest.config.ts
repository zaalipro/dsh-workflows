import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    passWithNoTests: false,
    coverage: {
      // Keep the 100%-per-file denominator on owned source. Subprocess/V8
      // filenames such as scripts/*.mjs and generated lib/* are release
      // artifacts with their own behavioral gates, not a second denominator.
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts'],
    },
  },
});
