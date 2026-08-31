import { INestApplication } from '@nestjs/common';
import { faker } from '@faker-js/faker';
import request from 'supertest';

export interface RegisteredCredentials {
  userId: string;
  email: string;
  password: string;
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
  const email = faker.internet.email().toLowerCase();
  const password = 'Str0ngPassword';
  const response = await api(app)
    .post('/api/v1/users')
    .send({ email, name: faker.person.fullName(), password })
    .expect(201);
  return { userId: (response.body as { id: string }).id, email, password };
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
