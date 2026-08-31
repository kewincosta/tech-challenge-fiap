import { INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { faker } from '@faker-js/faker';
import request from 'supertest';
import { AssignRoleToUserCommand } from '../../src/modules/authorization/application/commands/assign-role-to-user/assign-role-to-user.command';
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
  const email = faker.internet.email().toLowerCase();
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

// Dispatches the assignment straight through the real CommandBus, bypassing HTTP - there is no
// role-granting endpoint an e2e test can call at this stage of the batch (T13 is what refuses
// this at the API boundary; until then nothing stops a direct dispatch), and building an admin
// actor is fixture setup, not the behaviour under test.
export async function grantRole(
  app: INestApplication,
  userId: string,
  role: string,
): Promise<void> {
  const commandBus = app.get(CommandBus);
  await commandBus.execute(new AssignRoleToUserCommand(userId, { name: role }));
}
