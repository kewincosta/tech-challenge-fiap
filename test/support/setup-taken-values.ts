import { beforeAll } from 'vitest';
import { loadTakenValues } from './load-taken-values';

// Loads the CPFs and plates of the active rows of the test database into the taken values before
// each test file of the integration and e2e suites. It runs after setup-tests.ts, which reads
// .env.test, and the unit configuration does not list it. A factory is not called while a spec is
// collected, so loading in a hook is early enough.
beforeAll(loadTakenValues);
