import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError, Repository } from 'typeorm';
import {
  currentEntityManager,
  runInNewTransaction,
} from '../../../../shared/infrastructure/database/typeorm-transaction-runner';
import { UserKeyResolver } from '../../../identity';
import {
  InventoryItemRepository,
  MovementClosureInput,
  OperationConsumptionDto,
  PendingConsumptionDto,
} from '../../application/ports/inventory-item.repository';
import { InventoryItem } from '../../domain/entities/inventory-item';
import { InsufficientStockError } from '../../domain/errors/insufficient-stock.error';
import { SkuAlreadyInUseError } from '../../domain/errors/sku-already-in-use.error';
import { StockMovementKind } from '../../domain/stock-movement-kind';
import { InventoryItemId } from '../../domain/value-objects/inventory-item-id';
import { Sku } from '../../domain/value-objects/sku';
import { WORK_ORDER_READS, WorkOrderReads } from '../work-order-reads';
import { InventoryItemMapper } from './inventory-item.mapper';
import { InventoryItemOrmEntity } from './inventory-item.orm-entity';
import { StockMovementOrmEntity } from './stock-movement.orm-entity';

const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';
const ACTIVE_SKU_CONSTRAINT = 'ux_inventory_items_active_sku';
const QUANTITY_CHECK_CONSTRAINT = 'chk_inventory_items_quantity_on_hand';

/**
 * A RETURN never edits the consumption it undoes (rule 22), so a consumption's own `quantity`
 * overstates what is still outstanding on it once a return has drawn from it. Every reader of
 * "how much is still outstanding on this consumption" - `findPendingConsumptions` and the
 * write-off - joins this same subquery and reads this same expression, so the two can never drift
 * apart the way two independently written copies of the same formula did on a prior feature.
 */
const RETURNED_TOTALS_JOIN = `
  LEFT JOIN (
    SELECT undoes_movement_id, SUM(quantity) AS total
      FROM stock_movements
     WHERE kind = 'RETURN'
     GROUP BY undoes_movement_id
  ) returned ON returned.undoes_movement_id = sm.id
`;
const NET_REMAINING_EXPR = `(sm.quantity - COALESCE(returned.total, 0))::integer`;

