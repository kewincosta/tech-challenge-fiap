import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkOrderClosingColumns1787702400008 implements MigrationInterface {
  name = 'AddWorkOrderClosingColumns1787702400008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE work_orders
        ADD COLUMN charged_total_cents bigint,
        ADD COLUMN discount_cents bigint NOT NULL DEFAULT 0,
        ADD COLUMN discount_note varchar(255),
        ADD COLUMN discount_applied_by_user_id bigint REFERENCES users (id) ON DELETE RESTRICT,
        ADD COLUMN discount_applied_at timestamptz,
        ADD COLUMN completed_at timestamptz,
        ADD COLUMN delivered_at timestamptz,
        ADD COLUMN delivered_by_user_id bigint REFERENCES users (id) ON DELETE RESTRICT,
        ADD COLUMN canceled_at timestamptz,
        ADD COLUMN canceled_by_user_id bigint REFERENCES users (id) ON DELETE RESTRICT,
        ADD COLUMN cancellation_reason varchar(255),
        ADD COLUMN version integer NOT NULL DEFAULT 0
    `);

    // Nullable: a settlement carries no quantity of its own, it settles whatever the movement
    // already says. Only a write-off records one, and it is the net figure after prior returns,
    // never the movement's own quantity (design.md's Tech Decisions).
    await queryRunner.query(`
      ALTER TABLE stock_movement_transitions
        ADD COLUMN quantity integer
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE stock_movement_transitions DROP COLUMN IF EXISTS quantity`,
    );
    await queryRunner.query(`
      ALTER TABLE work_orders
        DROP COLUMN IF EXISTS version,
        DROP COLUMN IF EXISTS cancellation_reason,
        DROP COLUMN IF EXISTS canceled_by_user_id,
        DROP COLUMN IF EXISTS canceled_at,
        DROP COLUMN IF EXISTS delivered_by_user_id,
        DROP COLUMN IF EXISTS delivered_at,
        DROP COLUMN IF EXISTS completed_at,
        DROP COLUMN IF EXISTS discount_applied_at,
        DROP COLUMN IF EXISTS discount_applied_by_user_id,
        DROP COLUMN IF EXISTS discount_note,
        DROP COLUMN IF EXISTS discount_cents,
        DROP COLUMN IF EXISTS charged_total_cents
    `);
  }
}
