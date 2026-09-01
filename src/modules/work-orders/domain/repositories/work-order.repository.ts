import { WorkOrder } from '../entities/work-order';
import { WorkOrderNumber } from '../value-objects/work-order-number';

export interface WorkOrderRepository {
  /** Loads a work order with its items - never its trail, which is a read model (T11). */
  findByNumber(number: WorkOrderNumber): Promise<WorkOrder | null>;
  save(workOrder: WorkOrder): Promise<void>;
}

export const WORK_ORDER_REPOSITORY = Symbol('WorkOrderRepository');
