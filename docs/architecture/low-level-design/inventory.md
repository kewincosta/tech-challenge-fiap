# inventory

What the workshop holds in stock, how much is left, and the traceable history of every unit that
moved. The whole of the Inventory context.

Parts and supplies are one aggregate distinguished by a label
([0013](../../adr/0013-one-inventory-item-aggregate.md)). Stock leaves the shelf when a mechanic
withdraws it, not when it is planned ([0014](../../adr/0014-stock-consumed-at-withdrawal.md)).

Conventions this page does not repeat are in [the high level design](../high-level-design.md).

## Aggregates

`InventoryItem` (`domain/entities/inventory-item.ts`) and `StockMovement`
(`domain/entities/stock-movement.ts`).

Invariants they hold:

- `quantity_on_hand` never goes below zero. The aggregate refuses it, and `chk_inventory_items_quantity_on_hand` is the last line of defence.
- A SKU is unique among active items (`ux_inventory_items_active_sku`).
- A movement is never updated to mean something else and never deleted. Only a consumption's status moves, and every move appends a transition ([0015](../../adr/0015-stock-movements-append-only.md)).
- A movement's quantity is always positive. Direction is carried by `kind`, not by a sign.
- An adjustment requires a note. `INVENTORY_ADJUSTMENT_NOTE_REQUIRED` (400).

## Value objects and enums

| Name                  | Rule                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `Sku`                 | Trimmed, uppercased, shape-validated. `INVENTORY_INVALID_SKU` (400).                      |
| `StockQuantity`       | A non-negative whole number. `INVENTORY_INVALID_STOCK_QUANTITY` (400).                    |
| `InventoryItemKind`   | `PART` or `SUPPLY`. A label, not a behavioural branch.                                    |
| `StockMovementKind`   | `INBOUND`, `CONSUMPTION`, `RETURN`, `ADJUSTMENT`.                                         |
| `StockMovementStatus` | `PENDING`, `SETTLED`, `WRITTEN_OFF`. Only a consumption carries one; the others are null. |

## Commands

