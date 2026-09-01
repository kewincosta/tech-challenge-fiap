import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Money } from '../../../../shared/domain/value-objects/money';
import { BudgetStatus } from '../../domain/budget-status';
import { Budget } from '../../domain/entities/budget';
import { WorkOrder } from '../../domain/entities/work-order';
import { WorkOrderPartItem } from '../../domain/entities/work-order-part-item';
import { WorkOrderServiceItem } from '../../domain/entities/work-order-service-item';
import { BudgetId } from '../../domain/value-objects/budget-id';
import { PlannedQuantity } from '../../domain/value-objects/planned-quantity';
import { WorkOrderId } from '../../domain/value-objects/work-order-id';
import { WorkOrderItemId } from '../../domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../domain/value-objects/work-order-number';
import { WorkOrderStatus } from '../../domain/work-order-status';
import { WorkOrderBudgetOrmEntity } from './work-order-budget.orm-entity';
import { WorkOrderServiceOrmEntity } from './work-order-service.orm-entity';
import { WorkOrderMapper, ResolvedWorkOrderIds } from './work-order.mapper';
import { WorkOrderOrmEntity } from './work-order.orm-entity';

const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';
const MECHANIC_ID = '55555555-5555-4555-8555-555555555555';
const NOW = new Date('2026-08-31T12:00:00.000Z');

function baseResolved(): ResolvedWorkOrderIds {
  return {
    customerExternalId: CUSTOMER_ID,
    vehicleExternalId: VEHICLE_ID,
    createdByExternalId: CREATOR_ID,
    assignedMechanicExternalId: MECHANIC_ID,
    budgetDecidedByExternalId: CUSTOMER_ID,
    serviceExternalIdByInternalId: new Map([['9001', '77777777-7777-4777-8777-777777777777']]),
    inventoryItemExternalIdByInternalId: new Map(),
    budgetDeciderExternalIdByInternalId: new Map([['9101', CUSTOMER_ID]]),
  };
}

function workOrderRowFixture(): WorkOrderOrmEntity {
  const row = new WorkOrderOrmEntity();
  row.externalId = randomUUID();
  row.number = 'A1B090-2026';
  row.status = WorkOrderStatus.AwaitingApproval;
  row.customerName = 'Jane Doe';
  row.vehiclePlate = 'ABC1234';
  row.vehicleBrand = 'Toyota';
  row.vehicleModel = 'Corolla';
  row.vehicleYear = 2020;
  row.createdAt = NOW;
  row.updatedAt = NOW;
  row.diagnosisStartedAt = NOW;
  row.diagnosisCompletedAt = NOW;
  row.budgetDecidedAt = null;
  row.executionStartedAt = null;
  return row;
}

