import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../support/app';
import { api, login, registerAndLogin, registerUser } from '../support/http';

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

describe('Change password', () => {
  it('should change the password, revoke the current session, and allow login with the new password', async () => {
    const client = await registerAndLogin(app);

    await api(app)
      .post('/api/v1/users/me/password')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .send({ currentPassword: client.password, newPassword: 'NewStrongerPassword2' })
      .expect(204);

    await api(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(401);

    await api(app)
      .post('/api/v1/auth/sessions')
      .send({ email: client.email, password: 'NewStrongerPassword2' })
      .expect(201);
  });

  it('should revoke every other active session of the user, not only the one that changed it', async () => {
    const credentials = await registerUser(app);
    const firstSession = await login(app, credentials);
    const secondSession = await login(app, credentials);

    await api(app)
      .post('/api/v1/users/me/password')
      .set('Authorization', `Bearer ${firstSession.accessToken}`)
      .send({ currentPassword: credentials.password, newPassword: 'NewStrongerPassword2' })
      .expect(204);

    await api(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${secondSession.accessToken}`)
      .expect(401);
  });

  it('should reject a wrong current password', async () => {
    const client = await registerAndLogin(app);

    const response = await api(app)
      .post('/api/v1/users/me/password')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .send({ currentPassword: 'WrongPassword1', newPassword: 'NewStrongerPassword2' })
      .expect(401);

    expect(response.body).toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
  });

  it('should reject a weak new password', async () => {
    const client = await registerAndLogin(app);

    const response = await api(app)
      .post('/api/v1/users/me/password')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .send({ currentPassword: client.password, newPassword: 'short' })
      .expect(400);

    expect(response.body).toMatchObject({ code: 'USER_WEAK_PASSWORD' });
  });
});
