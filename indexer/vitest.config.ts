import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Blank RPC URLs so a developer's indexer/.env never sends tests to a real node.
  test: { include: ['test/**/*.test.ts'], env: { ENVIO_RPC_URL_10143: '', ENVIO_RPC_URL_143: '' } },
});
