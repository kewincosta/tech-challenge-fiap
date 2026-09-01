import { WorkOrder } from '../../../src/modules/work-orders/domain/entities/work-order';
import { WorkOrderRepository } from '../../../src/modules/work-orders/domain/repositories/work-order.repository';
import { WorkOrderNumber } from '../../../src/modules/work-orders/domain/value-objects/work-order-number';

export class InMemoryWorkOrderRepository implements WorkOrderRepository {
  workOrders: WorkOrder[] = [];

  async findByNumber(number: WorkOrderNumber): Promise<WorkOrder | null> {
    return Promise.resolve(
      this.workOrders.find((workOrder) => workOrder.number.equals(number)) ?? null,
    );
  }

  async save(workOrder: WorkOrder): Promise<void> {
    this.workOrders = this.workOrders.filter((existing) => !existing.id.equals(workOrder.id));
    this.workOrders.push(workOrder);
    return Promise.resolve();
  }
}
