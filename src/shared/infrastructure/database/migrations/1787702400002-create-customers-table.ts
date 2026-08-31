import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCustomersTable1787702400002 implements MigrationInterface {
  name = 'CreateCustomersTable1787702400002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE customers (
        id bigserial PRIMARY KEY,
        external_id uuid NOT NULL,
        user_id bigint NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
        address_street varchar(160),
        address_number varchar(20),
        address_complement varchar(60),
        address_district varchar(80),
        address_city varchar(80),
        address_state char(2),
        address_zip_code varchar(8),
        phone varchar(11),
        status varchar(20) NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        deleted_at timestamptz,
        CONSTRAINT chk_customers_status CHECK (status IN ('ACTIVE', 'INACTIVE')),
        CONSTRAINT ux_customers_external_id UNIQUE (external_id),
        -- Not filtered by deleted_at IS NULL: a user identity backs at most one customer for its
        -- whole life (event-storming.md rule 12), unlike users.email/users.document, which a
        -- deactivated record frees up for reuse. Deactivating a customer never opens a slot for
        -- a second one over the same user.
        CONSTRAINT ux_customers_user_id UNIQUE (user_id)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS customers`);
  }
}
