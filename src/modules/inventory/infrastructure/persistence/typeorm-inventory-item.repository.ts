import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError, Repository } from 'typeorm';
import { currentEntityManager } from '../../../../shared/infrastructure/database/typeorm-transaction-runner';
import { InventoryItem } from '../../domain/entities/inventory-item';
import { InsufficientStockError } from '../../domain/errors/insufficient-stock.error';
import { SkuAlreadyInUseError } from '../../domain/errors/sku-already-in-use.error';
import { InventoryItemRepository } from '../../domain/repositories/inventory-item.repository';
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
