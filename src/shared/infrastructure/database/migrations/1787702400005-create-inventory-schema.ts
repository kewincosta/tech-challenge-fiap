import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInventorySchema1787702400005 implements MigrationInterface {
  name = 'CreateInventorySchema1787702400005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE inventory_items (
        id bigserial PRIMARY KEY,
        external_id uuid NOT NULL,
        sku varchar(40) NOT NULL,
        name varchar(120) NOT NULL,
        description varchar(255),
        kind varchar(10) NOT NULL,
        unit_price_cents bigint NOT NULL,
        quantity_on_hand integer NOT NULL,
        status varchar(20) NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        CONSTRAINT chk_inventory_items_kind CHECK (kind IN ('PART', 'SUPPLY')),
        CONSTRAINT chk_inventory_items_unit_price_cents CHECK (unit_price_cents >= 0),
        -- The last line of defence against a lost update: a CHECK alone cannot see two concurrent
        -- writers both reading 10 and both writing 15 (spec.md's Assumptions) - the row lock T6
        -- takes is what actually prevents that. This is what stops either of them writing negative.
        CONSTRAINT chk_inventory_items_quantity_on_hand CHECK (quantity_on_hand >= 0),
        CONSTRAINT chk_inventory_items_status CHECK (status IN ('ACTIVE', 'INACTIVE')),
        CONSTRAINT ux_inventory_items_external_id UNIQUE (external_id)
      )
    `);
    // Plain, not an expression index: Sku normalises to upper case on the way in, so there is
    // nothing left for lower()/upper() to do here (unlike services.name).
    await queryRunner.query(
      `CREATE UNIQUE INDEX ux_inventory_items_active_sku ON inventory_items (sku) WHERE status = 'ACTIVE'`,
    );

    // kind and status carry every value the consumption-era phases (11-12) will write, not only
    // the two this feature records - a dormant column costs nothing, but a CHECK that forbids a
    // value the schema is meant to hold would (spec.md's Assumptions).
    await queryRunner.query(`
      CREATE TABLE stock_movements (
        id bigserial PRIMARY KEY,
        external_id uuid NOT NULL,
        inventory_item_id bigint NOT NULL REFERENCES inventory_items (id) ON DELETE RESTRICT,
        kind varchar(20) NOT NULL,
        undoes_movement_id bigint REFERENCES stock_movements (id),
        quantity integer NOT NULL,
        unit_price_cents bigint NOT NULL,
        work_order_id bigint,
        status varchar(20),
        occurred_at timestamptz NOT NULL,
        actor_user_id bigint NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
        note varchar(255),
        CONSTRAINT chk_stock_movements_kind CHECK (kind IN ('INBOUND', 'CONSUMPTION', 'RETURN', 'ADJUSTMENT')),
        CONSTRAINT chk_stock_movements_quantity CHECK (quantity > 0),
        CONSTRAINT chk_stock_movements_unit_price_cents CHECK (unit_price_cents >= 0),
        CONSTRAINT chk_stock_movements_status CHECK (status IN ('PENDING', 'SETTLED', 'WRITTEN_OFF')),
        CONSTRAINT ux_stock_movements_external_id UNIQUE (external_id)
      )
    `);
    // work_order_id deliberately carries no foreign key: work_orders does not exist until phase 8,
    // which adds the constraint (spec.md's Out of Scope).
    await queryRunner.query(
      `CREATE INDEX ix_stock_movements_item_occurred ON stock_movements (inventory_item_id, occurred_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX ix_stock_movements_work_order_status ON stock_movements (work_order_id, status)`,
    );

    // Created here, written by nothing until phase 11 - only a consumption ever changes status.
    await queryRunner.query(`
      CREATE TABLE stock_movement_transitions (
        id bigserial PRIMARY KEY,
        external_id uuid NOT NULL,
        stock_movement_id bigint NOT NULL REFERENCES stock_movements (id) ON DELETE RESTRICT,
        from_status varchar(20),
        to_status varchar(20) NOT NULL,
        from_work_order_id bigint,
        to_work_order_id bigint,
        actor_user_id bigint REFERENCES users (id) ON DELETE RESTRICT,
        occurred_at timestamptz NOT NULL,
        note varchar(255),
        CONSTRAINT ux_stock_movement_transitions_external_id UNIQUE (external_id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX ix_stock_movement_transitions_movement ON stock_movement_transitions (stock_movement_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS stock_movement_transitions`);
    await queryRunner.query(`DROP TABLE IF EXISTS stock_movements`);
    await queryRunner.query(`DROP TABLE IF EXISTS inventory_items`);
  }
}
