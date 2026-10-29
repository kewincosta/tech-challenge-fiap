import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeStockLedger } from '../../../../../../test/support/fakes/fake-stock-ledger';
import { FakeWorkOrderActors } from '../../../../../../test/support/fakes/fake-work-order-actors';
import { FakeTransactionRunner } from '../../../../../../test/support/fakes/fake-transaction-runner';
import { InMemoryWorkOrderRepository } from '../../../../../../test/support/fakes/in-memory-work-order.repository';
import { RecordingDomainEventPublisher } from '../../../../../../test/support/fakes/recording-domain-event-publisher';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { WorkOrder } from '../../../domain/entities/work-order';
import { WorkOrderPartItem } from '../../../domain/entities/work-order-part-item';
import { CancelInExecutionForbiddenError } from '../../../domain/errors/cancel-in-execution-forbidden.error';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderCanceled } from '../../../domain/events/work-order-canceled.event';
import { PlannedQuantity } from '../../../domain/value-objects/planned-quantity';
import { WorkOrderId } from '../../../domain/value-objects/work-order-id';
import { WorkOrderItemId } from '../../../domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { WorkOrderStatus } from '../../../domain/work-order-status';
import { ActorCapabilities } from '../../ports/work-order-actors.port';
import { CancellationAuthorizer } from '../../services/cancellation.authorizer';
import { CancelWorkOrderCommand } from './cancel-work-order.command';
import { CancelWorkOrderHandler } from './cancel-work-order.handler';

const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';
const ACTOR_ID = '99999999-9999-4999-8999-999999999999';
const ITEM_ID = WorkOrderItemId.create('66666666-6666-4666-8666-666666666666');
const INVENTORY_ITEM_ID = '77777777-7777-4777-8777-777777777777';
const NUMBER = 'A1B090-2026';
const NOW = new Date('2026-08-31T12:00:00.000Z');

function partItem(withdrawnQuantity: number): WorkOrderPartItem {
  return WorkOrderPartItem.restore({
    id: ITEM_ID,
    inventoryItemId: INVENTORY_ITEM_ID,
    sku: 'FLT-001',
    itemName: 'Filtro de oleo',
    unitPrice: Money.fromCents(2500),
    plannedQuantity: PlannedQuantity.create(3),
    withdrawnQuantity,
    budgetRound: null,
    budgetedUnitPrice: null,
  });
}

function restoreInExecution(withdrawnQuantity: number): WorkOrder {
  return WorkOrder.restore({
    id: WorkOrderId.create('11111111-1111-4111-8111-111111111111'),
    number: WorkOrderNumber.create(NUMBER),
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
    serviceItems: [],
    partItems: [partItem(withdrawnQuantity)],
    diagnosisStartedAt: NOW,
    diagnosisCompletedAt: NOW,
    budgets: [],
    budgetDecidedAt: null,
    budgetDecidedByUserId: null,
    executionStartedAt: NOW,
  });
}

function makeAuthorizer(capabilities: Partial<ActorCapabilities>): CancellationAuthorizer {
  return new CancellationAuthorizer(
    new FakeWorkOrderActors().withCapabilities(ACTOR_ID, capabilities),
  );
}

function makeHandler(authorizer: CancellationAuthorizer, refusal?: Error) {
  const transactionRunner = new FakeTransactionRunner();
  const workOrders = new InMemoryWorkOrderRepository(() => transactionRunner.active);
  const stockLedger = new FakeStockLedger(() => transactionRunner.active);
  if (refusal) {
    stockLedger.refuseWith(refusal);
  }
  const clock = new FakeClock(NOW);
  const events = new RecordingDomainEventPublisher();
  const handler = new CancelWorkOrderHandler(
    workOrders,
    transactionRunner,
    authorizer,
    clock,
    stockLedger,
    events,
  );
  return { handler, workOrders, transactionRunner, stockLedger, clock, events };
}

describe('CancelWorkOrderHandler', () => {
  it('refuses an unknown work order with WorkOrderNotFoundError', async () => {
    const authorizer = makeAuthorizer({});
    const { handler, workOrders, events } = makeHandler(authorizer);

    await expect(
      handler.execute(new CancelWorkOrderCommand('ZZZZZZ-2026', 'x', ACTOR_ID)),
    ).rejects.toThrow(WorkOrderNotFoundError);
    expect(workOrders.workOrders).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });

  it('refuses an actor the authorizer refuses, and never reaches save', async () => {
    const authorizer = makeAuthorizer({});
    const { handler, workOrders, transactionRunner, stockLedger, events } = makeHandler(authorizer);
    await workOrders.save(restoreInExecution(2));

    await expect(
      handler.execute(new CancelWorkOrderCommand(NUMBER, 'Cliente desistiu', ACTOR_ID)),
    ).rejects.toThrow(CancelInExecutionForbiddenError);
    expect(transactionRunner.runCalls).toBe(0);
    expect(workOrders.workOrders[0].status).toBe(WorkOrderStatus.InExecution);
    expect(stockLedger.writtenOff).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });

  it('opens exactly one transaction, saves the work order and writes the stock off through the ledger', async () => {
    const authorizer = makeAuthorizer({ cancelsInExecution: true });
    const { handler, workOrders, transactionRunner, stockLedger } = makeHandler(authorizer);
    await workOrders.save(restoreInExecution(2));

    await handler.execute(new CancelWorkOrderCommand(NUMBER, 'Cliente desistiu', ACTOR_ID));

    expect(transactionRunner.runCalls).toBe(1);
    expect(workOrders.workOrders[0].status).toBe(WorkOrderStatus.Canceled);
    expect(workOrders.savedInsideTransaction).toEqual([NUMBER]);
    expect(stockLedger.writtenOff).toEqual([
      {
        workOrderId: workOrders.workOrders[0].id.value,
        actorUserId: ACTOR_ID,
        insideTransaction: true,
      },
    ]);
  });

  it('still asks the ledger to write off for a work order with no outstanding withdrawn part (spec.md edge case)', async () => {
    const authorizer = makeAuthorizer({});
    const { handler, workOrders, stockLedger } = makeHandler(authorizer);
    await workOrders.save(restoreInExecution(0));

    await handler.execute(new CancelWorkOrderCommand(NUMBER, 'Cliente desistiu', ACTOR_ID));

    expect(stockLedger.writtenOff).toEqual([
      {
        workOrderId: workOrders.workOrders[0].id.value,
        actorUserId: ACTOR_ID,
        insideTransaction: true,
      },
    ]);
  });

  it('lets an error raised by the inventory side travel out untouched', async () => {
    const authorizer = makeAuthorizer({ cancelsInExecution: true });
    const { handler, workOrders, stockLedger, events } = makeHandler(authorizer, new Error('boom'));
    await workOrders.save(restoreInExecution(2));

    await expect(
      handler.execute(new CancelWorkOrderCommand(NUMBER, 'Cliente desistiu', ACTOR_ID)),
    ).rejects.toThrow('boom');
    expect(stockLedger.writtenOff).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });

  it('publishes the recorded events after the transaction', async () => {
    const authorizer = makeAuthorizer({});
    const { handler, workOrders, clock, events } = makeHandler(authorizer);
    await workOrders.save(restoreInExecution(0));

    await handler.execute(new CancelWorkOrderCommand(NUMBER, 'Cliente desistiu', ACTOR_ID));

    expect(events.published).toEqual([
      new WorkOrderCanceled(
        workOrders.workOrders[0].id.value,
        ACTOR_ID,
        WorkOrderStatus.InExecution,
        clock.now(),
      ),
    ]);
  });
});
