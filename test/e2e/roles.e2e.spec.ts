import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../support/app';
import { api, grantRole, login, registerUser, type AuthenticatedClient } from '../support/http';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface RoleBody {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
}

let app: INestApplication;
let close: () => Promise<void>;
// SUPER_ADMIN holds roles:read and roles:manage. ADMIN holds roles:read but not roles:manage, and
// MECHANIC holds neither, so each 403 below is refused for the one permission its route requires.
let superAdmin: AuthenticatedClient;
let admin: AuthenticatedClient;
let mechanic: AuthenticatedClient;

async function loginAs(role: string): Promise<AuthenticatedClient> {
  const credentials = await registerUser(app);
  await grantRole(app, credentials.userId, role);
  return login(app, credentials);
}

beforeAll(async () => {
  const testApp = await createTestApp();
  app = testApp.app;
  close = testApp.close;
  superAdmin = await loginAs('SUPER_ADMIN');
  admin = await loginAs('ADMIN');
  mechanic = await loginAs('MECHANIC');
});

afterAll(async () => {
  await close();
});

function uniqueRoleName(): string {
  return `ROLE_${randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()}`;
}

async function createRole(): Promise<RoleBody> {
  const response = await api(app)
    .post('/api/v1/roles')
    .set('Authorization', `Bearer ${superAdmin.accessToken}`)
    .send({
      name: uniqueRoleName(),
      description: 'Created by the roles e2e spec',
      permissions: ['users:read', 'roles:read'],
    })
    .expect(201);
  return response.body as RoleBody;
}

describe('Roles', () => {
  it('should create a role, answering 201 with the stored role and its permission codes', async () => {
    const name = uniqueRoleName();

    const response = await api(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .send({
        name,
        description: 'Created by the roles e2e spec',
        permissions: ['users:read', 'roles:read'],
      })
      .expect(201);

    expect(response.body).toEqual({
      id: expect.stringMatching(UUID_PATTERN) as string,
      name,
      description: 'Created by the roles e2e spec',
      isSystem: false,
      permissions: ['roles:read', 'users:read'],
    });
  });

  it('should list the roles, the system roles and the created one', async () => {
    const created = await createRole();

    const response = await api(app)
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .expect(200);

    const roles = response.body as RoleBody[];
    expect(roles).toContainEqual(created);
    expect(roles.filter((role) => role.isSystem).map((role) => role.name)).toEqual(
      expect.arrayContaining(['SUPER_ADMIN', 'ADMIN', 'SERVICE_ADVISOR', 'MECHANIC', 'CUSTOMER']),
    );
  });

  it('should get a role by id', async () => {
    const created = await createRole();

    const response = await api(app)
      .get(`/api/v1/roles/${created.id}`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .expect(200);

    expect(response.body).toEqual(created);
  });

  it('should answer 404 ROLE_NOT_FOUND for a role id that does not exist', async () => {
    const response = await api(app)
      .get(`/api/v1/roles/${randomUUID()}`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .expect(404);

    expect(response.body).toMatchObject({ code: 'ROLE_NOT_FOUND' });
  });

  it('should update the name and the description of a role', async () => {
    const created = await createRole();
    const name = uniqueRoleName();

    const response = await api(app)
      .patch(`/api/v1/roles/${created.id}`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .send({ name, description: 'Renamed by the roles e2e spec' })
      .expect(200);

    expect(response.body).toEqual({
      ...created,
      name,
      description: 'Renamed by the roles e2e spec',
    });
  });

  it('should replace the permissions of a role', async () => {
    const created = await createRole();

    const response = await api(app)
      .put(`/api/v1/roles/${created.id}/permissions`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .send({ permissions: ['services:read', 'customers:read'] })
      .expect(200);

    expect(response.body).toEqual({ ...created, permissions: ['customers:read', 'services:read'] });
  });

  it('should delete a role, answering 204 and 404 ROLE_NOT_FOUND afterwards', async () => {
    const created = await createRole();

    await api(app)
      .delete(`/api/v1/roles/${created.id}`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .expect(204);

    const response = await api(app)
      .get(`/api/v1/roles/${created.id}`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .expect(404);
    expect(response.body).toMatchObject({ code: 'ROLE_NOT_FOUND' });
  });

  it('should refuse listing roles without roles:read', async () => {
    const response = await api(app)
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .expect(403);

    expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });

  it('should refuse creating a role without roles:manage', async () => {
    const response = await api(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: uniqueRoleName(), permissions: ['users:read'] })
      .expect(403);

    expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });

  it('should refuse getting a role without roles:read', async () => {
    const created = await createRole();

    const response = await api(app)
      .get(`/api/v1/roles/${created.id}`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .expect(403);

    expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });

  it('should refuse updating a role without roles:manage', async () => {
    const created = await createRole();

    const response = await api(app)
      .patch(`/api/v1/roles/${created.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ description: 'Should not apply' })
      .expect(403);

    expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });

  it('should refuse deleting a role without roles:manage', async () => {
    const created = await createRole();

    const response = await api(app)
      .delete(`/api/v1/roles/${created.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(403);

    expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });

  it('should refuse replacing the permissions of a role without roles:manage', async () => {
    const created = await createRole();

    const response = await api(app)
      .put(`/api/v1/roles/${created.id}/permissions`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ permissions: ['services:read'] })
      .expect(403);

    expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });
});
