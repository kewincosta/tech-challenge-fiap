import { describe, expect, it } from 'vitest';
import { stubEventBus, stubQueryBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { InMemoryWorkOrderRepository } from '../../../../../../test/support/fakes/in-memory-work-order.repository';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { EffectiveAccessDto } from '../../../../authorization/application/dtos/effective-access.dto';
import { GetUserEffectiveAccessQuery } from '../../../../authorization/application/queries/get-user-effective-access/get-user-effective-access.query';
import { CustomerSummaryDto } from '../../../../customers/application/ports/customer-query.port';
import { GetCustomerByUserIdQuery } from '../../../../customers/application/queries/get-customer-by-user-id/get-customer-by-user-id.query';
import { BudgetStatus } from '../../../domain/budget-status';
import { Budget } from '../../../domain/entities/budget';
import { WorkOrder } from '../../../domain/entities/work-order';
import { WorkOrderServiceItem } from '../../../domain/entities/work-order-service-item';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderStateError } from '../../../domain/errors/work-order-state.error';
import { BudgetId } from '../../../domain/value-objects/budget-id';
import { WorkOrderId } from '../../../domain/value-objects/work-order-id';
import { WorkOrderItemId } from '../../../domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { WorkOrderStatus } from '../../../domain/work-order-status';
import { BudgetDecisionAuthorizer } from '../../services/budget-decision.authorizer';
import { ApproveBudgetCommand } from './approve-budget.command';
import { ApproveBudgetHandler } from './approve-budget.handler';

const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';
const CUSTOMER_ACTOR_ID = '55555555-5555-4555-8555-555555555555';
const NUMBER = 'A1B090-2026';
const NOW = new Date('2026-08-31T12:00:00.000Z');

function customer(id: string): CustomerSummaryDto {
  return {
    id,
    userId: CUSTOMER_ACTOR_ID,
    name: 'Jane Doe',
    email: 'jane@example.com',
    document: '12345678900',
    address: null,
    phoneNumber: null,
    status: 'ACTIVE',
  };
}

function stubAuthorizer(
  access: EffectiveAccessDto,
  customerDto: CustomerSummaryDto | null,
): BudgetDecisionAuthorizer {
  const queryBus = stubQueryBus();
  queryBus.execute.mockImplementation((query: unknown) => {
    if (query instanceof GetUserEffectiveAccessQuery) {
      return Promise.resolve(access);
    }
    if (query instanceof GetCustomerByUserIdQuery) {
      return Promise.resolve(customerDto);
    }
    return Promise.resolve(null);
  });
  return new BudgetDecisionAuthorizer(queryBus.bus);
}

function restoreAwaitingApproval(): WorkOrder {
  const budget = Budget.restore({
    id: BudgetId.create('88888888-8888-4888-8888-888888888888'),
    round: 1,
    total: Money.fromCents(15099),
    status: BudgetStatus.Pending,
    generatedAt: NOW,
    decidedAt: null,
    decidedByUserId: null,
  });
  const item = WorkOrderServiceItem.restore({
    id: WorkOrderItemId.create('66666666-6666-4666-8666-666666666666'),
    serviceId: '77777777-7777-4777-8777-777777777777',
    serviceName: 'Troca de oleo',
    unitPrice: Money.fromCents(15099),
    budgetRound: 1,
    budgetedUnitPrice: Money.fromCents(15099),
  });
  return WorkOrder.restore({
    id: WorkOrderId.create('11111111-1111-4111-8111-111111111111'),
    number: WorkOrderNumber.create(NUMBER),
    customerId: CUSTOMER_ID,
    vehicleId: VEHICLE_ID,
    assignedMechanicUserId: null,
    createdByUserId: CREATOR_ID,
    status: WorkOrderStatus.AwaitingApproval,
    customerName: 'Jane Doe',
    vehiclePlate: 'ABC1234',
    vehicleBrand: 'Toyota',
    vehicleModel: 'Corolla',
    vehicleYear: 2020,
    createdAt: NOW,
    updatedAt: NOW,
    serviceItems: [item],
    partItems: [],
    diagnosisStartedAt: NOW,
    diagnosisCompletedAt: NOW,
    budgets: [budget],
    budgetDecidedAt: null,
    budgetDecidedByUserId: null,
    executionStartedAt: null,
  });
}

