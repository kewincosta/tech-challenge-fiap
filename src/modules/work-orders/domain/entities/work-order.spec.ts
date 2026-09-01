import { describe, expect, it } from 'vitest';
import { Money } from '../../../../shared/domain/value-objects/money';
import { WorkOrderItemNotFoundError } from '../errors/work-order-item-not-found.error';
import { WorkOrderStateError } from '../errors/work-order-state.error';
import { ItemRemovedFromWorkOrder } from '../events/item-removed-from-work-order.event';
import { MechanicAssigned } from '../events/mechanic-assigned.event';
import { PartPlannedForWorkOrder } from '../events/part-planned-for-work-order.event';
import { ServiceAddedToWorkOrder } from '../events/service-added-to-work-order.event';
import { WorkOrderCreated } from '../events/work-order-created.event';
import { PlannedQuantity } from '../value-objects/planned-quantity';
import { WorkOrderId } from '../value-objects/work-order-id';
import { WorkOrderItemId } from '../value-objects/work-order-item-id';
import { WorkOrderNumber } from '../value-objects/work-order-number';
import { WorkOrderStatus } from '../work-order-status';
import { WorkOrder } from './work-order';
import { WorkOrderServiceItem } from './work-order-service-item';

const WORK_ORDER_ID = WorkOrderId.create('11111111-1111-4111-8111-111111111111');
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';
const MECHANIC_ID = '55555555-5555-4555-8555-555555555555';
const NOW = new Date('2026-08-31T12:00:00.000Z');

