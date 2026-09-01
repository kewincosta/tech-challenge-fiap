import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Money } from '../../src/shared/domain/value-objects/money';
import { BudgetStatus } from '../../src/modules/work-orders/domain/budget-status';
import { WorkOrder } from '../../src/modules/work-orders/domain/entities/work-order';
import { BudgetId } from '../../src/modules/work-orders/domain/value-objects/budget-id';
import { WorkOrderId } from '../../src/modules/work-orders/domain/value-objects/work-order-id';
import { WorkOrderItemId } from '../../src/modules/work-orders/domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../src/modules/work-orders/domain/value-objects/work-order-number';
import { WorkOrderStatus } from '../../src/modules/work-orders/domain/work-order-status';
import { WorkOrderOrmEntity } from '../../src/modules/work-orders/infrastructure/persistence/work-order.orm-entity';
import { WorkOrderBudgetOrmEntity } from '../../src/modules/work-orders/infrastructure/persistence/work-order-budget.orm-entity';
import { WorkOrderServiceOrmEntity } from '../../src/modules/work-orders/infrastructure/persistence/work-order-service.orm-entity';
import { WorkOrderPartOrmEntity } from '../../src/modules/work-orders/infrastructure/persistence/work-order-part.orm-entity';
import { TypeOrmWorkOrderRepository } from '../../src/modules/work-orders/infrastructure/persistence/typeorm-work-order.repository';
import { createTestDataSource } from '../support/db';

let dataSource: DataSource;
let repository: TypeOrmWorkOrderRepository;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  repository = new TypeOrmWorkOrderRepository(
    dataSource.getRepository(WorkOrderOrmEntity),
    dataSource.getRepository(WorkOrderServiceOrmEntity),
    dataSource.getRepository(WorkOrderPartOrmEntity),
    dataSource.getRepository(WorkOrderBudgetOrmEntity),
    dataSource,
  );
});

afterAll(async () => {
  await dataSource.destroy();
});

interface SeededRef {
  internalId: number;
  externalId: string;
}

async function insertUser(): Promise<SeededRef> {
  const externalId = randomUUID();
  const rows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO users (external_id, email, password_hash, name, document, status, created_at, updated_at)
     VALUES ($1, $2, 'hash', 'Test User', $3, 'ACTIVE', now(), now())
     RETURNING id`,
    [
      externalId,
      `wob-repo-${Math.random().toString(36).slice(2)}@example.com`,
      Math.random().toString().slice(2, 13),
    ],
  );
  return { internalId: rows[0].id, externalId };
}

async function insertCustomer(userInternalId: number): Promise<SeededRef> {
  const externalId = randomUUID();
  const rows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO customers (external_id, user_id, status, created_at, updated_at)
     VALUES ($1, $2, 'ACTIVE', now(), now())
     RETURNING id`,
    [externalId, userInternalId],
  );
  return { internalId: rows[0].id, externalId };
}

async function insertVehicle(customerInternalId: number): Promise<SeededRef> {
  const externalId = randomUUID();
  const rows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO vehicles (external_id, customer_id, plate, brand, model, year, created_at, updated_at)
     VALUES ($1, $2, $3, 'Toyota', 'Corolla', 2020, now(), now())
     RETURNING id`,
    [externalId, customerInternalId, Math.random().toString(36).slice(2, 9).toUpperCase()],
  );
  return { internalId: rows[0].id, externalId };
}

async function insertService(priceCents = 15099): Promise<SeededRef> {
  const externalId = randomUUID();
  const rows: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO services (external_id, name, price_cents, estimated_duration_minutes, status, created_at, updated_at)
     VALUES ($1, $2, $3, 60, 'ACTIVE', now(), now())
     RETURNING id`,
    [externalId, `Servico ${Math.random().toString(36).slice(2)}`, priceCents],
  );
  return { internalId: rows[0].id, externalId };
}

interface Fixture {
  creator: SeededRef;
  customer: SeededRef;
  vehicle: SeededRef;
}

