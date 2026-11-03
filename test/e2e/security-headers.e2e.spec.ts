import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../support/app';
import { api } from '../support/http';

let testApp: TestApp;

beforeAll(async () => {
  testApp = await createTestApp();
});

afterAll(async () => {
  await testApp.close();
});

describe('Security headers', () => {
  it('keeps the content security policy and lets a page served over HTTP load its own assets', async () => {
    const response = await api(testApp.app).get('/health/live').expect(200);
    const policy = String(response.headers['content-security-policy']);
    const directives = policy.split(';').map((directive) => directive.trim().split(/\s+/)[0]);

    // The rest of Helmet's default policy stays, so only the upgrade to HTTPS goes away.
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(directives).not.toContain('upgrade-insecure-requests');
  });
});
