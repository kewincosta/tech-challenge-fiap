import { INestApplication } from '@nestjs/common';
import { faker } from '@faker-js/faker';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../support/app';
import { api, login, registerAndLogin, registerUser } from '../support/http';

let app: INestApplication;
let dataSource: DataSource;
let close: () => Promise<void>;

beforeAll(async () => {
  const testApp = await createTestApp();
  app = testApp.app;
  dataSource = testApp.dataSource;
  close = testApp.close;
});

afterAll(async () => {
  await close();
});

describe('Authentication', () => {
  it('should register a user and return its id', async () => {
    const response = await api(app)
      .post('/api/v1/users')
      .send({
        email: faker.internet.email().toLowerCase(),
        name: 'Jane Doe',
        password: 'Str0ngPassword',
      })
      .expect(201);

    expect(response.body).toEqual({ id: expect.any(String) as string });
  });

  it('should not register a user with an existing email', async () => {
    const credentials = await registerUser(app);

    const response = await api(app)
      .post('/api/v1/users')
      .send({ email: credentials.email, name: 'Other', password: 'Str0ngPassword' })
      .expect(409);

    expect(response.body).toMatchObject({ code: 'USER_EMAIL_ALREADY_IN_USE' });
  });

  it('should not register a user with a weak password', async () => {
    const response = await api(app)
      .post('/api/v1/users')
      .send({
        email: faker.internet.email().toLowerCase(),
        name: 'Jane Doe',
        password: 'short',
      })
      .expect(400);

    expect(response.body).toMatchObject({ code: 'USER_WEAK_PASSWORD' });
  });

  it('should not store the password in plain text', async () => {
    const credentials = await registerUser(app);

    const rows: Array<{ password_hash: string }> = await dataSource.query(
      `SELECT password_hash FROM users WHERE email = $1`,
      [credentials.email],
    );

    expect(rows[0].password_hash).not.toContain(credentials.password);
    expect(rows[0].password_hash.startsWith('$argon2id$')).toBe(true);
  });

  it('should login and return an access and refresh token pair', async () => {
    const credentials = await registerUser(app);

    const response = await api(app)
      .post('/api/v1/auth/sessions')
      .send({ email: credentials.email, password: credentials.password })
      .expect(201);

    expect(response.body).toMatchObject({
      tokenType: 'Bearer',
      expiresInSeconds: 900,
      accessToken: expect.any(String) as string,
      refreshToken: expect.any(String) as string,
      sessionId: expect.any(String) as string,
    });
  });

  it('should reject invalid credentials with a generic error', async () => {
    const credentials = await registerUser(app);

    const wrongPassword = await api(app)
      .post('/api/v1/auth/sessions')
      .send({ email: credentials.email, password: 'WrongPassword1' })
      .expect(401);
    const unknownEmail = await api(app)
      .post('/api/v1/auth/sessions')
      .send({ email: `unknown-${faker.string.uuid()}@example.com`, password: 'Str0ngPassword' })
      .expect(401);

    const wrongPasswordBody = wrongPassword.body as { code: string; message: string };
    const unknownEmailBody = unknownEmail.body as { code: string; message: string };
    expect(wrongPasswordBody).toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
    expect(unknownEmailBody.code).toBe(wrongPasswordBody.code);
    expect(unknownEmailBody.message).toBe(wrongPasswordBody.message);
  });

  it('should not store the refresh token in plain text', async () => {
    const client = await registerAndLogin(app);

    const rows: Array<{ token_hash: string }> = await dataSource.query(
      `SELECT token_hash FROM refresh_tokens WHERE session_id = $1`,
      [client.sessionId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toBe(client.refreshToken);
    expect(rows[0].token_hash).toHaveLength(64);
  });

  it('should return the current user with its effective roles and permissions', async () => {
    const client = await registerAndLogin(app);

    const response = await api(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      id: client.userId,
      email: client.email,
      status: 'ACTIVE',
      roles: ['CUSTOMER'],
      permissions: [],
    });
  });

  it('should not return the current user without an access token', async () => {
    const response = await api(app).get('/api/v1/users/me').expect(401);

    expect(response.body).toMatchObject({ code: 'AUTH_UNAUTHORIZED' });
  });

  it('should refresh a session and rotate the refresh token', async () => {
    const client = await registerAndLogin(app);

    const response = await api(app)
      .post('/api/v1/auth/tokens')
      .send({ refreshToken: client.refreshToken })
      .expect(201);

    const body = response.body as {
      refreshToken: string;
      sessionId: string;
      accessToken: string;
    };
    expect(body.refreshToken).not.toBe(client.refreshToken);
    expect(body.sessionId).toBe(client.sessionId);
    await api(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200);
  });

  it('should not refresh with an unknown refresh token', async () => {
    const response = await api(app)
      .post('/api/v1/auth/tokens')
      .send({ refreshToken: faker.string.uuid() })
      .expect(401);

    expect(response.body).toMatchObject({ code: 'AUTH_INVALID_REFRESH_TOKEN' });
  });

  it('should revoke the whole session when a rotated refresh token is reused', async () => {
    const client = await registerAndLogin(app);
    const rotated = await api(app)
      .post('/api/v1/auth/tokens')
      .send({ refreshToken: client.refreshToken })
      .expect(201);
    const rotatedBody = rotated.body as { refreshToken: string };

    await api(app)
      .post('/api/v1/auth/tokens')
      .send({ refreshToken: client.refreshToken })
      .expect(401);

    await api(app)
      .post('/api/v1/auth/tokens')
      .send({ refreshToken: rotatedBody.refreshToken })
      .expect(401);
    const sessions: Array<{ status: string }> = await dataSource.query(
      `SELECT status FROM sessions WHERE id = $1`,
      [client.sessionId],
    );
    expect(sessions[0].status).toBe('REVOKED');
  });

  it('should logout and immediately reject the access token', async () => {
    const client = await registerAndLogin(app);

    await api(app)
      .delete('/api/v1/auth/sessions/current')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(204);

    await api(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(401);
    await api(app)
      .post('/api/v1/auth/tokens')
      .send({ refreshToken: client.refreshToken })
      .expect(401);
  });

  it('should logout all sessions of the user', async () => {
    const credentials = await registerUser(app);
    const first = await login(app, credentials);
    const second = await login(app, credentials);

    const response = await api(app)
      .delete('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${second.accessToken}`)
      .expect(200);

    expect(response.body).toEqual({ revokedSessions: 2 });
    await api(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(401);
    await api(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${second.accessToken}`)
      .expect(401);
  });

  it('should list the active sessions marking the current one', async () => {
    const credentials = await registerUser(app);
    await login(app, credentials);
    const current = await login(app, credentials);

    const response = await api(app)
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${current.accessToken}`)
      .expect(200);

    expect(response.body).toHaveLength(2);
    const currentEntries = (response.body as Array<{ id: string; current: boolean }>).filter(
      (session) => session.current,
    );
    expect(currentEntries).toHaveLength(1);
    expect(currentEntries[0].id).toBe(current.sessionId);
  });

  it('should not revoke a session owned by another user', async () => {
    const owner = await registerAndLogin(app);
    const attacker = await registerAndLogin(app);

    const response = await api(app)
      .delete(`/api/v1/auth/sessions/${owner.sessionId}`)
      .set('Authorization', `Bearer ${attacker.accessToken}`)
      .expect(404);

    expect(response.body).toMatchObject({ code: 'SESSION_NOT_FOUND' });
    await api(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
  });

  it('should reject unknown properties in the request body', async () => {
    const response = await api(app)
      .post('/api/v1/users')
      .send({
        email: faker.internet.email().toLowerCase(),
        name: 'Jane Doe',
        password: 'Str0ngPassword',
        isAdmin: true,
      })
      .expect(400);

    expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
