import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVehiclesTable1787702400003 implements MigrationInterface {
  name = 'CreateVehiclesTable1787702400003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE vehicles (
        id bigserial PRIMARY KEY,
        external_id uuid NOT NULL,
        customer_id bigint NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
        plate varchar(7) NOT NULL,
        brand varchar(60) NOT NULL,
        model varchar(60) NOT NULL,
        year smallint NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        deleted_at timestamptz,
        CONSTRAINT ux_vehicles_external_id UNIQUE (external_id)
      )
    `);
    // Partial, not plain: a removed vehicle's plate must be reusable by a later registration
    // (spec.md's own Edge Case), unlike customers.user_id in T4.
    await queryRunner.query(
      `CREATE UNIQUE INDEX ux_vehicles_plate ON vehicles (plate) WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(`CREATE INDEX ix_vehicles_customer_id ON vehicles (customer_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS vehicles`);
  }
}
