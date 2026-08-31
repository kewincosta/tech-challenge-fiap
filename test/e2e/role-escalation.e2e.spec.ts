import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { createTestApp } from '../support/app';
import { api, grantRole, login, registerUser } from '../support/http';

let app: INestApplication;
let dataSource: DataSource;
let close: () => Promise<void>;

async function roleExternalIdFor(name: string): Promise<string> {
  const rows: Array<{ external_id: string }> = await dataSource.query(
    `SELECT external_id FROM roles WHERE name = $1`,
    [name],
  );
  return rows[0].external_id;
}

beforeAll(async () => {
  const testApp = await createTestApp();
  app = testApp.app;
  dataSource = testApp.dataSource;
  close = testApp.close;
});

afterAll(async () => {
  await close();
});

describe('Role escalation', () => {
  it('should refuse assigning SUPER_ADMIN through the API, even from an administrator', async () => {
    const adminCredentials = await registerUser(app);
    await grantRole(app, adminCredentials.userId, 'ADMIN');
    const admin = await login(app, adminCredentials);
    const target = await registerUser(app);
    const superAdminRoleId = await roleExternalIdFor('SUPER_ADMIN');

    const response = await api(app)
      .put(`/api/v1/users/${target.userId}/roles/${superAdminRoleId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(403);

    expect(response.body).toMatchObject({ code: 'AUTHZ_ROLE_NOT_ASSIGNABLE' });
  });

  it('should refuse an administrator assigning ADMIN', async () => {
    const adminCredentials = await registerUser(app);
    await grantRole(app, adminCredentials.userId, 'ADMIN');
    const admin = await login(app, adminCredentials);
    const target = await registerUser(app);
    const adminRoleId = await roleExternalIdFor('ADMIN');

    const response = await api(app)
      .put(`/api/v1/users/${target.userId}/roles/${adminRoleId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(403);

    expect(response.body).toMatchObject({ code: 'AUTHZ_ROLE_ESCALATION_FORBIDDEN' });
  });

  it('should let a super administrator assign ADMIN', async () => {
    const superAdminCredentials = await registerUser(app);
    // SUPER_ADMIN's own grant list (the seed migration) already includes user-access:manage, the
    // permission this route requires, so no second role is needed for the fixture.
    await grantRole(app, superAdminCredentials.userId, 'SUPER_ADMIN');
    const superAdmin = await login(app, superAdminCredentials);
    const target = await registerUser(app);
    const adminRoleId = await roleExternalIdFor('ADMIN');

    await api(app)
      .put(`/api/v1/users/${target.userId}/roles/${adminRoleId}`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .expect(204);

    const roles: Array<{ name: string }> = await dataSource.query(
      `SELECT r.name FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         JOIN users u ON u.id = ur.user_id
        WHERE u.external_id = $1`,
      [target.userId],
    );
    expect(roles.map((row) => row.name)).toContain('ADMIN');
  });

  it('should let an administrator assign a non-escalation role through the real endpoint', async () => {
    const adminCredentials = await registerUser(app);
    await grantRole(app, adminCredentials.userId, 'ADMIN');
    const admin = await login(app, adminCredentials);
    const target = await registerUser(app);
    const mechanicRoleId = await roleExternalIdFor('MECHANIC');

    await api(app)
      .put(`/api/v1/users/${target.userId}/roles/${mechanicRoleId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(204);

    const mechanic = await login(app, target);
    const me = await api(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .expect(200);

    expect((me.body as { roles: string[] }).roles).toContain('MECHANIC');
  });
});
