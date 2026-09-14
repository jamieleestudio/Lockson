import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

function luaTextPlugin(): Plugin {
  return {
    name: 'lua-text',
    enforce: 'pre',
    load(id: string) {
      if (id.endsWith('.lua')) {
        return `export default ${JSON.stringify(readFileSync(id, 'utf-8'))}`;
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [luaTextPlugin()],
  resolve: {
    alias: [
      { find: /^lockson\/errors$/, replacement: resolve(__dirname, 'src/errors/index.ts') },
      { find: /^lockson$/, replacement: resolve(__dirname, 'src/index.ts') },
    ],
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    setupFiles: [],
    testTimeout: 15000,
    hookTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.lua', 'src/**/index.ts'],
    },
  },
});