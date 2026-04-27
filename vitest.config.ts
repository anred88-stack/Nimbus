import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const rootDir = dirname(fileURLToPath(import.meta.url));

const sharedAlias = {
  '@': resolve(rootDir, 'src'),
  '@physics': resolve(rootDir, 'src/physics'),
  '@scene': resolve(rootDir, 'src/scene'),
  '@ui': resolve(rootDir, 'src/ui'),
  '@data': resolve(rootDir, 'src/data'),
  '@store': resolve(rootDir, 'src/store'),
};

export default defineConfig({
  plugins: [react()],
  resolve: { alias: sharedAlias },
  test: {
    globals: false,
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/main.tsx', 'src/vite-env.d.ts', 'src/**/*.stories.{ts,tsx}'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'physics',
          environment: 'node',
          include: ['src/physics/**/*.test.ts', 'tests/unit/physics/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: [
            'src/ui/**/*.test.{ts,tsx}',
            'src/store/**/*.test.ts',
            'src/scene/**/*.test.ts',
            'tests/unit/ui/**/*.test.{ts,tsx}',
          ],
        },
      },
    ],
  },
});
