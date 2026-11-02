import { defineConfig } from 'vitest/config';
import { swcPlugin } from './vitest.base';

// The infrastructure specs build the image, start containers and install the chart in a cluster.
// `npm run test:unit`, the integration and e2e suites and the CI never load this configuration.
export default defineConfig({
  test: {
    include: ['test/infra/**/*.spec.ts'],
    environment: 'node',
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 300000,
    hookTimeout: 900000,
  },
  plugins: [swcPlugin()],
});
