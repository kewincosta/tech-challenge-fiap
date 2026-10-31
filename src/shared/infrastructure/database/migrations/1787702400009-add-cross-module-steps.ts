import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCrossModuleSteps1787702400009 implements MigrationInterface {
  name = 'AddCrossModuleSteps1787702400009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The outbox of `work-orders` (design C16): one row per stock step the module still has to
    // apply or compensate. A row is armed before its first write and completed with the last one,
    // or enqueued with a save and applied after the commit. `operation_id` is the key every
    // receiving step uses to apply once, so it is unique.
    await queryRunner.query(`
      CREATE TABLE work_order_stock_steps (
        id bigserial PRIMARY KEY,
        operation_id uuid NOT NULL,
        kind varchar(30) NOT NULL,
        work_order_id bigint NOT NULL REFERENCES work_orders (id) ON DELETE RESTRICT,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        status varchar(20) NOT NULL,
        attempts integer NOT NULL DEFAULT 0,
        due_at timestamptz NOT NULL,
        last_error text,
        created_at timestamptz NOT NULL,
        completed_at timestamptz,
        CONSTRAINT chk_work_order_stock_steps_status CHECK (status IN ('ARMED', 'PENDING', 'DONE', 'FAILED')),
        CONSTRAINT ux_work_order_stock_steps_operation_id UNIQUE (operation_id)
      )
    `);

    // The outbox of `customers`. `user_id` is the external id the registration chose before the
    // account exists, so it carries no foreign key: `users` belongs to `identity`.
    await queryRunner.query(`
      CREATE TABLE customer_account_steps (
        id bigserial PRIMARY KEY,
        operation_id uuid NOT NULL,
        kind varchar(30) NOT NULL,
        user_id uuid NOT NULL,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        status varchar(20) NOT NULL,
        attempts integer NOT NULL DEFAULT 0,
        due_at timestamptz NOT NULL,
        last_error text,
        created_at timestamptz NOT NULL,
        completed_at timestamptz,
        CONSTRAINT chk_customer_account_steps_status CHECK (status IN ('ARMED', 'PENDING', 'DONE', 'FAILED')),
        CONSTRAINT ux_customer_account_steps_operation_id UNIQUE (operation_id)
      )
    `);

    // Nullable: only the movements a stock step writes carry the operation that wrote them. An
    // undo and a repeated restore find their movements through this column.
    await queryRunner.query(`ALTER TABLE stock_movements ADD COLUMN operation_id uuid`);
    await queryRunner.query(
      `CREATE INDEX ix_stock_movements_operation_id ON stock_movements (operation_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS ix_stock_movements_operation_id`);
    await queryRunner.query(`ALTER TABLE stock_movements DROP COLUMN IF EXISTS operation_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS customer_account_steps`);
    await queryRunner.query(`DROP TABLE IF EXISTS work_order_stock_steps`);
  }
}
