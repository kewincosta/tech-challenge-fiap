import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { TypeOrmInventoryQueryAdapter } from '../../src/modules/inventory/infrastructure/persistence/typeorm-inventory-query.adapter';
import { uniqueSku } from '../support/factories/sku.factory';
import { createTestDataSource } from '../support/db';

let dataSource: DataSource;
let queryAdapter: TypeOrmInventoryQueryAdapter;
let actorInternalId: number;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  queryAdapter = new TypeOrmInventoryQueryAdapter(dataSource);
  actorInternalId = await insertUser();
});

afterAll(async () => {
  await dataSource.destroy();
});

async function insertUser(): Promise<number> {
  const rows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO users (external_id, email, password_hash, name, document, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'hash', 'Test User', $2, 'ACTIVE', now(), now())
     RETURNING id`,
    [`${randomUUID()}@example.com`, Math.random().toString().slice(2, 13)],
  );
  return rows[0].id;
}

interface SeededItem {
  id: number;
  externalId: string;
}

async function insertInventoryItem(quantityOnHand: number): Promise<SeededItem> {
  const externalId = randomUUID();
  const rows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO inventory_items (external_id, sku, name, kind, unit_price_cents, quantity_on_hand, status, created_at, updated_at)
     VALUES ($1, $2, 'Item de teste', 'PART', 2500, $3, 'ACTIVE', now(), now())
     RETURNING id`,
    [externalId, uniqueSku(), quantityOnHand],
  );
  return { id: rows[0].id, externalId };
}

interface SeededWorkOrder {
  id: number;
  number: string;
}

async function insertWorkOrder(status: string): Promise<SeededWorkOrder> {
  // A dedicated user per work order - `actorInternalId` is shared across this whole file for
  // movements, but `ux_customers_user_id` refuses a second customer over the same user.
  const ownerId = await insertUser();
  const customerRows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO customers (external_id, user_id, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'ACTIVE', now(), now())
     RETURNING id`,
    [ownerId],
  );
  const vehicleRows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO vehicles (external_id, customer_id, plate, brand, model, year, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'Toyota', 'Corolla', 2020, now(), now())
     RETURNING id`,
    [customerRows[0].id, Math.random().toString(36).slice(2, 9).toUpperCase()],
  );
  const number = `${Math.random().toString(36).slice(2, 8).toUpperCase()}-2026`;
  const workOrderRows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO work_orders (external_id, number, customer_id, vehicle_id, created_by_user_id, status, customer_name, vehicle_plate, vehicle_brand, vehicle_model, vehicle_year, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'Jane Doe', 'ABC1234', 'Toyota', 'Corolla', 2020, now(), now())
     RETURNING id`,
    [number, customerRows[0].id, vehicleRows[0].id, actorInternalId, status],
  );
  return { id: workOrderRows[0].id, number };
}

async function insertBudget(workOrderId: number, round: number, status: string): Promise<number> {
  const rows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO work_order_budgets (external_id, work_order_id, round, total_cents, status, generated_at)
     VALUES (gen_random_uuid(), $1, $2, 10000, $3, now())
     RETURNING id`,
    [workOrderId, round, status],
  );
  return rows[0].id;
}

async function insertWorkOrderPart(
  workOrderId: number,
  inventoryItemId: number,
  overrides: {
    budgetId?: number | null;
    plannedQuantity?: number;
    withdrawnQuantity?: number;
  } = {},
): Promise<void> {
  await dataSource.query(
    `INSERT INTO work_order_parts (external_id, work_order_id, inventory_item_id, sku, item_name, planned_quantity, withdrawn_quantity, unit_price_cents, created_at, budget_id, budgeted_unit_price_cents)
     VALUES (gen_random_uuid(), $1, $2, 'FLT-001', 'Filtro de oleo', $3, $4, 2500, now(), $5, $6)`,
    [
      workOrderId,
      inventoryItemId,
      overrides.plannedQuantity ?? 3,
      overrides.withdrawnQuantity ?? 0,
      overrides.budgetId ?? null,
      overrides.budgetId ? 2500 : null,
    ],
  );
}

