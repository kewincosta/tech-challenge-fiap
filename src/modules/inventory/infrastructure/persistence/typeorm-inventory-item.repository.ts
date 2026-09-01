import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError, Repository } from 'typeorm';
import { currentEntityManager } from '../../../../shared/infrastructure/database/typeorm-transaction-runner';
import { InventoryItem } from '../../domain/entities/inventory-item';
import { InsufficientStockError } from '../../domain/errors/insufficient-stock.error';
import { SkuAlreadyInUseError } from '../../domain/errors/sku-already-in-use.error';
import {
  InventoryItemRepository,
  PendingConsumptionDto,
} from '../../domain/repositories/inventory-item.repository';
import { StockMovementKind } from '../../domain/stock-movement-kind';
import { InventoryItemId } from '../../domain/value-objects/inventory-item-id';
import { Sku } from '../../domain/value-objects/sku';
import { InventoryItemMapper } from './inventory-item.mapper';
import { InventoryItemOrmEntity } from './inventory-item.orm-entity';
import { StockMovementOrmEntity } from './stock-movement.orm-entity';

const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';
const ACTIVE_SKU_CONSTRAINT = 'ux_inventory_items_active_sku';
const QUANTITY_CHECK_CONSTRAINT = 'chk_inventory_items_quantity_on_hand';

