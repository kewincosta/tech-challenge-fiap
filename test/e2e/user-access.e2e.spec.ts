import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../support/app';
import { api, grantRole, login, registerUser, type AuthenticatedClient } from '../support/http';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface UserAccessBody {
  roles: Array<{ id: string; name: string }>;
}

let app: INestApplication;
let dataSource: DataSource;
let close: () => Promise<void>;
// ADMIN holds permissions:read, user-access:read and user-access:manage. MECHANIC holds none of the
// three, so every 403 below is refused for the permission its route requires.
let admin: AuthenticatedClient;
let mechanic: AuthenticatedClient;

async function loginAs(role: string): Promise<AuthenticatedClient> {
  const credentials = await registerUser(app);
  await grantRole(app, credentials.userId, role);
  return login(app, credentials);
}

async function roleExternalIdFor(name: string): Promise<string> {
  const rows: Array<{ external_id: string }> = await dataSource.query(
    `SELECT external_id FROM roles WHERE name = $1`,
    [name],
  );
  return rows[0].external_id;
}

async function getAccess(userId: string): Promise<UserAccessBody> {
  const response = await api(app)
    .get(`/api/v1/users/${userId}/access`)
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .expect(200);
  return response.body as UserAccessBody;
}

beforeAll(async () => {
  const testApp = await createTestApp();
  app = testApp.app;
  dataSource = testApp.dataSource;
  close = testApp.close;
  admin = await loginAs('ADMIN');
  mechanic = await loginAs('MECHANIC');
});

afterAll(async () => {
  await close();
});

describe('Permission catalog', () => {
  it('should list the permission catalog with the id, code and description of each permission', async () => {
    const response = await api(app)
      .get('/api/v1/permissions')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);

    const permissions = response.body as Array<Record<string, unknown>>;
    expect(permissions.length).toBeGreaterThan(0);
    for (const permission of permissions) {
      expect(Object.keys(permission).sort()).toEqual(['code', 'description', 'id']);
    }
    expect(permissions).toContainEqual({
      id: expect.stringMatching(UUID_PATTERN) as string,
      code: 'roles:manage',
      description: 'Create, update and delete roles',
    });
    expect(permissions).toContainEqual({
      id: expect.stringMatching(UUID_PATTERN) as string,
      code: 'users:read',
      description: 'Read any user account',
    });
  });

  it('should refuse listing the permission catalog without permissions:read', async () => {
    const response = await api(app)
      .get('/api/v1/permissions')
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .expect(403);

    expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });
});

describe('User access', () => {
  it('should list the roles assigned to a user, each with its id and name', async () => {
    const target = await registerUser(app);
    const customerRoleId = await roleExternalIdFor('CUSTOMER');
    const mechanicRoleId = await roleExternalIdFor('MECHANIC');

    // Registration assigns CUSTOMER and nothing else.
    expect(await getAccess(target.userId)).toEqual({
      roles: [{ id: customerRoleId, name: 'CUSTOMER' }],
    });

    await grantRole(app, target.userId, 'MECHANIC');

    const { roles } = await getAccess(target.userId);
    expect(roles).toHaveLength(2);
    expect(roles).toEqual(
      expect.arrayContaining([
        { id: customerRoleId, name: 'CUSTOMER' },
        { id: mechanicRoleId, name: 'MECHANIC' },
      ]),
    );
  });

  it('should answer 404 USER_NOT_FOUND for the access of a user that does not exist', async () => {
    const response = await api(app)
      .get(`/api/v1/users/${randomUUID()}/access`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(404);

    expect(response.body).toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('should refuse reading the access of a user without user-access:read', async () => {
    const target = await registerUser(app);

    const response = await api(app)
      .get(`/api/v1/users/${target.userId}/access`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .expect(403);

    expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });
});

describe('Role revocation', () => {
  it('should revoke a role from a user, answering 204 and leaving the other roles', async () => {
    const target = await registerUser(app);
    await grantRole(app, target.userId, 'MECHANIC');
    const customerRoleId = await roleExternalIdFor('CUSTOMER');
    const mechanicRoleId = await roleExternalIdFor('MECHANIC');

    await api(app)
      .delete(`/api/v1/users/${target.userId}/roles/${mechanicRoleId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(204);

    expect(await getAccess(target.userId)).toEqual({
      roles: [{ id: customerRoleId, name: 'CUSTOMER' }],
    });
  });

  it('should take the revoked role permissions away on the next request of that user', async () => {
    const target = await registerUser(app);
    await grantRole(app, target.userId, 'MECHANIC');
    const mechanicRoleId = await roleExternalIdFor('MECHANIC');
    const client = await login(app, target);
    // MECHANIC carries inventory:read. This request also fills the access cache of the user.
    await api(app)
      .get('/api/v1/inventory-items')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(200);

    await api(app)
      .delete(`/api/v1/users/${target.userId}/roles/${mechanicRoleId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(204);

    const response = await api(app)
      .get('/api/v1/inventory-items')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(403);
    expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });

  it('should refuse revoking a role without user-access:manage', async () => {
    const target = await registerUser(app);
    const customerRoleId = await roleExternalIdFor('CUSTOMER');

    const response = await api(app)
      .delete(`/api/v1/users/${target.userId}/roles/${customerRoleId}`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .expect(403);

    expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });

  it('should answer 404 for a user that does not exist', async () => {
    const customerRoleId = await roleExternalIdFor('CUSTOMER');

    const response = await api(app)
      .delete(`/api/v1/users/${randomUUID()}/roles/${customerRoleId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(404);

    expect(response.body).toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  });

  it('should answer 404 for a role that does not exist', async () => {
    const target = await registerUser(app);

    const response = await api(app)
      .delete(`/api/v1/users/${target.userId}/roles/${randomUUID()}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(404);

    expect(response.body).toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  });
});
