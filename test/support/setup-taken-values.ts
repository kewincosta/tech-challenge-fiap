import { beforeAll } from 'vitest';
import { loadTakenValues } from './load-taken-values';

// Loads the CPFs and plates of the active rows of the test database into the taken values before
// each test file of the integration and e2e suites. It runs after setup-tests.ts, which reads
// .env.test, and the unit configuration does not list it. The hook runs once the file is collected,
// so a spec that called a factory at module level or in a describe body would draw before the
// values are in. None does: the factories are for hooks and tests.
beforeAll(loadTakenValues);