async function insertConsumption(
  inventoryItemId: number,
  workOrderId: number,
  quantity: number,
): Promise<void> {
  await dataSource.query(
    `INSERT INTO stock_movements (external_id, inventory_item_id, kind, quantity, unit_price_cents, work_order_id, status, occurred_at, actor_user_id)
     VALUES (gen_random_uuid(), $1, 'CONSUMPTION', $2, 2500, $3, 'PENDING', now(), $4)`,
    [inventoryItemId, quantity, workOrderId, actorInternalId],
  );
}

describe('TypeOrmInventoryQueryAdapter.listStockShortages', () => {
  it('lists an item whose outstanding demand from an approved round exceeds the shelf, naming the work order waiting on it', async () => {
    const item = await insertInventoryItem(1);
    const workOrder = await insertWorkOrder('IN_EXECUTION');
    const budgetId = await insertBudget(workOrder.id, 1, 'APPROVED');
    await insertWorkOrderPart(workOrder.id, item.id, { budgetId, plannedQuantity: 3 });

    const shortages = await queryAdapter.listStockShortages();
    const found = shortages.find((row) => row.inventoryItemId === item.externalId);

    expect(found).toBeDefined();
    expect(found?.outstandingQuantity).toBe(3);
    expect(found?.workOrderNumbers).toEqual([workOrder.number]);
  });

  it('reads demand as planned minus withdrawn, not planned alone', async () => {
    // count 2, planned 5, withdrawn 3: true outstanding is 2, which does not exceed the count on
    // hand, so the item must be absent. Dropping `withdrawn` from the sum would compute 5,
    // which does exceed 2 and would wrongly list it (validation.md's N3).
    const item = await insertInventoryItem(2);
    const workOrder = await insertWorkOrder('IN_EXECUTION');
    const budgetId = await insertBudget(workOrder.id, 1, 'APPROVED');
    await insertWorkOrderPart(workOrder.id, item.id, {
      budgetId,
      plannedQuantity: 5,
      withdrawnQuantity: 3,
    });

    const shortages = await queryAdapter.listStockShortages();

    expect(shortages.some((row) => row.inventoryItemId === item.externalId)).toBe(false);
  });

  it('reports the net outstanding quantity, not the raw planned quantity, for a listed partly withdrawn item', async () => {
    // The demand formula is written twice in SELECT_SHORTAGES - once in the HAVING threshold,
    // once in the projected column. The previous case only reads the threshold copy (the row
    // never appears, so outstandingQuantity is never read); this one keeps the item listed so the
    // projected value itself is checked (validation.md's P1, round 3).
    const item = await insertInventoryItem(1);
    const workOrder = await insertWorkOrder('IN_EXECUTION');
    const budgetId = await insertBudget(workOrder.id, 1, 'APPROVED');
    await insertWorkOrderPart(workOrder.id, item.id, {
      budgetId,
      plannedQuantity: 5,
      withdrawnQuantity: 3,
    });

    const shortages = await queryAdapter.listStockShortages();
    const found = shortages.find((row) => row.inventoryItemId === item.externalId);

    expect(found?.outstandingQuantity).toBe(2);
  });

  it('sums demand and names every work order across more than one contributing round, not just one', async () => {
    // Every other fixture in this file gives an item exactly one contributing work order part, so
    // an aggregate over a single row cannot tell SUM from MAX, or array_agg from picking the first
    // element (validation.md's Fix 10, round 4). Two work orders, 2 planned each, against a shelf
    // of 3: true demand is 4, which exceeds the shelf, and both numbers must be named.
    const item = await insertInventoryItem(3);
    const workOrderA = await insertWorkOrder('IN_EXECUTION');
    const budgetIdA = await insertBudget(workOrderA.id, 1, 'APPROVED');
    await insertWorkOrderPart(workOrderA.id, item.id, { budgetId: budgetIdA, plannedQuantity: 2 });
    const workOrderB = await insertWorkOrder('IN_EXECUTION');
    const budgetIdB = await insertBudget(workOrderB.id, 1, 'APPROVED');
    await insertWorkOrderPart(workOrderB.id, item.id, { budgetId: budgetIdB, plannedQuantity: 2 });

    const shortages = await queryAdapter.listStockShortages();
    const found = shortages.find((row) => row.inventoryItemId === item.externalId);

    expect(found?.outstandingQuantity).toBe(4);
    expect(found?.workOrderNumbers.slice().sort()).toEqual(
      [workOrderA.number, workOrderB.number].sort(),
    );
  });

  it('leaves out an item whose count on hand covers its outstanding demand', async () => {
    const item = await insertInventoryItem(5);
    const workOrder = await insertWorkOrder('IN_EXECUTION');
    const budgetId = await insertBudget(workOrder.id, 1, 'APPROVED');
    await insertWorkOrderPart(workOrder.id, item.id, { budgetId, plannedQuantity: 3 });

    const shortages = await queryAdapter.listStockShortages();

    expect(shortages.some((row) => row.inventoryItemId === item.externalId)).toBe(false);
  });

  it('leaves out an item whose count on hand exactly equals its outstanding demand', async () => {
    // WOP-04's AC1 names "exceeds", AC4 "covers" - covers includes exact equality, so the
    // boundary itself needs its own fixture (validation.md's M7): count and demand both at 3
    // must not appear, or `>` has silently become `>=` somewhere in the query.
    const item = await insertInventoryItem(3);
    const workOrder = await insertWorkOrder('IN_EXECUTION');
    const budgetId = await insertBudget(workOrder.id, 1, 'APPROVED');
    await insertWorkOrderPart(workOrder.id, item.id, { budgetId, plannedQuantity: 3 });

    const shortages = await queryAdapter.listStockShortages();

    expect(shortages.some((row) => row.inventoryItemId === item.externalId)).toBe(false);
  });

  it('ignores demand from a work order in any state other than IN_EXECUTION', async () => {
    const item = await insertInventoryItem(1);
    const workOrder = await insertWorkOrder('AWAITING_APPROVAL');
    const budgetId = await insertBudget(workOrder.id, 1, 'APPROVED');
    await insertWorkOrderPart(workOrder.id, item.id, { budgetId, plannedQuantity: 3 });

    const shortages = await queryAdapter.listStockShortages();

    expect(shortages.some((row) => row.inventoryItemId === item.externalId)).toBe(false);
  });

  it('leaves out a part on a rejected round and a draft item attached to no round', async () => {
    const rejectedItem = await insertInventoryItem(0);
    const workOrderA = await insertWorkOrder('IN_EXECUTION');
    const rejectedBudgetId = await insertBudget(workOrderA.id, 1, 'REJECTED');
    await insertWorkOrderPart(workOrderA.id, rejectedItem.id, {
      budgetId: rejectedBudgetId,
      plannedQuantity: 3,
    });

    const draftItem = await insertInventoryItem(0);
    const workOrderB = await insertWorkOrder('IN_EXECUTION');
    await insertWorkOrderPart(workOrderB.id, draftItem.id, { budgetId: null, plannedQuantity: 3 });

    const shortages = await queryAdapter.listStockShortages();

    expect(shortages.some((row) => row.inventoryItemId === rejectedItem.externalId)).toBe(false);
    expect(shortages.some((row) => row.inventoryItemId === draftItem.externalId)).toBe(false);
  });

  it('never reads stock_movements: a large PENDING consumption with nothing outstanding leaves the item off the list', async () => {
    const item = await insertInventoryItem(0);
    const workOrder = await insertWorkOrder('IN_EXECUTION');
    const budgetId = await insertBudget(workOrder.id, 1, 'APPROVED');
    // Fully withdrawn - nothing outstanding - even though the consumption itself is still PENDING.
    await insertWorkOrderPart(workOrder.id, item.id, {
      budgetId,
      plannedQuantity: 3,
      withdrawnQuantity: 3,
    });
    await insertConsumption(item.id, workOrder.id, 3);

    const shortages = await queryAdapter.listStockShortages();

    expect(shortages.some((row) => row.inventoryItemId === item.externalId)).toBe(false);
  });

  it('returns an empty list rather than an error when nothing is short', async () => {
    const item = await insertInventoryItem(10);
    const workOrder = await insertWorkOrder('IN_EXECUTION');
    const budgetId = await insertBudget(workOrder.id, 1, 'APPROVED');
    await insertWorkOrderPart(workOrder.id, item.id, { budgetId, plannedQuantity: 1 });

    const shortages = await queryAdapter.listStockShortages();

    expect(Array.isArray(shortages)).toBe(true);
    expect(shortages.some((row) => row.inventoryItemId === item.externalId)).toBe(false);
  });
});