async function seedWorkOrderRefs(): Promise<Fixture> {
  const creator = await insertUser();
  const customer = await insertCustomer(creator.internalId);
  const vehicle = await insertVehicle(customer.internalId);
  return { creator, customer, vehicle };
}

function uniqueNumber(): WorkOrderNumber {
  return WorkOrderNumber.create(`${Math.random().toString(36).slice(2, 8).toUpperCase()}-2026`);
}

function openWorkOrder(fixture: Fixture): WorkOrder {
  return WorkOrder.open({
    id: WorkOrderId.create(randomUUID()),
    number: uniqueNumber(),
    customerId: fixture.customer.externalId,
    vehicleId: fixture.vehicle.externalId,
    createdByUserId: fixture.creator.externalId,
    customerName: 'Jane Doe',
    vehiclePlate: 'ABC1234',
    vehicleBrand: 'Toyota',
    vehicleModel: 'Corolla',
    vehicleYear: 2020,
    now: new Date(),
  });
}

async function workOrderInternalId(externalId: string): Promise<number> {
  const rows: Array<{ id: number }> = await dataSource.query(
    `SELECT id FROM work_orders WHERE external_id = $1`,
    [externalId],
  );
  return rows[0].id;
}

describe('TypeOrmWorkOrderRepository - budget rounds', () => {
  it('writes the work order row, the budget row and the item rows in one transaction, and findByNumber rebuilds them', async () => {
    const fixture = await seedWorkOrderRefs();
    const workOrder = openWorkOrder(fixture);
    await repository.save(workOrder);
    const reloaded = await repository.findByNumber(workOrder.number);
    if (!reloaded) throw new Error('work order not found');
    reloaded.startDiagnosis({ actorUserId: fixture.creator.externalId, now: new Date() });
    const service = await insertService(15099);
    reloaded.addService({
      itemId: WorkOrderItemId.create(randomUUID()),
      serviceId: service.externalId,
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
      actorUserId: fixture.creator.externalId,
      now: new Date(),
    });
    reloaded.completeDiagnosis({
      budgetId: BudgetId.create(randomUUID()),
      actorUserId: fixture.creator.externalId,
      now: new Date(),
    });
    await repository.save(reloaded);

    const final = await repository.findByNumber(workOrder.number);
    if (!final) throw new Error('work order not found after save');
    expect(final.status).toBe(WorkOrderStatus.AwaitingApproval);
    expect(final.budgets).toHaveLength(1);
    expect(final.budgets[0].round).toBe(1);
    expect(final.budgets[0].status).toBe(BudgetStatus.Pending);
    expect(final.budgets[0].total.cents).toBe(15099);
    expect(final.serviceItems[0].budgetRound).toBe(1);
    expect(final.serviceItems[0].budgetedUnitPrice?.cents).toBe(15099);
  });

  it("persists each item's own budgeted price on a round carrying three items, never one price repeated", async () => {
    const fixture = await seedWorkOrderRefs();
    const workOrder = openWorkOrder(fixture);
    await repository.save(workOrder);
    const reloaded = await repository.findByNumber(workOrder.number);
    if (!reloaded) throw new Error('work order not found');
    reloaded.startDiagnosis({ actorUserId: fixture.creator.externalId, now: new Date() });
    const prices = [15099, 8000, 5000];
    for (const price of prices) {
      const service = await insertService(price);
      reloaded.addService({
        itemId: WorkOrderItemId.create(randomUUID()),
        serviceId: service.externalId,
        serviceName: `Servico ${price}`,
        unitPrice: Money.fromCents(price),
        actorUserId: fixture.creator.externalId,
        now: new Date(),
      });
    }
    reloaded.completeDiagnosis({
      budgetId: BudgetId.create(randomUUID()),
      actorUserId: fixture.creator.externalId,
      now: new Date(),
    });
    await repository.save(reloaded);

    const final = await repository.findByNumber(workOrder.number);
    if (!final) throw new Error('work order not found after save');
    const persistedPrices = final.serviceItems
      .map((item) => item.budgetedUnitPrice?.cents)
      .sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(persistedPrices).toEqual([...prices].sort((a, b) => a - b));
    expect(final.budgets[0].total.cents).toBe(prices.reduce((sum, price) => sum + price, 0));
  });

  it('updates the existing round-one row in place on a regeneration, rather than inserting a second', async () => {
    const fixture = await seedWorkOrderRefs();
    const workOrder = openWorkOrder(fixture);
    await repository.save(workOrder);
    let reloaded = await repository.findByNumber(workOrder.number);
    if (!reloaded) throw new Error('work order not found');
    reloaded.startDiagnosis({ actorUserId: fixture.creator.externalId, now: new Date() });
    const service = await insertService(15099);
    reloaded.addService({
      itemId: WorkOrderItemId.create(randomUUID()),
      serviceId: service.externalId,
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
      actorUserId: fixture.creator.externalId,
      now: new Date(),
    });
    reloaded.completeDiagnosis({
      budgetId: BudgetId.create(randomUUID()),
      actorUserId: fixture.creator.externalId,
      now: new Date(),
    });
    await repository.save(reloaded);

    reloaded = await repository.findByNumber(workOrder.number);
    if (!reloaded) throw new Error('work order not found');
    reloaded.rejectBudget({ actorUserId: fixture.creator.externalId, now: new Date() });
    await repository.save(reloaded);

    reloaded = await repository.findByNumber(workOrder.number);
    if (!reloaded) throw new Error('work order not found');
    const secondService = await insertService(8000);
    reloaded.addService({
      itemId: WorkOrderItemId.create(randomUUID()),
      serviceId: secondService.externalId,
      serviceName: 'Alinhamento',
      unitPrice: Money.fromCents(8000),
      actorUserId: fixture.creator.externalId,
      now: new Date(),
    });
    reloaded.completeDiagnosis({
      budgetId: BudgetId.create(randomUUID()),
      actorUserId: fixture.creator.externalId,
      now: new Date(),
    });
    await repository.save(reloaded);

    const internalId = await workOrderInternalId(workOrder.id.value);
    const rows: Array<{ round: number; status: string; total_cents: string }> =
      await dataSource.query(
        `SELECT round, status, total_cents FROM work_order_budgets WHERE work_order_id = $1`,
        [internalId],
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].round).toBe(1);
    expect(rows[0].status).toBe('PENDING');
    expect(Number(rows[0].total_cents)).toBe(15099 + 8000);
  });

  it('leaves exactly one row when two supplementary submissions for the same work order race, the loser raising the unique violation', async () => {
    const fixture = await seedWorkOrderRefs();
    const workOrder = openWorkOrder(fixture);
    await repository.save(workOrder);
    let reloaded = await repository.findByNumber(workOrder.number);
    if (!reloaded) throw new Error('work order not found');
    reloaded.startDiagnosis({ actorUserId: fixture.creator.externalId, now: new Date() });
    const service = await insertService(15099);
    reloaded.addService({
      itemId: WorkOrderItemId.create(randomUUID()),
      serviceId: service.externalId,
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
      actorUserId: fixture.creator.externalId,
      now: new Date(),
    });
    reloaded.completeDiagnosis({
      budgetId: BudgetId.create(randomUUID()),
      actorUserId: fixture.creator.externalId,
      now: new Date(),
    });
    await repository.save(reloaded);
    reloaded = await repository.findByNumber(workOrder.number);
    if (!reloaded) throw new Error('work order not found');
    reloaded.approveBudget({ actorUserId: fixture.creator.externalId, now: new Date() });
    await repository.save(reloaded);

    // Two independent loads of the same IN_EXECUTION work order, each about to submit round two.
    const first = await repository.findByNumber(workOrder.number);
    const second = await repository.findByNumber(workOrder.number);
    if (!first || !second) throw new Error('work order not found');
    const extraServiceOne = await insertService(3000);
    first.addService({
      itemId: WorkOrderItemId.create(randomUUID()),
      serviceId: extraServiceOne.externalId,
      serviceName: 'Extra 1',
      unitPrice: Money.fromCents(3000),
      actorUserId: fixture.creator.externalId,
      now: new Date(),
    });
    first.submitSupplementaryBudget({
      budgetId: BudgetId.create(randomUUID()),
      actorUserId: fixture.creator.externalId,
      now: new Date(),
    });
    const extraServiceTwo = await insertService(4000);
    second.addService({
      itemId: WorkOrderItemId.create(randomUUID()),
      serviceId: extraServiceTwo.externalId,
      serviceName: 'Extra 2',
      unitPrice: Money.fromCents(4000),
      actorUserId: fixture.creator.externalId,
      now: new Date(),
    });
    second.submitSupplementaryBudget({
      budgetId: BudgetId.create(randomUUID()),
      actorUserId: fixture.creator.externalId,
      now: new Date(),
    });

    const results = await Promise.allSettled([repository.save(first), repository.save(second)]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const internalId = await workOrderInternalId(workOrder.id.value);
    const rows: Array<{ round: number }> = await dataSource.query(
      `SELECT round FROM work_order_budgets WHERE work_order_id = $1 AND round = 2`,
      [internalId],
    );
    expect(rows).toHaveLength(1);
  });

  it('leaves neither the budget row nor the status change behind when the write fails mid-transaction', async () => {
    const fixture1 = await seedWorkOrderRefs();
    const first = openWorkOrder(fixture1);
    await repository.save(first);
    const reloadedFirst = await repository.findByNumber(first.number);
    if (!reloadedFirst) throw new Error('work order not found');
    reloadedFirst.startDiagnosis({ actorUserId: fixture1.creator.externalId, now: new Date() });
    const reusedItemId = WorkOrderItemId.create(randomUUID());
    const service1 = await insertService(15099);
    reloadedFirst.addService({
      itemId: reusedItemId,
      serviceId: service1.externalId,
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
      actorUserId: fixture1.creator.externalId,
      now: new Date(),
    });
    reloadedFirst.completeDiagnosis({
      budgetId: BudgetId.create(randomUUID()),
      actorUserId: fixture1.creator.externalId,
      now: new Date(),
    });
    await repository.save(reloadedFirst);

    // Second work order's item reuses the first's item external id - a real unique-violation the
    // domain layer cannot see coming, forced deliberately mid-transaction, after the budget row
    // for this second work order has already been inserted.
    const fixture2 = await seedWorkOrderRefs();
    const second = openWorkOrder(fixture2);
    await repository.save(second);
    const reloadedSecond = await repository.findByNumber(second.number);
    if (!reloadedSecond) throw new Error('work order not found');
    reloadedSecond.startDiagnosis({ actorUserId: fixture2.creator.externalId, now: new Date() });
    const service2 = await insertService(8000);
    reloadedSecond.addService({
      itemId: reusedItemId,
      serviceId: service2.externalId,
      serviceName: 'Alinhamento',
      unitPrice: Money.fromCents(8000),
      actorUserId: fixture2.creator.externalId,
      now: new Date(),
    });
    reloadedSecond.completeDiagnosis({
      budgetId: BudgetId.create(randomUUID()),
      actorUserId: fixture2.creator.externalId,
      now: new Date(),
    });

    await expect(repository.save(reloadedSecond)).rejects.toThrow();

    const internalId = await workOrderInternalId(second.id.value);
    const budgetRows: Array<{ id: number }> = await dataSource.query(
      `SELECT id FROM work_order_budgets WHERE work_order_id = $1`,
      [internalId],
    );
    expect(budgetRows).toHaveLength(0);
    const statusRows: Array<{ status: string }> = await dataSource.query(
      `SELECT status FROM work_orders WHERE id = $1`,
      [internalId],
    );
    // The whole transaction rolled back, including the in-memory startDiagnosis this save
    // attempted to persist - the DB still shows the status from the last successful save.
    expect(statusRows[0].status).toBe('RECEIVED');
  });
});
