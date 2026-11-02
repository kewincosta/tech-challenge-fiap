# work-orders

The life of a work order, from reception to delivery or cancellation: its items, its budget rounds,
what is charged, and who did each step. The whole of the Workshop Operations context, and the
largest module in the system.

This is the module that spans others. It reads customers, vehicles, services and users through ports
it declares itself, and it moves stock in `inventory` through steps of its own: it records each step
in its outbox and `inventory` commits the stock side in a transaction of its own. It also tells the
customer, by e-mail, each time a work order changes status.

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
- A service or a part can be added while the work order is `RECEIVED`, `IN_DIAGNOSIS` or `IN_EXECUTION`, so the customer can ask for a part at reception ([0034](../../adr/0034-parts-can-be-planned-at-reception.md)).
- A decision can name its budget. The budget has to be one of the work order's (`WORK_ORDER_BUDGET_NOT_FOUND`, 404) and still pending (`BUDGET_INVALID_STATE`, 422, whatever the status of the work order). Left unnamed, the pending round is the one decided.
- Every transition, the opening included, records one `WorkOrderStatusChanged` with the old and the new status, after the facts it consists of. An approval records it once, though the trail keeps `BudgetApproved` and `ExecutionStarted`. The event feeds no `work_order_events` row ([0036](../../adr/0036-email-goes-through-a-mailer-port-over-smtp.md)).
- The diagnosis cannot be completed with an empty item list.
- A withdrawal cannot exceed what the round planned, and a return cannot exceed what was withdrawn.
- A discount cannot exceed the charged total.
- The version guard lives in the repository, not here ([0024](../../adr/0024-optimistic-version-guard-on-the-work-order.md)).

## Value objects

| Value object                                 | Rule                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `WorkOrderNumber`                            | `AAAAAA-YYYY`, six characters and a year. Unique. `WORK_ORDER_INVALID_NUMBER` (400). |
| `PlannedQuantity`                            | A whole number from 1 to 2147483647. `WORK_ORDER_INVALID_PLANNED_QUANTITY` (400).    |
| `WorkOrderId`, `WorkOrderItemId`, `BudgetId` | External UUIDs.                                                                      |

## Commands

Sixteen command use cases, in lifecycle order. Each command is run by the use case of the same name,
`CreateWorkOrderCommand` by `CreateWorkOrderUseCase`, and so on.

| Command                            | What it does                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `CreateWorkOrderCommand`           | Opens the work order, with the services and parts the customer asks for.                              |
| `AddRequestedServiceCommand`       | Adds a service item, freezing the catalog price into the draft round.                                 |
| `PlanPartCommand`                  | Plans a part. Touches no stock ([0014](../../adr/0014-stock-consumed-at-withdrawal.md)).              |
| `RemoveWorkOrderItemCommand`       | Removes a draft item. A budgeted item is not removable.                                               |
| `AssignMechanicCommand`            | Assigns a mechanic, checking the target actually holds the role.                                      |
| `StartDiagnosisCommand`            | `RECEIVED` to `IN_DIAGNOSIS`.                                                                         |
| `CompleteDiagnosisCommand`         | Prices round one and moves to `AWAITING_APPROVAL`.                                                    |
| `ApproveBudgetCommand`             | Approves the pending round, or the budget its optional `budgetId` names, and moves to `IN_EXECUTION`. |
| `RejectBudgetCommand`              | Rejects it, or the budget its optional `budgetId` names, and returns to the previous scope.           |
| `SubmitSupplementaryBudgetCommand` | Prices the next round from execution and returns to `AWAITING_APPROVAL`.                              |
| `WithdrawPartsCommand`             | Consumes the parts in `inventory` and saves the work order, as compensated steps.                     |
| `ReturnPartsCommand`               | Returns unused parts. Saves the work order and records a restore step.                                |
| `CompleteWorkOrderCommand`         | Computes the charged total and moves to `COMPLETED`.                                                  |
| `DeliverVehicleCommand`            | Moves to `DELIVERED` and records a settle step.                                                       |
| `CancelWorkOrderCommand`           | Moves to `CANCELED` and records a write-off step.                                                     |
| `ApplyDiscountCommand`             | Reduces the charged total, with an actor and a reason.                                                |

