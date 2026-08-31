import { randomUUID } from 'node:crypto';

// A catalog name unique per call: the test database is never truncated (STATE.md Conventions), so
// a fixed literal collides with leftover rows from an earlier run - the bug
// customer-and-vehicle-registry hit with license plates.
export function uniqueServiceName(prefix = 'Servico'): string {
  return `${prefix} ${randomUUID()}`;
}
