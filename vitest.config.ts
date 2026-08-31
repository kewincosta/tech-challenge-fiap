import { defineConfig } from 'vitest/config';
import { swcPlugin } from './vitest.base';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    setupFiles: ['./test/support/setup-tests.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/main.ts',
        'src/app.setup.ts',
        'src/**/*.module.ts',
        'src/**/*.orm-entity.ts',
        'src/**/*.spec.ts',
        'src/shared/infrastructure/database/migrations/**',
      ],
    },
  },
  plugins: [swcPlugin()],
});
