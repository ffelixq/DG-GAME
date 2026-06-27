import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [tsconfigPaths()],
        test: {
          name: 'unit',
          environment: 'node',
          include: ['packages/shared/**/*.test.ts', 'packages/server/**/*.test.ts'],
        },
      },
      {
        plugins: [tsconfigPaths()],
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['packages/client/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
});
