import { Money } from '../../../../shared/domain/value-objects/money';
import { WorkOrder } from '../../domain/entities/work-order';
import { WorkOrderPartItem } from '../../domain/entities/work-order-part-item';
import { WorkOrderServiceItem } from '../../domain/entities/work-order-service-item';
import { PlannedQuantity } from '../../domain/value-objects/planned-quantity';
import { WorkOrderId } from '../../domain/value-objects/work-order-id';
import { WorkOrderItemId } from '../../domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../domain/value-objects/work-order-number';
import { WorkOrderStatus } from '../../domain/work-order-status';
import { WorkOrderPartOrmEntity } from './work-order-part.orm-entity';
import { WorkOrderServiceOrmEntity } from './work-order-service.orm-entity';
import { WorkOrderOrmEntity } from './work-order.orm-entity';

/** External ids the repository resolves through raw SQL - the mapper stays pure. */
export interface ResolvedWorkOrderIds {
  customerExternalId: string;
  vehicleExternalId: string;
  createdByExternalId: string;
  assignedMechanicExternalId: string | null;
  serviceExternalIdByInternalId: Map<string, string>;
  inventoryItemExternalIdByInternalId: Map<string, string>;
}

export interface WorkOrderOrmSnapshot {
  workOrderRow: WorkOrderOrmEntity;
  serviceRows: WorkOrderServiceOrmEntity[];
  partRows: WorkOrderPartOrmEntity[];
}

export class WorkOrderMapper {
  static toDomain(
    row: WorkOrderOrmEntity,
    serviceRows: WorkOrderServiceOrmEntity[],
    partRows: WorkOrderPartOrmEntity[],
    resolved: ResolvedWorkOrderIds,
  ): WorkOrder {
    return WorkOrder.restore({
      id: WorkOrderId.create(row.externalId),
      number: WorkOrderNumber.create(row.number),
      customerId: resolved.customerExternalId,
      vehicleId: resolved.vehicleExternalId,
      assignedMechanicUserId: resolved.assignedMechanicExternalId,
      createdByUserId: resolved.createdByExternalId,
      status: row.status as WorkOrderStatus,
      customerName: row.customerName,
      vehiclePlate: row.vehiclePlate,
      vehicleBrand: row.vehicleBrand,
      vehicleModel: row.vehicleModel,
      vehicleYear: row.vehicleYear,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      serviceItems: serviceRows.map((serviceRow) => {
        const serviceExternalId = resolved.serviceExternalIdByInternalId.get(
          serviceRow.serviceInternalId,
        );
        if (!serviceExternalId) {
          throw new Error(`Service ${serviceRow.serviceInternalId} not resolved`);
        }
        return WorkOrderServiceItem.restore({
          id: WorkOrderItemId.create(serviceRow.externalId),
          serviceId: serviceExternalId,
          serviceName: serviceRow.serviceName,
          unitPrice: Money.fromDatabase(serviceRow.unitPriceCents),
        });
      }),
      partItems: partRows.map((partRow) => {
        const inventoryItemExternalId = resolved.inventoryItemExternalIdByInternalId.get(
          partRow.inventoryItemInternalId,
        );
        if (!inventoryItemExternalId) {
          throw new Error(`Inventory item ${partRow.inventoryItemInternalId} not resolved`);
        }
        return WorkOrderPartItem.restore({
          id: WorkOrderItemId.create(partRow.externalId),
          inventoryItemId: inventoryItemExternalId,
          sku: partRow.sku,
          itemName: partRow.itemName,
          unitPrice: Money.fromDatabase(partRow.unitPriceCents),
          plannedQuantity: PlannedQuantity.create(partRow.plannedQuantity),
          withdrawnQuantity: partRow.withdrawnQuantity,
        });
      }),
    });
  }

  /**
   * `customerInternalId`, `vehicleInternalId`, `createdByInternalId`, `assignedMechanicInternalId`
   * and each item row's own reference column are left unset - only the repository resolves
   * external ids to internal keys, since that is I/O the mapper stays free of.
   */
  static toOrm(workOrder: WorkOrder): WorkOrderOrmSnapshot {
    const workOrderRow = new WorkOrderOrmEntity();
    workOrderRow.externalId = workOrder.id.value;
    workOrderRow.number = workOrder.number.value;
    workOrderRow.status = workOrder.status;
    workOrderRow.customerName = workOrder.customerName;
    workOrderRow.vehiclePlate = workOrder.vehiclePlate;
    workOrderRow.vehicleBrand = workOrder.vehicleBrand;
    workOrderRow.vehicleModel = workOrder.vehicleModel;
    workOrderRow.vehicleYear = workOrder.vehicleYear;
    workOrderRow.createdAt = workOrder.createdAt;
    workOrderRow.updatedAt = workOrder.updatedAt;

    const serviceRows = workOrder.serviceItems.map((item) => {
      const row = new WorkOrderServiceOrmEntity();
      row.externalId = item.id.value;
      row.serviceName = item.serviceName;
      row.unitPriceCents = String(item.unitPrice.cents);
      return row;
    });

    const partRows = workOrder.partItems.map((item) => {
      const row = new WorkOrderPartOrmEntity();
      row.externalId = item.id.value;
      row.sku = item.sku;
      row.itemName = item.itemName;
      row.plannedQuantity = item.plannedQuantity.units;
      row.withdrawnQuantity = item.withdrawnQuantity;
      row.unitPriceCents = String(item.unitPrice.cents);
      return row;
    });

    return { workOrderRow, serviceRows, partRows };
  }
}
