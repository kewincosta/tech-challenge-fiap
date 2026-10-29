import { randomUUID } from 'node:crypto';
import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource, EntityManager } from 'typeorm';
import { WORK_ORDER_READS, WorkOrderReads } from '../../src/modules/inventory';
import { TypeOrmWorkOrderReads } from '../../src/modules/work-orders/infrastructure/persistence/typeorm-work-order-reads';
import { WorkOrderReadsModule } from '../../src/modules/work-orders/work-order-reads.module';
import {
  currentEntityManager,
  TypeOrmTransactionRunner,
} from '../../src/shared/infrastructure/database/typeorm-transaction-runner';
import { uniqueValidCpf } from '../support/factories/document.factory';
import { uniqueLicensePlate } from '../support/factories/plate.factory';
import { uniqueSku } from '../support/factories/sku.factory';
import { createTestApp } from '../support/app';
import { createTestDataSource } from '../support/db';

// The largest bigint: no sequence in the test database gets there, so no row owns it.
const UNKNOWN_INTERNAL_ID = '9223372036854775807';

type Runner = DataSource | EntityManager;

let dataSource: DataSource;
let reads: TypeOrmWorkOrderReads;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  reads = new TypeOrmWorkOrderReads(dataSource);
});

afterAll(async () => {
  await dataSource.destroy();
});

async function insertUser(runner: Runner): Promise<string> {
  const rows: Array<{ id: string }> = await runner.query(
    `INSERT INTO users (external_id, email, password_hash, name, document, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'hash', 'Test User', $2, 'ACTIVE', now(), now())
     RETURNING id`,
    [`${randomUUID()}@example.com`, uniqueValidCpf()],
  );
  return rows[0].id;
}

async function insertInventoryItem(): Promise<string> {
  const rows: Array<{ id: string }> = await dataSource.query(
    `INSERT INTO inventory_items (external_id, sku, name, kind, unit_price_cents, quantity_on_hand, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'Item de teste', 'PART', 2500, 0, 'ACTIVE', now(), now())
     RETURNING id`,
    [uniqueSku()],
  );
  return rows[0].id;
}

// A number unique per call, since the test database is never truncated. The prefix fixes where it
// sorts.
function uniqueNumber(prefix = ''): string {
  const suffix = randomUUID()
    .replace(/-/g, '')
    .slice(0, 6 - prefix.length);
  return `${prefix}${suffix}`.toUpperCase() + '-2026';
}

interface SeededWorkOrder {
  id: string;
  externalId: string;
  number: string;
}

// Each work order gets a customer and a vehicle of its own, because only one work order that is
// not delivered or canceled may exist per vehicle.
async function insertWorkOrder(
  status: string,
  { number = uniqueNumber(), runner = dataSource }: { number?: string; runner?: Runner } = {},
): Promise<SeededWorkOrder> {
  const userId = await insertUser(runner);
  const customerRows: Array<{ id: string }> = await runner.query(
    `INSERT INTO customers (external_id, user_id, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'ACTIVE', now(), now())
     RETURNING id`,
    [userId],
  );
  const vehicleRows: Array<{ id: string }> = await runner.query(
    `INSERT INTO vehicles (external_id, customer_id, plate, brand, model, year, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'Toyota', 'Corolla', 2020, now(), now())
     RETURNING id`,
    [customerRows[0].id, uniqueLicensePlate()],
  );
  const workOrderRows: Array<{ id: string; external_id: string }> = await runner.query(
    `INSERT INTO work_orders (external_id, number, customer_id, vehicle_id, created_by_user_id, status, customer_name, vehicle_plate, vehicle_brand, vehicle_model, vehicle_year, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'Jane Doe', 'ABC1234', 'Toyota', 'Corolla', 2020, now(), now())
     RETURNING id, external_id`,
    [number, customerRows[0].id, vehicleRows[0].id, userId, status],
  );
  return { id: workOrderRows[0].id, externalId: workOrderRows[0].external_id, number };
}

async function insertBudget(workOrderId: string, status: string): Promise<string> {
  const rows: Array<{ id: string }> = await dataSource.query(
    `INSERT INTO work_order_budgets (external_id, work_order_id, round, total_cents, status, generated_at)
     VALUES (gen_random_uuid(), $1, 1, 10000, $2, now())
     RETURNING id`,
    [workOrderId, status],
  );
  return rows[0].id;
}

interface PartOptions {
  budgetId?: string | null;
  planned?: number;
  withdrawn?: number;
}

async function insertPart(
  workOrderId: string,
  inventoryItemId: string,
  { budgetId = null, planned = 3, withdrawn = 0 }: PartOptions = {},
): Promise<void> {
  await dataSource.query(
    `INSERT INTO work_order_parts (external_id, work_order_id, inventory_item_id, sku, item_name, planned_quantity, withdrawn_quantity, unit_price_cents, created_at, budget_id, budgeted_unit_price_cents)
     VALUES (gen_random_uuid(), $1, $2, 'FLT-001', 'Filtro de oleo', $3, $4, 2500, now(), $5, $6)`,
    [workOrderId, inventoryItemId, planned, withdrawn, budgetId, budgetId ? 2500 : null],
  );
}

