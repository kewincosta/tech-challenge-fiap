import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { FakePartCatalog } from '../../../../../../test/support/fakes/fake-part-catalog';
import { InMemoryWorkOrderRepository } from '../../../../../../test/support/fakes/in-memory-work-order.repository';
import { RecordingDomainEventPublisher } from '../../../../../../test/support/fakes/recording-domain-event-publisher';
import { WorkOrder } from '../../../domain/entities/work-order';
import { InventoryItemInactiveError } from '../../../domain/errors/inventory-item-inactive.error';
import { InvalidPlannedQuantityError } from '../../../domain/errors/invalid-planned-quantity.error';
import { ReferencedInventoryItemNotFoundError } from '../../../domain/errors/referenced-inventory-item-not-found.error';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderStateError } from '../../../domain/errors/work-order-state.error';
import { PartPlannedForWorkOrder } from '../../../domain/events/part-planned-for-work-order.event';
import { WorkOrderId } from '../../../domain/value-objects/work-order-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { WorkOrderStatus } from '../../../domain/work-order-status';
import { PartRef } from '../../ports/part-catalog.port';
import { PlanPartCommand } from './plan-part.command';
import { PlanPartUseCase } from './plan-part.use-case';

const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';
const ITEM_ID = '55555555-5555-4555-8555-555555555555';
const NUMBER = 'A1B090-2026';
const NOW = new Date('2026-08-31T12:00:00.000Z');

const ACTIVE_ITEM: PartRef = {
  id: ITEM_ID,
  sku: 'FLT-001',
  name: 'Filtro de oleo',
  unitPriceCents: 2500,
  active: true,
};

const INACTIVE_ITEM: PartRef = { ...ACTIVE_ITEM, active: false };

function buildWorkOrder(status: WorkOrderStatus): WorkOrder {
  if (status === WorkOrderStatus.Received) {
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
      now: NOW,
    });
    // A work order read back from the repository carries no pending events.
    workOrder.pullDomainEvents();
    return workOrder;
  }
  return WorkOrder.restore({
    id: WorkOrderId.create('11111111-1111-4111-8111-111111111111'),
    number: WorkOrderNumber.create(NUMBER),
    customerId: CUSTOMER_ID,
    vehicleId: VEHICLE_ID,
    assignedMechanicUserId: null,
    createdByUserId: CREATOR_ID,
    status,
    customerName: 'Jane Doe',
    vehiclePlate: 'ABC1234',
    vehicleBrand: 'Toyota',
    vehicleModel: 'Corolla',
    vehicleYear: 2020,
    createdAt: NOW,
    updatedAt: NOW,
    serviceItems: [],
    partItems: [],
    diagnosisStartedAt: null,
    diagnosisCompletedAt: null,
    budgets: [],
    budgetDecidedAt: null,
    budgetDecidedByUserId: null,
    executionStartedAt: null,
  });
}

function makeUseCase(inventoryItem: PartRef | null) {
  const workOrders = new InMemoryWorkOrderRepository();
  const partCatalog = new FakePartCatalog();
  if (inventoryItem) {
    partCatalog.add(inventoryItem);
  }
  const clock = new FakeClock();
  const events = new RecordingDomainEventPublisher();
  const useCase = new PlanPartUseCase(
    workOrders,
    new FakeIdGenerator(),
    clock,
    partCatalog,
    events,
  );
  return { useCase, workOrders, partCatalog, clock, events };
}