| Command                          | Use case                         | Called by                                                                                                                                                  |
| -------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CreateInventoryItemCommand`     | `CreateInventoryItemUseCase`     | The administrator, over HTTP.                                                                                                                              |
| `UpdateInventoryItemCommand`     | `UpdateInventoryItemUseCase`     | The administrator.                                                                                                                                         |
| `DeactivateInventoryItemCommand` | `DeactivateInventoryItemUseCase` | The administrator. Refused with `INVENTORY_ITEM_IN_USE` while a work order that is neither delivered nor canceled plans the item.                          |
| `ReplenishStockCommand`          | `ReplenishStockUseCase`          | The administrator. Appends an `INBOUND` movement.                                                                                                          |
| `AdjustStockCommand`             | `AdjustStockUseCase`             | The administrator. Appends an `ADJUSTMENT`, note required.                                                                                                 |
| `ConsumeStockBatchCommand`       | `ConsumeStockBatchUseCase`       | `work-orders`, on withdrawal. Appends `CONSUMPTION` movements as `PENDING`, tagged with the caller's operation id.                                         |
| `RestoreStockBatchCommand`       | `RestoreStockBatchUseCase`       | `work-orders`, on a return. Draws down consumptions and appends one `RETURN` per consumption drawn. A repeat of an operation changes nothing.              |
| `UndoConsumptionCommand`         | `UndoConsumptionUseCase`         | `work-orders`, to undo a withdrawal that did not complete. Returns the net remaining units of every consumption the operation tagged, whatever its status. |
| `SettleStockMovementsCommand`    | `SettleStockMovementsUseCase`    | `work-orders`, on delivery. Moves pending consumptions to `SETTLED`.                                                                                       |
| `WriteOffStockMovementsCommand`  | `WriteOffStockMovementsUseCase`  | `work-orders`, on cancellation. Moves them to `WRITTEN_OFF` ([0016](../../adr/0016-cancellation-writes-movements-off.md)).                                 |

The last five are called by `work-orders` through its `StockLedger` port. The gateway of that port
calls these use cases, which `InventoryModule` exports and `index.ts` re-exports. Each opens a
transaction of its own through the `TransactionRunner`, locks the items inside it where it needs to,
and commits its writes together, so the caller never holds a transaction that writes stock
([0033](../../adr/0033-writes-across-modules-run-as-steps.md)). The consume and the restore carry
the caller's operation id, and the undo finds its work by that id. The undo, the restore, the
settlement and the write-off are safe to repeat, because a step can run more than once: a restore
whose operation id already tags a return does nothing, and the settlement and the write-off act on
pending consumptions only. The write-off updates only the rows still pending, so two runs at once
record each transition once. The undo returns a consumption that a write-off or a settlement closed
meanwhile, because the operation it undoes never reached the work order.
`ReplenishStockUseCase` is also what the seed script calls for the opening stock of each item.

## Queries and ports

| Query                         | Answers                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `GetInventoryItemQuery`       | One item. Throws `InventoryItemNotFoundError` when there is none. `work-orders` calls it through its `PartCatalog` gateway.                 |
| `ListInventoryItemsQuery`     | The catalog of stock.                                                                                                                       |
| `GetItemMovementHistoryQuery` | The full ledger for one item, which is the traceability requirement made readable. Throws `InventoryItemNotFoundError` for an unknown item. |
| `ListStockShortagesQuery`     | Items whose demand from work orders in execution exceeds what is on the shelf.                                                              |

Ports, both in `application/ports`: `InventoryItemRepository` and `InventoryQueryPort`.

## Reading work order data

The shortage report, the in-use check and the movement history need data that `work-orders` owns,
and `work-orders` already calls this module to move stock. A call back would close a cycle, so
`inventory` declares the interface it needs and `work-orders` implements it
([0027](../../adr/0027-ports-between-modules.md)).

`WorkOrderReads` (`infrastructure/work-order-reads.ts`, exported by `index.ts` with its
`WORK_ORDER_READS` token) has four methods: the internal key of a work order, the external ids behind
a list of internal keys, the outstanding demand per item (planned minus withdrawn, on approved
budgets of work orders in execution, with their numbers), and the numbers of the open work orders
that plan an item. `TypeOrmWorkOrderReads` in `work-orders` implements it, and the global
`WorkOrderReadsModule` binds the two once, at the root.

## Persistence

`TypeOrmInventoryItemRepository`, `TypeOrmInventoryQueryAdapter`, `InventoryItemMapper` and
`InventoryItemKeyResolver` in `infrastructure/persistence`. The repository joins the transaction
the stock use case opened ([0023](../../adr/0023-repositories-honour-an-ambient-transaction.md),
[0032](../../adr/0032-a-repository-own-transaction-is-the-ambient-one.md)) and takes a row
lock on the item, which is what actually prevents two concurrent withdrawals from both reading the
same quantity.

Both adapters read only this module's tables. User keys go through `UserKeyResolver` and work order
keys through `WorkOrderReads`, and the query adapter combines the demand `WorkOrderReads` returns
with its own `inventory_items` ([0028](../../adr/0028-each-module-queries-only-its-own-tables.md)).

`InventoryItemKeyResolver` turns an item UUID into its internal key and back for `work-orders`.

### `inventory_items`

From migration `1787702400005-create-inventory-schema.ts`.

| Column             | Type           | Notes                                                                                  |
| ------------------ | -------------- | -------------------------------------------------------------------------------------- |
| `id`               | `bigserial`    | Primary key, internal only.                                                            |
| `external_id`      | `uuid`         | `ux_inventory_items_external_id` unique.                                               |
| `sku`              | `varchar(40)`  | Unique among active rows (`ux_inventory_items_active_sku`, `WHERE status = 'ACTIVE'`). |
| `name`             | `varchar(120)` |                                                                                        |
| `description`      | `varchar(255)` | Nullable.                                                                              |
| `kind`             | `varchar(10)`  | `chk_inventory_items_kind`: `PART` or `SUPPLY`.                                        |
| `unit_price_cents` | `bigint`       | Integer BRL cents. `chk_inventory_items_unit_price_cents`: `>= 0`.                     |
| `quantity_on_hand` | `integer`      | `chk_inventory_items_quantity_on_hand`: `>= 0`.                                        |
| `status`           | `varchar(20)`  | `chk_inventory_items_status`: `ACTIVE` or `INACTIVE`.                                  |
| `created_at`       | `timestamptz`  |                                                                                        |
| `updated_at`       | `timestamptz`  |                                                                                        |

The `CHECK` on `quantity_on_hand` is documented in the migration as the last line of defence rather
than the mechanism: a constraint cannot see two concurrent writers both reading 10 and both writing 15. The row lock is what prevents that; the constraint is what stops either of them writing a
negative.

### `stock_movements`

| Column               | Type           | Notes                                                                                                                                                                                                        |
| -------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                 | `bigserial`    | Primary key, internal only.                                                                                                                                                                                  |
| `external_id`        | `uuid`         | `ux_stock_movements_external_id` unique.                                                                                                                                                                     |
| `inventory_item_id`  | `bigint`       | References `inventory_items (id)`, `ON DELETE RESTRICT`.                                                                                                                                                     |
| `kind`               | `varchar(20)`  | `chk_stock_movements_kind`: `INBOUND`, `CONSUMPTION`, `RETURN`, `ADJUSTMENT`.                                                                                                                                |
| `undoes_movement_id` | `bigint`       | Self-reference. Set on a `RETURN`, naming the consumption it draws down.                                                                                                                                     |
| `quantity`           | `integer`      | `chk_stock_movements_quantity`: `> 0`. Direction lives in `kind`.                                                                                                                                            |
| `unit_price_cents`   | `bigint`       | `chk_stock_movements_unit_price_cents`: `>= 0`.                                                                                                                                                              |
| `work_order_id`      | `bigint`       | Nullable. References `work_orders (id)` through `fk_stock_movements_work_order`, added later by migration `1787702400006` rather than here, because `work_orders` did not exist when this table was created. |
| `status`             | `varchar(20)`  | Nullable. `chk_stock_movements_status`: `PENDING`, `SETTLED`, `WRITTEN_OFF`. Only a consumption carries one.                                                                                                 |
| `occurred_at`        | `timestamptz`  |                                                                                                                                                                                                              |
| `actor_user_id`      | `bigint`       | References `users (id)`, `ON DELETE RESTRICT`. Who moved it.                                                                                                                                                 |
| `operation_id`       | `uuid`         | Nullable. The operation that wrote a consumption or a return, from migration `1787702400009`. `ix_stock_movements_operation_id`. An undo and a repeated restore find their movements by it.                  |
| `note`               | `varchar(255)` | Nullable. Required for an adjustment, by the aggregate.                                                                                                                                                      |

Indexed by `ix_stock_movements_item_occurred` for the per-item history, and
`ix_stock_movements_work_order_status` for finding a work order's pending consumptions at
settlement or write-off.

### `stock_movement_transitions`

| Column               | Type           | Notes                                                                           |
| -------------------- | -------------- | ------------------------------------------------------------------------------- |
| `id`                 | `bigserial`    | Primary key, internal only.                                                     |
| `external_id`        | `uuid`         | `ux_stock_movement_transitions_external_id` unique.                             |
| `stock_movement_id`  | `bigint`       | References `stock_movements (id)`, `ON DELETE RESTRICT`.                        |
| `from_status`        | `varchar(20)`  | Nullable, absent on the first entry.                                            |
| `to_status`          | `varchar(20)`  |                                                                                 |
| `from_work_order_id` | `bigint`       | Nullable.                                                                       |
| `to_work_order_id`   | `bigint`       | Nullable.                                                                       |
| `actor_user_id`      | `bigint`       | Nullable. References `users (id)`.                                              |
| `occurred_at`        | `timestamptz`  |                                                                                 |
| `note`               | `varchar(255)` | Nullable.                                                                       |
| `quantity`           | `integer`      | Added by migration `1787702400008-add-work-order-closing-columns.ts`. Nullable. |

Indexed by `ix_stock_movement_transitions_movement`.

`from_work_order_id` and `to_work_order_id` exist for a transfer between work orders that the model
no longer has: extra work is authorised on the same work order
([0018](../../adr/0018-numbered-budget-rounds.md)), so there is no successor to transfer a
consumption to. The columns are unused and kept rather than dropped.

## Endpoints

`/api/v1/inventory-items`.

| Route                                              | Permission         |
| -------------------------------------------------- | ------------------ |
| `POST /inventory-items`                            | `inventory:manage` |
| `GET /inventory-items`                             | `inventory:read`   |
| `GET /inventory-items/shortages`                   | `inventory:read`   |
| `GET /inventory-items/:externalId`                 | `inventory:read`   |
| `PATCH /inventory-items/:externalId`               | `inventory:manage` |
| `DELETE /inventory-items/:externalId`              | `inventory:manage` |
| `POST /inventory-items/:externalId/replenishments` | `inventory:manage` |
| `POST /inventory-items/:externalId/adjustments`    | `inventory:manage` |
| `GET /inventory-items/:externalId/movements`       | `audit:read`       |

`shortages` is declared before `:externalId`. The movement history is gated by `audit:read` rather
than `inventory:read`, because reading who moved what is an audit question.

## Errors

| Error                          | Code                                  | Status |
| ------------------------------ | ------------------------------------- | ------ |
| `InvalidSkuError`              | `INVENTORY_INVALID_SKU`               | 400    |
| `InvalidStockQuantityError`    | `INVENTORY_INVALID_STOCK_QUANTITY`    | 400    |
| `InvalidMovementQuantityError` | `INVENTORY_INVALID_MOVEMENT_QUANTITY` | 400    |
| `AdjustmentNoteRequiredError`  | `INVENTORY_ADJUSTMENT_NOTE_REQUIRED`  | 400    |
| `InventoryItemNotFoundError`   | `INVENTORY_ITEM_NOT_FOUND`            | 404    |
| `SkuAlreadyInUseError`         | `INVENTORY_SKU_ALREADY_IN_USE`        | 409    |
| `InventoryItemInUseError`      | `INVENTORY_ITEM_IN_USE`               | 409    |
| `InsufficientStockError`       | `INVENTORY_INSUFFICIENT_STOCK`        | 422    |
