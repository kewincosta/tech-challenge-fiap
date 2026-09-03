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

| Command                         | Handler                     | Called by                                                                                                                  |
| ------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `CreateInventoryItemCommand`    | `create-inventory-item`     | The administrator, over HTTP.                                                                                              |
| `UpdateInventoryItemCommand`    | `update-inventory-item`     | The administrator.                                                                                                         |
| `ReplenishStockCommand`         | `replenish-stock`           | The administrator. Appends an `INBOUND` movement.                                                                          |
| `AdjustStockCommand`            | `adjust-stock`              | The administrator. Appends an `ADJUSTMENT`, note required.                                                                 |
| `ConsumeStockBatchCommand`      | `consume-stock-batch`       | `work-orders`, on withdrawal. Appends `CONSUMPTION` movements as `PENDING`.                                                |
| `RestoreStockBatchCommand`      | `restore-stock-batch`       | `work-orders`, on a return. Draws down consumptions and appends one `RETURN` per consumption drawn.                        |
| `SettleStockMovementsCommand`   | `settle-stock-movements`    | `work-orders`, on delivery. Moves pending consumptions to `SETTLED`.                                                       |
| `WriteOffStockMovementsCommand` | `write-off-stock-movements` | `work-orders`, on cancellation. Moves them to `WRITTEN_OFF` ([0016](../../adr/0016-cancellation-writes-movements-off.md)). |

The last four are dispatched over the `CommandBus` from `work-orders` and run inside that caller's
transaction. They must therefore stay registered in `inventory.module.ts`: a
`@CommandHandler`-decorated class that is not in the `providers` array compiles, lints and
unit-tests clean, and fails at runtime with "No handler found for the command".

## Queries and ports

| Query                         | Answers                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `GetInventoryItemQuery`       | One item.                                                                          |
| `ListInventoryItemsQuery`     | The catalog of stock.                                                              |
| `GetItemMovementHistoryQuery` | The full ledger for one item, which is the traceability requirement made readable. |
| `ListStockShortagesQuery`     | Items whose demand from work orders in execution exceeds what is on the shelf.     |

Ports: `InventoryItemRepository` (`domain/repositories`), `InventoryQueryPort`
(`application/ports`).

## Persistence

`TypeOrmInventoryItemRepository` and `TypeOrmInventoryQueryAdapter` in `infrastructure/persistence`.
The repository honours an ambient transaction
([0023](../../adr/0023-repositories-honour-an-ambient-transaction.md)) and takes a row lock on the
item, which is what actually prevents two concurrent withdrawals from both reading the same
quantity.

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
| `note`               | `varchar(255)` | Nullable. Required for an adjustment, by the aggregate.                                                                                                                                                      |

Indexed by `ix_stock_movements_item_occurred` for the per-item history, and
`ix_stock_movements_work_order_status` for finding a work order's pending consumptions at
settlement or write-off.

### `stock_movement_transitions`

| Column               | Type           | Notes                                                    |
| -------------------- | -------------- | -------------------------------------------------------- |
| `id`                 | `bigserial`    | Primary key, internal only.                              |
| `external_id`        | `uuid`         | `ux_stock_movement_transitions_external_id` unique.      |
| `stock_movement_id`  | `bigint`       | References `stock_movements (id)`, `ON DELETE RESTRICT`. |
| `from_status`        | `varchar(20)`  | Nullable, absent on the first entry.                     |
| `to_status`          | `varchar(20)`  |                                                          |
| `from_work_order_id` | `bigint`       | Nullable.                                                |
| `to_work_order_id`   | `bigint`       | Nullable.                                                |
| `actor_user_id`      | `bigint`       | Nullable. References `users (id)`.                       |
| `occurred_at`        | `timestamptz`  |                                                          |
| `note`               | `varchar(255)` | Nullable.                                                |

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
| `InsufficientStockError`       | `INVENTORY_INSUFFICIENT_STOCK`        | 422    |