function openWorkOrder(): WorkOrder {
  return WorkOrder.open({
    id: WORK_ORDER_ID,
    number: WorkOrderNumber.create('A1B090-2026'),
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

function restoreWorkOrder(status: WorkOrderStatus): WorkOrder {
  return WorkOrder.restore({
    id: WORK_ORDER_ID,
    number: WorkOrderNumber.create('A1B090-2026'),
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
    serviceItems: [
      WorkOrderServiceItem.restore({
        id: WorkOrderItemId.create('66666666-6666-4666-8666-666666666666'),
        serviceId: '77777777-7777-4777-8777-777777777777',
        serviceName: 'Troca de oleo',
        unitPrice: Money.fromCents(15099),
      }),
    ],
    partItems: [],
  });
}

describe('WorkOrder', () => {
  it('should start RECEIVED, store the customer and vehicle snapshot, record the creator and record WorkOrderCreated', () => {
    const workOrder = openWorkOrder();

    expect(workOrder.status).toBe(WorkOrderStatus.Received);
    expect(workOrder.customerName).toBe('Jane Doe');
    expect(workOrder.vehiclePlate).toBe('ABC1234');
    expect(workOrder.vehicleBrand).toBe('Toyota');
    expect(workOrder.vehicleModel).toBe('Corolla');
    expect(workOrder.vehicleYear).toBe(2020);
    expect(workOrder.createdByUserId).toBe(CREATOR_ID);
    const events = workOrder.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(WorkOrderCreated);
  });

  it('should rebuild from persisted props with its items and no trail via restore', () => {
    const workOrder = restoreWorkOrder(WorkOrderStatus.Received);

    expect(workOrder.serviceItems).toHaveLength(1);
    expect(workOrder.pullDomainEvents()).toHaveLength(0);
  });

  it('should append an item and record ServiceAddedToWorkOrder when adding a service in RECEIVED', () => {
    const workOrder = openWorkOrder();
    workOrder.pullDomainEvents();

    workOrder.addService({
      itemId: WorkOrderItemId.create('88888888-8888-4888-8888-888888888888'),
      serviceId: '77777777-7777-4777-8777-777777777777',
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
      actorUserId: CREATOR_ID,
      now: NOW,
    });

    expect(workOrder.serviceItems).toHaveLength(1);
    const events = workOrder.pullDomainEvents();
    expect(events[0]).toBeInstanceOf(ServiceAddedToWorkOrder);
  });

  it('should record two separate items when the same service is added twice', () => {
    const workOrder = openWorkOrder();

    workOrder.addService({
      itemId: WorkOrderItemId.create('88888888-8888-4888-8888-888888888888'),
      serviceId: '77777777-7777-4777-8777-777777777777',
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
      actorUserId: CREATOR_ID,
      now: NOW,
    });
    workOrder.addService({
      itemId: WorkOrderItemId.create('99999999-9999-4999-8999-999999999999'),
      serviceId: '77777777-7777-4777-8777-777777777777',
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
      actorUserId: CREATOR_ID,
      now: NOW,
    });

    expect(workOrder.serviceItems).toHaveLength(2);
  });

  it('should throw WorkOrderStateError naming the current status when addService is called in a forbidden state', () => {
    const workOrder = restoreWorkOrder(WorkOrderStatus.Delivered);

    expect(() =>
      workOrder.addService({
        itemId: WorkOrderItemId.create('88888888-8888-4888-8888-888888888888'),
        serviceId: '77777777-7777-4777-8777-777777777777',
        serviceName: 'Troca de oleo',
        unitPrice: Money.fromCents(15099),
        actorUserId: CREATOR_ID,
        now: NOW,
      }),
    ).toThrow(WorkOrderStateError);
    try {
      workOrder.addService({
        itemId: WorkOrderItemId.create('88888888-8888-4888-8888-888888888888'),
        serviceId: '77777777-7777-4777-8777-777777777777',
        serviceName: 'Troca de oleo',
        unitPrice: Money.fromCents(15099),
        actorUserId: CREATOR_ID,
        now: NOW,
      });
    } catch (error) {
      expect((error as WorkOrderStateError).currentStatus).toBe(WorkOrderStatus.Delivered);
    }
  });

  it('should append an item and record PartPlannedForWorkOrder when planning a part in IN_DIAGNOSIS', () => {
    const workOrder = restoreWorkOrder(WorkOrderStatus.InDiagnosis);
    workOrder.pullDomainEvents();

    workOrder.planPart({
      itemId: WorkOrderItemId.create('88888888-8888-4888-8888-888888888888'),
      inventoryItemId: '99999999-9999-4999-8999-999999999999',
      sku: 'FLT-001',
      itemName: 'Filtro de oleo',
      unitPrice: Money.fromCents(2500),
      plannedQuantity: PlannedQuantity.create(2),
      actorUserId: CREATOR_ID,
      now: NOW,
    });

    expect(workOrder.partItems).toHaveLength(1);
    const events = workOrder.pullDomainEvents();
    expect(events[0]).toBeInstanceOf(PartPlannedForWorkOrder);
  });

  it('should throw WorkOrderStateError when a part is planned in RECEIVED (L-003, first layer)', () => {
    const workOrder = openWorkOrder();

    expect(() =>
      workOrder.planPart({
        itemId: WorkOrderItemId.create('88888888-8888-4888-8888-888888888888'),
        inventoryItemId: '99999999-9999-4999-8999-999999999999',
        sku: 'FLT-001',
        itemName: 'Filtro de oleo',
        unitPrice: Money.fromCents(2500),
        plannedQuantity: PlannedQuantity.create(2),
        actorUserId: CREATOR_ID,
        now: NOW,
      }),
    ).toThrow(WorkOrderStateError);
  });

  it('should remove a service item and leave every other item in place', () => {
    const workOrder = openWorkOrder();
    workOrder.addService({
      itemId: WorkOrderItemId.create('88888888-8888-4888-8888-888888888888'),
      serviceId: '77777777-7777-4777-8777-777777777777',
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
      actorUserId: CREATOR_ID,
      now: NOW,
    });
    const keptId = WorkOrderItemId.create('99999999-9999-4999-8999-999999999999');
    workOrder.addService({
      itemId: keptId,
      serviceId: '77777777-7777-4777-8777-777777777777',
      serviceName: 'Alinhamento',
      unitPrice: Money.fromCents(8000),
      actorUserId: CREATOR_ID,
      now: NOW,
    });

    workOrder.removeItem({
      itemId: WorkOrderItemId.create('88888888-8888-4888-8888-888888888888'),
      actorUserId: CREATOR_ID,
      now: NOW,
    });

    expect(workOrder.serviceItems).toHaveLength(1);
    expect(workOrder.serviceItems[0].id.equals(keptId)).toBe(true);
  });

  it('should remove a part item', () => {
    const workOrder = restoreWorkOrder(WorkOrderStatus.InDiagnosis);
    const partId = WorkOrderItemId.create('88888888-8888-4888-8888-888888888888');
    workOrder.planPart({
      itemId: partId,
      inventoryItemId: '99999999-9999-4999-8999-999999999999',
      sku: 'FLT-001',
      itemName: 'Filtro de oleo',
      unitPrice: Money.fromCents(2500),
      plannedQuantity: PlannedQuantity.create(2),
      actorUserId: CREATOR_ID,
      now: NOW,
    });

    workOrder.removeItem({ itemId: partId, actorUserId: CREATOR_ID, now: NOW });

    expect(workOrder.partItems).toHaveLength(0);
    const events = workOrder.pullDomainEvents();
    expect(events.some((event) => event instanceof ItemRemovedFromWorkOrder)).toBe(true);
  });

  it('should throw WorkOrderItemNotFoundError when the addressed item does not belong to the work order', () => {
    const workOrder = openWorkOrder();

    expect(() =>
      workOrder.removeItem({
        itemId: WorkOrderItemId.create('99999999-9999-4999-8999-999999999999'),
        actorUserId: CREATOR_ID,
        now: NOW,
      }),
    ).toThrow(WorkOrderItemNotFoundError);
  });

  it('should record the assignee and MechanicAssigned when assigning a mechanic', () => {
    const workOrder = openWorkOrder();
    workOrder.pullDomainEvents();

    workOrder.assignMechanic({ mechanicUserId: MECHANIC_ID, actorUserId: CREATOR_ID, now: NOW });

    expect(workOrder.assignedMechanicUserId).toBe(MECHANIC_ID);
    const events = workOrder.pullDomainEvents();
    expect(events[0]).toBeInstanceOf(MechanicAssigned);
  });

  it('should replace an existing assignee', () => {
    const workOrder = openWorkOrder();
    workOrder.assignMechanic({ mechanicUserId: MECHANIC_ID, actorUserId: CREATOR_ID, now: NOW });
    const secondMechanicId = '66666666-6666-4666-8666-666666666666';

    workOrder.assignMechanic({
      mechanicUserId: secondMechanicId,
      actorUserId: CREATOR_ID,
      now: NOW,
    });

    expect(workOrder.assignedMechanicUserId).toBe(secondMechanicId);
  });

  it('should throw WorkOrderStateError when assigning a mechanic on a DELIVERED or CANCELED work order', () => {
    const delivered = restoreWorkOrder(WorkOrderStatus.Delivered);
    const canceled = restoreWorkOrder(WorkOrderStatus.Canceled);

    expect(() =>
      delivered.assignMechanic({ mechanicUserId: MECHANIC_ID, actorUserId: CREATOR_ID, now: NOW }),
    ).toThrow(WorkOrderStateError);
    expect(() =>
      canceled.assignMechanic({ mechanicUserId: MECHANIC_ID, actorUserId: CREATOR_ID, now: NOW }),
    ).toThrow(WorkOrderStateError);
  });
});
