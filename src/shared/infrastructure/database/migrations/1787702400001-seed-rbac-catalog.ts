import { MigrationInterface, QueryRunner } from 'typeorm';

const PERMISSION_ROWS = `
  ('users:read', 'Read any user account'),
  ('roles:read', 'List and read roles'),
  ('roles:manage', 'Create, update and delete roles'),
  ('groups:read', 'List and read groups'),
  ('groups:manage', 'Create, update and delete groups'),
  ('permissions:read', 'List the permission catalog'),
  ('user-access:read', 'Read user role and group assignments'),
  ('user-access:manage', 'Assign and revoke user roles and groups'),
  ('sessions:revoke-any', 'Revoke sessions of any user')
`;

const SYSTEM_ROLE_ROWS = `
  ('ADMIN', 'Full administrative access'),
  ('MECHANIC', 'Workshop mechanic'),
  ('SELLER', 'Workshop seller'),
  ('CUSTOMER', 'Workshop customer')
`;

export class SeedRbacCatalog1787702400001 implements MigrationInterface {
  name = 'SeedRbacCatalog1787702400001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permissions (id, code, description, created_at)
      SELECT gen_random_uuid(), seed.code, seed.description, now()
        FROM (VALUES ${PERMISSION_ROWS}) AS seed (code, description)
    `);
    await queryRunner.query(`
      INSERT INTO roles (id, name, description, is_system, created_at, updated_at)
      SELECT gen_random_uuid(), seed.name, seed.description, true, now(), now()
        FROM (VALUES ${SYSTEM_ROLE_ROWS}) AS seed (name, description)
    `);
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
        FROM roles r
       CROSS JOIN permissions p
       WHERE r.name = 'ADMIN'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM role_permissions
        WHERE role_id IN (SELECT id FROM roles WHERE name IN ('ADMIN', 'MECHANIC', 'SELLER', 'CUSTOMER'))`,
    );
    await queryRunner.query(
      `DELETE FROM roles WHERE name IN ('ADMIN', 'MECHANIC', 'SELLER', 'CUSTOMER')`,
    );
    await queryRunner.query(`DELETE FROM permissions WHERE code IN (
      'users:read', 'roles:read', 'roles:manage', 'groups:read', 'groups:manage',
      'permissions:read', 'user-access:read', 'user-access:manage', 'sessions:revoke-any'
    )`);
  }
}
