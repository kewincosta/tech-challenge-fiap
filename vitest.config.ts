import { defineConfig } from 'vitest/config';
import { swcPlugin } from './vitest.base';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'security/**/*.spec.ts'],
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
      // One entry per critical path the build plan named. Kept per glob,
      // not global, so a controller or DTO that unit tests deliberately skip never drags the
      // number down on the paths that matter (design.md's Coverage thresholds).
      thresholds: {
        'src/modules/work-orders/domain/**/*.ts': {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
        'src/modules/inventory/domain/**/*.ts': {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
        'src/modules/users/domain/value-objects/**/*.ts': {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
        'src/modules/customers/domain/**/*.ts': {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
        'src/modules/vehicles/domain/value-objects/**/*.ts': {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
        // Section 8 names this path for one concern - the role escalation rule, not every
        // authorization command - and that rule lives entirely in this one handler
        // (AssignRoleToUserHandler.ensureAssignable). The rest of application/** (role CRUD,
        // access queries) is proven at the e2e layer instead, per the plan's own testing
        // strategy table, and would need many new unit tests to clear 80 on its own.
        'src/modules/authorization/application/commands/assign-role-to-user/**/*.ts': {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
        'src/shared/domain/value-objects/money.ts': {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
        // The use case layer of every module that owns a critical path. Added once the query
        // handlers each got a test of their own: before that, the untested ones held customers,
        // vehicles and users below 80 while every command handler was already covered.
        'src/modules/work-orders/application/**/*.ts': {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
        'src/modules/inventory/application/**/*.ts': {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
        'src/modules/customers/application/**/*.ts': {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
        'src/modules/vehicles/application/**/*.ts': {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
        'src/modules/users/application/**/*.ts': {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
        'src/modules/services/application/**/*.ts': {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
      },
    },
  },
  plugins: [swcPlugin()],
});
