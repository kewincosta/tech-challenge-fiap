import { defineConfig } from 'vitest/config';
import { swcPlugin } from './vitest.base';

export default defineConfig({
  test: {
    include: ['test/integration/**/*.spec.ts'],
    environment: 'node',
    setupFiles: ['./test/support/setup-tests.ts'],
    globalSetup: ['./test/support/global-setup.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30000,
    hookTimeout: 60000,
  },
  plugins: [swcPlugin()],
});
