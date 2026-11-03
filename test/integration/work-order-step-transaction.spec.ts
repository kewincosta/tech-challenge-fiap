import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Money } from '../../src/shared/domain/value-objects/money';
import { InventoryItem } from '../../src/modules/inventory/domain/entities/inventory-item';
import { InventoryItemKind } from '../../src/modules/inventory/domain/inventory-item-kind';
import { InventoryItemId } from '../../src/modules/inventory/domain/value-objects/inventory-item-id';
import { Sku } from '../../src/modules/inventory/domain/value-objects/sku';
import { InventoryItemOrmEntity } from '../../src/modules/inventory/infrastructure/persistence/inventory-item.orm-entity';
import { TypeOrmInventoryItemRepository } from '../../src/modules/inventory/infrastructure/persistence/typeorm-inventory-item.repository';
import { UserKeyResolver } from '../../src/modules/identity';
import {
  StockStep,
  StockStepKind,
} from '../../src/modules/work-orders/application/ports/pending-stock-steps.port';
import { TypeOrmPendingStockSteps } from '../../src/modules/work-orders/infrastructure/persistence/typeorm-pending-stock-steps';
import { TypeOrmWorkOrderReads } from '../../src/modules/work-orders/infrastructure/persistence/typeorm-work-order-reads';
import { WorkOrder } from '../../src/modules/work-orders/domain/entities/work-order';
import { WorkOrderId } from '../../src/modules/work-orders/domain/value-objects/work-order-id';
import { WorkOrderNumber } from '../../src/modules/work-orders/domain/value-objects/work-order-number';
import { TypeOrmWorkOrderRepository } from '../../src/modules/work-orders/infrastructure/persistence/typeorm-work-order.repository';
import { TypeOrmTransactionRunner } from '../../src/shared/infrastructure/database/typeorm-transaction-runner';
import { SystemClock } from '../../src/shared/infrastructure/time/system-clock';
import { uniqueSku } from '../support/factories/sku.factory';
import { createTestDataSource } from '../support/db';
import { buildWorkOrderRepository } from '../support/work-order-adapters';

let dataSource: DataSource;
let inventoryRepository: TypeOrmInventoryItemRepository;
let workOrderRepository: TypeOrmWorkOrderRepository;
let steps: TypeOrmPendingStockSteps;
let mechanicExternalId: string;
const madeSteps: string[] = [];

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  inventoryRepository = new TypeOrmInventoryItemRepository(
    dataSource.getRepository(InventoryItemOrmEntity),
    dataSource,
    new TypeOrmWorkOrderReads(dataSource),
    new UserKeyResolver(dataSource),
  );
  workOrderRepository = buildWorkOrderRepository(dataSource);
  steps = new TypeOrmPendingStockSteps(dataSource, new SystemClock());
  mechanicExternalId = await insertUser();
});

afterEach(async () => {
  await dataSource.query(
    `DELETE FROM work_order_stock_steps WHERE operation_id = ANY($1::uuid[])`,
    [madeSteps.splice(0)],
  );
});

afterAll(async () => {
  await dataSource.destroy();
});

async function insertUser(): Promise<string> {
  const externalId = randomUUID();
  await dataSource.query(
    `INSERT INTO users (external_id, email, password_hash, name, document, status, created_at, updated_at)
     VALUES ($1, $2, 'hash', 'Test User', $3, 'ACTIVE', now(), now())`,
    [externalId, `${randomUUID()}@example.com`, Math.random().toString().slice(2, 13)],
  );
  return externalId;
}

interface Fixture {
  creator: string;
  customer: string;
  vehicle: string;
}

async function seedWorkOrderRefs(): Promise<Fixture> {
  const creator = await insertUser();
  const userRows: Array<{ id: number }> = await dataSource.query(
    `SELECT id FROM users WHERE external_id = $1`,
    [creator],
  );
  const customerRows: Array<{ id: number; external_id: string }> = await dataSource.query(
    `INSERT INTO customers (external_id, user_id, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'ACTIVE', now(), now())
     RETURNING id, external_id`,
    [userRows[0].id],
  );
  const vehicleRows: Array<{ id: number; external_id: string }> = await dataSource.query(
    `INSERT INTO vehicles (external_id, customer_id, plate, brand, model, year, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'Toyota', 'Corolla', 2020, now(), now())
     RETURNING id, external_id`,
    [customerRows[0].id, Math.random().toString(36).slice(2, 9).toUpperCase()],
  );
  return { creator, customer: customerRows[0].external_id, vehicle: vehicleRows[0].external_id };
}

