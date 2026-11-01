import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConsumptionConfirmation1787702400010 implements MigrationInterface {
  name = 'AddConsumptionConfirmation1787702400010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Nullable: a consumption that a withdrawal wrote counts for a restore, a settlement and a
    // write-off once its work order confirmed it, and this column records when (design C16).
    // Nothing else reads it, so every movement of another kind keeps it empty.
    await queryRunner.query(`ALTER TABLE stock_movements ADD COLUMN confirmed_at timestamptz`);
    // A consumption recorded before this migration reached its work order long ago, so it counts
    // from the moment it happened.
    await queryRunner.query(
      `UPDATE stock_movements SET confirmed_at = occurred_at WHERE kind = 'CONSUMPTION'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE stock_movements DROP COLUMN IF EXISTS confirmed_at`);
  }
}
