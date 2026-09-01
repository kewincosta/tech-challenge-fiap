import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError, Repository } from 'typeorm';
import { ConcurrentModificationError } from '../../../../shared/application/errors/concurrent-modification.error';
import { DomainEvent } from '../../../../shared/domain/domain-event';
import { currentEntityManager } from '../../../../shared/infrastructure/database/typeorm-transaction-runner';
import { WorkOrder } from '../../domain/entities/work-order';
import { VehicleAlreadyHasActiveWorkOrderError } from '../../domain/errors/vehicle-already-has-active-work-order.error';
import { WorkOrderNumberTakenError } from '../../domain/errors/work-order-number-taken.error';
import { WorkOrderTrailEvent } from '../../domain/events/work-order-trail.event';
import { WorkOrderRepository } from '../../domain/repositories/work-order.repository';
import { WorkOrderNumber } from '../../domain/value-objects/work-order-number';
import { WorkOrderMapper } from './work-order.mapper';
import { WorkOrderBudgetOrmEntity } from './work-order-budget.orm-entity';
import { WorkOrderEventOrmEntity } from './work-order-event.orm-entity';
import { WorkOrderPartOrmEntity } from './work-order-part.orm-entity';
import { WorkOrderServiceOrmEntity } from './work-order-service.orm-entity';
import { WorkOrderOrmEntity } from './work-order.orm-entity';

const UNIQUE_VIOLATION = '23505';
const ACTIVE_VEHICLE_CONSTRAINT = 'ux_work_orders_active_vehicle';
const NUMBER_CONSTRAINT = 'ux_work_orders_number';