async function openAndSaveWorkOrder(): Promise<WorkOrder> {
  const fixture = await seedWorkOrderRefs();
  const workOrder = WorkOrder.open({
    id: WorkOrderId.create(randomUUID()),
    number: WorkOrderNumber.create(`${Math.random().toString(36).slice(2, 8).toUpperCase()}-2026`),
    customerId: fixture.customer,
    vehicleId: fixture.vehicle,
    createdByUserId: fixture.creator,
    customerName: 'Jane Doe',
    vehiclePlate: 'ABC1234',
    vehicleBrand: 'Toyota',
    vehicleModel: 'Corolla',
    vehicleYear: 2020,
    now: new Date(),
  });
  await workOrderRepository.save(workOrder);
  return workOrder;
}

function buildInventoryItem(): InventoryItem {
  return InventoryItem.create({
    id: InventoryItemId.create(randomUUID()),
    sku: Sku.create(uniqueSku()),
    name: 'Item de teste',
    description: 'Descricao',
    kind: InventoryItemKind.Part,
    unitPrice: Money.fromCents(2500),
    now: new Date(),
  });
}

function stepFor(workOrder: WorkOrder): StockStep {
  const step: StockStep = {
    operationId: randomUUID(),
    kind: StockStepKind.Settle,
    workOrderId: workOrder.id.value,
    actorUserId: mechanicExternalId,
  };
  madeSteps.push(step.operationId);
  return step;
}

async function stepStatusOf(operationId: string): Promise<string | undefined> {
  const rows: Array<{ status: string }> = await dataSource.query(
    `SELECT status FROM work_order_stock_steps WHERE operation_id = $1`,
    [operationId],
  );
  return rows[0]?.status;
}

describe('A work order save and its stock step in one work-orders transaction (AD-008 within one module)', () => {
  it('commits a work order write and the enqueue of a stock step together', async () => {
    const workOrder = await openAndSaveWorkOrder();
    const step = stepFor(workOrder);
    const runner = new TypeOrmTransactionRunner(dataSource);

    const reloadedWorkOrder = await workOrderRepository.findByNumber(workOrder.number);
    reloadedWorkOrder!.assignMechanic({
      mechanicUserId: mechanicExternalId,
      actorUserId: mechanicExternalId,
      now: new Date(),
    });

    await runner.run(async () => {
      await workOrderRepository.save(reloadedWorkOrder!);
      await steps.enqueue(step);
    });

    const finalWorkOrder = await workOrderRepository.findByNumber(workOrder.number);
    expect(finalWorkOrder?.assignedMechanicUserId).toBe(mechanicExternalId);
    expect(await stepStatusOf(step.operationId)).toBe('PENDING');
  });

  it('leaves neither the work order write nor the step in the database when the transaction fails after both were applied', async () => {
    const workOrder = await openAndSaveWorkOrder();
    const step = stepFor(workOrder);
    const runner = new TypeOrmTransactionRunner(dataSource);

    const reloadedWorkOrder = await workOrderRepository.findByNumber(workOrder.number);
    reloadedWorkOrder!.assignMechanic({
      mechanicUserId: mechanicExternalId,
      actorUserId: mechanicExternalId,
      now: new Date(),
    });
    const forcedFailure = new Error('work order write forced to fail');

    await expect(
      runner.run(async () => {
        await workOrderRepository.save(reloadedWorkOrder!);
        await steps.enqueue(step);
        throw forcedFailure;
      }),
    ).rejects.toThrow(forcedFailure);

    const finalWorkOrder = await workOrderRepository.findByNumber(workOrder.number);
    expect(finalWorkOrder?.assignedMechanicUserId).toBeNull();
    expect(await stepStatusOf(step.operationId)).toBeUndefined();
  });

  it('behaves exactly as before with no ambient transaction - each save opens its own', async () => {
    const workOrder = await openAndSaveWorkOrder();
    const item = buildInventoryItem();

    // No TransactionRunner in play here - the existing call shape every other test in this suite
    // already uses, and the regression net for the `inTransaction` fallback branch.
    await inventoryRepository.save(item);
    const reloadedWorkOrder = await workOrderRepository.findByNumber(workOrder.number);
    reloadedWorkOrder!.assignMechanic({
      mechanicUserId: mechanicExternalId,
      actorUserId: mechanicExternalId,
      now: new Date(),
    });
    await workOrderRepository.save(reloadedWorkOrder!);

    const finalWorkOrder = await workOrderRepository.findByNumber(workOrder.number);
    const finalItem = await inventoryRepository.findById(item.id);
    expect(finalWorkOrder?.assignedMechanicUserId).toBe(mechanicExternalId);
    expect(finalItem?.quantityOnHand.units).toBe(0);
  });
});