function buildReceivedWorkOrder(): WorkOrder {
  return WorkOrder.open({
    id: WorkOrderId.create('11111111-1111-4111-8111-111111111111'),
    number: WorkOrderNumber.create(NUMBER),
    customerId: CUSTOMER_ID,
    vehicleId: VEHICLE_ID,
    createdByUserId: CREATOR_ID,
    customerName: 'Jane Doe',
    vehiclePlate: 'ABC1234',
    vehicleBrand: 'Toyota',
    vehicleModel: 'Corolla',
    vehicleYear: 2020,
    now: NOW,
  });
}

function makeHandler(authorizer: BudgetDecisionAuthorizer) {
  const workOrders = new InMemoryWorkOrderRepository();
  const eventBus = stubEventBus();
  const handler = new ApproveBudgetHandler(workOrders, authorizer, new FakeClock(), eventBus.bus);
  return { handler, workOrders, eventBus };
}

describe('ApproveBudgetHandler', () => {
  it('approves the pending round and publishes both recorded events when the authorizer admits the actor', async () => {
    const authorizer = stubAuthorizer({ roles: ['CUSTOMER'], permissions: [] }, customer(CUSTOMER_ID));
    const { handler, workOrders, eventBus } = makeHandler(authorizer);
    await workOrders.save(restoreAwaitingApproval());

    await handler.execute(new ApproveBudgetCommand(NUMBER, CUSTOMER_ACTOR_ID));

    const updated = workOrders.workOrders[0];
    expect(updated.status).toBe(WorkOrderStatus.InExecution);
    expect(eventBus.publishAll).toHaveBeenCalledTimes(1);
    expect((eventBus.publishAll.mock.calls[0] as unknown[][])[0]).toHaveLength(2);
  });

  it('refuses an actor the authorizer refuses, and never reaches save', async () => {
    const otherCustomerId = '66666666-6666-4666-8666-666666666666';
    const authorizer = stubAuthorizer(
      { roles: ['CUSTOMER'], permissions: [] },
      customer(otherCustomerId),
    );
    const { handler, workOrders } = makeHandler(authorizer);
    await workOrders.save(restoreAwaitingApproval());

    await expect(
      handler.execute(new ApproveBudgetCommand(NUMBER, CUSTOMER_ACTOR_ID)),
    ).rejects.toThrow(WorkOrderNotFoundError);
    expect(workOrders.workOrders[0].status).toBe(WorkOrderStatus.AwaitingApproval);
  });

  it('refuses an unknown work order before the authorizer is consulted', async () => {
    const authorizer = stubAuthorizer({ roles: [], permissions: [] }, null);
    const { handler, workOrders } = makeHandler(authorizer);

    await expect(
      handler.execute(new ApproveBudgetCommand('ZZZZZZ-2026', CUSTOMER_ACTOR_ID)),
    ).rejects.toThrow(WorkOrderNotFoundError);
    expect(workOrders.workOrders).toHaveLength(0);
  });

  it("lets the aggregate's wrong-state error travel out untouched", async () => {
    const authorizer = stubAuthorizer(
      { roles: [], permissions: ['work-orders:decide'] },
      null,
    );
    const { handler, workOrders } = makeHandler(authorizer);
    await workOrders.save(buildReceivedWorkOrder());

    await expect(
      handler.execute(new ApproveBudgetCommand(NUMBER, CUSTOMER_ACTOR_ID)),
    ).rejects.toThrow(WorkOrderStateError);
  });
});
