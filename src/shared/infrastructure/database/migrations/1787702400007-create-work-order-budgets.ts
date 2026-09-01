import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWorkOrderBudgets1787702400007 implements MigrationInterface {
  name = 'CreateWorkOrderBudgets1787702400007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE work_orders
        ADD COLUMN diagnosis_started_at timestamptz,
        ADD COLUMN diagnosis_completed_at timestamptz,
        ADD COLUMN budget_decided_at timestamptz,
        ADD COLUMN budget_decided_by_user_id bigint REFERENCES users (id) ON DELETE RESTRICT,
        ADD COLUMN execution_started_at timestamptz
    `);

    await queryRunner.query(`
      CREATE TABLE work_order_budgets (
        id bigserial PRIMARY KEY,
        external_id uuid NOT NULL,
        work_order_id bigint NOT NULL REFERENCES work_orders (id) ON DELETE RESTRICT,
        round integer NOT NULL,
        total_cents bigint NOT NULL,
        status varchar(20) NOT NULL,
        generated_at timestamptz NOT NULL,
        decided_at timestamptz,
        decided_by_user_id bigint REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT chk_work_order_budgets_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
        CONSTRAINT chk_work_order_budgets_round CHECK (round > 0),
        CONSTRAINT chk_work_order_budgets_total_cents CHECK (total_cents >= 0),
        CONSTRAINT ux_work_order_budgets_external_id UNIQUE (external_id)
      )
    `);
    // The correctness guarantee for two concurrent supplementary submissions: the loser's insert
    // fails this constraint, and no retry is attempted (design.md's Risks & Concerns - retrying
    // with round n+1 would silently quote a round the mechanic never asked for).
    await queryRunner.query(
      `CREATE UNIQUE INDEX ux_work_order_budgets_round ON work_order_budgets (work_order_id, round)`,
    );

    // Nullable while an item is a draft, set once its round is generated - the only price ever
    // charged for that item thereafter (phase 9).
    await queryRunner.query(`
      ALTER TABLE work_order_services
        ADD COLUMN budget_id bigint REFERENCES work_order_budgets (id) ON DELETE RESTRICT,
        ADD COLUMN budgeted_unit_price_cents bigint
    `);
    await queryRunner.query(`
      ALTER TABLE work_order_parts
        ADD COLUMN budget_id bigint REFERENCES work_order_budgets (id) ON DELETE RESTRICT,
        ADD COLUMN budgeted_unit_price_cents bigint
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE work_order_parts DROP COLUMN IF EXISTS budgeted_unit_price_cents, DROP COLUMN IF EXISTS budget_id`,
    );
    await queryRunner.query(
      `ALTER TABLE work_order_services DROP COLUMN IF EXISTS budgeted_unit_price_cents, DROP COLUMN IF EXISTS budget_id`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS work_order_budgets`);
    await queryRunner.query(`
      ALTER TABLE work_orders
        DROP COLUMN IF EXISTS execution_started_at,
        DROP COLUMN IF EXISTS budget_decided_by_user_id,
        DROP COLUMN IF EXISTS budget_decided_at,
        DROP COLUMN IF EXISTS diagnosis_completed_at,
        DROP COLUMN IF EXISTS diagnosis_started_at
    `);
  }
}
