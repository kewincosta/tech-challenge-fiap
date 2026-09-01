import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Money } from '../../src/shared/domain/value-objects/money';
import { InventoryItem } from '../../src/modules/inventory/domain/entities/inventory-item';
import { InventoryItemKind } from '../../src/modules/inventory/domain/inventory-item-kind';
import { InventoryItemId } from '../../src/modules/inventory/domain/value-objects/inventory-item-id';
import { Sku } from '../../src/modules/inventory/domain/value-objects/sku';
import { StockMovementId } from '../../src/modules/inventory/domain/value-objects/stock-movement-id';
import { InventoryItemOrmEntity } from '../../src/modules/inventory/infrastructure/persistence/inventory-item.orm-entity';
import { TypeOrmInventoryItemRepository } from '../../src/modules/inventory/infrastructure/persistence/typeorm-inventory-item.repository';
import { WorkOrder } from '../../src/modules/work-orders/domain/entities/work-order';
import { WorkOrderId } from '../../src/modules/work-orders/domain/value-objects/work-order-id';
import { WorkOrderNumber } from '../../src/modules/work-orders/domain/value-objects/work-order-number';
import { WorkOrderOrmEntity } from '../../src/modules/work-orders/infrastructure/persistence/work-order.orm-entity';
import { WorkOrderBudgetOrmEntity } from '../../src/modules/work-orders/infrastructure/persistence/work-order-budget.orm-entity';
import { WorkOrderServiceOrmEntity } from '../../src/modules/work-orders/infrastructure/persistence/work-order-service.orm-entity';
import { WorkOrderPartOrmEntity } from '../../src/modules/work-orders/infrastructure/persistence/work-order-part.orm-entity';
import { TypeOrmWorkOrderRepository } from '../../src/modules/work-orders/infrastructure/persistence/typeorm-work-order.repository';
import { TypeOrmTransactionRunner } from '../../src/shared/infrastructure/database/typeorm-transaction-runner';
import { uniqueSku } from '../support/factories/sku.factory';
import { createTestDataSource } from '../support/db';

let dataSource: DataSource;
let inventoryRepository: TypeOrmInventoryItemRepository;
let workOrderRepository: TypeOrmWorkOrderRepository;
let mechanicExternalId: string;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  inventoryRepository = new TypeOrmInventoryItemRepository(
    dataSource.getRepository(InventoryItemOrmEntity),
    dataSource,
  );
  workOrderRepository = new TypeOrmWorkOrderRepository(
    dataSource.getRepository(WorkOrderOrmEntity),
    dataSource.getRepository(WorkOrderServiceOrmEntity),
    dataSource.getRepository(WorkOrderPartOrmEntity),
    dataSource.getRepository(WorkOrderBudgetOrmEntity),
    dataSource,
  );
  mechanicExternalId = await insertUser();
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

describe('Cross-module transaction (AD-008)', () => {
  it('lands a work order write and an inventory write in the same Postgres transaction', async () => {
    const workOrder = await openAndSaveWorkOrder();
    const item = buildInventoryItem();
    await inventoryRepository.save(item);
    const runner = new TypeOrmTransactionRunner(dataSource);

    const reloadedWorkOrder = await workOrderRepository.findByNumber(workOrder.number);
    reloadedWorkOrder!.assignMechanic({
      mechanicUserId: mechanicExternalId,
      actorUserId: mechanicExternalId,
      now: new Date(),
    });
    const reloadedItem = await inventoryRepository.findById(item.id);
    reloadedItem!.replenish({
      quantity: 4,
      unitPrice: Money.fromCents(2500),
      actorUserId: mechanicExternalId,
      movementId: StockMovementId.create(randomUUID()),
      now: new Date(),
    });

    await runner.run(async () => {
      await workOrderRepository.save(reloadedWorkOrder!);
      await inventoryRepository.save(reloadedItem!);
    });

    const finalWorkOrder = await workOrderRepository.findByNumber(workOrder.number);
    const finalItem = await inventoryRepository.findById(item.id);
    expect(finalWorkOrder?.assignedMechanicUserId).toBe(mechanicExternalId);
    expect(finalItem?.quantityOnHand.units).toBe(4);
  });

  it('leaves neither write in the database when the shared transaction fails after both were applied', async () => {
    const workOrder = await openAndSaveWorkOrder();
    const item = buildInventoryItem();
    await inventoryRepository.save(item);
    const runner = new TypeOrmTransactionRunner(dataSource);

    const reloadedWorkOrder = await workOrderRepository.findByNumber(workOrder.number);
    reloadedWorkOrder!.assignMechanic({
      mechanicUserId: mechanicExternalId,
      actorUserId: mechanicExternalId,
      now: new Date(),
    });
    const reloadedItem = await inventoryRepository.findById(item.id);
    reloadedItem!.replenish({
      quantity: 4,
      unitPrice: Money.fromCents(2500),
      actorUserId: mechanicExternalId,
      movementId: StockMovementId.create(randomUUID()),
      now: new Date(),
    });
    const forcedFailure = new Error('cross-module write forced to fail');

    await expect(
      runner.run(async () => {
        await workOrderRepository.save(reloadedWorkOrder!);
        await inventoryRepository.save(reloadedItem!);
        throw forcedFailure;
      }),
    ).rejects.toThrow(forcedFailure);

    const finalWorkOrder = await workOrderRepository.findByNumber(workOrder.number);
    const finalItem = await inventoryRepository.findById(item.id);
    expect(finalWorkOrder?.assignedMechanicUserId).toBeNull();
    expect(finalItem?.quantityOnHand.units).toBe(0);
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