`CreateWorkOrderUseCase` takes the customer and the vehicle, as before, and the optional `services`
and `parts` of the call. It reads every service and every part through `ServiceCatalog` and
`PartCatalog` before the work order exists, checking a part's quantity before the catalog read as
`PlanPartUseCase` does. Then it opens the aggregate and calls `addService` and `planPart` once per
item, so an unknown or deactivated item stops the opening with nothing saved, and the repository
saves the work order once, with its trail: `WORK_ORDER_CREATED`, then one entry per item. Each item
is a draft item with no budget round. The errors are the ones the separate routes answer.

Four of these move stock in `inventory`: withdrawal, return, delivery and cancellation. None of
them holds a transaction that writes stock. Each module commits its own tables, and the stock side
is completed by a step in this module's outbox (see [Stock steps](#stock-steps)).

## Authorizers

Three plain classes in `application/services` hold rules `PermissionsGuard` cannot express, because it
requires _all_ the permissions a route names and cannot say "either of two". They read what the caller
may do from the `WorkOrderActors` port, which maps the permissions `work-orders:decide`,
`work-orders:cancel-in-execution` and `work-orders:manage` to three flags, so this module imports no
permission catalog:

| Authorizer                      | Rule                                                                                                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BudgetDecisionAuthorizer`      | The owning customer, or a holder of `work-orders:decide`. The budget approval and rejection routes, with or without a budget id, therefore carry no `@RequirePermissions`. |
| `WorkOrderCompletionAuthorizer` | The assigned mechanic, or a holder of `work-orders:manage`.                                                                                                                |
| `CancellationAuthorizer`        | Who may cancel, and from which state. Cancelling from `IN_EXECUTION` is `WORK_ORDER_CANCEL_IN_EXECUTION_FORBIDDEN` (403) for an actor without the right.                   |

## Queries and ports

| Query                          | Answers                                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GetWorkOrderQuery`            | One work order in full, by number. Throws `WorkOrderNotFoundError` when there is none.                                                                                                            |
| `ListWorkOrdersQuery`          | One page of the board: the open work orders by default, the statuses named otherwise, with the totals.                                                                                            |
| `GetWorkOrderTrailQuery`       | The append-only trail. Throws `WorkOrderNotFoundError` for an unknown number.                                                                                                                     |
| `GetMyWorkOrdersQuery`         | The caller's own work orders, resolving the customer from the token.                                                                                                                              |
| `GetMyWorkOrderQuery`          | One of the caller's own, by number. Throws the same `WorkOrderNotFoundError` for "no customer", "no such number" and "not yours", so a stranger's number is indistinguishable from a missing one. |
| `GetAverageExecutionTimeQuery` | Mean elapsed time between execution start and completion, in whole seconds, computed in SQL.                                                                                                      |

Ports, all in `application/ports`. Two are the usual ones for a module's own data:
`WorkOrderRepository`, `WorkOrderQueryPort`, `WorkOrderMetricsQueryPort` and
`WorkOrderNumberGenerator`. Six are what this module needs of the others, and a gateway in
`infrastructure/gateways` implements each by calling the other module's public API
([0027](../../adr/0027-ports-between-modules.md)):

| Port                | Gateway                    | Calls                                                                                             |
| ------------------- | -------------------------- | ------------------------------------------------------------------------------------------------- |
| `CustomerDirectory` | `CustomerDirectoryGateway` | `GetCustomerUseCase` and `GetCustomerByUserIdUseCase` of `customers`, for the name and the e-mail |
| `VehicleDirectory`  | `VehicleDirectoryGateway`  | `GetVehicleUseCase` of `vehicles`                                                                 |
| `ServiceCatalog`    | `ServiceCatalogGateway`    | `GetServiceUseCase` of `services`                                                                 |
| `PartCatalog`       | `PartCatalogGateway`       | `GetInventoryItemUseCase` of `inventory`                                                          |
| `StockLedger`       | `StockLedgerGateway`       | The consume, restore, undo, confirm, settle and write-off use cases of `inventory`                |
| `WorkOrderActors`   | `WorkOrderActorsGateway`   | `GetUserEffectiveAccessUseCase` and `GetUserByIdUseCase` of `identity`                            |

Two more ports belong to the stock steps: `PendingStockSteps`, the outbox, and `StockStepLog`, which
logs a step that reached its attempt limit.

