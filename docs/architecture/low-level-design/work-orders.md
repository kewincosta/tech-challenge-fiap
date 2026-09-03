# work-orders

The life of a work order, from reception to delivery or cancellation: its items, its budget rounds,
what is charged, and who did each step. The whole of the Workshop Operations context, and the
largest module in the system.

This is the module that spans others. It reads customers, vehicles and services, and it moves stock
in `inventory` inside its own transaction.

Conventions this page does not repeat are in [the high level design](../high-level-design.md).

## Aggregate

`WorkOrder` (`domain/entities/work-order.ts`), with three child entities: `Budget`,
`WorkOrderServiceItem` and `WorkOrderPartItem`. One aggregate, five tables.

The status machine, enforced by `assertStateAllows` on every method:

```
RECEIVED -> IN_DIAGNOSIS -> AWAITING_APPROVAL -> IN_EXECUTION -> COMPLETED -> DELIVERED
                 ^                   |                 |
                 +--- rejected ------+                 +--- supplementary round -> AWAITING_APPROVAL
CANCELED is reachable from RECEIVED, IN_DIAGNOSIS, AWAITING_APPROVAL and IN_EXECUTION.
DELIVERED and CANCELED are terminal.
```

Invariants it holds:

- Only the transitions above are allowed. Anything else is `WORK_ORDER_INVALID_STATE` (422).
- A vehicle holds at most one non-terminal work order, enforced by `ux_work_orders_active_vehicle`.
- The vehicle must belong to the customer the work order names.
- Items belong to a budget round. Items of an approved or rejected round are frozen; new items go into the draft round ([0018](../../adr/0018-numbered-budget-rounds.md)).
- A budget total is always the sum of its own round's items, never a value supplied from outside, and never changes after approval.
- The diagnosis cannot be completed with an empty item list.
- A withdrawal cannot exceed what the round planned, and a return cannot exceed what was withdrawn.
- A discount cannot exceed the charged total.
- The version guard lives in the repository, not here ([0024](../../adr/0024-optimistic-version-guard-on-the-work-order.md)).

## Value objects

| Value object                                 | Rule                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `WorkOrderNumber`                            | `AAAAAA-YYYY`, six characters and a year. Unique. `WORK_ORDER_INVALID_NUMBER` (400). |
| `PlannedQuantity`                            | A positive whole number. `WORK_ORDER_INVALID_PLANNED_QUANTITY` (400).                |
| `WorkOrderId`, `WorkOrderItemId`, `BudgetId` | External UUIDs.                                                                      |

## Commands

Sixteen write handlers, in lifecycle order.

| Command                            | What it does                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| `CreateWorkOrderCommand`           | Opens the work order against a customer and one of their vehicles.                       |
| `AddRequestedServiceCommand`       | Adds a service item, freezing the catalog price into the draft round.                    |
| `PlanPartCommand`                  | Plans a part. Touches no stock ([0014](../../adr/0014-stock-consumed-at-withdrawal.md)). |
| `RemoveWorkOrderItemCommand`       | Removes a draft item. A budgeted item is not removable.                                  |
| `AssignMechanicCommand`            | Assigns a mechanic, checking the target actually holds the role.                         |
| `StartDiagnosisCommand`            | `RECEIVED` to `IN_DIAGNOSIS`.                                                            |
| `CompleteDiagnosisCommand`         | Prices round one and moves to `AWAITING_APPROVAL`.                                       |
| `ApproveBudgetCommand`             | Approves the pending round and moves to `IN_EXECUTION`.                                  |
| `RejectBudgetCommand`              | Rejects it and returns to the previous scope.                                            |
| `SubmitSupplementaryBudgetCommand` | Prices the next round from execution and returns to `AWAITING_APPROVAL`.                 |
| `WithdrawPartsCommand`             | Moves stock. Dispatches `ConsumeStockBatchCommand` into `inventory`.                     |
| `ReturnPartsCommand`               | Returns unused parts. Dispatches `RestoreStockBatchCommand`.                             |
| `CompleteWorkOrderCommand`         | Computes the charged total and moves to `COMPLETED`.                                     |
| `DeliverVehicleCommand`            | Moves to `DELIVERED` and dispatches `SettleStockMovementsCommand`.                       |
| `CancelWorkOrderCommand`           | Moves to `CANCELED` and dispatches `WriteOffStockMovementsCommand`.                      |
| `ApplyDiscountCommand`             | Reduces the charged total, with an actor and a reason.                                   |