@Injectable()
export class TypeOrmInventoryItemRepository implements InventoryItemRepository {
  constructor(
    @InjectRepository(InventoryItemOrmEntity)
    private readonly items: Repository<InventoryItemOrmEntity>,
    private readonly dataSource: DataSource,
    @Inject(WORK_ORDER_READS) private readonly workOrderReads: WorkOrderReads,
    private readonly userKeys: UserKeyResolver,
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
   * Concerns). Must run inside an open transaction, where the lock is held until that transaction
   * commits and not released when this query alone finishes. `ConsumeStockBatchUseCase`,
   * `RestoreStockBatchUseCase` and `UndoConsumptionUseCase` open that transaction themselves.
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
    const workOrderInternalId = await this.workOrderReads.internalIdOf(workOrderId);
    if (workOrderInternalId === null) {
      return [];
    }
    const manager = currentEntityManager() ?? this.dataSource.manager;
    const rows: Array<{ external_id: string; remaining: number }> = await manager.query(
      `SELECT sm.external_id, ${NET_REMAINING_EXPR} AS remaining
         FROM stock_movements sm
         JOIN inventory_items ii ON ii.id = sm.inventory_item_id
         ${RETURNED_TOTALS_JOIN}
        WHERE ii.external_id = $1 AND sm.work_order_id = $2
          AND sm.kind = 'CONSUMPTION' AND sm.status = 'PENDING'
          AND ${NET_REMAINING_EXPR} > 0
        ORDER BY sm.occurred_at DESC`,
      [inventoryItemId.value, workOrderInternalId],
    );
    return rows.map((row) => ({ movementId: row.external_id, quantity: row.remaining }));
  }

  /**
   * What an undo gives back: the operation's consumptions with units left, newest first, on the
   * same net-remaining figure as `findPendingConsumptions` and the write-off. The status is left
   * out on purpose. An undone operation never reached the work order, so a consumption that a
   * cancellation wrote off or a delivery settled while the operation was in flight still comes
   * back. The consumptions carry the work order's internal key, so the external id comes from its
   * owner in one batch.
   */
  async findPendingConsumptionsOfOperation(
    operationId: string,
  ): Promise<OperationConsumptionDto[]> {
    const manager = currentEntityManager() ?? this.dataSource.manager;
    const rows: Array<{
      external_id: string;
      item_external_id: string;
      work_order_id: string;
      remaining: number;
    }> = await manager.query(
      `SELECT sm.external_id, ii.external_id AS item_external_id, sm.work_order_id,
              ${NET_REMAINING_EXPR} AS remaining
         FROM stock_movements sm
         JOIN inventory_items ii ON ii.id = sm.inventory_item_id
         ${RETURNED_TOTALS_JOIN}
        WHERE sm.operation_id = $1
          AND sm.kind = 'CONSUMPTION'
          AND ${NET_REMAINING_EXPR} > 0
        ORDER BY sm.occurred_at DESC, sm.id DESC`,
      [operationId],
    );
    if (rows.length === 0) {
      return [];
    }
    const workOrders = await this.workOrderReads.externalIdsOf([
      ...new Set(rows.map((row) => row.work_order_id)),
    ]);
    return rows.map((row) => {
      const workOrderId = workOrders.get(row.work_order_id);
      if (workOrderId === undefined) {
        throw new Error(`work_orders row for internal key ${row.work_order_id} not found`);
      }
      return {
        movementId: row.external_id,
        inventoryItemId: row.item_external_id,
        workOrderId,
        quantity: row.remaining,
      };
    });
  }

  async hasReturnOfOperation(operationId: string): Promise<boolean> {
    const manager = currentEntityManager() ?? this.dataSource.manager;
    const rows: unknown[] = await manager.query(
      `SELECT 1 FROM stock_movements WHERE operation_id = $1 AND kind = 'RETURN' LIMIT 1`,
      [operationId],
    );
    return rows.length > 0;
  }

  async confirmConsumptionsOfOperation(operationId: string, confirmedAt: Date): Promise<void> {
    const manager = currentEntityManager() ?? this.dataSource.manager;
    await manager.query(
      `UPDATE stock_movements
          SET confirmed_at = $2
        WHERE operation_id = $1 AND kind = 'CONSUMPTION' AND confirmed_at IS NULL`,
      [operationId, confirmedAt],
    );
  }

  /** Rule 23: every `PENDING` consumption of the work order, whatever its remaining balance,
   * moves to `SETTLED` on delivery - see the interface doc for why netting does not apply here. */
  async settleWorkOrderConsumptions(input: MovementClosureInput): Promise<number> {
    const manager = currentEntityManager() ?? this.dataSource.manager;
    const actorInternalId = await this.actorInternalId(input.actorUserId);
    const workOrderInternalId = await this.workOrderReads.internalIdOf(input.workOrderId);
    if (workOrderInternalId === null) {
      return 0;
    }
    // TypeORM's raw `query()` returns `[rows, rowCount]` for UPDATE/DELETE, unlike the plain rows
    // array a SELECT or INSERT returns - `PostgresQueryRunner.query`'s own switch on `raw.command`.
    const [rows]: [Array<{ id: string }>, number] = await manager.query(
      `UPDATE stock_movements
          SET status = 'SETTLED'
        WHERE work_order_id = $1
          AND kind = 'CONSUMPTION' AND status = 'PENDING'
        RETURNING id`,
      [workOrderInternalId],
    );
    if (rows.length === 0) {
      return 0;
    }
    await manager.query(
      `INSERT INTO stock_movement_transitions
         (external_id, stock_movement_id, from_status, to_status, actor_user_id, occurred_at, quantity)
       SELECT gen_random_uuid(), movement_id, 'PENDING', 'SETTLED', $2, $3, NULL
         FROM unnest($1::bigint[]) AS movement_id`,
      [rows.map((row) => row.id), actorInternalId, input.now],
    );
    return rows.length;
  }

  /** Rule 24: only what is still outstanding on a `PENDING` consumption is lost - a consumption a
   * prior return already drained contributes nothing and is skipped entirely. */
  async writeOffWorkOrderConsumptions(input: MovementClosureInput): Promise<number> {
    const manager = currentEntityManager() ?? this.dataSource.manager;
    const actorInternalId = await this.actorInternalId(input.actorUserId);
    const workOrderInternalId = await this.workOrderReads.internalIdOf(input.workOrderId);
    if (workOrderInternalId === null) {
      return 0;
    }
    const candidates: Array<{ id: string; remaining: number }> = await manager.query(
      `SELECT sm.id, ${NET_REMAINING_EXPR} AS remaining
         FROM stock_movements sm
         ${RETURNED_TOTALS_JOIN}
        WHERE sm.work_order_id = $1
          AND sm.kind = 'CONSUMPTION' AND sm.status = 'PENDING'
          AND ${NET_REMAINING_EXPR} > 0`,
      [workOrderInternalId],
    );
    if (candidates.length === 0) {
      return 0;
    }
    // Only the rows still pending are updated, and only those get a transition. A run that read the
    // same consumptions as another one waits at this update for the other's row locks, and once the
    // other commits it finds the rows no longer pending, so each transition is recorded once.
    const [written]: [Array<{ id: string }>, number] = await manager.query(
      `UPDATE stock_movements SET status = 'WRITTEN_OFF'
        WHERE id = ANY($1::bigint[]) AND status = 'PENDING'
        RETURNING id`,
      [candidates.map((row) => row.id)],
    );
    if (written.length === 0) {
      return 0;
    }
    const remainingById = new Map(candidates.map((row) => [row.id, row.remaining]));
    await manager.query(
      `INSERT INTO stock_movement_transitions
         (external_id, stock_movement_id, from_status, to_status, actor_user_id, occurred_at, quantity)
       SELECT gen_random_uuid(), t.movement_id, 'PENDING', 'WRITTEN_OFF', $3, $4, t.qty
         FROM unnest($1::bigint[], $2::integer[]) AS t(movement_id, qty)`,
      [
        written.map((row) => row.id),
        written.map((row) => remainingById.get(row.id)),
        actorInternalId,
        input.now,
      ],
    );
    return written.length;
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
            movementRows[index].actorInternalId = await this.actorInternalId(movement.actorUserId);
            movementRows[index].workOrderInternalId = movement.workOrderId
              ? await this.workOrderInternalId(movement.workOrderId)
              : null;
            movementRows[index].undoesMovementInternalId = movement.undoesMovementId
              ? await this.movementInternalId(manager, movement.undoesMovementId)
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
   * A stock use case saves its items inside the transaction it opened, after it locked them, so
   * this save joins that transaction and the locks and the writes commit together. With no
   * ambient transaction the save opens its own through `runInNewTransaction`, which publishes the
   * manager as the ambient one: the user key resolver and the work order reads that `save` calls
   * then join the transaction and hold no second pool connection.
   */
  private inTransaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    const ambient = currentEntityManager();
    return ambient ? work(ambient) : runInNewTransaction(this.dataSource, work);
  }

  private async actorInternalId(actorUserId: string): Promise<string> {
    const internalId = await this.userKeys.toInternalId(actorUserId);
    if (internalId === null) {
      throw new Error(`users row for external id ${actorUserId} not found`);
    }
    return internalId;
  }

  private async workOrderInternalId(workOrderId: string): Promise<string> {
    const internalId = await this.workOrderReads.internalIdOf(workOrderId);
    if (internalId === null) {
      throw new Error(`work_orders row for external id ${workOrderId} not found`);
    }
    return internalId;
  }

  private async movementInternalId(manager: EntityManager, externalId: string): Promise<string> {
    const rows: Array<{ id: string }> = await manager.query(
      `SELECT id FROM stock_movements WHERE external_id = $1`,
      [externalId],
    );
    if (rows.length === 0) {
      throw new Error(`stock_movements row for external id ${externalId} not found`);
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