describe('WorkOrderMapper.toOrm', () => {
  function workOrderWithTwoRounds(): WorkOrder {
    const roundOne = Budget.restore({
      id: BudgetId.create(randomUUID()),
      round: 1,
      total: Money.fromCents(15099),
      status: BudgetStatus.Approved,
      generatedAt: NOW,
      decidedAt: NOW,
      decidedByUserId: CUSTOMER_ID,
    });
    const roundTwo = Budget.restore({
      id: BudgetId.create(randomUUID()),
      round: 2,
      total: Money.fromCents(8000),
      status: BudgetStatus.Pending,
      generatedAt: NOW,
      decidedAt: null,
      decidedByUserId: null,
    });
    const attachedItem = WorkOrderServiceItem.restore({
      id: WorkOrderItemId.create(randomUUID()),
      serviceId: '77777777-7777-4777-8777-777777777777',
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
      budgetRound: 1,
      budgetedUnitPrice: Money.fromCents(15099),
    });
    return WorkOrder.restore({
      id: WorkOrderId.create(randomUUID()),
      number: WorkOrderNumber.create('A1B090-2026'),
      customerId: CUSTOMER_ID,
      vehicleId: VEHICLE_ID,
      assignedMechanicUserId: MECHANIC_ID,
      createdByUserId: CREATOR_ID,
      status: WorkOrderStatus.InExecution,
      customerName: 'Jane Doe',
      vehiclePlate: 'ABC1234',
      vehicleBrand: 'Toyota',
      vehicleModel: 'Corolla',
      vehicleYear: 2020,
      createdAt: NOW,
      updatedAt: NOW,
      serviceItems: [attachedItem],
      partItems: [],
      diagnosisStartedAt: NOW,
      diagnosisCompletedAt: NOW,
      budgets: [roundOne, roundTwo],
      budgetDecidedAt: NOW,
      budgetDecidedByUserId: CUSTOMER_ID,
      executionStartedAt: NOW,
    });
  }

  it('emits one budget row per round, with the total in cents as a string', () => {
    const { budgetRows } = WorkOrderMapper.toOrm(workOrderWithTwoRounds());

    expect(budgetRows).toHaveLength(2);
    expect(budgetRows[0].round).toBe(1);
    expect(budgetRows[0].totalCents).toBe('15099');
    expect(typeof budgetRows[0].totalCents).toBe('string');
    expect(budgetRows[1].round).toBe(2);
    expect(budgetRows[1].totalCents).toBe('8000');
  });

  it('emits the budgeted unit price on an attached item, as a string', () => {
    const { serviceRows } = WorkOrderMapper.toOrm(workOrderWithTwoRounds());

    expect(serviceRows[0].budgetedUnitPriceCents).toBe('15099');
    expect(typeof serviceRows[0].budgetedUnitPriceCents).toBe('string');
  });

  it('emits a null budgeted unit price for a draft item', () => {
    const draftItem = WorkOrderServiceItem.add({
      id: WorkOrderItemId.create(randomUUID()),
      serviceId: '77777777-7777-4777-8777-777777777777',
      serviceName: 'Alinhamento',
      unitPrice: Money.fromCents(8000),
    });
    const workOrder = WorkOrder.restore({
      id: WorkOrderId.create(randomUUID()),
      number: WorkOrderNumber.create('A1B090-2026'),
      customerId: CUSTOMER_ID,
      vehicleId: VEHICLE_ID,
      assignedMechanicUserId: null,
      createdByUserId: CREATOR_ID,
      status: WorkOrderStatus.InExecution,
      customerName: 'Jane Doe',
      vehiclePlate: 'ABC1234',
      vehicleBrand: 'Toyota',
      vehicleModel: 'Corolla',
      vehicleYear: 2020,
      createdAt: NOW,
      updatedAt: NOW,
      serviceItems: [draftItem],
      partItems: [],
      diagnosisStartedAt: NOW,
      diagnosisCompletedAt: NOW,
      budgets: [],
      budgetDecidedAt: null,
      budgetDecidedByUserId: null,
      executionStartedAt: null,
    });

    const { serviceRows } = WorkOrderMapper.toOrm(workOrder);

    expect(serviceRows[0].budgetedUnitPriceCents).toBeNull();
  });
});