Four of these open a transaction that spans into `inventory`: withdrawal, return, delivery and
cancellation ([0023](../../adr/0023-repositories-honour-an-ambient-transaction.md)).

## Authorizers

Three services in `application/services` hold rules `PermissionsGuard` cannot express, because it
requires _all_ the permissions a route names and cannot say "either of two":

| Authorizer                      | Rule                                                                                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BudgetDecisionAuthorizer`      | The owning customer, or a holder of `work-orders:decide`. The budget approval and rejection routes therefore carry no `@RequirePermissions`.             |
| `WorkOrderCompletionAuthorizer` | The assigned mechanic, or a holder of `work-orders:manage`.                                                                                              |
| `CancellationAuthorizer`        | Who may cancel, and from which state. Cancelling from `IN_EXECUTION` is `WORK_ORDER_CANCEL_IN_EXECUTION_FORBIDDEN` (403) for an actor without the right. |

## Queries and ports

| Query                          | Answers                                                                                                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GetWorkOrderQuery`            | One work order in full, by number.                                                                                                                                               |
| `ListWorkOrdersQuery`          | The board, filtered by status.                                                                                                                                                   |
| `GetWorkOrderTrailQuery`       | The append-only trail.                                                                                                                                                           |
| `GetMyWorkOrdersQuery`         | The caller's own work orders, resolving the customer from the token.                                                                                                             |
| `GetMyWorkOrderQuery`          | One of the caller's own, by number. Answers the same `null` for "no customer", "no such number" and "not yours", so a stranger's number is indistinguishable from a missing one. |
| `GetAverageExecutionTimeQuery` | Mean elapsed time between execution start and completion, in whole seconds, computed in SQL.                                                                                     |

Ports: `WorkOrderRepository` (`domain/repositories`), `WorkOrderQueryPort`,
`WorkOrderMetricsQueryPort` and `WorkOrderNumberGenerator` (`application/ports`).

## Persistence

`TypeOrmWorkOrderRepository`, `TypeOrmWorkOrderQueryAdapter`,
`TypeOrmWorkOrderMetricsQueryAdapter` and the mapper, in `infrastructure/persistence`.

The repository does three things beyond persisting the aggregate: it honours an ambient
transaction, it enforces the version guard, and it writes the trail rows from the aggregate's own
events inside the same transaction
([0021](../../adr/0021-the-trail-written-inside-the-aggregate-transaction.md)).

The metrics adapter filters by `EXISTS` rather than joining `work_order_services`, because a join
would multiply rows for a work order carrying several services and corrupt the average.

### `work_orders`

From migration `1787702400006-create-work-orders-schema.ts`, extended by
`1787702400008-add-work-order-closing-columns.ts`.

