import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIdentityAndAccessSchema1787702400000 implements MigrationInterface {
  name = 'CreateIdentityAndAccessSchema1787702400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id bigserial PRIMARY KEY,
        external_id uuid NOT NULL,
        email varchar(320) NOT NULL,
        password_hash text NOT NULL,
        name varchar(120) NOT NULL,
        document varchar(14) NOT NULL,
        must_change_password boolean NOT NULL DEFAULT false,
        status varchar(20) NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        deleted_at timestamptz,
        CONSTRAINT chk_users_status CHECK (status IN ('ACTIVE', 'INACTIVE')),
        CONSTRAINT ux_users_external_id UNIQUE (external_id)
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX ux_users_email ON users (email) WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX ux_users_document ON users (document) WHERE deleted_at IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE roles (
        id bigserial PRIMARY KEY,
        external_id uuid NOT NULL,
        name varchar(50) NOT NULL,
        description varchar(255),
        is_system boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        CONSTRAINT ux_roles_name UNIQUE (name),
        CONSTRAINT ux_roles_external_id UNIQUE (external_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE permissions (
        id bigserial PRIMARY KEY,
        external_id uuid NOT NULL,
        code varchar(100) NOT NULL,
        description varchar(255),
        created_at timestamptz NOT NULL,
        CONSTRAINT ux_permissions_code UNIQUE (code),
        CONSTRAINT ux_permissions_external_id UNIQUE (external_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE user_roles (
        user_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        role_id bigint NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL,
        PRIMARY KEY (user_id, role_id)
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_user_roles_role_id ON user_roles (role_id)`);

    await queryRunner.query(`
      CREATE TABLE role_permissions (
        role_id bigint NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
        permission_id bigint NOT NULL REFERENCES permissions (id) ON DELETE CASCADE,
        PRIMARY KEY (role_id, permission_id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX ix_role_permissions_permission_id ON role_permissions (permission_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE sessions (
        id bigserial PRIMARY KEY,
        external_id uuid NOT NULL,
        user_id bigint NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
        status varchar(20) NOT NULL,
        ip varchar(64),
        user_agent varchar(512),
        created_at timestamptz NOT NULL,
        last_used_at timestamptz NOT NULL,
        absolute_expires_at timestamptz NOT NULL,
        revoked_at timestamptz,
        revocation_reason varchar(40),
        CONSTRAINT chk_sessions_status CHECK (status IN ('ACTIVE', 'REVOKED')),
        CONSTRAINT ux_sessions_external_id UNIQUE (external_id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX ix_sessions_user_id_status ON sessions (user_id, status)`,
    );

    await queryRunner.query(`
      CREATE TABLE refresh_tokens (
        id bigserial PRIMARY KEY,
        external_id uuid NOT NULL,
        session_id bigint NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
        token_hash varchar(128) NOT NULL,
        status varchar(20) NOT NULL,
        created_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL,
        rotated_at timestamptz,
        replaced_by_id bigint,
        CONSTRAINT fk_refresh_tokens_replaced_by FOREIGN KEY (replaced_by_id)
          REFERENCES refresh_tokens (id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT chk_refresh_tokens_status CHECK (status IN ('ACTIVE', 'ROTATED', 'REVOKED')),
        CONSTRAINT ux_refresh_tokens_external_id UNIQUE (external_id)
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX ux_refresh_tokens_token_hash ON refresh_tokens (token_hash)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX ux_refresh_tokens_active_per_session
         ON refresh_tokens (session_id) WHERE status = 'ACTIVE'`,
    );
    await queryRunner.query(
      `CREATE INDEX ix_refresh_tokens_session_id ON refresh_tokens (session_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS refresh_tokens`);
    await queryRunner.query(`DROP TABLE IF EXISTS sessions`);
    await queryRunner.query(`DROP TABLE IF EXISTS role_permissions`);
    await queryRunner.query(`DROP TABLE IF EXISTS user_roles`);
    await queryRunner.query(`DROP TABLE IF EXISTS permissions`);
    await queryRunner.query(`DROP TABLE IF EXISTS roles`);
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
  }
}
