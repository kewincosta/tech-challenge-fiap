import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { FakeServiceCatalog } from '../../../../../../test/support/fakes/fake-service-catalog';
import { InMemoryWorkOrderRepository } from '../../../../../../test/support/fakes/in-memory-work-order.repository';
import { RecordingDomainEventPublisher } from '../../../../../../test/support/fakes/recording-domain-event-publisher';
import { WorkOrder } from '../../../domain/entities/work-order';
import { ReferencedServiceNotFoundError } from '../../../domain/errors/referenced-service-not-found.error';
import { ServiceInactiveError } from '../../../domain/errors/service-inactive.error';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { ServiceAddedToWorkOrder } from '../../../domain/events/service-added-to-work-order.event';
import { WorkOrderId } from '../../../domain/value-objects/work-order-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { ServiceRef } from '../../ports/service-catalog.port';
import { AddRequestedServiceCommand } from './add-requested-service.command';
import { AddRequestedServiceUseCase } from './add-requested-service.use-case';

const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';
const SERVICE_ID = '55555555-5555-4555-8555-555555555555';
const NUMBER = 'A1B090-2026';

const ACTIVE_SERVICE: ServiceRef = {
  id: SERVICE_ID,
  name: 'Troca de oleo',
  priceCents: 15099,
  active: true,
};

function buildReceivedWorkOrder(): WorkOrder {
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
  // A work order read back from the repository carries no pending events.
  workOrder.pullDomainEvents();
  return workOrder;
}

function makeUseCase(service: ServiceRef | null) {
  const workOrders = new InMemoryWorkOrderRepository();
  const serviceCatalog = new FakeServiceCatalog();
  if (service) {
    serviceCatalog.add(service);
  }
  const clock = new FakeClock();
  const events = new RecordingDomainEventPublisher();
  const useCase = new AddRequestedServiceUseCase(
    workOrders,
    new FakeIdGenerator(),
    clock,
    serviceCatalog,
    events,
  );
  return { useCase, workOrders, clock, events };
}

describe('AddRequestedServiceUseCase', () => {
  it('should add an active service, snapshotting its name and unit price at that moment', async () => {
    const { useCase, workOrders } = makeUseCase(ACTIVE_SERVICE);
    await workOrders.save(buildReceivedWorkOrder());

    await useCase.execute(new AddRequestedServiceCommand(NUMBER, SERVICE_ID, CREATOR_ID));

    const updated = workOrders.workOrders[0];
    expect(updated.serviceItems).toHaveLength(1);
    expect(updated.serviceItems[0].serviceName).toBe('Troca de oleo');
    expect(updated.serviceItems[0].unitPrice.cents).toBe(15099);
  });

  it('should publish the service-added event of the work order, with the acting user', async () => {
    const { useCase, workOrders, clock, events } = makeUseCase(ACTIVE_SERVICE);
    await workOrders.save(buildReceivedWorkOrder());

    await useCase.execute(new AddRequestedServiceCommand(NUMBER, SERVICE_ID, CREATOR_ID));

    expect(events.published).toEqual([
      new ServiceAddedToWorkOrder(workOrders.workOrders[0].id.value, CREATOR_ID, clock.now()),
    ]);
  });

  it('should refuse a deactivated service with ServiceInactiveError (L-003)', async () => {
    const { useCase, workOrders, events } = makeUseCase({ ...ACTIVE_SERVICE, active: false });
    await workOrders.save(buildReceivedWorkOrder());

    await expect(
      useCase.execute(new AddRequestedServiceCommand(NUMBER, SERVICE_ID, CREATOR_ID)),
    ).rejects.toThrow(ServiceInactiveError);
    expect(workOrders.workOrders[0].serviceItems).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });

  it('should refuse a service the catalog does not know, with ReferencedServiceNotFoundError', async () => {
    const { useCase, workOrders, events } = makeUseCase(null);
    await workOrders.save(buildReceivedWorkOrder());

    await expect(
      useCase.execute(new AddRequestedServiceCommand(NUMBER, SERVICE_ID, CREATOR_ID)),
    ).rejects.toThrow(ReferencedServiceNotFoundError);
    expect(workOrders.workOrders[0].serviceItems).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });

  it('should refuse an unknown work order with WorkOrderNotFoundError', async () => {
    const { useCase, workOrders, events } = makeUseCase(ACTIVE_SERVICE);

    await expect(
      useCase.execute(new AddRequestedServiceCommand('ZZZZZZ-2026', SERVICE_ID, CREATOR_ID)),
    ).rejects.toThrow(WorkOrderNotFoundError);
    expect(workOrders.workOrders).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });
});
