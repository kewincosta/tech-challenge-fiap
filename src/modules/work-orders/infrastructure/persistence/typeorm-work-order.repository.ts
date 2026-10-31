import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError, Repository } from 'typeorm';
import { ConcurrentModificationError } from '../../../../shared/application/errors/concurrent-modification.error';
import {
  currentEntityManager,
  runInNewTransaction,
} from '../../../../shared/infrastructure/database/typeorm-transaction-runner';
import { CustomerKeyResolver } from '../../../customers';
import { UserKeyResolver } from '../../../identity';
import { InventoryItemKeyResolver } from '../../../inventory';
import { ServiceKeyResolver } from '../../../services';
import { VehicleKeyResolver } from '../../../vehicles';
import { WorkOrder } from '../../domain/entities/work-order';
import { VehicleAlreadyHasActiveWorkOrderError } from '../../domain/errors/vehicle-already-has-active-work-order.error';
import { WorkOrderNumberTakenError } from '../../domain/errors/work-order-number-taken.error';
import { WorkOrderTrailEvent } from '../../domain/events/work-order-trail.event';
import { WorkOrderRepository } from '../../application/ports/work-order.repository';
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

/** Keyed by external id, valued by internal key, one map per owner. */
interface InternalKeys {
  customers: Map<string, string>;
  vehicles: Map<string, string>;
  users: Map<string, string>;
  services: Map<string, string>;
  inventoryItems: Map<string, string>;
}

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
    private readonly customerKeys: CustomerKeyResolver,
    private readonly vehicleKeys: VehicleKeyResolver,
    private readonly userKeys: UserKeyResolver,
    private readonly serviceKeys: ServiceKeyResolver,
    private readonly inventoryItemKeys: InventoryItemKeyResolver,
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

    // One batch call per owner: the users are read once for every user column and budget decider.
    const userInternalIds = [
      row.createdByInternalId,
      row.assignedMechanicInternalId,
      row.budgetDecidedByInternalId,
      row.discountAppliedByInternalId,
      row.deliveredByInternalId,
      row.canceledByInternalId,
      ...budgetRows.map((budgetRow) => budgetRow.decidedByInternalId),
    ].filter((internalId): internalId is string => internalId !== null);
    const customers = await this.customerKeys.toExternalIds([row.customerInternalId]);
    const vehicles = await this.vehicleKeys.toExternalIds([row.vehicleInternalId]);
    const users = await this.userKeys.toExternalIds(userInternalIds);
    const services = await this.serviceKeys.toExternalIds(
      serviceRows.map((serviceRow) => serviceRow.serviceInternalId),
    );
    const inventoryItems = await this.inventoryItemKeys.toExternalIds(
      partRows.map((partRow) => partRow.inventoryItemInternalId),
    );
    const userExternalId = (internalId: string | null): string | null =>
      internalId ? this.externalKey(users, 'users', internalId) : null;

    return WorkOrderMapper.toDomain(row, serviceRows, partRows, budgetRows, {
      customerExternalId: this.externalKey(customers, 'customers', row.customerInternalId),
      vehicleExternalId: this.externalKey(vehicles, 'vehicles', row.vehicleInternalId),
      createdByExternalId: this.externalKey(users, 'users', row.createdByInternalId),
      assignedMechanicExternalId: userExternalId(row.assignedMechanicInternalId),
      budgetDecidedByExternalId: userExternalId(row.budgetDecidedByInternalId),
      discountAppliedByExternalId: userExternalId(row.discountAppliedByInternalId),
      deliveredByExternalId: userExternalId(row.deliveredByInternalId),
      canceledByExternalId: userExternalId(row.canceledByInternalId),
      serviceExternalIdByInternalId: services,
      inventoryItemExternalIdByInternalId: inventoryItems,
      budgetDeciderExternalIdByInternalId: users,
    });
  }

  /**
   * Resolves every external id to its internal key through the owners' key resolvers, then opens
   * one transaction (copying `TypeOrmSessionRepository.save`), writes the work order row,
   * replaces its item rows (rows whose external id is no longer on the aggregate are deleted, the
   * rest are written - design.md's Tech Decisions), and appends one trail row per event read from
   * `workOrder.domainEvents` - a non-draining read, so the use case's own `pullDomainEvents()`
   * after `save` still sees them (AD-007, H39). A violation of `ux_work_orders_number` maps to
   * `WorkOrderNumberTakenError`, which the use case retries with a fresh number; a violation of
   * `ux_work_orders_active_vehicle` maps to `VehicleAlreadyHasActiveWorkOrderError` (409) and is
   * never retried. The row write itself is version-guarded (AD-009): an update only lands if the
   * row's version still matches what this aggregate was loaded at, or
   * `ConcurrentModificationError` (409) is thrown instead.
   */
  async save(workOrder: WorkOrder): Promise<void> {
    const { workOrderRow, serviceRows, partRows, budgetRows } = WorkOrderMapper.toOrm(workOrder);
    const trailEvents = workOrder.domainEvents.filter(
      (event): event is WorkOrderTrailEvent => event instanceof WorkOrderTrailEvent,
    );
    // Read before the transaction opens, so the transaction spans only the writes. Inside an
    // ambient transaction the resolvers join it either way.
    const keys = await this.resolveInternalKeys(workOrder, trailEvents);
    const userKey = (userId: string): string => this.internalKey(keys.users, 'users', userId);

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
        workOrderRow.customerInternalId = this.internalKey(
          keys.customers,
          'customers',
          workOrder.customerId,
        );
        workOrderRow.vehicleInternalId = this.internalKey(
          keys.vehicles,
          'vehicles',
          workOrder.vehicleId,
        );
        workOrderRow.createdByInternalId = userKey(workOrder.createdByUserId);
        workOrderRow.assignedMechanicInternalId = workOrder.assignedMechanicUserId
          ? userKey(workOrder.assignedMechanicUserId)
          : null;
        workOrderRow.budgetDecidedByInternalId = workOrder.budgetDecidedByUserId
          ? userKey(workOrder.budgetDecidedByUserId)
          : null;
        workOrderRow.discountAppliedByInternalId = workOrder.discountAppliedByUserId
          ? userKey(workOrder.discountAppliedByUserId)
          : null;
        workOrderRow.deliveredByInternalId = workOrder.deliveredByUserId
          ? userKey(workOrder.deliveredByUserId)
          : null;
        workOrderRow.canceledByInternalId = workOrder.canceledByUserId
          ? userKey(workOrder.canceledByUserId)
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
            .where('id = :id AND version = :version', {
              id: existing.id,
              version: workOrder.version,
            })
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
          keys.users,
        );
        await this.replaceServiceItems(
          manager,
          workOrderRow.id,
          workOrder,
          serviceRows,
          internalIdByRound,
          keys.services,
        );
        await this.replacePartItems(
          manager,
          workOrderRow.id,
          workOrder,
          partRows,
          internalIdByRound,
          keys.inventoryItems,
        );
        await this.appendTrail(manager, workOrderRow.id, trailEvents, keys.users);
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
    trailEvents: readonly WorkOrderTrailEvent[],
    userKeys: Map<string, string>,
  ): Promise<void> {
    if (trailEvents.length === 0) {
      return;
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
      row.actorInternalId = this.internalKey(userKeys, 'users', event.actorUserId);
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
    userKeys: Map<string, string>,
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
        ? this.internalKey(userKeys, 'users', budget.decidedByUserId)
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
    serviceKeys: Map<string, string>,
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
      row.serviceInternalId = this.internalKey(serviceKeys, 'services', item.serviceId);
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
    inventoryItemKeys: Map<string, string>,
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
      row.inventoryItemInternalId = this.internalKey(
        inventoryItemKeys,
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
   * A use case that saves this aggregate together with a step of its own outbox runs both inside
   * one `transactionRunner.run`, so this save joins that transaction and the step and the work
   * order commit or roll back together. With no ambient transaction the save opens its own through
   * `runInNewTransaction`, which publishes the manager as the ambient one.
   */
  private inTransaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    const ambient = currentEntityManager();
    return ambient ? work(ambient) : runInNewTransaction(this.dataSource, work);
  }

  /** Every key a save writes, from one batch call per owner. */
  private async resolveInternalKeys(
    workOrder: WorkOrder,
    trailEvents: readonly WorkOrderTrailEvent[],
  ): Promise<InternalKeys> {
    const userIds = [
      workOrder.createdByUserId,
      workOrder.assignedMechanicUserId,
      workOrder.budgetDecidedByUserId,
      workOrder.discountAppliedByUserId,
      workOrder.deliveredByUserId,
      workOrder.canceledByUserId,
      ...workOrder.budgets.map((budget) => budget.decidedByUserId),
      ...trailEvents.map((event) => event.actorUserId),
    ].filter((userId): userId is string => userId !== null);
    return {
      customers: await this.customerKeys.toInternalIds([workOrder.customerId]),
      vehicles: await this.vehicleKeys.toInternalIds([workOrder.vehicleId]),
      users: await this.userKeys.toInternalIds(userIds),
      services: await this.serviceKeys.toInternalIds(
        workOrder.serviceItems.map((item) => item.serviceId),
      ),
      inventoryItems: await this.inventoryItemKeys.toInternalIds(
        workOrder.partItems.map((item) => item.inventoryItemId),
      ),
    };
  }

  /** `owner` only names the row in the message. A key an owner does not know is an inconsistency. */
  private internalKey(keys: Map<string, string>, owner: string, externalId: string): string {
    const internalId = keys.get(externalId);
    if (internalId === undefined) {
      throw new Error(`${owner} row for external id ${externalId} not found`);
    }
    return internalId;
  }

  private externalKey(keys: Map<string, string>, owner: string, internalId: string): string {
    const externalId = keys.get(internalId);
    if (externalId === undefined) {
      throw new Error(`${owner} row for internal id ${internalId} not found`);
    }
    return externalId;
  }

  private isViolation(error: unknown, constraint: string): boolean {
    return (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string }).code === UNIQUE_VIOLATION &&
      (error.driverError as { constraint?: string }).constraint === constraint
    );
  }
}
