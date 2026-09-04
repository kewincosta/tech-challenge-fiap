import { describe, expect, it } from 'vitest';
import { stubEventBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { InMemoryWorkOrderRepository } from '../../../../../../test/support/fakes/in-memory-work-order.repository';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { BudgetStatus } from '../../../domain/budget-status';
import { Budget } from '../../../domain/entities/budget';
import { WorkOrder } from '../../../domain/entities/work-order';
import { WorkOrderServiceItem } from '../../../domain/entities/work-order-service-item';
import { DiscountExceedsChargedTotalError } from '../../../domain/errors/discount-exceeds-charged-total.error';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderStateError } from '../../../domain/errors/work-order-state.error';
import { BudgetId } from '../../../domain/value-objects/budget-id';
import { WorkOrderId } from '../../../domain/value-objects/work-order-id';
import { WorkOrderItemId } from '../../../domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { WorkOrderStatus } from '../../../domain/work-order-status';
import { ApplyDiscountCommand } from './apply-discount.command';
import { ApplyDiscountHandler } from './apply-discount.handler';

const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';
const MECHANIC_ID = '55555555-5555-4555-8555-555555555555';
const NUMBER = 'A1B090-2026';
const NOW = new Date('2026-08-31T12:00:00.000Z');

function restoreInExecution(status: WorkOrderStatus = WorkOrderStatus.InExecution): WorkOrder {
  const budget = Budget.restore({
    id: BudgetId.create('88888888-8888-4888-8888-888888888888'),
    round: 1,
    total: Money.fromCents(15099),
    status: BudgetStatus.Approved,
    generatedAt: NOW,
    decidedAt: NOW,
    decidedByUserId: CUSTOMER_ID,
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
    assignedMechanicUserId: MECHANIC_ID,
    createdByUserId: CREATOR_ID,
    status,
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
    budgetDecidedAt: NOW,
    budgetDecidedByUserId: CUSTOMER_ID,
    executionStartedAt: NOW,
  });
}

function makeHandler() {
  const workOrders = new InMemoryWorkOrderRepository();
  const eventBus = stubEventBus();
  const handler = new ApplyDiscountHandler(workOrders, new FakeClock(NOW), eventBus.bus);
  return { handler, workOrders, eventBus };
}

describe('ApplyDiscountHandler', () => {
  it('refuses an unknown work order with WorkOrderNotFoundError', async () => {
    const { handler, workOrders } = makeHandler();

    await expect(
      handler.execute(new ApplyDiscountCommand('ZZZZZZ-2026', 1000, 'x', CREATOR_ID)),
    ).rejects.toThrow(WorkOrderNotFoundError);
    expect(workOrders.workOrders).toHaveLength(0);
  });

  it('carries the amount to the aggregate as Money, never as a bare number', async () => {
    const { handler, workOrders } = makeHandler();
    await workOrders.save(restoreInExecution());

    await handler.execute(
      new ApplyDiscountCommand(NUMBER, 5000, 'Combinado com o cliente', CREATOR_ID),
    );

    const updated = workOrders.workOrders[0];
    expect(updated.discount.equals(Money.fromCents(5000))).toBe(true);
    expect(updated.discountNote).toBe('Combinado com o cliente');
  });

  it("lets the aggregate's discount-exceeds-total error travel out untouched", async () => {
    const { handler, workOrders } = makeHandler();
    await workOrders.save(restoreInExecution());

    await expect(
      handler.execute(new ApplyDiscountCommand(NUMBER, 999999, 'x', CREATOR_ID)),
    ).rejects.toThrow(DiscountExceedsChargedTotalError);
  });

  it("lets the aggregate's wrong-state error travel out untouched", async () => {
    const { handler, workOrders } = makeHandler();
    await workOrders.save(restoreInExecution(WorkOrderStatus.Received));

    await expect(
      handler.execute(new ApplyDiscountCommand(NUMBER, 1000, 'x', CREATOR_ID)),
    ).rejects.toThrow(WorkOrderStateError);
  });

  it('publishes the recorded events after the save', async () => {
    const { handler, workOrders, eventBus } = makeHandler();
    await workOrders.save(restoreInExecution());

    await handler.execute(new ApplyDiscountCommand(NUMBER, 1000, 'x', CREATOR_ID));

    expect(eventBus.publishAll).toHaveBeenCalledTimes(1);
  });
});