| Column                        | Type           | Notes                                                                                                                                                   |
| ----------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                          | `bigserial`    | Primary key, internal only.                                                                                                                             |
| `external_id`                 | `uuid`         | `ux_work_orders_external_id` unique.                                                                                                                    |
| `number`                      | `varchar(11)`  | `ux_work_orders_number` unique. The public identifier in every route.                                                                                   |
| `customer_id`                 | `bigint`       | References `customers (id)`, `ON DELETE RESTRICT`.                                                                                                      |
| `vehicle_id`                  | `bigint`       | References `vehicles (id)`, `ON DELETE RESTRICT`.                                                                                                       |
| `assigned_mechanic_user_id`   | `bigint`       | Nullable. References `users (id)`. A user reference and a role check, not an aggregate ([0010](../../adr/0010-no-aggregate-for-the-staff-profiles.md)). |
| `created_by_user_id`          | `bigint`       | References `users (id)`.                                                                                                                                |
| `status`                      | `varchar(20)`  | `chk_work_orders_status`, seven values.                                                                                                                 |
| `customer_name`               | `varchar(120)` | Denormalised at creation, so the board reads without joining.                                                                                           |
| `vehicle_plate`               | `varchar(7)`   | Denormalised.                                                                                                                                           |
| `vehicle_brand`               | `varchar(60)`  | Denormalised.                                                                                                                                           |
| `vehicle_model`               | `varchar(60)`  | Denormalised.                                                                                                                                           |
| `vehicle_year`                | `smallint`     | Denormalised.                                                                                                                                           |
| `created_at`                  | `timestamptz`  |                                                                                                                                                         |
| `updated_at`                  | `timestamptz`  |                                                                                                                                                         |
| `charged_total_cents`         | `bigint`       | Added by `…008`. Null before completion ([0020](../../adr/0020-budget-total-and-charged-total-kept-apart.md)).                                          |
| `discount_cents`              | `bigint`       | Added by `…008`.                                                                                                                                        |
| `discount_note`               | `varchar(255)` | Added by `…008`.                                                                                                                                        |
| `discount_applied_by_user_id` | `bigint`       | Added by `…008`. References `users (id)`.                                                                                                               |
| `discount_applied_at`         | `timestamptz`  | Added by `…008`.                                                                                                                                        |
| `completed_at`                | `timestamptz`  | Added by `…008`. Read by the average execution time metric.                                                                                             |
| `delivered_at`                | `timestamptz`  | Added by `…008`.                                                                                                                                        |
| `delivered_by_user_id`        | `bigint`       | Added by `…008`.                                                                                                                                        |
| `canceled_at`                 | `timestamptz`  | Added by `…008`.                                                                                                                                        |
| `canceled_by_user_id`         | `bigint`       | Added by `…008`.                                                                                                                                        |
| `cancellation_reason`         | `varchar(255)` | Added by `…008`.                                                                                                                                        |
| `version`                     | `integer`      | Added by `…008`. The optimistic guard. Never exposed in a response.                                                                                     |

`ux_work_orders_active_vehicle` is a partial unique index on `(vehicle_id) WHERE status NOT IN
('DELIVERED', 'CANCELED')`. One open work order per vehicle, with finished ones free to accumulate.
`COMPLETED` is not terminal for this rule, which surprises people writing fixtures.

### `work_order_services`

| Column                      | Type           | Notes                                                                                                                      |
| --------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `id`                        | `bigserial`    | Primary key, internal only.                                                                                                |
| `external_id`               | `uuid`         | Unique.                                                                                                                    |
| `work_order_id`             | `bigint`       | References `work_orders (id)`, `ON DELETE RESTRICT`.                                                                       |
| `service_id`                | `bigint`       | References `services (id)`, `ON DELETE RESTRICT`.                                                                          |
| `service_name`              | `varchar(120)` | Frozen at the moment the item was added.                                                                                   |
| `unit_price_cents`          | `bigint`       | `>= 0`. The live catalog price when added.                                                                                 |
| `budget_round`              | `integer`      | Added by `…007`. Null while a draft.                                                                                       |
| `budgeted_unit_price_cents` | `bigint`       | Added by `…007`. Frozen when the round was generated ([0019](../../adr/0019-withdrawal-charged-at-the-budgeted-price.md)). |
| `created_at`                | `timestamptz`  |                                                                                                                            |

Indexed by `ix_work_order_services_work_order_id`.

### `work_order_parts`

