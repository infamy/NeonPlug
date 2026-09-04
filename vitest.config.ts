import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Node by default — the unit suite is pure functions and stays fast this
    // way. Component tests opt into a DOM per file with a
    // `@vitest-environment jsdom` docblock rather than slowing everything down.
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/component/**/*.test.tsx'],
    globals: false,
  },
});
