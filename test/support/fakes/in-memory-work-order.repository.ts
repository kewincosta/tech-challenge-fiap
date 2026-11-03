import { WorkOrder } from '../../../src/modules/work-orders/domain/entities/work-order';
import { VehicleAlreadyHasActiveWorkOrderError } from '../../../src/modules/work-orders/domain/errors/vehicle-already-has-active-work-order.error';
import { WorkOrderNumberTakenError } from '../../../src/modules/work-orders/domain/errors/work-order-number-taken.error';
import { WorkOrderRepository } from '../../../src/modules/work-orders/application/ports/work-order.repository';
import { WorkOrderNumber } from '../../../src/modules/work-orders/domain/value-objects/work-order-number';
import { WorkOrderStatus } from '../../../src/modules/work-orders/domain/work-order-status';

const CLOSED_STATUSES: WorkOrderStatus[] = [WorkOrderStatus.Delivered, WorkOrderStatus.Canceled];

export class InMemoryWorkOrderRepository implements WorkOrderRepository {
  workOrders: WorkOrder[] = [];
  /** The numbers of the work orders saved while the transaction was open, in order. */
  readonly savedInsideTransaction: string[] = [];

  /** `insideTransaction` tells whether the transaction is open at the moment of a save. */
  constructor(private readonly insideTransaction: () => boolean = () => false) {}

  async findByNumber(number: WorkOrderNumber): Promise<WorkOrder | null> {
    return Promise.resolve(
      this.workOrders.find((workOrder) => workOrder.number.equals(number)) ?? null,
    );
  }

  // Refuses what the unique indexes of the table refuse: a number held by another work order
  // (`ux_work_orders_number`), and a second work order not yet delivered or canceled on a vehicle
  // (`ux_work_orders_active_vehicle`).
  async save(workOrder: WorkOrder): Promise<void> {
    const others = this.workOrders.filter((existing) => !existing.id.equals(workOrder.id));
    if (others.some((existing) => existing.number.equals(workOrder.number))) {
      throw new WorkOrderNumberTakenError();
    }
    const isActive = !CLOSED_STATUSES.includes(workOrder.status);
    if (
      isActive &&
      others.some(
        (existing) =>
          existing.vehicleId === workOrder.vehicleId && !CLOSED_STATUSES.includes(existing.status),
      )
    ) {
      throw new VehicleAlreadyHasActiveWorkOrderError();
    }
    if (this.insideTransaction()) {
      this.savedInsideTransaction.push(workOrder.number.value);
    }
    this.workOrders = [...others, workOrder];
    return Promise.resolve();
  }
}