| Column                      | Type           | Notes                                                                            |
| --------------------------- | -------------- | -------------------------------------------------------------------------------- |
| `id`                        | `bigserial`    | Primary key, internal only.                                                      |
| `external_id`               | `uuid`         | Unique.                                                                          |
| `work_order_id`             | `bigint`       | References `work_orders (id)`, `ON DELETE RESTRICT`.                             |
| `inventory_item_id`         | `bigint`       | References `inventory_items (id)`, `ON DELETE RESTRICT`.                         |
| `sku`                       | `varchar(40)`  | Denormalised.                                                                    |
| `item_name`                 | `varchar(120)` | Denormalised.                                                                    |
| `planned_quantity`          | `integer`      | `> 0`.                                                                           |
| `withdrawn_quantity`        | `integer`      | `>= 0`, default 0. What actually moved stock, and what the charged total counts. |
| `unit_price_cents`          | `bigint`       | `>= 0`.                                                                          |
| `budget_round`              | `integer`      | Added by `…007`.                                                                 |
| `budgeted_unit_price_cents` | `bigint`       | Added by `…007`.                                                                 |
| `created_at`                | `timestamptz`  |                                                                                  |

Indexed by `ix_work_order_parts_work_order_id`.

### `work_order_budgets`

From migration `1787702400007-create-work-order-budgets.ts`.

| Column               | Type          | Notes                                                |
| -------------------- | ------------- | ---------------------------------------------------- |
| `id`                 | `bigserial`   | Primary key, internal only.                          |
| `external_id`        | `uuid`        | Unique.                                              |
| `work_order_id`      | `bigint`      | References `work_orders (id)`, `ON DELETE RESTRICT`. |
| `round`              | `integer`     | `chk_work_order_budgets_round`: `> 0`.               |
| `total_cents`        | `bigint`      | `>= 0`. The sum of its own round's items.            |
| `status`             | `varchar(20)` | `PENDING`, `APPROVED` or `REJECTED`.                 |
| `generated_at`       | `timestamptz` |                                                      |
| `decided_at`         | `timestamptz` | Null while pending.                                  |
| `decided_by_user_id` | `bigint`      | Nullable. References `users (id)`.                   |

`ux_work_order_budgets_round` on `(work_order_id, round)` makes round numbers unique per work
order.

### `work_order_events`

The trail. Append only, written by the repository inside the aggregate's transaction.

| Column          | Type           | Notes                                                |
| --------------- | -------------- | ---------------------------------------------------- |
| `id`            | `bigserial`    | Primary key, internal only.                          |
| `external_id`   | `uuid`         | Unique.                                              |
| `work_order_id` | `bigint`       | References `work_orders (id)`, `ON DELETE RESTRICT`. |
| `event_type`    | `varchar(40)`  |                                                      |
| `from_status`   | `varchar(20)`  | Nullable.                                            |
| `to_status`     | `varchar(20)`  | Nullable.                                            |
| `actor_user_id` | `bigint`       | Nullable. References `users (id)`. Who did it.       |
| `occurred_at`   | `timestamptz`  |                                                      |
| `note`          | `varchar(255)` | Nullable.                                            |

Indexed by `ix_work_order_events_work_order_occurred`.

## Endpoints

`/api/v1/work-orders`. The work order is addressed by its `number`, not by a UUID.

