import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Money } from '../../src/shared/domain/value-objects/money';
import { WorkOrder } from '../../src/modules/work-orders/domain/entities/work-order';
import { BudgetId } from '../../src/modules/work-orders/domain/value-objects/budget-id';
import { WorkOrderId } from '../../src/modules/work-orders/domain/value-objects/work-order-id';
import { WorkOrderItemId } from '../../src/modules/work-orders/domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../src/modules/work-orders/domain/value-objects/work-order-number';
import { WorkOrderOrmEntity } from '../../src/modules/work-orders/infrastructure/persistence/work-order.orm-entity';
import { WorkOrderBudgetOrmEntity } from '../../src/modules/work-orders/infrastructure/persistence/work-order-budget.orm-entity';
import { WorkOrderServiceOrmEntity } from '../../src/modules/work-orders/infrastructure/persistence/work-order-service.orm-entity';
import { WorkOrderPartOrmEntity } from '../../src/modules/work-orders/infrastructure/persistence/work-order-part.orm-entity';
import { TypeOrmWorkOrderRepository } from '../../src/modules/work-orders/infrastructure/persistence/typeorm-work-order.repository';
import { TypeOrmWorkOrderQueryAdapter } from '../../src/modules/work-orders/infrastructure/persistence/typeorm-work-order-query.adapter';
import { createTestDataSource } from '../support/db';

let dataSource: DataSource;
let repository: TypeOrmWorkOrderRepository;
let queryAdapter: TypeOrmWorkOrderQueryAdapter;

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
  queryAdapter = new TypeOrmWorkOrderQueryAdapter(dataSource);
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
      `wob-query-${Math.random().toString(36).slice(2)}@example.com`,
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

describe('TypeOrmWorkOrderQueryAdapter - budget rounds', () => {
  it('returns an empty round list for a work order carrying no budget yet', async () => {
    const fixture = await seedWorkOrderRefs();
    const workOrder = openWorkOrder(fixture);
    await repository.save(workOrder);

    const dto = await queryAdapter.getByNumber(workOrder.number.value);

    expect(dto?.budgets).toEqual([]);
  });

  it('returns every round, ordered by number, each with its total, status, generation moment and decision', async () => {
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
    reloaded = await repository.findByNumber(workOrder.number);
    if (!reloaded) throw new Error('work order not found');
    const extraService = await insertService(3000);
    reloaded.addService({
      itemId: WorkOrderItemId.create(randomUUID()),
      serviceId: extraService.externalId,
      serviceName: 'Extra',
      unitPrice: Money.fromCents(3000),
      actorUserId: fixture.creator.externalId,
      now: new Date(),
    });
    reloaded.submitSupplementaryBudget({
      budgetId: BudgetId.create(randomUUID()),
      actorUserId: fixture.creator.externalId,
      now: new Date(),
    });
    await repository.save(reloaded);

    const dto = await queryAdapter.getByNumber(workOrder.number.value);

    expect(dto?.budgets).toHaveLength(2);
    expect(dto?.budgets.map((budget) => budget.round)).toEqual([1, 2]);
    expect(dto?.budgets[0].totalCents).toBe(15099);
    expect(dto?.budgets[0].status).toBe('APPROVED');
    expect(dto?.budgets[0].decidedByUserId).toBe(fixture.creator.externalId);
    expect(dto?.budgets[0].decidedAt).not.toBeNull();
    expect(dto?.budgets[0].generatedAt).not.toBeNull();
    expect(dto?.budgets[1].totalCents).toBe(3000);
    expect(dto?.budgets[1].status).toBe('PENDING');
    expect(dto?.budgets[1].decidedByUserId).toBeNull();
  });

  it("carries each item's budget round and budgeted price, null while the item is still a draft", async () => {
    const fixture = await seedWorkOrderRefs();
    const workOrder = openWorkOrder(fixture);
    await repository.save(workOrder);
    let reloaded = await repository.findByNumber(workOrder.number);
    if (!reloaded) throw new Error('work order not found');
    reloaded.startDiagnosis({ actorUserId: fixture.creator.externalId, now: new Date() });
    const attachedService = await insertService(15099);
    reloaded.addService({
      itemId: WorkOrderItemId.create(randomUUID()),
      serviceId: attachedService.externalId,
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
    const draftService = await insertService(3000);
    reloaded.addService({
      itemId: WorkOrderItemId.create(randomUUID()),
      serviceId: draftService.externalId,
      serviceName: 'Extra',
      unitPrice: Money.fromCents(3000),
      actorUserId: fixture.creator.externalId,
      now: new Date(),
    });
    await repository.save(reloaded);

    const dto = await queryAdapter.getByNumber(workOrder.number.value);
    if (!dto) throw new Error('dto not found');
    const attached = dto.serviceItems.find((item) => item.serviceName === 'Troca de oleo');
    const draft = dto.serviceItems.find((item) => item.serviceName === 'Extra');

    expect(attached?.budgetRound).toBe(1);
    expect(attached?.budgetedUnitPriceCents).toBe(15099);
    expect(draft?.budgetRound).toBeNull();
    expect(draft?.budgetedUnitPriceCents).toBeNull();
  });

  it("gives the list route's summaries the same budget fields as the detail read", async () => {
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

    const detail = await queryAdapter.getByNumber(workOrder.number.value);
    const list = await queryAdapter.listByStatus('AWAITING_APPROVAL');
    const listed = list.find((summary) => summary.number === workOrder.number.value);

    expect(listed?.budgets).toEqual(detail?.budgets);
    expect(listed?.serviceItems[0].budgetRound).toBe(detail?.serviceItems[0].budgetRound);
    expect(listed?.serviceItems[0].budgetedUnitPriceCents).toBe(
      detail?.serviceItems[0].budgetedUnitPriceCents,
    );
  });
});