describe('WorkOrderMapper.toDomain', () => {
  it('rebuilds the rounds ordered by round number, whatever order the rows arrive in', () => {
    const row = workOrderRowFixture();
    const roundTwoRow = new WorkOrderBudgetOrmEntity();
    roundTwoRow.id = '9102';
    roundTwoRow.externalId = randomUUID();
    roundTwoRow.round = 2;
    roundTwoRow.totalCents = '8000';
    roundTwoRow.status = 'PENDING';
    roundTwoRow.generatedAt = NOW;
    roundTwoRow.decidedAt = null;
    roundTwoRow.decidedByInternalId = null;
    const roundOneRow = new WorkOrderBudgetOrmEntity();
    roundOneRow.id = '9101';
    roundOneRow.externalId = randomUUID();
    roundOneRow.round = 1;
    roundOneRow.totalCents = '15099';
    roundOneRow.status = 'APPROVED';
    roundOneRow.generatedAt = NOW;
    roundOneRow.decidedAt = NOW;
    roundOneRow.decidedByInternalId = '9101';

    const workOrder = WorkOrderMapper.toDomain(row, [], [], [roundTwoRow, roundOneRow], baseResolved());

    expect(workOrder.budgets.map((budget) => budget.round)).toEqual([1, 2]);
  });

  it('maps a round carrying a decision back to its decider and moment', () => {
    const row = workOrderRowFixture();
    const budgetRow = new WorkOrderBudgetOrmEntity();
    budgetRow.id = '9101';
    budgetRow.externalId = randomUUID();
    budgetRow.round = 1;
    budgetRow.totalCents = '15099';
    budgetRow.status = 'APPROVED';
    budgetRow.generatedAt = NOW;
    budgetRow.decidedAt = NOW;
    budgetRow.decidedByInternalId = '9101';

    const workOrder = WorkOrderMapper.toDomain(row, [], [], [budgetRow], baseResolved());

    expect(workOrder.budgets[0].decidedAt).toEqual(NOW);
    expect(workOrder.budgets[0].decidedByUserId).toBe(CUSTOMER_ID);
  });

  it("resolves an item's budget round by cross-referencing its budget_id against the loaded rows", () => {
    const row = workOrderRowFixture();
    const budgetRow = new WorkOrderBudgetOrmEntity();
    budgetRow.id = '9101';
    budgetRow.externalId = randomUUID();
    budgetRow.round = 1;
    budgetRow.totalCents = '15099';
    budgetRow.status = 'PENDING';
    budgetRow.generatedAt = NOW;
    budgetRow.decidedAt = null;
    budgetRow.decidedByInternalId = null;

    const serviceRow = new WorkOrderServiceOrmEntity();
    serviceRow.id = '8001';
    serviceRow.externalId = randomUUID();
    serviceRow.workOrderInternalId = row.id;
    serviceRow.serviceInternalId = '9001';
    serviceRow.serviceName = 'Troca de oleo';
    serviceRow.unitPriceCents = '15099';
    serviceRow.createdAt = NOW;
    serviceRow.budgetInternalId = '9101';
    serviceRow.budgetedUnitPriceCents = '15099';

    const workOrder = WorkOrderMapper.toDomain(row, [serviceRow], [], [budgetRow], baseResolved());

    expect(workOrder.serviceItems[0].budgetRound).toBe(1);
    expect(workOrder.serviceItems[0].budgetedUnitPrice?.cents).toBe(15099);
    expect(workOrder.serviceItems[0].isDraft).toBe(false);
  });

  it('leaves a draft item (no budget_id) with a null round and a null budgeted price', () => {
    const row = workOrderRowFixture();
    const serviceRow = new WorkOrderServiceOrmEntity();
    serviceRow.id = '8001';
    serviceRow.externalId = randomUUID();
    serviceRow.workOrderInternalId = row.id;
    serviceRow.serviceInternalId = '9001';
    serviceRow.serviceName = 'Alinhamento';
    serviceRow.unitPriceCents = '8000';
    serviceRow.createdAt = NOW;
    serviceRow.budgetInternalId = null;
    serviceRow.budgetedUnitPriceCents = null;

    const workOrder = WorkOrderMapper.toDomain(row, [serviceRow], [], [], baseResolved());

    expect(workOrder.serviceItems[0].budgetRound).toBeNull();
    expect(workOrder.serviceItems[0].budgetedUnitPrice).toBeNull();
    expect(workOrder.serviceItems[0].isDraft).toBe(true);
  });

  it('returns an empty round list for a work order carrying no budget', () => {
    const row = workOrderRowFixture();

    const workOrder = WorkOrderMapper.toDomain(row, [], [], [], baseResolved());

    expect(workOrder.budgets).toEqual([]);
  });
});
