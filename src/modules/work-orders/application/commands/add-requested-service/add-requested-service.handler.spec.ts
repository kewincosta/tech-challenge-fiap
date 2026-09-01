import { describe, expect, it } from 'vitest';
import { stubEventBus, stubQueryBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { InMemoryWorkOrderRepository } from '../../../../../../test/support/fakes/in-memory-work-order.repository';
import { ServiceSummaryDto } from '../../../../services/application/ports/service-query.port';
import { WorkOrder } from '../../../domain/entities/work-order';
import { ReferencedServiceNotFoundError } from '../../../domain/errors/referenced-service-not-found.error';
import { ServiceInactiveError } from '../../../domain/errors/service-inactive.error';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderId } from '../../../domain/value-objects/work-order-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { AddRequestedServiceCommand } from './add-requested-service.command';
import { AddRequestedServiceHandler } from './add-requested-service.handler';

const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';
const SERVICE_ID = '55555555-5555-4555-8555-555555555555';
const NUMBER = 'A1B090-2026';

const ACTIVE_SERVICE: ServiceSummaryDto = {
  id: SERVICE_ID,
  name: 'Troca de oleo',
  description: 'Inclui filtro',
  priceCents: 15099,
  estimatedDurationMinutes: 60,
  status: 'ACTIVE',
};

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
    now: new Date('2026-08-31T12:00:00.000Z'),
  });
}

function makeHandler(service: ServiceSummaryDto | null) {
  const workOrders = new InMemoryWorkOrderRepository();
  const queryBus = stubQueryBus();
  queryBus.execute.mockResolvedValueOnce(service);
  const eventBus = stubEventBus();
  const handler = new AddRequestedServiceHandler(
    workOrders,
    new FakeIdGenerator(),
    new FakeClock(),
    queryBus.bus,
    eventBus.bus,
  );
  return { handler, workOrders };
}

describe('AddRequestedServiceHandler', () => {
  it('should add an active service, snapshotting its name and unit price at that moment', async () => {
    const { handler, workOrders } = makeHandler(ACTIVE_SERVICE);
    await workOrders.save(buildReceivedWorkOrder());

    await handler.execute(new AddRequestedServiceCommand(NUMBER, SERVICE_ID, CREATOR_ID));

    const updated = workOrders.workOrders[0];
    expect(updated.serviceItems).toHaveLength(1);
    expect(updated.serviceItems[0].serviceName).toBe('Troca de oleo');
    expect(updated.serviceItems[0].unitPrice.cents).toBe(15099);
  });

  it('should refuse a deactivated service with ServiceInactiveError (L-003)', async () => {
    const { handler, workOrders } = makeHandler({ ...ACTIVE_SERVICE, status: 'INACTIVE' });
    await workOrders.save(buildReceivedWorkOrder());

    await expect(
      handler.execute(new AddRequestedServiceCommand(NUMBER, SERVICE_ID, CREATOR_ID)),
    ).rejects.toThrow(ServiceInactiveError);
    expect(workOrders.workOrders[0].serviceItems).toHaveLength(0);
  });

  it('should refuse a service the query answers null for, with ReferencedServiceNotFoundError', async () => {
    const { handler, workOrders } = makeHandler(null);
    await workOrders.save(buildReceivedWorkOrder());

    await expect(
      handler.execute(new AddRequestedServiceCommand(NUMBER, SERVICE_ID, CREATOR_ID)),
    ).rejects.toThrow(ReferencedServiceNotFoundError);
    expect(workOrders.workOrders[0].serviceItems).toHaveLength(0);
  });

  it('should refuse an unknown work order with WorkOrderNotFoundError', async () => {
    const { handler, workOrders } = makeHandler(ACTIVE_SERVICE);

    await expect(
      handler.execute(new AddRequestedServiceCommand('ZZZZZZ-2026', SERVICE_ID, CREATOR_ID)),
    ).rejects.toThrow(WorkOrderNotFoundError);
    expect(workOrders.workOrders).toHaveLength(0);
  });
});
