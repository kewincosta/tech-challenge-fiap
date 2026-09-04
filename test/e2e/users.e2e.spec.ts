import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../support/app';
import { uniqueValidCpf } from '../support/factories/document.factory';
import {
  api,
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

describe('User administration', () => {
  it('should let an admin update another user account', async () => {
    const target = await registerUser(app);
    const newDocument = uniqueValidCpf();

    const response = await api(app)
      .patch(`/api/v1/users/${target.userId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'Renamed By Admin', document: newDocument })
      .expect(200);

    expect(response.body).toMatchObject({ id: target.userId, name: 'Renamed By Admin' });
    const list = await api(app)
      .get(`/api/v1/users?document=${newDocument}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(list.body).toEqual([
      expect.objectContaining({ id: target.userId, document: newDocument }),
    ]);
  });

  it('should refuse updating another user without users:manage', async () => {
    const actor = await registerAndLogin(app);
    const target = await registerUser(app);

    const response = await api(app)
      .patch(`/api/v1/users/${target.userId}`)
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .send({ name: 'Should Not Apply' })
      .expect(403);

    expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });

  it('should not update to a document already in use', async () => {
    const target = await registerUser(app);
    const other = await registerUser(app);

    const response = await api(app)
      .patch(`/api/v1/users/${target.userId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ document: other.document })
      .expect(409);

    expect(response.body).toMatchObject({ code: 'USER_DOCUMENT_ALREADY_IN_USE' });
  });

  it('should let an admin deactivate an account', async () => {
    const target = await registerUser(app);

    await api(app)
      .delete(`/api/v1/users/${target.userId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(204);

    await api(app)
      .get(`/api/v1/users/${target.userId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(404);
  });

  it("should refuse a deactivated account's session on its next request", async () => {
    const target = await registerAndLogin(app);

    await api(app)
      .delete(`/api/v1/users/${target.userId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(204);

    const response = await api(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${target.accessToken}`)
      .expect(401);

    expect(response.body).toMatchObject({ code: 'AUTH_UNAUTHORIZED' });
  });

  it('should refuse deactivating an account without users:manage', async () => {
    const actor = await registerAndLogin(app);
    const target = await registerUser(app);

    const response = await api(app)
      .delete(`/api/v1/users/${target.userId}`)
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .expect(403);

    expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });

  it('should let any authenticated user update their own data through /me with no workshop permission', async () => {
    const self = await registerAndLogin(app);

    const response = await api(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${self.accessToken}`)
      .send({ name: 'Self Updated' })
      .expect(200);

    expect(response.body).toMatchObject({ id: self.userId, name: 'Self Updated' });
  });

  it('should refuse /me without an access token', async () => {
    const response = await api(app).patch('/api/v1/users/me').send({ name: 'Nobody' }).expect(401);

    expect(response.body).toMatchObject({ code: 'AUTH_UNAUTHORIZED' });
  });

  it('should list active users filtered by role', async () => {
    const mechanic = await registerUser(app);
    await grantRole(app, mechanic.userId, 'MECHANIC');

    const response = await api(app)
      .get('/api/v1/users?role=MECHANIC')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);

    const ids = (response.body as Array<{ id: string }>).map((row) => row.id);
    expect(ids).toContain(mechanic.userId);
  });

  it('should list active users filtered by document', async () => {
    const target = await registerUser(app);

    const response = await api(app)
      .get(`/api/v1/users?document=${target.document}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({ id: target.userId, document: target.document }),
    ]);
  });

  it('should refuse listing users without users:read', async () => {
    const actor = await registerAndLogin(app);

    const response = await api(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .expect(403);

    expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });
});
