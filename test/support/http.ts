import { INestApplication } from '@nestjs/common';
import { faker } from '@faker-js/faker';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { uniqueValidCpf } from './factories/document.factory';

export interface RegisteredCredentials {
  userId: string;
  email: string;
  password: string;
  document: string;
}

export interface AuthenticatedClient extends RegisteredCredentials {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

export function api(app: INestApplication): request.Agent {
  return request(app.getHttpServer() as Parameters<typeof request>[0]);
}

export async function registerUser(app: INestApplication): Promise<RegisteredCredentials> {
  // A random prefix, not faker's email alone: faker.internet.email() draws from a bounded pool
  // of names, and the test database is never truncated, so it collides across many e2e runs
  // (STATE.md Conventions) - the same reasoning uniqueValidCpf already documents for the CPF.
  const email = `${Math.random().toString(36).slice(2)}.${faker.internet.email().toLowerCase()}`;
  const password = 'Str0ngPassword';
  const document = uniqueValidCpf();
  const response = await api(app)
    .post('/api/v1/users')
    .send({ email, name: faker.person.fullName(), password, document })
    .expect(201);
  return { userId: (response.body as { id: string }).id, email, password, document };
}

export async function login(
  app: INestApplication,
  credentials: RegisteredCredentials,
): Promise<AuthenticatedClient> {
  const response = await api(app)
    .post('/api/v1/auth/sessions')
    .send({ email: credentials.email, password: credentials.password })
    .expect(201);
  const body = response.body as {
    accessToken: string;
    refreshToken: string;
    sessionId: string;
  };
  return { ...credentials, ...body };
}

export async function registerAndLogin(app: INestApplication): Promise<AuthenticatedClient> {
  return login(app, await registerUser(app));
}

export interface StaffCreatedAccount {
  userId: string;
  email: string;
  document: string;
  temporaryPassword: string;
}

// Exercises POST /users/staff (T18, IDENT-07 AC1). The actor token must carry users:manage.
export async function createStaffAccount(
  app: INestApplication,
  actorToken: string,
): Promise<StaffCreatedAccount> {
  const email = `${Math.random().toString(36).slice(2)}.${faker.internet.email().toLowerCase()}`;
  const document = uniqueValidCpf();
  const response = await api(app)
    .post('/api/v1/users/staff')
    .set('Authorization', `Bearer ${actorToken}`)
    .send({ email, name: faker.person.fullName(), document })
    .expect(201);
  const body = response.body as { id: string; temporaryPassword: string };
  return { userId: body.id, email, document, temporaryPassword: body.temporaryPassword };
}

// Inserts the assignment directly, bypassing both HTTP and AssignRoleToUserCommand. T13's
// escalation rule refuses ADMIN through that command unless the actor already holds SUPER_ADMIN,
// and refuses SUPER_ADMIN unconditionally (AD-006: only the seed script or a direct database
// insert may create one) - building a privileged actor for test fixtures needs the same direct
// insert AD-006 itself prescribes, since going through the command would just trip the rule the
// fixture exists to test around.
export async function grantRole(
  app: INestApplication,
  userId: string,
  role: string,
): Promise<void> {
  const dataSource = app.get(DataSource);
  await dataSource.query(
    `INSERT INTO user_roles (user_id, role_id, created_at)
       SELECT u.id, r.id, now()
         FROM users u
        CROSS JOIN roles r
        WHERE u.external_id = $1 AND r.name = $2
       ON CONFLICT DO NOTHING`,
    [userId, role],
  );
}

/** Registration always assigns CUSTOMER (RegisterUserHandler), so a fresh account always carries
 * work-orders:read-own - a test proving a 403 without that permission has to revoke it first. */
export async function revokeRole(
  app: INestApplication,
  userId: string,
  role: string,
): Promise<void> {
  const dataSource = app.get(DataSource);
  await dataSource.query(
    `DELETE FROM user_roles
      WHERE user_id = (SELECT id FROM users WHERE external_id = $1)
        AND role_id = (SELECT id FROM roles WHERE name = $2)`,
    [userId, role],
  );
}

// Sets the flag directly, bypassing HTTP. POST /users/staff (T18) now creates a pending-password
// account through the real endpoint - prefer createStaffAccount() for a test that exercises the
// flow itself. This helper stays for tests that only need the flag set on an otherwise-plain
// account, without paying for a second registration.
export async function markPendingPassword(app: INestApplication, userId: string): Promise<void> {
  const dataSource = app.get(DataSource);
  await dataSource.query(`UPDATE users SET must_change_password = true WHERE external_id = $1`, [
    userId,
  ]);
}
