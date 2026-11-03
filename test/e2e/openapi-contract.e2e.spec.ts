import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '../../src/openapi';
import { createTestApp, type TestApp } from '../support/app';

// Object keys carry no meaning in an OpenAPI document: moving a module reorders `paths` and
// `components.schemas` without changing the API. Arrays keep their order, because parameter,
// required-field and enum order belong to the document.
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

function canonical(document: unknown): string {
  return JSON.stringify(sortKeys(document), null, 2);
}

let testApp: TestApp;

beforeAll(async () => {
  testApp = await createTestApp();
});

afterAll(async () => {
  await testApp.close();
});

describe('OpenAPI contract', () => {
  it('matches the document captured before the clean architecture refactor', () => {
    const baseline: unknown = JSON.parse(
      readFileSync(resolve(__dirname, '../contract/openapi.baseline.json'), 'utf8'),
    );

    expect(canonical(buildOpenApiDocument(testApp.app))).toBe(canonical(baseline));
  });
});