describe('PlanPartUseCase', () => {
  it('should refuse a deactivated item with InventoryItemInactiveError, planning nothing', async () => {
    const { useCase, workOrders, events } = makeUseCase(INACTIVE_ITEM);
    await workOrders.save(buildWorkOrder(WorkOrderStatus.InDiagnosis));

    await expect(
      useCase.execute(new PlanPartCommand(NUMBER, ITEM_ID, 2, CREATOR_ID)),
    ).rejects.toThrow(InventoryItemInactiveError);
    expect(workOrders.workOrders[0].partItems).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });

  it('should plan a part on a work order in IN_DIAGNOSIS, snapshotting the SKU, name and unit price', async () => {
    const { useCase, workOrders } = makeUseCase(ACTIVE_ITEM);
    await workOrders.save(buildWorkOrder(WorkOrderStatus.InDiagnosis));

    await useCase.execute(new PlanPartCommand(NUMBER, ITEM_ID, 2, CREATOR_ID));

    const updated = workOrders.workOrders[0];
    expect(updated.partItems).toHaveLength(1);
    expect(updated.partItems[0].sku).toBe('FLT-001');
    expect(updated.partItems[0].itemName).toBe('Filtro de oleo');
    expect(updated.partItems[0].unitPrice.cents).toBe(2500);
    expect(updated.partItems[0].plannedQuantity.units).toBe(2);
  });

  it('should publish the part-planned event of the work order, with the acting user', async () => {
    const { useCase, workOrders, clock, events } = makeUseCase(ACTIVE_ITEM);
    await workOrders.save(buildWorkOrder(WorkOrderStatus.InDiagnosis));

    await useCase.execute(new PlanPartCommand(NUMBER, ITEM_ID, 2, CREATOR_ID));

    expect(events.published).toEqual([
      new PartPlannedForWorkOrder(workOrders.workOrders[0].id.value, CREATOR_ID, clock.now()),
    ]);
  });

  it('should plan the part without withdrawing it, the single catalog read being all that reaches inventory', async () => {
    const { useCase, workOrders, partCatalog } = makeUseCase(ACTIVE_ITEM);
    await workOrders.save(buildWorkOrder(WorkOrderStatus.InDiagnosis));

    await useCase.execute(new PlanPartCommand(NUMBER, ITEM_ID, 2, CREATOR_ID));

    // The use case holds a read-only catalog and no stock ledger, so the stock cannot be touched.
    expect(workOrders.workOrders[0].partItems[0].withdrawnQuantity).toBe(0);
    expect(partCatalog.lookups).toEqual([ITEM_ID]);
  });

  it('should plan a part on a work order in RECEIVED as a draft item, without withdrawing it', async () => {
    const { useCase, workOrders, events } = makeUseCase(ACTIVE_ITEM);
    await workOrders.save(buildWorkOrder(WorkOrderStatus.Received));

    await useCase.execute(new PlanPartCommand(NUMBER, ITEM_ID, 2, CREATOR_ID));

    const [part] = workOrders.workOrders[0].partItems;
    expect(part.inventoryItemId).toBe(ITEM_ID);
    expect(part.plannedQuantity.units).toBe(2);
    expect(part.budgetRound).toBeNull();
    expect(part.withdrawnQuantity).toBe(0);
    expect(events.published).toHaveLength(1);
  });

  it('should refuse a part planned on a work order in COMPLETED with WorkOrderStateError (L-003, second layer)', async () => {
    const { useCase, workOrders, events } = makeUseCase(ACTIVE_ITEM);
    await workOrders.save(buildWorkOrder(WorkOrderStatus.Completed));

    await expect(
      useCase.execute(new PlanPartCommand(NUMBER, ITEM_ID, 2, CREATOR_ID)),
    ).rejects.toThrow(WorkOrderStateError);
    expect(workOrders.workOrders[0].partItems).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });

  it('should refuse a zero or negative quantity with InvalidPlannedQuantityError', async () => {
    const { useCase, workOrders, events } = makeUseCase(ACTIVE_ITEM);
    await workOrders.save(buildWorkOrder(WorkOrderStatus.InDiagnosis));

    await expect(
      useCase.execute(new PlanPartCommand(NUMBER, ITEM_ID, 0, CREATOR_ID)),
    ).rejects.toThrow(InvalidPlannedQuantityError);
    expect(workOrders.workOrders[0].partItems).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });

  it('should check the quantity before reading the catalog, so an invalid quantity for an unknown item answers the quantity error', async () => {
    const { useCase, workOrders, partCatalog } = makeUseCase(null);
    await workOrders.save(buildWorkOrder(WorkOrderStatus.InDiagnosis));

    await expect(
      useCase.execute(new PlanPartCommand(NUMBER, ITEM_ID, 0, CREATOR_ID)),
    ).rejects.toThrow(InvalidPlannedQuantityError);
    expect(partCatalog.lookups).toEqual([]);
  });

  it('should refuse an inventory item the catalog does not know, with ReferencedInventoryItemNotFoundError', async () => {
    const { useCase, workOrders, events } = makeUseCase(null);
    await workOrders.save(buildWorkOrder(WorkOrderStatus.InDiagnosis));

    await expect(
      useCase.execute(new PlanPartCommand(NUMBER, ITEM_ID, 2, CREATOR_ID)),
    ).rejects.toThrow(ReferencedInventoryItemNotFoundError);
    expect(workOrders.workOrders[0].partItems).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });

  it('should refuse an unknown work order with WorkOrderNotFoundError', async () => {
    const { useCase, events } = makeUseCase(ACTIVE_ITEM);

    await expect(
      useCase.execute(new PlanPartCommand('ZZZZZZ-2026', ITEM_ID, 2, CREATOR_ID)),
    ).rejects.toThrow(WorkOrderNotFoundError);
    expect(events.published).toHaveLength(0);
  });
});
