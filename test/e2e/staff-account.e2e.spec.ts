import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../support/app';
import { uniqueValidCpf } from '../support/factories/document.factory';
import {
  api,
  createStaffAccount,
  grantRole,
  login,
  registerAndLogin,
  registerUser,
  type AuthenticatedClient,
} from '../support/http';

let app: INestApplication;
let close: () => Promise<void>;
let admin: AuthenticatedClient;

beforeAll(async () => {
  const testApp = await createTestApp();
  app = testApp.app;
  close = testApp.close;

  const adminCredentials = await registerUser(app);
  await grantRole(app, adminCredentials.userId, 'ADMIN');
  admin = await login(app, adminCredentials);
});

afterAll(async () => {
  await close();
});

describe('Staff account creation', () => {
  // spec.md's own Independent Test for IDENT-07: create an account, log in with the returned
  // password, be refused on any other route, change the password, then succeed.
  it('should create an account with a generated password, gate it until the password changes, then let it through', async () => {
    const created = await createStaffAccount(app, admin.accessToken);
    expect(created.temporaryPassword).toHaveLength(12);

    const pendingClient = await login(app, {
      userId: created.userId,
      email: created.email,
      password: created.temporaryPassword,
      document: created.document,
    });

    const refused = await api(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${pendingClient.accessToken}`)
      .expect(403);
    expect(refused.body).toMatchObject({ code: 'AUTH_PASSWORD_CHANGE_REQUIRED' });

    await api(app)
      .post('/api/v1/users/me/password')
      .set('Authorization', `Bearer ${pendingClient.accessToken}`)
      .send({ currentPassword: created.temporaryPassword, newPassword: 'NewStrongerPassword2' })
      .expect(204);

    const activeClient = await login(app, {
      userId: created.userId,
      email: created.email,
      password: 'NewStrongerPassword2',
      document: created.document,
    });

    const me = await api(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${activeClient.accessToken}`)
      .expect(200);
    expect(me.body).toMatchObject({ id: created.userId, mustChangePassword: false });
  });

  it('should refuse creating a staff account without users:manage', async () => {
    const actor = await registerAndLogin(app);

    const response = await api(app)
      .post('/api/v1/users/staff')
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .send({ email: 'someone@example.com', name: 'Someone', document: uniqueValidCpf() })
      .expect(403);

    expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });

  it('should refuse a staff account creation with a document already in use', async () => {
    const existing = await registerUser(app);

    const response = await api(app)
      .post('/api/v1/users/staff')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ email: 'another@example.com', name: 'Another Person', document: existing.document })
      .expect(409);

    expect(response.body).toMatchObject({ code: 'USER_DOCUMENT_ALREADY_IN_USE' });
  });
});
