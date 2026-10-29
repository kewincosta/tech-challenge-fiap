import { WorkOrder } from '../../domain/entities/work-order';
import { WorkOrderNumber } from '../../domain/value-objects/work-order-number';

export interface WorkOrderRepository {
  /** Loads a work order with its items - never its trail, which is a read model (T11). */
  findByNumber(number: WorkOrderNumber): Promise<WorkOrder | null>;
  save(workOrder: WorkOrder): Promise<void>;
}