@Injectable()
export class TypeOrmInventoryItemRepository implements InventoryItemRepository {
  constructor(
    @InjectRepository(InventoryItemOrmEntity)
    private readonly items: Repository<InventoryItemOrmEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /** Never attaches movements - the full ledger is a read model, not part of this aggregate. */
  async findById(id: InventoryItemId): Promise<InventoryItem | null> {
    const row = await this.items.findOne({ where: { externalId: id.value } });
    return row ? InventoryItemMapper.toDomain(row) : null;
  }

  async existsActiveBySku(sku: Sku): Promise<boolean> {
    const count = await this.items
      .createQueryBuilder('item')
      .where('item.sku = :sku', { sku: sku.value })
      .andWhere('item.status = :status', { status: 'ACTIVE' })
      .getCount();
    return count > 0;
  }

  /**
   * The deadlock fix lives here, not in any caller: every batch, whatever order the client sent
   * its lines in, locks the same items in internal-id order in one query (design.md's Risks &
   * Concerns). Meant to run inside the caller's own open transaction - `ConsumeStockBatchHandler`
   * and `RestoreStockBatchHandler` are always reached from inside `WithdrawPartsHandler`'s or
   * `ReturnPartsHandler`'s `transactionRunner.run`, so the lock this takes is held for that whole
   * transaction, not released when this query alone finishes.
   */
  async findAllByIdsForUpdate(ids: InventoryItemId[]): Promise<InventoryItem[]> {
    if (ids.length === 0) {
      return [];
    }
    const manager = currentEntityManager() ?? this.dataSource.manager;
    const rows = await manager
      .createQueryBuilder(InventoryItemOrmEntity, 'item')
      .where('item.externalId IN (:...ids)', { ids: ids.map((id) => id.value) })
      .orderBy('item.id', 'ASC')
      .setLock('pessimistic_write')
      .getMany();
    return rows.map((row) => InventoryItemMapper.toDomain(row));
  }

  /**
   * Newest first, each carrying what is still un-returned on it - a `RETURN` never edits the
   * consumption it undoes (rule 22), so "pending" alone would keep offering an already-exhausted
   * consumption forever. `quantity - COALESCE(returned, 0)` is the true remaining amount, and a
   * consumption drained to zero drops out of the result entirely. This is the only place a
   * return's `undoesMovementId` comes from - work-orders has no way to know a movement id, since
   * that data lives only in `stock_movements`, this module's own ledger (spec.md's Assumptions).
   */
  async findPendingConsumptions(
    inventoryItemId: InventoryItemId,
    workOrderId: string,
  ): Promise<PendingConsumptionDto[]> {
    const manager = currentEntityManager() ?? this.dataSource.manager;
    const rows: Array<{ external_id: string; remaining: number }> = await manager.query(
      `SELECT sm.external_id, (sm.quantity - COALESCE(returned.total, 0))::integer AS remaining
         FROM stock_movements sm
         JOIN inventory_items ii ON ii.id = sm.inventory_item_id
         JOIN work_orders wo ON wo.id = sm.work_order_id
         LEFT JOIN (
           SELECT undoes_movement_id, SUM(quantity) AS total
             FROM stock_movements
            WHERE kind = 'RETURN'
            GROUP BY undoes_movement_id
         ) returned ON returned.undoes_movement_id = sm.id
        WHERE ii.external_id = $1 AND wo.external_id = $2
          AND sm.kind = 'CONSUMPTION' AND sm.status = 'PENDING'
          AND sm.quantity - COALESCE(returned.total, 0) > 0
        ORDER BY sm.occurred_at DESC`,
      [inventoryItemId.value, workOrderId],
    );
    return rows.map((row) => ({ movementId: row.external_id, quantity: row.remaining }));
  }

  /**
   * Opens one transaction (copying `TypeOrmSessionRepository.save`), locks the item row
   * (`SELECT ... FOR UPDATE`) and writes the item plus every row in `item.newMovements` inside it.
   *
   * The persisted `quantity_on_hand` is re-derived from the value the lock just read, plus this
   * save's own delta - never taken directly from `item.quantityOnHand`. That field was computed
   * by the aggregate against whatever `findById` returned earlier in the request, which may
   * already be stale by the time this transaction acquires the lock; only a value read *after*
   * the lock is trustworthy (design.md's Risks: the `CHECK` constraint backstops the invariant,
   * only the lock protects the arithmetic).
   */
  async save(item: InventoryItem): Promise<void> {
    const { itemRow, movementRows } = InventoryItemMapper.toOrm(item);
    // Keyed on the movement's own kind, not on "anything but INBOUND" - INBOUND and RETURN both
    // put units back on the shelf, CONSUMPTION and ADJUSTMENT both take them off. Getting this
    // wrong once RETURN movements exist would double a return's loss instead of undoing it
    // (design.md's Risks & Concerns, first row).
    const delta = item.newMovements.reduce((sum, movement) => {
      const sign =
        movement.kind === StockMovementKind.Inbound || movement.kind === StockMovementKind.Return
          ? 1
          : -1;
      return sum + sign * movement.quantity;
    }, 0);
    try {
      await this.inTransaction(async (manager) => {
        const existing = await manager.findOne(InventoryItemOrmEntity, {
          where: { externalId: item.id.value },
          lock: { mode: 'pessimistic_write' },
        });
        if (existing) {
          itemRow.id = existing.id;
          itemRow.quantityOnHand = existing.quantityOnHand + delta;
        }
        await manager.save(InventoryItemOrmEntity, itemRow);

        if (movementRows.length > 0) {
          for (let index = 0; index < movementRows.length; index += 1) {
            const movement = item.newMovements[index];
            movementRows[index].inventoryItemInternalId = itemRow.id;
            movementRows[index].actorInternalId = await this.resolveInternalId(
              manager,
              'users',
              movement.actorUserId,
            );
            movementRows[index].workOrderInternalId = movement.workOrderId
              ? await this.resolveInternalId(manager, 'work_orders', movement.workOrderId)
              : null;
            movementRows[index].undoesMovementInternalId = movement.undoesMovementId
              ? await this.resolveInternalId(manager, 'stock_movements', movement.undoesMovementId)
              : null;
          }
          await manager.save(StockMovementOrmEntity, movementRows);
        }
      });
    } catch (error) {
      if (this.isViolation(error, UNIQUE_VIOLATION, ACTIVE_SKU_CONSTRAINT)) {
        throw new SkuAlreadyInUseError();
      }
      if (this.isViolation(error, CHECK_VIOLATION, QUANTITY_CHECK_CONSTRAINT)) {
        throw new InsufficientStockError();
      }
      throw error;
    }
  }

  /**
   * A cross-module write (this feature's `ConsumeStockBatchCommand`/`RestoreStockBatchCommand`,
   * dispatched from inside `WithdrawPartsHandler`'s `transactionRunner.run`) must land in the
   * same Postgres transaction as the work order write it accompanies, or a failure on one side
   * leaves the other committed (AD-008). Falls back to opening its own transaction when there is
   * no ambient one, which is every call this repository has ever received before this feature -
   * that fallback is the regression net the whole existing suite already proves.
   */
  private inTransaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    const ambient = currentEntityManager();
    return ambient ? work(ambient) : this.dataSource.transaction(work);
  }

  /** `table` is always a literal this file controls, never external input. */
  private async resolveInternalId(
    manager: EntityManager,
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

  private isViolation(error: unknown, code: string, constraint: string): boolean {
    return (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string }).code === code &&
      (error.driverError as { constraint?: string }).constraint === constraint
    );
  }
}
