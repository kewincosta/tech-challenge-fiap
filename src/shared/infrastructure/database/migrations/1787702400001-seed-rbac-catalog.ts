import { MigrationInterface, QueryRunner } from 'typeorm';

const PERMISSION_ROWS = `
  ('users:read', 'Read any user account'),
  ('users:manage', 'Create, update and deactivate user accounts'),
  ('roles:read', 'List and read roles'),
  ('roles:manage', 'Create, update and delete roles'),
  ('groups:read', 'List and read groups'),
  ('groups:manage', 'Create, update and delete groups'),
  ('permissions:read', 'List the permission catalog'),
  ('user-access:read', 'Read user role assignments'),
  ('user-access:manage', 'Assign and revoke user roles'),
  ('sessions:revoke-any', 'Revoke sessions of any user'),
  ('customers:read', 'Read customer records'),
  ('customers:manage', 'Create, update and delete customer records'),
  ('vehicles:read', 'Read vehicle records'),
  ('vehicles:manage', 'Create, update and delete vehicle records'),
  ('services:read', 'Read the service catalog'),
  ('services:manage', 'Create, update and delete the service catalog'),
  ('inventory:read', 'Read inventory items and stock levels'),
  ('inventory:manage', 'Create, update and replenish inventory items'),
  ('work-orders:read', 'Read work orders'),
  ('work-orders:manage', 'Create and update work orders'),
  ('work-orders:execute', 'Execute work order tasks'),
  ('work-orders:decide', 'Approve or reject a work order budget'),
  ('work-orders:cancel', 'Cancel a work order before execution'),
  ('work-orders:cancel-in-execution', 'Cancel a work order already in execution'),
  ('work-orders:discount', 'Apply a discount to a work order budget'),
  ('work-orders:read-own', 'Read the caller''s own work orders'),
  ('work-orders:decide-own', 'Approve or reject the caller''s own work order budget'),
  ('audit:read', 'Read the audit and stock movement trail'),
  ('metrics:read', 'Read operational metrics')
`;

const SYSTEM_ROLE_ROWS = `
  ('SUPER_ADMIN', 'Access model owner'),
  ('ADMIN', 'Full administrative access'),
  ('SERVICE_ADVISOR', 'Workshop service advisor'),
  ('MECHANIC', 'Workshop mechanic'),
  ('CUSTOMER', 'Workshop customer')
`;

const ROLE_GRANTS: Record<string, string[]> = {
  SUPER_ADMIN: [
    'roles:manage',
    'roles:read',
    'users:manage',
    'users:read',
    'user-access:manage',
    'user-access:read',
    'permissions:read',
    'sessions:revoke-any',
    'customers:read',
    'customers:manage',
    'vehicles:read',
    'vehicles:manage',
    'services:read',
    'services:manage',
    'inventory:read',
    'inventory:manage',
    'work-orders:read',
    'work-orders:manage',
    'work-orders:execute',
    'work-orders:decide',
    'work-orders:cancel',
    'work-orders:cancel-in-execution',
    'work-orders:discount',
    'audit:read',
    'metrics:read',
  ],
  ADMIN: [
    'roles:read',
    'users:manage',
    'users:read',
    'user-access:manage',
    'user-access:read',
    'permissions:read',
    'sessions:revoke-any',
    'customers:read',
    'customers:manage',
    'vehicles:read',
    'vehicles:manage',
    'services:read',
    'services:manage',
    'inventory:read',
    'inventory:manage',
    'work-orders:read',
    'work-orders:manage',
    'work-orders:execute',
    'work-orders:decide',
    'work-orders:cancel',
    'work-orders:cancel-in-execution',
    'work-orders:discount',
    'audit:read',
    'metrics:read',
  ],
  SERVICE_ADVISOR: [
    'customers:read',
    'customers:manage',
    'vehicles:read',
    'vehicles:manage',
    'services:read',
    'inventory:read',
    'work-orders:read',
    'work-orders:manage',
    'work-orders:decide',
    'work-orders:cancel',
    'metrics:read',
  ],
  MECHANIC: [
    'customers:read',
    'vehicles:read',
    'services:read',
    'inventory:read',
    'work-orders:read',
    'work-orders:execute',
  ],
  CUSTOMER: ['work-orders:read-own', 'work-orders:decide-own'],
};

const SYSTEM_ROLE_NAMES = ['SUPER_ADMIN', 'ADMIN', 'SERVICE_ADVISOR', 'MECHANIC', 'CUSTOMER'];

export class SeedRbacCatalog1787702400001 implements MigrationInterface {
  name = 'SeedRbacCatalog1787702400001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permissions (external_id, code, description, created_at)
      SELECT gen_random_uuid(), seed.code, seed.description, now()
        FROM (VALUES ${PERMISSION_ROWS}) AS seed (code, description)
    `);
    await queryRunner.query(`
      INSERT INTO roles (external_id, name, description, is_system, created_at, updated_at)
      SELECT gen_random_uuid(), seed.name, seed.description, true, now(), now()
        FROM (VALUES ${SYSTEM_ROLE_ROWS}) AS seed (name, description)
    `);

    for (const roleName of SYSTEM_ROLE_NAMES) {
      const grantedCodes = ROLE_GRANTS[roleName];
      await queryRunner.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT r.id, p.id
           FROM roles r
           JOIN permissions p ON p.code = ANY($2::text[])
          WHERE r.name = $1`,
        [roleName, grantedCodes],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM role_permissions
        WHERE role_id IN (SELECT id FROM roles WHERE name = ANY($1::text[]))`,
      [SYSTEM_ROLE_NAMES],
    );
    await queryRunner.query(`DELETE FROM roles WHERE name = ANY($1::text[])`, [
      SYSTEM_ROLE_NAMES,
    ]);
    await queryRunner.query(`DELETE FROM permissions WHERE code IN (
      'users:read', 'users:manage', 'roles:read', 'roles:manage', 'groups:read', 'groups:manage',
      'permissions:read', 'user-access:read', 'user-access:manage', 'sessions:revoke-any',
      'customers:read', 'customers:manage', 'vehicles:read', 'vehicles:manage',
      'services:read', 'services:manage', 'inventory:read', 'inventory:manage',
      'work-orders:read', 'work-orders:manage', 'work-orders:execute', 'work-orders:decide',
      'work-orders:cancel', 'work-orders:cancel-in-execution', 'work-orders:discount',
      'work-orders:read-own', 'work-orders:decide-own', 'audit:read', 'metrics:read'
    )`);
  }
}
