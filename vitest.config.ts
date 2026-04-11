import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@main': path.resolve(__dirname, 'src/main'),
      '@native': path.resolve(__dirname, 'src/native'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
