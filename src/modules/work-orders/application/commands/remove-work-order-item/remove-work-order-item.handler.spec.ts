import { describe, expect, it } from 'vitest';
import { stubEventBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { InMemoryWorkOrderRepository } from '../../../../../../test/support/fakes/in-memory-work-order.repository';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { WorkOrder } from '../../../domain/entities/work-order';
import { WorkOrderItemNotFoundError } from '../../../domain/errors/work-order-item-not-found.error';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderId } from '../../../domain/value-objects/work-order-id';
import { WorkOrderItemId } from '../../../domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { RemoveWorkOrderItemCommand } from './remove-work-order-item.command';
import { RemoveWorkOrderItemHandler } from './remove-work-order-item.handler';

const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';
const SERVICE_ID = '55555555-5555-4555-8555-555555555555';
const NUMBER = 'A1B090-2026';

function buildWorkOrderWithTwoServices(): WorkOrder {
  const workOrder = WorkOrder.open({
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
    now: new Date('2026-08-31T12:00:00.000Z'),
  });
  workOrder.addService({
    itemId: WorkOrderItemId.create('66666666-6666-4666-8666-666666666666'),
    serviceId: SERVICE_ID,
    serviceName: 'Troca de oleo',
    unitPrice: Money.fromCents(15099),
    actorUserId: CREATOR_ID,
    now: new Date(),
  });
  workOrder.addService({
    itemId: WorkOrderItemId.create('77777777-7777-4777-8777-777777777777'),
    serviceId: SERVICE_ID,
    serviceName: 'Alinhamento',
    unitPrice: Money.fromCents(8000),
    actorUserId: CREATOR_ID,
    now: new Date(),
  });
  return workOrder;
}

function makeHandler() {
  const workOrders = new InMemoryWorkOrderRepository();
  const eventBus = stubEventBus();
  const handler = new RemoveWorkOrderItemHandler(workOrders, new FakeClock(), eventBus.bus);
  return { handler, workOrders };
}

describe('RemoveWorkOrderItemHandler', () => {
  it('should remove an item and leave every other item of that work order in place', async () => {
    const { handler, workOrders } = makeHandler();
    await workOrders.save(buildWorkOrderWithTwoServices());

    await handler.execute(
      new RemoveWorkOrderItemCommand(NUMBER, '66666666-6666-4666-8666-666666666666', CREATOR_ID),
    );

    const updated = workOrders.workOrders[0];
    expect(updated.serviceItems).toHaveLength(1);
    expect(updated.serviceItems[0].serviceName).toBe('Alinhamento');
  });

  it('should refuse an item identifier the addressed work order does not hold, with WorkOrderItemNotFoundError', async () => {
    const { handler, workOrders } = makeHandler();
    await workOrders.save(buildWorkOrderWithTwoServices());

    await expect(
      handler.execute(
        new RemoveWorkOrderItemCommand(NUMBER, '99999999-9999-4999-8999-999999999999', CREATOR_ID),
      ),
    ).rejects.toThrow(WorkOrderItemNotFoundError);
    expect(workOrders.workOrders[0].serviceItems).toHaveLength(2);
  });

  it('should refuse an unknown work order with WorkOrderNotFoundError (L-003)', async () => {
    const { handler } = makeHandler();

    await expect(
      handler.execute(
        new RemoveWorkOrderItemCommand(
          'ZZZZZZ-2026',
          '66666666-6666-4666-8666-666666666666',
          CREATOR_ID,
        ),
      ),
    ).rejects.toThrow(WorkOrderNotFoundError);
  });
});
