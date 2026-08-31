import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateServicesTable1787702400004 implements MigrationInterface {
  name = 'CreateServicesTable1787702400004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // No deleted_at column: deactivation here is a status flip, not a soft delete, and the
    // uniqueness filter is WHERE status = 'ACTIVE' (implementation-plan.md phase 6). Deliberately
    // different from users, customers and vehicles.
    await queryRunner.query(`
      CREATE TABLE services (
        id bigserial PRIMARY KEY,
        external_id uuid NOT NULL,
        name varchar(120) NOT NULL,
        description varchar(255),
        price_cents bigint NOT NULL,
        estimated_duration_minutes integer NOT NULL,
        status varchar(20) NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        CONSTRAINT chk_services_price_cents CHECK (price_cents >= 0),
        CONSTRAINT chk_services_duration CHECK (estimated_duration_minutes > 0),
        CONSTRAINT chk_services_status CHECK (status IN ('ACTIVE', 'INACTIVE')),
        CONSTRAINT ux_services_external_id UNIQUE (external_id)
      )
    `);
    // Keyed on lower(name), not name: two active services may not differ only by case
    // (spec.md's Assumptions). The repository's own pre-check uses lower() for the same reason -
    // if only one side did, the two layers would disagree.
    await queryRunner.query(
      `CREATE UNIQUE INDEX ux_services_active_name ON services (lower(name)) WHERE status = 'ACTIVE'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS services`);
  }
}