Three belong to the status e-mails ([Status e-mails](#status-e-mails)): `Mailer`, which sends one
message, `StatusMailLog`, which logs an e-mail that did not go out, and `BudgetDecisionLinks`, which
answers the two addresses that decide a budget. The HTTP adapter owns the last one, and the
subscriber depends on the port.

A gateway turns the provider's not-found error into `null`, and the use case raises its own error,
such as `WORK_ORDER_REFERENCED_CUSTOMER_NOT_FOUND`. A customer that exists but is deactivated is still
found, with `active` false, which is what separates a 404 from a 422.

### The board

`GET /work-orders` reads one page of the board through `WorkOrderQueryPort.listBoard`
([0035](../../adr/0035-paginated-listings-answer-a-page-envelope.md)). `ListWorkOrdersUseCase`
decides what the page holds and answers it:

- With no status in the query it lists `IN_EXECUTION`, `AWAITING_APPROVAL`, `IN_DIAGNOSIS` and
  `RECEIVED`. With statuses it lists exactly those, so `COMPLETED`, `DELIVERED` and `CANCELED` come
  only when asked for.
- It hands the port the statuses in the board's order: `IN_EXECUTION`, `AWAITING_APPROVAL`,
  `IN_DIAGNOSIS`, `RECEIVED`, `COMPLETED`, `DELIVERED`, `CANCELED`.
- It answers `{ items, page, pageSize, totalItems, totalPages }`, with `totalPages` the total
  divided by `pageSize`, rounded up, and 0 when nothing matches.

`TypeOrmWorkOrderQueryAdapter.listBoard` filters on those statuses, sorts by the position of the
status in that list, then by `created_at` and `id`, so the oldest work order comes first within a
status, and reads one page with `LIMIT` and `OFFSET`. A second query counts every match, so a page
past the last answers 200 with `items` empty and the same totals. The two queries share no
snapshot.

`ListWorkOrdersQueryDto` in `presentation/dtos` validates the route's query. `page` (an integer, 1
or more) and `pageSize` (an integer, 1 to 100) are required, and `status` is optional and takes
statuses separated by commas. A missing or out-of-range value, an unknown status and an unknown
query parameter answer 400 `VALIDATION_ERROR`. The validation runs after the permission guard, so a
caller without `work-orders:read` still gets 403.

### Status labels

Every route that answers a work order adds `statusLabel` beside `status`. The label comes from one
map, `domain/work-order-status-label.ts`, which the controller applies to each work order it answers,
the items of the board included, and the status e-mail uses for its subject:

| `status`            | `statusLabel`          |
| ------------------- | ---------------------- |
| `RECEIVED`          | `Recebida`             |
| `IN_DIAGNOSIS`      | `Diagnóstico`          |
| `AWAITING_APPROVAL` | `Aguardando Aprovação` |
| `IN_EXECUTION`      | `Execução`             |
| `COMPLETED`         | `Finalizada`           |
| `DELIVERED`         | `Entregue`             |
| `CANCELED`          | `Cancelada`            |

The domain, the database and the board's `status` filter use the code.

### Budget decision links

Every work order answer carries `approvalUrl` and `rejectionUrl` on the pending budget of a work
order that awaits approval, and null in both on every other budget:

```
${APP_PUBLIC_URL}/api/v1/work-orders/${number}/budgets/${budgetId}/approval
${APP_PUBLIC_URL}/api/v1/work-orders/${number}/budgets/${budgetId}/rejection
```

`HttpBudgetDecisionLinks` in `presentation` builds them, from the `APP_PUBLIC_URL` setting and the
routes `WorkOrdersController` declares, and the controller applies it in the one place that maps a
work order to its response. A work order canceled while it awaited approval keeps its budget
`PENDING`, and the controller leaves both links null on it, because a call would answer
`WORK_ORDER_INVALID_STATE`. The customer calls an address with `POST` and their own bearer token.
The two routes run `ApproveBudgetUseCase` and `RejectBudgetUseCase` with the budget id, and
`BudgetDecisionAuthorizer` checks the caller first, so a stranger gets `WORK_ORDER_NOT_FOUND` even
for a budget id that does not exist. The routes `POST /work-orders/:number/budget/approval` and
`/rejection` stay, and they decide whichever round is pending
([0037](../../adr/0037-how-the-phase-2-briefs-api-items-are-read.md)).

### Status e-mails

[0036](../../adr/0036-email-goes-through-a-mailer-port-over-smtp.md) holds the reasoning. The flow:

1. A use case saves the work order, and after the commit hands its recorded events to the
   `DomainEventPublisher`. The dispatcher starts the subscribers of `WorkOrderStatusChanged` and does
   not wait for them. `WorkOrdersModule` registers `StatusMailSubscriber` on it in `onModuleInit`.
2. The event carries the work order's number, customer and plate, the old and the new status, and the
   pending budget (its id and total) when the new status is `AWAITING_APPROVAL`.
3. The subscriber reads the customer's name and e-mail through `CustomerDirectory`, composes the
   message in `status-mail.message.ts` and calls `Mailer.send`. The subject is
   `Ordem de serviço ${number}: ${statusLabel}`. The body names the customer, the number, the plate
   and the label, in plain text and as HTML with every value escaped. For `AWAITING_APPROVAL` it adds
   the total in reais and the two decision links, written as text because they are `POST` calls.
4. `SmtpMailer` (`infrastructure/mail`) sends through `nodemailer` to `SMTP_HOST` and `SMTP_PORT`,
   with the login of `SMTP_USER` and `SMTP_PASSWORD` when they are set, from `MAIL_FROM`.
5. A failure in step 3 or 4 is caught in the subscriber and logged at error level, with the work order
   number and the error, by `NestStatusMailLog`. Nothing sends the e-mail again and the request
   answers as it would without it.

In local development Mailpit takes the e-mails (`docker compose up -d mailpit`), and its inbox is at
`http://localhost:8025`. The end-to-end suites replace the `Mailer` with a recording fake.

## Stock steps

A step is `{ operationId, kind, workOrderId, actorUserId, lines?, consumptionOperationId? }`, with the
kind `UNDO_CONSUMPTION`, `CONFIRM_CONSUMPTION`, `RESTORE`, `SETTLE` or `WRITE_OFF`. The `operationId`
is the key `inventory` applies the step by, so a repeat changes nothing. A confirmation step has an
`operationId` of its own, because each step has one, and carries the withdrawal's in
`consumptionOperationId`. The pieces ([0033](../../adr/0033-writes-across-modules-run-as-steps.md)):

- `PendingStockSteps` (`application/ports`), implemented by `TypeOrmPendingStockSteps` over
  `work_order_stock_steps`. `arm` records an armed step in a statement of its own. `enqueue` records a
  pending step, and `disarm` closes an armed step only while it is still armed and says whether it
  did; both join the transaction the caller has open. `complete` joins the transaction the caller has open,
  if there is one. `release`, `recordFailure` and `markFailed` are statements of their own. `claimDue` takes the due steps with
  `FOR UPDATE SKIP LOCKED` and leases them for the grace period, counting the attempt.
- `StockStepApplier` (`application/services`) applies one claimed step through the `StockLedger`
  method of its kind (`undoConsumption`, `confirmConsumption`, `restore`, `settle` or `writeOff`),
  completes it, or records the failure with the next due time (1 s, 5 s, 30 s, 2 min, 10 min, then
  1 h). At the attempt limit it marks the step failed and logs it through `StockStepLog`.
  `applyAfterCommit` is the attempt a request makes at its own step, and it never fails the request.
- `StockStepProcessor` (`infrastructure/outbox`) runs the applier at application bootstrap and every
  `OUTBOX_POLL_INTERVAL_MS`. An interval of 0 turns it off, which is how the test suites keep an
  application from picking up steps older runs left behind.

A work order's steps apply in the order they were recorded. A claim takes a step only while no older
step of the same work order is armed, pending or failed, so it takes at most one step per work
order, the oldest that is not done. A failed step holds the later ones until an operator sets it
back to pending, and the steps of other work orders go on. The undo is the exception: a claim takes
it once it is due, whatever older step of its work order is still open, and it holds no later step.
It touches only the unconfirmed consumptions of its own operation, which no other step reads.

Withdrawal arms an `UNDO_CONSUMPTION` step due after `OUTBOX_GRACE_SECONDS`, consumes the stock,
and then disarms the step, saves the work order and enqueues a `CONFIRM_CONSUMPTION` step in one
transaction. After the commit the request applies the confirmation, and `inventory` records a
confirmation time on the consumptions the withdrawal tagged. When the consumption or that
transaction fails, the request undoes the consumption through the ledger at once, completes the step
and answers the first error, and no confirmation step exists. A step the processor claimed first
answers 409 `CONCURRENT_MODIFICATION`. Return, delivery and cancellation save the work order and
enqueue their step in one transaction, and apply it after the commit.

`inventory` counts a consumption for a restore, a settlement and a write-off only once its work
order confirmed it. Until the confirmation applies, the units of a withdrawal belong to its undo
alone. The confirmation follows the order rule like any other step: a restore, a settlement or a
write-off recorded after the withdrawal's save waits for it.

## Persistence

`TypeOrmWorkOrderRepository`, `TypeOrmWorkOrderQueryAdapter`,
`TypeOrmWorkOrderMetricsQueryAdapter`, `TypeOrmWorkOrderReads` and the mapper, in
`infrastructure/persistence`.

The repository does three things beyond persisting the aggregate: it honours an ambient
transaction, it enforces the version guard, and it writes the trail rows from the aggregate's own
events inside the same transaction
([0021](../../adr/0021-the-trail-written-inside-the-aggregate-transaction.md)).

The repository and the query adapters read only this module's tables. The customer, vehicle, user,
service and inventory item keys go through the key resolvers of their owners, one batch call per
owner for each request ([0028](../../adr/0028-each-module-queries-only-its-own-tables.md)).

`TypeOrmWorkOrderReads` implements the `WorkOrderReads` interface that `inventory` declares, and the
global `WorkOrderReadsModule` binds the two at the root. That is why every import between the two
modules points from `work-orders` to `inventory`.

The metrics adapter filters by `EXISTS` rather than joining `work_order_services`, because a join
would multiply rows for a work order carrying several services and corrupt the average. It turns the
service UUID of the filter into an internal key with `ServiceKeyResolver` first.

### `work_orders`

From migration `1787702400006-create-work-orders-schema.ts`, extended twice: by
`1787702400007-create-work-order-budgets.ts` and by
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
| `diagnosis_started_at`        | `timestamptz`  | Added by `…007`.                                                                                                                                        |
| `diagnosis_completed_at`      | `timestamptz`  | Added by `…007`.                                                                                                                                        |
| `budget_decided_at`           | `timestamptz`  | Added by `…007`.                                                                                                                                        |
| `budget_decided_by_user_id`   | `bigint`       | Added by `…007`. References `users (id)`, `ON DELETE RESTRICT`.                                                                                         |
| `execution_started_at`        | `timestamptz`  | Added by `…007`. The metric subtracts this from `completed_at`.                                                                                         |
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

| Column                      | Type           | Notes                                                                                                                                                             |
| --------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                        | `bigserial`    | Primary key, internal only.                                                                                                                                       |
| `external_id`               | `uuid`         | Unique.                                                                                                                                                           |
| `work_order_id`             | `bigint`       | References `work_orders (id)`, `ON DELETE RESTRICT`.                                                                                                              |
| `service_id`                | `bigint`       | References `services (id)`, `ON DELETE RESTRICT`.                                                                                                                 |
| `service_name`              | `varchar(120)` | Frozen at the moment the item was added.                                                                                                                          |
| `unit_price_cents`          | `bigint`       | `>= 0`. The live catalog price when added.                                                                                                                        |
| `budget_id`                 | `bigint`       | Added by `…007`. References `work_order_budgets (id)`, `ON DELETE RESTRICT`. Null while a draft. This is what makes "items belong to a round" true in the schema. |
| `budgeted_unit_price_cents` | `bigint`       | Added by `…007`. Frozen when the round was generated ([0019](../../adr/0019-withdrawal-charged-at-the-budgeted-price.md)).                                        |
| `created_at`                | `timestamptz`  |                                                                                                                                                                   |

Indexed by `ix_work_order_services_work_order_id`.

### `work_order_parts`

| Column                      | Type           | Notes                                                                                            |
| --------------------------- | -------------- | ------------------------------------------------------------------------------------------------ |
| `id`                        | `bigserial`    | Primary key, internal only.                                                                      |
| `external_id`               | `uuid`         | Unique.                                                                                          |
| `work_order_id`             | `bigint`       | References `work_orders (id)`, `ON DELETE RESTRICT`.                                             |
| `inventory_item_id`         | `bigint`       | References `inventory_items (id)`, `ON DELETE RESTRICT`.                                         |
| `sku`                       | `varchar(40)`  | Denormalised.                                                                                    |
| `item_name`                 | `varchar(120)` | Denormalised.                                                                                    |
| `planned_quantity`          | `integer`      | `> 0`.                                                                                           |
| `withdrawn_quantity`        | `integer`      | `>= 0`, default 0. What actually moved stock, and what the charged total counts.                 |
| `unit_price_cents`          | `bigint`       | `>= 0`.                                                                                          |
| `budget_id`                 | `bigint`       | Added by `…007`. References `work_order_budgets (id)`, `ON DELETE RESTRICT`. Null while a draft. |
| `budgeted_unit_price_cents` | `bigint`       | Added by `…007`.                                                                                 |
| `created_at`                | `timestamptz`  |                                                                                                  |

Indexed by `ix_work_order_parts_work_order_id`.

The API answers with a `budgetRound` field on both item shapes, and no column of that name exists.
It is a read-path alias: `typeorm-work-order-query.adapter.ts` selects `wob.round AS budget_round`
by joining `work_order_budgets` through `budget_id`.

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

### `work_order_stock_steps`

The outbox of the stock steps. From migration `1787702400009-add-cross-module-steps.ts`.

| Column          | Type          | Notes                                                                                                                                                 |
| --------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`            | `bigserial`   | Primary key, internal only.                                                                                                                           |
| `operation_id`  | `uuid`        | `ux_work_order_stock_steps_operation_id` unique. The key `inventory` applies the step by; a confirmation applies by `payload.consumptionOperationId`. |
| `kind`          | `varchar(30)` | `UNDO_CONSUMPTION`, `CONFIRM_CONSUMPTION`, `RESTORE`, `SETTLE` or `WRITE_OFF`.                                                                        |
| `work_order_id` | `bigint`      | References `work_orders (id)`, `ON DELETE RESTRICT`.                                                                                                  |
| `payload`       | `jsonb`       | The actor, plus the lines of a restore or the `consumptionOperationId` of a confirmation. Defaults to `{}`.                                           |
| `status`        | `varchar(20)` | `ARMED`, `PENDING`, `DONE` or `FAILED`, checked by `chk_work_order_stock_steps_status`.                                                               |
| `attempts`      | `integer`     | Claims so far. Defaults to 0.                                                                                                                         |
| `due_at`        | `timestamptz` | When the step is next due. A claim pushes it to the end of its lease.                                                                                 |
| `last_error`    | `text`        | Nullable. The error of the last failed attempt.                                                                                                       |
| `created_at`    | `timestamptz` |                                                                                                                                                       |
| `completed_at`  | `timestamptz` | Nullable. Set when the step is done.                                                                                                                  |

A step stays in the table after it is done or failed. A failed one waits there for an operator.

## Endpoints

`/api/v1/work-orders`. The work order is addressed by its `number`, not by a UUID.

| Route                                                   | Permission                                               |
| ------------------------------------------------------- | -------------------------------------------------------- |
| `POST /work-orders`                                     | `work-orders:manage`                                     |
| `GET /work-orders`                                      | `work-orders:read`                                       |
| `GET /work-orders/me`                                   | `work-orders:read-own`                                   |
| `GET /work-orders/me/:number`                           | `work-orders:read-own`                                   |
| `GET /work-orders/metrics/average-execution-time`       | `metrics:read`                                           |
| `GET /work-orders/:number`                              | `work-orders:read`                                       |
| `GET /work-orders/:number/trail`                        | `audit:read`                                             |
| `POST /work-orders/:number/services`                    | `work-orders:manage`                                     |
| `POST /work-orders/:number/parts`                       | `work-orders:manage`                                     |
| `DELETE /work-orders/:number/items/:itemExternalId`     | `work-orders:manage`                                     |
| `PUT /work-orders/:number/mechanic`                     | `work-orders:manage`                                     |
| `POST /work-orders/:number/diagnosis`                   | `work-orders:execute`                                    |
| `POST /work-orders/:number/diagnosis/completion`        | `work-orders:execute`                                    |
| `POST /work-orders/:number/budget/supplementary`        | `work-orders:execute`                                    |
| `POST /work-orders/:number/budget/approval`             | none: `BudgetDecisionAuthorizer` decides                 |
| `POST /work-orders/:number/budget/rejection`            | none: `BudgetDecisionAuthorizer` decides                 |
| `POST /work-orders/:number/budgets/:budgetId/approval`  | none: `BudgetDecisionAuthorizer` decides                 |
| `POST /work-orders/:number/budgets/:budgetId/rejection` | none: `BudgetDecisionAuthorizer` decides                 |
| `POST /work-orders/:number/withdrawals`                 | `work-orders:execute`                                    |
| `POST /work-orders/:number/returns`                     | `work-orders:execute`                                    |
| `POST /work-orders/:number/completion`                  | `work-orders:read`, then `WorkOrderCompletionAuthorizer` |
| `POST /work-orders/:number/delivery`                    | `work-orders:manage`                                     |
| `POST /work-orders/:number/cancellation`                | `work-orders:cancel`, then `CancellationAuthorizer`      |
| `POST /work-orders/:number/discount`                    | `work-orders:discount`                                   |

`POST /work-orders` takes `customerId` and `vehicleId`, and optionally `services`, a list of
`{ serviceId }`, and `parts`, a list of `{ inventoryItemId, quantity }`. It answers 201 with
`{ id, number }`. `GET /work-orders` requires `page` and `pageSize`, as [The board](#the-board)
describes.

`me`, `me/:number` and `metrics/average-execution-time` are declared before `:number`, or the
literals would be read as work order numbers.

## Errors

| Code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Status |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `WORK_ORDER_INVALID_NUMBER`, `WORK_ORDER_INVALID_PLANNED_QUANTITY`                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 400    |
| `WORK_ORDER_CANCEL_IN_EXECUTION_FORBIDDEN`, `WORK_ORDER_COMPLETION_FORBIDDEN`                                                                                                                                                                                                                                                                                                                                                                                                                                               | 403    |
| `WORK_ORDER_NOT_FOUND`, `WORK_ORDER_BUDGET_NOT_FOUND`, `WORK_ORDER_ITEM_NOT_FOUND`, `WORK_ORDER_ASSIGNED_MECHANIC_NOT_FOUND`, `WORK_ORDER_REFERENCED_CUSTOMER_NOT_FOUND`, `WORK_ORDER_REFERENCED_VEHICLE_NOT_FOUND`, `WORK_ORDER_REFERENCED_SERVICE_NOT_FOUND`, `WORK_ORDER_REFERENCED_INVENTORY_ITEM_NOT_FOUND`                                                                                                                                                                                                            | 404    |
| `WORK_ORDER_NUMBER_TAKEN`, `WORK_ORDER_VEHICLE_ALREADY_HAS_ACTIVE_WORK_ORDER`                                                                                                                                                                                                                                                                                                                                                                                                                                               | 409    |
| `WORK_ORDER_INVALID_STATE`, `BUDGET_INVALID_STATE`, `WORK_ORDER_DIAGNOSIS_WITHOUT_ITEMS`, `WORK_ORDER_EMPTY_DRAFT_BUDGET`, `WORK_ORDER_BUDGETED_ITEM_NOT_REMOVABLE`, `WORK_ORDER_WITHDRAWAL_EXCEEDS_PLANNED`, `WORK_ORDER_RETURN_EXCEEDS_WITHDRAWN`, `WORK_ORDER_PART_NOT_WITHDRAWABLE`, `WORK_ORDER_DISCOUNT_EXCEEDS_CHARGED_TOTAL`, `WORK_ORDER_DUPLICATE_BATCH_LINE`, `WORK_ORDER_CUSTOMER_INACTIVE`, `WORK_ORDER_SERVICE_INACTIVE`, `WORK_ORDER_VEHICLE_NOT_OWNED_BY_CUSTOMER`, `WORK_ORDER_ASSIGNED_USER_NOT_MECHANIC` | 422    |

A concurrent write answers 409 through `ConcurrentModificationError`, which lives in the shared
kernel rather than here.
