import { describe, expect, it } from 'vitest';
import { stubEventBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { FakePartCatalog } from '../../../../../../test/support/fakes/fake-part-catalog';
import { InMemoryWorkOrderRepository } from '../../../../../../test/support/fakes/in-memory-work-order.repository';
import { WorkOrder } from '../../../domain/entities/work-order';
import { InventoryItemInactiveError } from '../../../domain/errors/inventory-item-inactive.error';
import { InvalidPlannedQuantityError } from '../../../domain/errors/invalid-planned-quantity.error';
import { ReferencedInventoryItemNotFoundError } from '../../../domain/errors/referenced-inventory-item-not-found.error';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderStateError } from '../../../domain/errors/work-order-state.error';
import { WorkOrderId } from '../../../domain/value-objects/work-order-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { WorkOrderStatus } from '../../../domain/work-order-status';
import { PartRef } from '../../ports/part-catalog.port';
import { PlanPartCommand } from './plan-part.command';
import { PlanPartHandler } from './plan-part.handler';

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

function makeHandler(inventoryItem: PartRef | null) {
  const workOrders = new InMemoryWorkOrderRepository();
  const partCatalog = new FakePartCatalog();
  if (inventoryItem) {
    partCatalog.add(inventoryItem);
  }
  const eventBus = stubEventBus();
  const handler = new PlanPartHandler(
    workOrders,
    new FakeIdGenerator(),
    new FakeClock(),
    partCatalog,
    eventBus.bus,
  );
  return { handler, workOrders, partCatalog };
}

describe('PlanPartHandler', () => {
  it('should refuse a deactivated item with InventoryItemInactiveError, planning nothing', async () => {
    const { handler, workOrders } = makeHandler(INACTIVE_ITEM);
    await workOrders.save(buildWorkOrder(WorkOrderStatus.InDiagnosis));

    await expect(
      handler.execute(new PlanPartCommand(NUMBER, ITEM_ID, 2, CREATOR_ID)),
    ).rejects.toThrow(InventoryItemInactiveError);
    expect(workOrders.workOrders[0].partItems).toHaveLength(0);
  });

  it('should plan a part on a work order in IN_DIAGNOSIS, snapshotting the SKU, name and unit price', async () => {
    const { handler, workOrders } = makeHandler(ACTIVE_ITEM);
    await workOrders.save(buildWorkOrder(WorkOrderStatus.InDiagnosis));

    await handler.execute(new PlanPartCommand(NUMBER, ITEM_ID, 2, CREATOR_ID));

    const updated = workOrders.workOrders[0];
    expect(updated.partItems).toHaveLength(1);
    expect(updated.partItems[0].sku).toBe('FLT-001');
    expect(updated.partItems[0].itemName).toBe('Filtro de oleo');
    expect(updated.partItems[0].unitPrice.cents).toBe(2500);
    expect(updated.partItems[0].plannedQuantity.units).toBe(2);
  });

  it('should plan the part without withdrawing it, the single catalog read being all that reaches inventory', async () => {
    const { handler, workOrders, partCatalog } = makeHandler(ACTIVE_ITEM);
    await workOrders.save(buildWorkOrder(WorkOrderStatus.InDiagnosis));

    await handler.execute(new PlanPartCommand(NUMBER, ITEM_ID, 2, CREATOR_ID));

    // The handler holds a read-only catalog and no stock ledger, so the stock cannot be touched.
    expect(workOrders.workOrders[0].partItems[0].withdrawnQuantity).toBe(0);
    expect(partCatalog.lookups).toEqual([ITEM_ID]);
  });

  it('should refuse a part planned on a work order in RECEIVED with WorkOrderStateError (L-003, second layer)', async () => {
    const { handler, workOrders } = makeHandler(ACTIVE_ITEM);
    await workOrders.save(buildWorkOrder(WorkOrderStatus.Received));

    await expect(
      handler.execute(new PlanPartCommand(NUMBER, ITEM_ID, 2, CREATOR_ID)),
    ).rejects.toThrow(WorkOrderStateError);
    expect(workOrders.workOrders[0].partItems).toHaveLength(0);
  });

  it('should refuse a zero or negative quantity with InvalidPlannedQuantityError', async () => {
    const { handler, workOrders } = makeHandler(ACTIVE_ITEM);
    await workOrders.save(buildWorkOrder(WorkOrderStatus.InDiagnosis));

    await expect(
      handler.execute(new PlanPartCommand(NUMBER, ITEM_ID, 0, CREATOR_ID)),
    ).rejects.toThrow(InvalidPlannedQuantityError);
    expect(workOrders.workOrders[0].partItems).toHaveLength(0);
  });

  it('should refuse an inventory item the catalog does not know, with ReferencedInventoryItemNotFoundError', async () => {
    const { handler, workOrders } = makeHandler(null);
    await workOrders.save(buildWorkOrder(WorkOrderStatus.InDiagnosis));

    await expect(
      handler.execute(new PlanPartCommand(NUMBER, ITEM_ID, 2, CREATOR_ID)),
    ).rejects.toThrow(ReferencedInventoryItemNotFoundError);
    expect(workOrders.workOrders[0].partItems).toHaveLength(0);
  });

  it('should refuse an unknown work order with WorkOrderNotFoundError', async () => {
    const { handler } = makeHandler(ACTIVE_ITEM);

    await expect(
      handler.execute(new PlanPartCommand('ZZZZZZ-2026', ITEM_ID, 2, CREATOR_ID)),
    ).rejects.toThrow(WorkOrderNotFoundError);
  });
});