// A work order in execution with the part on an approved round, the shape that counts as demand.
async function insertDemand(
  inventoryItemId: string,
  options: { planned?: number; withdrawn?: number } = {},
): Promise<SeededWorkOrder> {
  const workOrder = await insertWorkOrder('IN_EXECUTION');
  const budgetId = await insertBudget(workOrder.id, 'APPROVED');
  await insertPart(workOrder.id, inventoryItemId, { budgetId, ...options });
  return workOrder;
}

async function demandOf(inventoryItemId: string) {
  const rows = await reads.outstandingDemand();
  return rows.find((row) => row.inventoryItemInternalId === inventoryItemId);
}

describe('TypeOrmWorkOrderReads', () => {
  describe('internalIdOf and externalIdsOf', () => {
    it('translates a work order external id into its internal key', async () => {
      const workOrder = await insertWorkOrder('RECEIVED');

      expect(await reads.internalIdOf(workOrder.externalId)).toBe(workOrder.id);
    });

    it('answers null for an external id that belongs to no work order', async () => {
      expect(await reads.internalIdOf(randomUUID())).toBeNull();
    });

    it('translates a batch of internal keys into external ids and leaves the unknown ones out', async () => {
      const first = await insertWorkOrder('RECEIVED');
      const second = await insertWorkOrder('RECEIVED');

      const externalIds = await reads.externalIdsOf([
        first.id,
        UNKNOWN_INTERNAL_ID,
        second.id,
        first.id,
      ]);

      expect(externalIds).toEqual(
        new Map([
          [first.id, first.externalId],
          [second.id, second.externalId],
        ]),
      );
    });

    // The fixture is written and read inside one transaction that is rolled back at the end: a
    // read on its own connection cannot see the uncommitted row, and nothing is left behind.
    it('resolves a work order inserted earlier in the same open transaction', async () => {
      const runner = new TypeOrmTransactionRunner(dataSource);
      const rollback = new Error('discard the fixture');
      let workOrder!: SeededWorkOrder;
      let inside!: { internalId: string | null; externalIds: Map<string, string> };

      await expect(
        runner.run(async () => {
          workOrder = await insertWorkOrder('RECEIVED', { runner: currentEntityManager()! });
          inside = {
            internalId: await reads.internalIdOf(workOrder.externalId),
            externalIds: await reads.externalIdsOf([workOrder.id]),
          };
          throw rollback;
        }),
      ).rejects.toThrow(rollback);

      expect(inside.internalId).toBe(workOrder.id);
      expect(inside.externalIds).toEqual(new Map([[workOrder.id, workOrder.externalId]]));
      expect(await reads.internalIdOf(workOrder.externalId)).toBeNull();
    });
  });

  describe('outstandingDemand', () => {
    it('sums planned minus withdrawn per item over every work order in execution, naming each of them', async () => {
      const itemId = await insertInventoryItem();
      const first = await insertDemand(itemId, { planned: 3 });
      const second = await insertDemand(itemId, { planned: 4, withdrawn: 1 });

      const demand = await demandOf(itemId);

      expect(demand?.outstanding).toBe(6);
      expect(demand?.workOrderNumbers.slice().sort()).toEqual([first.number, second.number].sort());
    });

    it('names a work order once when it holds the item on more than one approved part', async () => {
      const itemId = await insertInventoryItem();
      const workOrder = await insertWorkOrder('IN_EXECUTION');
      const budgetId = await insertBudget(workOrder.id, 'APPROVED');
      await insertPart(workOrder.id, itemId, { budgetId, planned: 2 });
      await insertPart(workOrder.id, itemId, { budgetId, planned: 3 });

      const demand = await demandOf(itemId);

      expect(demand?.outstanding).toBe(5);
      expect(demand?.workOrderNumbers).toEqual([workOrder.number]);
    });

    it('reads planned minus withdrawn, not planned alone', async () => {
      const itemId = await insertInventoryItem();
      await insertDemand(itemId, { planned: 5, withdrawn: 3 });

      expect((await demandOf(itemId))?.outstanding).toBe(2);
    });

    it('leaves out a work order that withdrew everything it planned, and an item with no demand left', async () => {
      const itemId = await insertInventoryItem();
      const waiting = await insertDemand(itemId, { planned: 4, withdrawn: 1 });
      await insertDemand(itemId, { planned: 3, withdrawn: 3 });
      const fulfilledItemId = await insertInventoryItem();
      await insertDemand(fulfilledItemId, { planned: 2, withdrawn: 2 });

      const demand = await demandOf(itemId);

      expect(demand?.outstanding).toBe(3);
      expect(demand?.workOrderNumbers).toEqual([waiting.number]);
      expect(await demandOf(fulfilledItemId)).toBeUndefined();
    });

    it.each(['PENDING', 'REJECTED'])(
      'leaves out a part on a round that is %s',
      async (budgetStatus) => {
        const itemId = await insertInventoryItem();
        const workOrder = await insertWorkOrder('IN_EXECUTION');
        const budgetId = await insertBudget(workOrder.id, budgetStatus);
        await insertPart(workOrder.id, itemId, { budgetId });

        expect(await demandOf(itemId)).toBeUndefined();
      },
    );

    it('leaves out a draft part that no round has taken in yet', async () => {
      const itemId = await insertInventoryItem();
      const workOrder = await insertWorkOrder('IN_EXECUTION');
      await insertPart(workOrder.id, itemId, { budgetId: null });

      expect(await demandOf(itemId)).toBeUndefined();
    });

    it.each([
      'RECEIVED',
      'IN_DIAGNOSIS',
      'AWAITING_APPROVAL',
      'COMPLETED',
      'DELIVERED',
      'CANCELED',
    ])('leaves out the approved parts of a work order that is %s', async (status) => {
      const itemId = await insertInventoryItem();
      const workOrder = await insertWorkOrder(status);
      const budgetId = await insertBudget(workOrder.id, 'APPROVED');
      await insertPart(workOrder.id, itemId, { budgetId });

      expect(await demandOf(itemId)).toBeUndefined();
    });
  });

  describe('openWorkOrderNumbersUsing', () => {
    it('lists the work orders that plan the item and are neither delivered nor canceled, ordered by number', async () => {
      const itemId = await insertInventoryItem();
      // The first letter fixes where each number sorts. They are stored out of order, so an
      // answer in number order comes from the query.
      const open = [
        { status: 'IN_EXECUTION', letter: 'Z' },
        { status: 'RECEIVED', letter: 'B' },
        { status: 'COMPLETED', letter: 'M' },
        { status: 'AWAITING_APPROVAL', letter: 'Q' },
        { status: 'IN_DIAGNOSIS', letter: 'D' },
      ];
      const numberOf = new Map<string, string>();
      for (const { status, letter } of open) {
        const workOrder = await insertWorkOrder(status, { number: uniqueNumber(letter) });
        await insertPart(workOrder.id, itemId);
        numberOf.set(letter, workOrder.number);
      }
      for (const status of ['DELIVERED', 'CANCELED']) {
        await insertPart((await insertWorkOrder(status)).id, itemId);
      }

      expect(await reads.openWorkOrderNumbersUsing(itemId)).toEqual(
        ['B', 'D', 'M', 'Q', 'Z'].map((letter) => numberOf.get(letter)),
      );
    });

    it('lists a work order once when it plans the item on more than one part', async () => {
      const itemId = await insertInventoryItem();
      const workOrder = await insertWorkOrder('IN_EXECUTION');
      await insertPart(workOrder.id, itemId);
      await insertPart(workOrder.id, itemId);

      expect(await reads.openWorkOrderNumbersUsing(itemId)).toEqual([workOrder.number]);
    });

    it('answers an empty list for an item no work order plans', async () => {
      const itemId = await insertInventoryItem();

      expect(await reads.openWorkOrderNumbersUsing(itemId)).toEqual([]);
    });

    it('leaves out the work orders that plan another item', async () => {
      const itemId = await insertInventoryItem();
      const otherItemId = await insertInventoryItem();
      await insertPart((await insertWorkOrder('IN_EXECUTION')).id, otherItemId);

      expect(await reads.openWorkOrderNumbersUsing(itemId)).toEqual([]);
    });
  });
});