@Injectable()
export class TypeOrmWorkOrderRepository implements WorkOrderRepository {
  constructor(
    @InjectRepository(WorkOrderOrmEntity)
    private readonly workOrders: Repository<WorkOrderOrmEntity>,
    @InjectRepository(WorkOrderServiceOrmEntity)
    private readonly serviceItems: Repository<WorkOrderServiceOrmEntity>,
    @InjectRepository(WorkOrderPartOrmEntity)
    private readonly partItems: Repository<WorkOrderPartOrmEntity>,
    @InjectRepository(WorkOrderBudgetOrmEntity)
    private readonly budgets: Repository<WorkOrderBudgetOrmEntity>,
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
    const budgetRows = await this.budgets.find({ where: { workOrderInternalId: row.id } });

    const [
      customerExternalId,
      vehicleExternalId,
      createdByExternalId,
      assignedMechanicExternalId,
      budgetDecidedByExternalId,
      discountAppliedByExternalId,
      deliveredByExternalId,
      canceledByExternalId,
    ] = await Promise.all([
      this.resolveExternalId(this.dataSource, 'customers', row.customerInternalId),
      this.resolveExternalId(this.dataSource, 'vehicles', row.vehicleInternalId),
      this.resolveExternalId(this.dataSource, 'users', row.createdByInternalId),
      row.assignedMechanicInternalId
        ? this.resolveExternalId(this.dataSource, 'users', row.assignedMechanicInternalId)
        : Promise.resolve(null),
      row.budgetDecidedByInternalId
        ? this.resolveExternalId(this.dataSource, 'users', row.budgetDecidedByInternalId)
        : Promise.resolve(null),
      row.discountAppliedByInternalId
        ? this.resolveExternalId(this.dataSource, 'users', row.discountAppliedByInternalId)
        : Promise.resolve(null),
      row.deliveredByInternalId
        ? this.resolveExternalId(this.dataSource, 'users', row.deliveredByInternalId)
        : Promise.resolve(null),
      row.canceledByInternalId
        ? this.resolveExternalId(this.dataSource, 'users', row.canceledByInternalId)
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
    const budgetDeciderExternalIdByInternalId = await this.resolveExternalIdsByInternalId(
      this.dataSource,
      'users',
      budgetRows
        .map((budgetRow) => budgetRow.decidedByInternalId)
        .filter((internalId): internalId is string => internalId !== null),
    );

    return WorkOrderMapper.toDomain(row, serviceRows, partRows, budgetRows, {
      customerExternalId,
      vehicleExternalId,
      createdByExternalId,
      assignedMechanicExternalId,
      budgetDecidedByExternalId,
      discountAppliedByExternalId,
      deliveredByExternalId,
      canceledByExternalId,
      serviceExternalIdByInternalId,
      inventoryItemExternalIdByInternalId,
      budgetDeciderExternalIdByInternalId,
    });
  }

  /**
   * Opens one transaction (copying `TypeOrmSessionRepository.save`), resolves every external id
   * to its internal key, writes the work order row, replaces its item rows (rows whose external
   * id is no longer on the aggregate are deleted, the rest are written - design.md's Tech
   * Decisions), and appends one trail row per event read from `workOrder.domainEvents` - a
   * non-draining read, so the handler's own `pullDomainEvents()` after `save` still sees them
   * (AD-007, H39). A violation of `ux_work_orders_number` maps to `WorkOrderNumberTakenError`,
   * which the handler retries with a fresh number; a violation of `ux_work_orders_active_vehicle`
   * maps to `VehicleAlreadyHasActiveWorkOrderError` (409) and is never retried. The row write
   * itself is version-guarded (AD-009): an update only lands if the row's version still matches
   * what this aggregate was loaded at, or `ConcurrentModificationError` (409) is thrown instead.
   */
  async save(workOrder: WorkOrder): Promise<void> {
    const { workOrderRow, serviceRows, partRows, budgetRows } = WorkOrderMapper.toOrm(workOrder);
    const events = workOrder.domainEvents;

    try {
      await this.inTransaction(async (manager) => {
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
        workOrderRow.budgetDecidedByInternalId = workOrder.budgetDecidedByUserId
          ? await this.resolveInternalId(manager, 'users', workOrder.budgetDecidedByUserId)
          : null;
        workOrderRow.discountAppliedByInternalId = workOrder.discountAppliedByUserId
          ? await this.resolveInternalId(manager, 'users', workOrder.discountAppliedByUserId)
          : null;
        workOrderRow.deliveredByInternalId = workOrder.deliveredByUserId
          ? await this.resolveInternalId(manager, 'users', workOrder.deliveredByUserId)
          : null;
        workOrderRow.canceledByInternalId = workOrder.canceledByUserId
          ? await this.resolveInternalId(manager, 'users', workOrder.canceledByUserId)
          : null;

        // AD-009: an update is guarded by the version this aggregate was loaded at, bumped in the
        // same statement. Zero rows affected means another write landed first - the version
        // column no longer matches what `existing` read moments ago. An insert has no prior
        // writer to race against, so it carries no guard, only the starting version.
        if (existing) {
          const result = await manager
            .createQueryBuilder()
            .update(WorkOrderOrmEntity)
            .set({ ...workOrderRow, version: () => 'version + 1' })
            .where('id = :id AND version = :version', { id: existing.id, version: workOrder.version })
            .execute();
          if (result.affected === 0) {
            throw new ConcurrentModificationError();
          }
          workOrderRow.version = workOrder.version + 1;
        } else {
          workOrderRow.version = 0;
          await manager.save(WorkOrderOrmEntity, workOrderRow);
        }

        // Budgets before items: an item's budget_id is a foreign key to a budget row whose
        // internal key does not exist until it is inserted (design.md's Tech Decisions).
        const internalIdByRound = await this.replaceBudgets(
          manager,
          workOrderRow.id,
          workOrder,
          budgetRows,
        );
        await this.replaceServiceItems(manager, workOrderRow.id, workOrder, serviceRows, internalIdByRound);
        await this.replacePartItems(manager, workOrderRow.id, workOrder, partRows, internalIdByRound);
        await this.appendTrail(manager, workOrderRow.id, events);
      });
    } catch (error) {
      if (this.isViolation(error, ACTIVE_VEHICLE_CONSTRAINT)) {
        throw new VehicleAlreadyHasActiveWorkOrderError();
      }
      if (this.isViolation(error, NUMBER_CONSTRAINT)) {
        throw new WorkOrderNumberTakenError();
      }
      throw error;
    }
  }

  private async appendTrail(
    manager: EntityManager,
    workOrderInternalId: string,
    events: readonly DomainEvent[],
  ): Promise<void> {
    const trailEvents = events.filter(
      (event): event is WorkOrderTrailEvent => event instanceof WorkOrderTrailEvent,
    );
    if (trailEvents.length === 0) {
      return;
    }
    const actorInternalIdByExternalId = new Map<string, string>();
    for (const actorExternalId of new Set(trailEvents.map((event) => event.actorUserId))) {
      actorInternalIdByExternalId.set(
        actorExternalId,
        await this.resolveInternalId(manager, 'users', actorExternalId),
      );
    }
    const rows = trailEvents.map((event) => {
      const row = new WorkOrderEventOrmEntity();
      // Trail rows carry no domain-assigned id - unlike a StockMovement, an event class has no
      // caller-supplied id to serialise, so the repository mints one for the column alone.
      row.externalId = randomUUID();
      row.workOrderInternalId = workOrderInternalId;
      row.eventType = event.eventType;
      row.fromStatus = event.fromStatus;
      row.toStatus = event.toStatus;
      row.actorInternalId = actorInternalIdByExternalId.get(event.actorUserId) ?? null;
      row.occurredAt = event.occurredAt;
      row.note = null;
      return row;
    });
    await manager.save(WorkOrderEventOrmEntity, rows);
  }

  /**
   * A budget round is never removed once generated - unlike an item, nothing deletes an existing
   * row here. Returns the round-to-internal-id map the item writers need for `budget_id`; a
   * newly inserted row's `id` is filled in by `manager.save` itself.
   */
  private async replaceBudgets(
    manager: EntityManager,
    workOrderInternalId: string,
    workOrder: WorkOrder,
    budgetRows: WorkOrderBudgetOrmEntity[],
  ): Promise<Map<number, string>> {
    const existingRows = await manager.find(WorkOrderBudgetOrmEntity, {
      where: { workOrderInternalId },
    });
    for (let index = 0; index < budgetRows.length; index += 1) {
      const row = budgetRows[index];
      const budget = workOrder.budgets[index];
      const previous = existingRows.find((candidate) => candidate.externalId === row.externalId);
      row.workOrderInternalId = workOrderInternalId;
      row.decidedByInternalId = budget.decidedByUserId
        ? await this.resolveInternalId(manager, 'users', budget.decidedByUserId)
        : null;
      if (previous) {
        row.id = previous.id;
      }
    }
    if (budgetRows.length > 0) {
      await manager.save(WorkOrderBudgetOrmEntity, budgetRows);
    }
    return new Map(budgetRows.map((row) => [row.round, row.id]));
  }

  private async replaceServiceItems(
    manager: EntityManager,
    workOrderInternalId: string,
    workOrder: WorkOrder,
    serviceRows: WorkOrderServiceOrmEntity[],
    internalIdByRound: Map<number, string>,
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
      row.budgetInternalId =
        item.budgetRound !== null ? (internalIdByRound.get(item.budgetRound) ?? null) : null;
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
    internalIdByRound: Map<number, string>,
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
      row.budgetInternalId =
        item.budgetRound !== null ? (internalIdByRound.get(item.budgetRound) ?? null) : null;
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

  /**
   * `WithdrawPartsHandler` and `ReturnPartsHandler` save this aggregate and dispatch a cross-
   * module inventory command inside one `transactionRunner.run` - both writes must land in the
   * same Postgres transaction, or a failure on one side leaves the other committed (AD-008).
   * Falls back to opening its own transaction when there is no ambient one, which is every call
   * this repository received before this feature - the existing suite is that fallback's
   * regression net.
   */
  private inTransaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    const ambient = currentEntityManager();
    return ambient ? work(ambient) : this.dataSource.transaction(work);
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

  private isViolation(error: unknown, constraint: string): boolean {
    return (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string }).code === UNIQUE_VIOLATION &&
      (error.driverError as { constraint?: string }).constraint === constraint
    );
  }
}
