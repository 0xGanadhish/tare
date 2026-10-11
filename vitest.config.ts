import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Next's tsconfig keeps JSX as-is; component tests need it compiled.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
  test: { environment: 'node', include: ['**/*.test.ts', '**/*.test.tsx'], exclude: ['**/node_modules/**', 'contracts/**', '.next/**', 'backend/**', 'indexer/**'] },
});