@Injectable()
class InventoryStandIn {
  constructor(@Inject(WORK_ORDER_READS) readonly workOrderReads: WorkOrderReads) {}
}

// Stands for InventoryModule: it provides a class that injects the token and imports nothing from
// work-orders.
@Module({ providers: [InventoryStandIn] })
class InventoryStandInModule {}

@Global()
@Module({
  providers: [{ provide: DataSource, useFactory: () => dataSource }],
  exports: [DataSource],
})
class DataSourceModule {}

describe('WorkOrderReadsModule', () => {
  it('binds the interface inventory declares for a module that does not import it', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DataSourceModule, WorkOrderReadsModule, InventoryStandInModule],
    }).compile();
    const workOrder = await insertWorkOrder('RECEIVED');

    const { workOrderReads } = moduleRef.get(InventoryStandIn);

    expect(workOrderReads).toBeInstanceOf(TypeOrmWorkOrderReads);
    expect(await workOrderReads.internalIdOf(workOrder.externalId)).toBe(workOrder.id);
    await moduleRef.close();
  });

  it('is registered in the application module, which boots with it', async () => {
    const { app, close } = await createTestApp();
    try {
      expect(app.get(WORK_ORDER_READS)).toBeInstanceOf(TypeOrmWorkOrderReads);
    } finally {
      await close();
    }
  });
});
