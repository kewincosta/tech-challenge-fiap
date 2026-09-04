import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { createTestDataSource } from '../support/db';

const execFileAsync = promisify(execFile);

let dataSource: DataSource;

function uniqueEmail(): string {
  return `${randomUUID()}@example.com`;
}

// Builds a structurally valid CPF (correct check digits) so PersonDocument.create accepts it,
// using a fresh random base each call so the partial unique index on document never collides
// across runs - the test database is never truncated.
function uniqueValidCpf(): string {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const firstCheckDigit = computeCheckDigit(base, 10);
  const secondCheckDigit = computeCheckDigit([...base, firstCheckDigit], 11);
  return [...base, firstCheckDigit, secondCheckDigit].join('');
}

function computeCheckDigit(digits: number[], startWeight: number): number {
  const sum = digits.reduce((total, digit, index) => total + digit * (startWeight - index), 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

async function runSeedAdmin(overrides: Record<string, string>): Promise<{ exitCode: number }> {
  try {
    await execFileAsync('npm', ['run', 'seed:admin'], {
      cwd: process.cwd(),
      env: { ...process.env, ...overrides },
    });
    return { exitCode: 0 };
  } catch (error) {
    const code = (error as { code?: number }).code;
    return { exitCode: typeof code === 'number' ? code : 1 };
  }
}

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
});

afterAll(async () => {
  await dataSource.destroy();
});

describe('seed-admin script', () => {
  it('creates a SUPER_ADMIN with the validated document when given a valid one', async () => {
    const email = uniqueEmail();
    const document = uniqueValidCpf();

    const result = await runSeedAdmin({
      ADMIN_EMAIL: email,
      ADMIN_PASSWORD: 'Str0ngPassword',
      ADMIN_DOCUMENT: document,
    });

    expect(result.exitCode).toBe(0);
    const userRows: Array<{ document: string; status: string }> = await dataSource.query(
      `SELECT document, status FROM users WHERE email = $1`,
      [email],
    );
    expect(userRows).toHaveLength(1);
    expect(userRows[0].document).toBe(document);
    expect(userRows[0].status).toBe('ACTIVE');
    const roleRows: Array<{ name: string }> = await dataSource.query(
      `SELECT r.name FROM user_roles ur
           JOIN roles r ON r.id = ur.role_id
           JOIN users u ON u.id = ur.user_id
          WHERE u.email = $1`,
      [email],
    );
    expect(roleRows.map((row) => row.name)).toEqual(['SUPER_ADMIN']);
  }, 30000);

  it('refuses to run without a valid document and creates nobody', async () => {
    const email = uniqueEmail();

    const result = await runSeedAdmin({
      ADMIN_EMAIL: email,
      ADMIN_PASSWORD: 'Str0ngPassword',
      ADMIN_DOCUMENT: '',
    });

    expect(result.exitCode).not.toBe(0);
    const userRows: Array<{ id: string }> = await dataSource.query(
      `SELECT id FROM users WHERE email = $1`,
      [email],
    );
    expect(userRows).toHaveLength(0);
  }, 30000);

  it('leaves exactly one super administrator when run twice', async () => {
    const email = uniqueEmail();
    const overrides = {
      ADMIN_EMAIL: email,
      ADMIN_PASSWORD: 'Str0ngPassword',
      ADMIN_DOCUMENT: uniqueValidCpf(),
    };

    await runSeedAdmin(overrides);
    const secondResult = await runSeedAdmin(overrides);

    expect(secondResult.exitCode).toBe(0);
    const userRows: Array<{ id: string }> = await dataSource.query(
      `SELECT id FROM users WHERE email = $1`,
      [email],
    );
    expect(userRows).toHaveLength(1);
    const roleRows: Array<{ name: string }> = await dataSource.query(
      `SELECT r.name FROM user_roles ur
           JOIN roles r ON r.id = ur.role_id
           JOIN users u ON u.id = ur.user_id
          WHERE u.email = $1`,
      [email],
    );
    expect(roleRows).toHaveLength(1);
  }, 30000);
});