| Route                                               | Permission                                               |
| --------------------------------------------------- | -------------------------------------------------------- |
| `POST /work-orders`                                 | `work-orders:manage`                                     |
| `GET /work-orders`                                  | `work-orders:read`                                       |
| `GET /work-orders/me`                               | `work-orders:read-own`                                   |
| `GET /work-orders/me/:number`                       | `work-orders:read-own`                                   |
| `GET /work-orders/metrics/average-execution-time`   | `metrics:read`                                           |
| `GET /work-orders/:number`                          | `work-orders:read`                                       |
| `GET /work-orders/:number/trail`                    | `audit:read`                                             |
| `POST /work-orders/:number/services`                | `work-orders:manage`                                     |
| `POST /work-orders/:number/parts`                   | `work-orders:manage`                                     |
| `DELETE /work-orders/:number/items/:itemExternalId` | `work-orders:manage`                                     |
| `PUT /work-orders/:number/mechanic`                 | `work-orders:manage`                                     |
| `POST /work-orders/:number/diagnosis`               | `work-orders:execute`                                    |
| `POST /work-orders/:number/diagnosis/completion`    | `work-orders:execute`                                    |
| `POST /work-orders/:number/budget/supplementary`    | `work-orders:execute`                                    |
| `POST /work-orders/:number/budget/approval`         | none: `BudgetDecisionAuthorizer` decides                 |
| `POST /work-orders/:number/budget/rejection`        | none: `BudgetDecisionAuthorizer` decides                 |
| `POST /work-orders/:number/withdrawals`             | `work-orders:execute`                                    |
| `POST /work-orders/:number/returns`                 | `work-orders:execute`                                    |
| `POST /work-orders/:number/completion`              | `work-orders:read`, then `WorkOrderCompletionAuthorizer` |
| `POST /work-orders/:number/delivery`                | `work-orders:manage`                                     |
| `POST /work-orders/:number/cancellation`            | `work-orders:cancel`, then `CancellationAuthorizer`      |
| `POST /work-orders/:number/discount`                | `work-orders:discount`                                   |

`me`, `me/:number` and `metrics/average-execution-time` are declared before `:number`, or the
literals would be read as work order numbers.

## Errors

| Code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Status |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `WORK_ORDER_INVALID_NUMBER`, `WORK_ORDER_INVALID_PLANNED_QUANTITY`                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 400    |
| `WORK_ORDER_CANCEL_IN_EXECUTION_FORBIDDEN`, `WORK_ORDER_COMPLETION_FORBIDDEN`                                                                                                                                                                                                                                                                                                                                                                                                                                               | 403    |
| `WORK_ORDER_NOT_FOUND`, `WORK_ORDER_ITEM_NOT_FOUND`, `WORK_ORDER_ASSIGNED_MECHANIC_NOT_FOUND`, `WORK_ORDER_REFERENCED_CUSTOMER_NOT_FOUND`, `WORK_ORDER_REFERENCED_VEHICLE_NOT_FOUND`, `WORK_ORDER_REFERENCED_SERVICE_NOT_FOUND`, `WORK_ORDER_REFERENCED_INVENTORY_ITEM_NOT_FOUND`                                                                                                                                                                                                                                           | 404    |
| `WORK_ORDER_NUMBER_TAKEN`, `WORK_ORDER_VEHICLE_ALREADY_HAS_ACTIVE_WORK_ORDER`                                                                                                                                                                                                                                                                                                                                                                                                                                               | 409    |
| `WORK_ORDER_INVALID_STATE`, `BUDGET_INVALID_STATE`, `WORK_ORDER_DIAGNOSIS_WITHOUT_ITEMS`, `WORK_ORDER_EMPTY_DRAFT_BUDGET`, `WORK_ORDER_BUDGETED_ITEM_NOT_REMOVABLE`, `WORK_ORDER_WITHDRAWAL_EXCEEDS_PLANNED`, `WORK_ORDER_RETURN_EXCEEDS_WITHDRAWN`, `WORK_ORDER_PART_NOT_WITHDRAWABLE`, `WORK_ORDER_DISCOUNT_EXCEEDS_CHARGED_TOTAL`, `WORK_ORDER_DUPLICATE_BATCH_LINE`, `WORK_ORDER_CUSTOMER_INACTIVE`, `WORK_ORDER_SERVICE_INACTIVE`, `WORK_ORDER_VEHICLE_NOT_OWNED_BY_CUSTOMER`, `WORK_ORDER_ASSIGNED_USER_NOT_MECHANIC` | 422    |

A concurrent write answers 409 through `ConcurrentModificationError`, which lives in the shared
kernel rather than here.
