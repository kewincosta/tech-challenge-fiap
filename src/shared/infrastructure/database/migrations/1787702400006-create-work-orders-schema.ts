import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWorkOrdersSchema1787702400006 implements MigrationInterface {
  name = 'CreateWorkOrdersSchema1787702400006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The CHECK lists all seven states even though only RECEIVED is reachable here, because
    // features 6 to 8 move through the rest and a CHECK that forbids a state the schema is meant
    // to hold would have to be rewritten (spec.md's Assumptions).
    await queryRunner.query(`
      CREATE TABLE work_orders (
        id bigserial PRIMARY KEY,
        external_id uuid NOT NULL,
        number varchar(11) NOT NULL,
        customer_id bigint NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
        vehicle_id bigint NOT NULL REFERENCES vehicles (id) ON DELETE RESTRICT,
        assigned_mechanic_user_id bigint REFERENCES users (id) ON DELETE RESTRICT,
        created_by_user_id bigint NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
        status varchar(20) NOT NULL,
        customer_name varchar(120) NOT NULL,
        vehicle_plate varchar(7) NOT NULL,
        vehicle_brand varchar(60) NOT NULL,
        vehicle_model varchar(60) NOT NULL,
        vehicle_year smallint NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        CONSTRAINT chk_work_orders_status CHECK (status IN ('RECEIVED', 'IN_DIAGNOSIS', 'AWAITING_APPROVAL', 'IN_EXECUTION', 'COMPLETED', 'DELIVERED', 'CANCELED')),
        CONSTRAINT ux_work_orders_external_id UNIQUE (external_id),
        CONSTRAINT ux_work_orders_number UNIQUE (number)
      )
    `);
    // The complement, not an enumeration: a state added later by a future phase is covered by
    // default rather than by remembering to add it here (design.md's Risks & Concerns).
    await queryRunner.query(
      `CREATE UNIQUE INDEX ux_work_orders_active_vehicle ON work_orders (vehicle_id) WHERE status NOT IN ('DELIVERED', 'CANCELED')`,
    );

    await queryRunner.query(`
      CREATE TABLE work_order_services (
        id bigserial PRIMARY KEY,
        external_id uuid NOT NULL,
        work_order_id bigint NOT NULL REFERENCES work_orders (id) ON DELETE RESTRICT,
        service_id bigint NOT NULL REFERENCES services (id) ON DELETE RESTRICT,
        service_name varchar(120) NOT NULL,
        unit_price_cents bigint NOT NULL,
        created_at timestamptz NOT NULL,
        CONSTRAINT chk_work_order_services_unit_price_cents CHECK (unit_price_cents >= 0),
        CONSTRAINT ux_work_order_services_external_id UNIQUE (external_id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX ix_work_order_services_work_order_id ON work_order_services (work_order_id)`,
    );

    // withdrawn_quantity is created here and written by nothing until phase 11, which states it
    // adds no column of its own - a dormant column, not dormant behaviour.
    await queryRunner.query(`
      CREATE TABLE work_order_parts (
        id bigserial PRIMARY KEY,
        external_id uuid NOT NULL,
        work_order_id bigint NOT NULL REFERENCES work_orders (id) ON DELETE RESTRICT,
        inventory_item_id bigint NOT NULL REFERENCES inventory_items (id) ON DELETE RESTRICT,
        sku varchar(40) NOT NULL,
        item_name varchar(120) NOT NULL,
        planned_quantity integer NOT NULL,
        withdrawn_quantity integer NOT NULL DEFAULT 0,
        unit_price_cents bigint NOT NULL,
        created_at timestamptz NOT NULL,
        CONSTRAINT chk_work_order_parts_planned_quantity CHECK (planned_quantity > 0),
        CONSTRAINT chk_work_order_parts_withdrawn_quantity CHECK (withdrawn_quantity >= 0),
        CONSTRAINT chk_work_order_parts_unit_price_cents CHECK (unit_price_cents >= 0),
        CONSTRAINT ux_work_order_parts_external_id UNIQUE (external_id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX ix_work_order_parts_work_order_id ON work_order_parts (work_order_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE work_order_events (
        id bigserial PRIMARY KEY,
        external_id uuid NOT NULL,
        work_order_id bigint NOT NULL REFERENCES work_orders (id) ON DELETE RESTRICT,
        event_type varchar(40) NOT NULL,
        from_status varchar(20),
        to_status varchar(20),
        actor_user_id bigint REFERENCES users (id) ON DELETE RESTRICT,
        occurred_at timestamptz NOT NULL,
        note varchar(255),
        CONSTRAINT ux_work_order_events_external_id UNIQUE (external_id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX ix_work_order_events_work_order_occurred ON work_order_events (work_order_id, occurred_at)`,
    );

    // The foreign key inventory-and-stock-movements deliberately left off: work_orders did not
    // exist until this migration. Every existing movement row carries NULL here, so it applies
    // cleanly (spec.md's Assumptions).
    await queryRunner.query(`
      ALTER TABLE stock_movements
        ADD CONSTRAINT fk_stock_movements_work_order
        FOREIGN KEY (work_order_id) REFERENCES work_orders (id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS fk_stock_movements_work_order`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS work_order_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS work_order_parts`);
    await queryRunner.query(`DROP TABLE IF EXISTS work_order_services`);
    await queryRunner.query(`DROP TABLE IF EXISTS work_orders`);
  }
}
