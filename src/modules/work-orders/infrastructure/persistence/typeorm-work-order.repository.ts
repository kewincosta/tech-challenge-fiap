import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { WorkOrder } from '../../domain/entities/work-order';
import { WorkOrderRepository } from '../../domain/repositories/work-order.repository';
import { WorkOrderNumber } from '../../domain/value-objects/work-order-number';
import { WorkOrderMapper } from './work-order.mapper';
import { WorkOrderPartOrmEntity } from './work-order-part.orm-entity';
import { WorkOrderServiceOrmEntity } from './work-order-service.orm-entity';
import { WorkOrderOrmEntity } from './work-order.orm-entity';

@Injectable()
export class TypeOrmWorkOrderRepository implements WorkOrderRepository {
  constructor(
    @InjectRepository(WorkOrderOrmEntity)
    private readonly workOrders: Repository<WorkOrderOrmEntity>,
    @InjectRepository(WorkOrderServiceOrmEntity)
    private readonly serviceItems: Repository<WorkOrderServiceOrmEntity>,
    @InjectRepository(WorkOrderPartOrmEntity)
    private readonly partItems: Repository<WorkOrderPartOrmEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /** Never attaches the trail - it is a read model, not part of this aggregate (T11). */
  async findByNumber(number: WorkOrderNumber): Promise<WorkOrder | null> {
    const row = await this.workOrders.findOne({ where: { number: number.value } });
    if (!row) {
      return null;
    }
    const serviceRows = await this.serviceItems.find({
      where: { workOrderInternalId: row.id },
    });
    const partRows = await this.partItems.find({ where: { workOrderInternalId: row.id } });

    const [customerExternalId, vehicleExternalId, createdByExternalId, assignedMechanicExternalId] =
      await Promise.all([
        this.resolveExternalId(this.dataSource, 'customers', row.customerInternalId),
        this.resolveExternalId(this.dataSource, 'vehicles', row.vehicleInternalId),
        this.resolveExternalId(this.dataSource, 'users', row.createdByInternalId),
        row.assignedMechanicInternalId
          ? this.resolveExternalId(this.dataSource, 'users', row.assignedMechanicInternalId)
          : Promise.resolve(null),
      ]);
    const serviceExternalIdByInternalId = await this.resolveExternalIdsByInternalId(
      this.dataSource,
      'services',
      serviceRows.map((serviceRow) => serviceRow.serviceInternalId),
    );
    const inventoryItemExternalIdByInternalId = await this.resolveExternalIdsByInternalId(
      this.dataSource,
      'inventory_items',
      partRows.map((partRow) => partRow.inventoryItemInternalId),
    );

    return WorkOrderMapper.toDomain(row, serviceRows, partRows, {
      customerExternalId,
      vehicleExternalId,
      createdByExternalId,
      assignedMechanicExternalId,
      serviceExternalIdByInternalId,
      inventoryItemExternalIdByInternalId,
    });
  }

  /**
   * Opens one transaction (copying `TypeOrmSessionRepository.save`), resolves every external id
   * to its internal key, writes the work order row, and replaces its item rows: rows whose
   * external id is no longer on the aggregate are deleted, the rest are written (design.md's
   * Tech Decisions). The trail write and the constraint-violation mapping are T10.
   */
  async save(workOrder: WorkOrder): Promise<void> {
    const { workOrderRow, serviceRows, partRows } = WorkOrderMapper.toOrm(workOrder);

    await this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(WorkOrderOrmEntity, {
        where: { externalId: workOrder.id.value },
        select: { id: true, createdAt: true },
      });
      if (existing) {
        workOrderRow.id = existing.id;
        workOrderRow.createdAt = existing.createdAt;
      }
      workOrderRow.customerInternalId = await this.resolveInternalId(
        manager,
        'customers',
        workOrder.customerId,
      );
      workOrderRow.vehicleInternalId = await this.resolveInternalId(
        manager,
        'vehicles',
        workOrder.vehicleId,
      );
      workOrderRow.createdByInternalId = await this.resolveInternalId(
        manager,
        'users',
        workOrder.createdByUserId,
      );
      workOrderRow.assignedMechanicInternalId = workOrder.assignedMechanicUserId
        ? await this.resolveInternalId(manager, 'users', workOrder.assignedMechanicUserId)
        : null;
      await manager.save(WorkOrderOrmEntity, workOrderRow);

      await this.replaceServiceItems(manager, workOrderRow.id, workOrder, serviceRows);
      await this.replacePartItems(manager, workOrderRow.id, workOrder, partRows);
    });
  }

  private async replaceServiceItems(
    manager: EntityManager,
    workOrderInternalId: string,
    workOrder: WorkOrder,
    serviceRows: WorkOrderServiceOrmEntity[],
  ): Promise<void> {
    const existingRows = await manager.find(WorkOrderServiceOrmEntity, {
      where: { workOrderInternalId },
    });
    const keptExternalIds = new Set(serviceRows.map((row) => row.externalId));
    const removedRows = existingRows.filter((row) => !keptExternalIds.has(row.externalId));
    if (removedRows.length > 0) {
      await manager.remove(WorkOrderServiceOrmEntity, removedRows);
    }
    for (let index = 0; index < serviceRows.length; index += 1) {
      const row = serviceRows[index];
      const item = workOrder.serviceItems[index];
      const previous = existingRows.find((candidate) => candidate.externalId === row.externalId);
      row.workOrderInternalId = workOrderInternalId;
      row.serviceInternalId = await this.resolveInternalId(manager, 'services', item.serviceId);
      if (previous) {
        row.id = previous.id;
        row.createdAt = previous.createdAt;
      } else {
        row.createdAt = workOrder.updatedAt;
      }
    }
    if (serviceRows.length > 0) {
      await manager.save(WorkOrderServiceOrmEntity, serviceRows);
    }
  }

  private async replacePartItems(
    manager: EntityManager,
    workOrderInternalId: string,
    workOrder: WorkOrder,
    partRows: WorkOrderPartOrmEntity[],
  ): Promise<void> {
    const existingRows = await manager.find(WorkOrderPartOrmEntity, {
      where: { workOrderInternalId },
    });
    const keptExternalIds = new Set(partRows.map((row) => row.externalId));
    const removedRows = existingRows.filter((row) => !keptExternalIds.has(row.externalId));
    if (removedRows.length > 0) {
      await manager.remove(WorkOrderPartOrmEntity, removedRows);
    }
    for (let index = 0; index < partRows.length; index += 1) {
      const row = partRows[index];
      const item = workOrder.partItems[index];
      const previous = existingRows.find((candidate) => candidate.externalId === row.externalId);
      row.workOrderInternalId = workOrderInternalId;
      row.inventoryItemInternalId = await this.resolveInternalId(
        manager,
        'inventory_items',
        item.inventoryItemId,
      );
      if (previous) {
        row.id = previous.id;
        row.createdAt = previous.createdAt;
      } else {
        row.createdAt = workOrder.updatedAt;
      }
    }
    if (partRows.length > 0) {
      await manager.save(WorkOrderPartOrmEntity, partRows);
    }
  }

  /** `table` is always a literal this file controls, never external input. */
  private async resolveInternalId(
    manager: EntityManager | DataSource,
    table: string,
    externalId: string,
  ): Promise<string> {
    const rows: Array<{ id: string }> = await manager.query(
      `SELECT id FROM ${table} WHERE external_id = $1`,
      [externalId],
    );
    if (rows.length === 0) {
      throw new Error(`${table} row for external id ${externalId} not found`);
    }
    return rows[0].id;
  }

  private async resolveExternalId(
    manager: EntityManager | DataSource,
    table: string,
    internalId: string,
  ): Promise<string> {
    const rows: Array<{ external_id: string }> = await manager.query(
      `SELECT external_id FROM ${table} WHERE id = $1`,
      [internalId],
    );
    return rows[0].external_id;
  }

  private async resolveExternalIdsByInternalId(
    manager: EntityManager | DataSource,
    table: string,
    internalIds: string[],
  ): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(internalIds)];
    if (uniqueIds.length === 0) {
      return new Map();
    }
    const rows: Array<{ id: string; external_id: string }> = await manager.query(
      `SELECT id, external_id FROM ${table} WHERE id = ANY($1::bigint[])`,
      [uniqueIds],
    );
    return new Map(rows.map((row) => [row.id, row.external_id]));
  }
}
