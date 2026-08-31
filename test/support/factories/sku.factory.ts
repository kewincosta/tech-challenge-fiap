import { randomUUID } from 'node:crypto';

// A SKU unique per call: the test database is never truncated (STATE.md Conventions), so a fixed
// literal collides with leftover rows from an earlier run - the bug customer-and-vehicle-registry
// hit with license plates.
export function uniqueSku(prefix = 'SKU'): string {
  return `${prefix}-${randomUUID()}`;
}
