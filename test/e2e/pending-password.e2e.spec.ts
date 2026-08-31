import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../support/app';
import { api, login, markPendingPassword, registerUser } from '../support/http';

let app: INestApplication;
let close: () => Promise<void>;

beforeAll(async () => {
  const testApp = await createTestApp();
  app = testApp.app;
  close = testApp.close;
});

afterAll(async () => {
  await close();
});

describe('Pending password', () => {
  it('should refuse a protected route while a password change is pending', async () => {
    const credentials = await registerUser(app);
    await markPendingPassword(app, credentials.userId);
    const client = await login(app, credentials);

    const response = await api(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(403);

    expect(response.body).toMatchObject({ code: 'AUTH_PASSWORD_CHANGE_REQUIRED' });
  });

  it('should allow the password change route while pending, and clear the flag afterwards', async () => {
    const credentials = await registerUser(app);
    await markPendingPassword(app, credentials.userId);
    const pendingClient = await login(app, credentials);

    await api(app)
      .post('/api/v1/users/me/password')
      .set('Authorization', `Bearer ${pendingClient.accessToken}`)
      .send({ currentPassword: credentials.password, newPassword: 'NewStrongerPassword2' })
      .expect(204);

    const clearedClient = await login(app, { ...credentials, password: 'NewStrongerPassword2' });

    await api(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${clearedClient.accessToken}`)
      .expect(200);
  });

  it('should allow logging out while a password change is pending', async () => {
    const credentials = await registerUser(app);
    await markPendingPassword(app, credentials.userId);
    const client = await login(app, credentials);

    await api(app)
      .delete('/api/v1/auth/sessions/current')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(204);
  });
});
