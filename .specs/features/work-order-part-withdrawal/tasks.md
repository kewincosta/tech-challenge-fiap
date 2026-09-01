# Work Order Part Withdrawal Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/work-order-part-withdrawal/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Generated from codebase, project guidelines and spec. Guidelines found: `vitest.config.ts`, `vitest.integration.config.ts`, `vitest.e2e.config.ts`, `package.json` scripts, `eslint.config.mjs`. No coverage threshold is configured, so the strong defaults below apply.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Domain value object / entity / aggregate | unit | All branches; 1:1 to spec ACs; every listed edge case owned by a task has a test here when the rule lives here | `src/modules/**/domain/**/*.spec.ts` | `npm run test:unit` |
| Application handler / service | unit | Every branch it owns, including each error-producing call site at this layer (L-003) | `src/modules/**/application/**/*.spec.ts` | `npm run test:unit` |
| Repository / query adapter / migration | integration | Key query paths, every constraint the design claims, and any transaction guarantee it claims | `test/integration/*.spec.ts` | `npm run test:integration` |
| Controller / route | e2e | Every route in scope: happy path, every listed edge case, and every error path including one 403 per permission per route | `test/e2e/*.e2e.spec.ts` | `npm run test:e2e` |
| ORM entity / module wiring / contract constants | none | build gate only - excluded from coverage in `vitest.config.ts` | - | build gate only |

## Gate Check Commands

> Generated from `package.json` - confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After tasks with unit tests only | `npm run test:unit` |
| Full | After tasks with integration or e2e tests | `npm run test:unit && npm run test:integration && npm run test:e2e` |
| Build | After phase completion or contract/wiring-only tasks | `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e` |

---

## Confirmed lessons applied to this breakdown

Both lessons in `.specs/LESSONS.md` are `confirmed` and shape this file directly:

- **L-002** (every spec Edge Case needs an owning task): the Edge Case Ownership table below assigns each of spec.md's six edge cases to the task that proves it and the layer that proves it. Each assignment also appears as its own **Done when** line inside that task, so an assignment cannot be satisfied by a task that forgot it.
- **L-003** (a sibling call site's test does not substitute for this one's own, x3): both batch routes get their own 403 test rather than one standing in for the pair, and both handlers get their own case for every error they can surface, even where the aggregate already has one for the same rule.

Two design-level rules also land here:

1. **No task may leave `save()` computing a stock delta from anything but the movement's own kind.** T7 owns the fix and asserts a withdraw-then-return round trip closes at the starting count - design.md's first risk, and a live trap in code shipped by feature 4.
2. **No task may take a row lock in caller-supplied order.** The ordering lives inside `findAllByIdsForUpdate` (T9), not in any handler, so no future caller can reintroduce the deadlock.

## Edge Case Ownership

| spec.md Edge Case | Owning task | Proof layer |
| --- | --- | --- |
| An empty batch is refused with 400 rather than succeeding silently | T16 | e2e, through the request DTO's own validation |
| Two mechanics withdrawing the last unit concurrently: one succeeds, one 422, the count never below zero | T9 | integration, two overlapping batches against the real database |
| Withdraw, return in full, withdraw again ends at a single withdrawal's count with three movements on the ledger | T7, T18 | integration for the delta arithmetic, e2e for the whole round trip |
| A catalog price change between approval and withdrawal writes the new price on the movement and leaves the budgeted price untouched | T11, T16 | unit handler, e2e |
| An item planned on an approved round and again on a round still awaiting approval allows only the approved line | T5, T16 | unit aggregate, e2e |
| A part on a rejected round is left out of the shortage list | T10 | integration, the query's own join |

---

## Preconditions

- No database reset. The test database is never truncated (STATE.md Conventions), so every test here generates its own customer, vehicle, plate, work order number and SKU. `test/support/factories/` already holds what the last three features built.
- **This feature adds no migration.** `stock_movements` already carries `CONSUMPTION`, `RETURN`, `undoes_movement_id`, the `PENDING` status and `stock_movement_transitions`, all created dormant by feature 4. `work_order_parts.withdrawn_quantity` was created by feature 5 and written by nothing until now. Neither `test/support/global-setup.ts` nor `test/support/db.ts` needs a new entry.
- The whole existing suite (471 unit, 172 integration, 128 e2e) runs with no ambient transaction open and is the regression net for T8's change to two shared write paths.

## Database actions

None. No migration, no new table, no new column.

## Commit rules

One atomic commit per task, with that task's checkboxes flipped in this file in the same commit. Conventional Commits, no trailers. Validate every message with `python3 .claude/skills/tlc-spec-driven/scripts/check_commit.py --message "..."` before committing.

---

## Execution Plan

Phases run in order; tasks inside a phase run in order. The real dependencies are the arrows in the Phase Execution Map further down, not this listing.

### Phase 1: Domain

```
T1  T2  T3  T4  T5  T6
```

### Phase 2: Persistence

```
T7  T8  T9  T10
```

### Phase 3: Application

```
T11  T12  T13  T14  T15
```

### Phase 4: Presentation and end to end

```
T16  T17  T18
```

---

## Task Breakdown

### T1: The inventory aggregate consumes and restores stock

**What**: `StockMovement.consume` and `StockMovement.undo` factories, filling the `status`, `workOrderId` and `undoesMovementId` props that have been null-only since feature 4, plus `InventoryItem.consume` and `InventoryItem.restoreUnits`.
**Where**: `src/modules/inventory/domain/entities/inventory-item.ts`
**Depends on**: None
**Reuses**: `replenish` and `adjustDown` as the shape, `StockQuantity.minus` for the never-negative invariant, `StockQuantity.plus` for the return
**Requirement**: WOP-01, WOP-02, WOP-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `StockMovement.consume` produces a `CONSUMPTION` in `PENDING`, carrying the work order and the acting user
- [ ] `StockMovement.undo` produces a `RETURN` with a null status, carrying the work order and the id of the consumption it undoes
- [ ] `InventoryItem.consume` lowers the count through `StockQuantity.minus` and appends the movement
- [ ] `InventoryItem.consume` refuses a quantity larger than the count on hand with `InsufficientStockError`, leaving the count and `newMovements` untouched
- [ ] `InventoryItem.restoreUnits` raises the count and appends the `RETURN`
- [ ] Neither method can be reached without a positive quantity, which `StockMovement` already guards
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: 12 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(inventory): consume and restore stock on the inventory aggregate`

---

### T2: The batch rule violation errors

**What**: `PartNotWithdrawableError`, `WithdrawalExceedsPlannedError`, `ReturnExceedsWithdrawnError` and `DuplicateBatchLineError`.
**Where**: `src/modules/work-orders/domain/errors/part-not-withdrawable.error.ts`
**Depends on**: None
**Reuses**: `DomainError` and `ErrorKind.RuleViolation`, which the global filter already maps to 422
**Requirement**: WOP-01, WOP-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Each error carries a distinct `code` and `ErrorKind.RuleViolation`
- [ ] The four codes are distinct from the twenty the module already exports
- [ ] `PartNotWithdrawableError`'s message names both reasons it fires: no round, or a round that is not approved
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: 6 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): add the part withdrawal rule violation errors`

---

### T3: The withdrawal and return trail events

**What**: `PartWithdrawn` and `PartReturned`, both `WorkOrderTrailEvent` subclasses.
**Where**: `src/modules/work-orders/domain/events/part-withdrawn.event.ts`
**Depends on**: None
**Reuses**: `WorkOrderTrailEvent` and the exported-literal pattern feature 5 established
**Requirement**: WOP-01, WOP-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Each class declares `eventType` from its own exported constant, so a rename cannot change an append-only row's meaning
- [ ] Both constants are distinct from the thirteen the module already exports
- [ ] Both carry null for `fromStatus` and `toStatus`: a withdrawal describes a fact, and the work order stays `IN_EXECUTION` either side
- [ ] Both carry the work order id, the acting user and the moment
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: 5 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): add the part withdrawal trail events`

---

### T4: The part item carries the net withdrawn quantity

**What**: `withdraw`, `returnUnits` and `outstandingQuantity` on `WorkOrderPartItem`.
**Where**: `src/modules/work-orders/domain/entities/work-order-part-item.ts`
**Depends on**: None
**Reuses**: The `attachToBudget` mutator shape feature 6 added to this same entity
**Requirement**: WOP-01, WOP-03, WOP-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `withdraw` raises `withdrawnQuantity` and accumulates across several calls
- [ ] `withdraw` refuses to pass `plannedQuantity` with `WithdrawalExceedsPlannedError`, leaving the quantity untouched
- [ ] `returnUnits` lowers `withdrawnQuantity`
- [ ] `returnUnits` refuses to go below zero with `ReturnExceedsWithdrawnError`, leaving the quantity untouched
- [ ] `outstandingQuantity` is `plannedQuantity - withdrawnQuantity`
- [ ] A withdraw-then-return-in-full round trip ends at a withdrawn quantity of zero
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: 9 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): track the net withdrawn quantity on a part item`

---

### T5: The aggregate validates a withdrawal batch

**What**: `WorkOrder.withdrawParts`, its guards, and the resolved lines it hands back to the handler.
**Where**: `src/modules/work-orders/domain/entities/work-order.ts`
**Depends on**: T2, T3, T4
**Reuses**: `assertStateAllows`, `record`, the `budgets` collection feature 6 added
**Requirement**: WOP-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `withdrawParts` guards `IN_EXECUTION` and refuses every other state with `WorkOrderStateError`
- [ ] It refuses a batch naming the same item twice with `DuplicateBatchLineError`
- [ ] It refuses an item that is not on this work order with `WorkOrderItemNotFoundError`
- [ ] It refuses an item attached to no round, and an item on a round that is not `APPROVED`, both with `PartNotWithdrawableError`
- [ ] An item planned on an approved round and again on a round still awaiting approval allows the approved line and refuses the pending one - spec.md's fifth edge case
- [ ] It returns one resolved line per requested item, each naming the inventory item id and the quantity
- [ ] It records exactly one `PartWithdrawn` for the whole batch, not one per line
- [ ] Nothing on the aggregate changes when any guard fires
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: 12 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): validate a part withdrawal batch on the aggregate`

---

### T6: The aggregate validates a return batch

**What**: `WorkOrder.returnParts` and its guards.
**Where**: `src/modules/work-orders/domain/entities/work-order.ts`
**Depends on**: T5
**Reuses**: The batch validation helpers T5 introduces
**Requirement**: WOP-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `returnParts` guards `IN_EXECUTION` and refuses every other state
- [ ] It refuses a batch naming the same item twice, and an item not on this work order
- [ ] It refuses returning more than was withdrawn with `ReturnExceedsWithdrawnError`
- [ ] It refuses an item that was never withdrawn on this work order
- [ ] It returns one resolved line per requested item, naming the inventory item id and the quantity
- [ ] It records exactly one `PartReturned` for the whole batch
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: 9 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): validate a part return batch on the aggregate`

---

### T7: The stock delta reads the movement's own kind

**What**: The delta in `save()` stops treating every non-`INBOUND` movement as a subtraction, and the three consumption-era columns start being persisted.
**Where**: `src/modules/inventory/infrastructure/persistence/typeorm-inventory-item.repository.ts`
**Depends on**: T1
**Reuses**: The existing pessimistic-lock-plus-delta write feature 4 built
**Requirement**: WOP-01, WOP-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The delta adds for `INBOUND` and `RETURN`, and subtracts for `CONSUMPTION` and `ADJUSTMENT`, keyed on the kind rather than on "not inbound" - design.md's first risk
- [ ] A `CONSUMPTION` movement persists its `status`, `work_order_id` and catalog unit price
- [ ] A `RETURN` movement persists its `undoes_movement_id` and a null status
- [ ] A withdraw-then-return-in-full round trip leaves the count on hand exactly where it started, with three movements on the ledger - spec.md's third edge case at this layer
- [ ] The mapper round-trips all three columns in both directions
- [ ] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [ ] The integration suite passes twice consecutively
- [ ] Test count: 9 tests pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `fix(inventory): compute the stock delta from the movement kind`

---

### T8: Both repositories honour an ambient transaction

**What**: The `inTransaction` helper on both write paths, so a cross-module write commits or rolls back as one (AD-008).
**Where**: `src/modules/work-orders/infrastructure/persistence/typeorm-work-order.repository.ts`
**Depends on**: T7
**Reuses**: `currentEntityManager()` and the `repo()` shape `TypeOrmUserRepository` already uses, `TransactionRunner` unchanged
**Requirement**: WOP-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Both `save()` methods resolve their manager through `currentEntityManager()` first and open their own transaction only when there is none
- [ ] With no ambient transaction, both behave exactly as before, which the whole existing suite proves
- [ ] Inside one `TransactionRunner.run`, a work order write and an inventory write land in the same Postgres transaction
- [ ] A failure after both writes have been applied leaves neither in the database
- [ ] The inventory row lock taken inside the ambient transaction is still held when the work order write commits
- [ ] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [ ] The integration suite passes twice consecutively
- [ ] Test count: 7 tests pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `feat(shared): let the work order and inventory writes share a transaction`

---

### T9: Batch loading locks in a deterministic order

**What**: `findAllByIdsForUpdate` on the inventory repository port and its TypeORM implementation.
**Where**: `src/modules/inventory/domain/repositories/inventory-item.repository.ts`
**Depends on**: T8
**Reuses**: The `pessimistic_write` lock mode feature 4 introduced
**Requirement**: WOP-01, WOP-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `findAllByIdsForUpdate` returns the addressed items ordered by internal id, locked in that order, in one query
- [ ] The order does not depend on the order of the ids the caller passed
- [ ] An id matching nothing is simply absent from the result, with no throw
- [ ] Two overlapping batches naming the same two items in reversed order both complete, one after the other, with no deadlock - spec.md's second edge case
- [ ] Two concurrent withdrawals of the last unit end with one success, one `InsufficientStockError`, and a count of zero
- [ ] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [ ] The integration suite passes twice consecutively
- [ ] Test count: 8 tests pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `feat(inventory): load a batch of items under a deterministic lock order`

---

### T10: The stock shortage query

**What**: `StockShortageDto`, the query port method, and the raw SQL that joins work-order tables from the inventory adapter.
**Where**: `src/modules/inventory/infrastructure/persistence/typeorm-inventory-query.adapter.ts`
**Depends on**: None
**Reuses**: The cross-module raw-SQL join precedent in `typeorm-work-order-query.adapter.ts:56` and its comment on AD-003
**Requirement**: WOP-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The query returns an item whose summed `planned - withdrawn` over approved rounds of work orders in `IN_EXECUTION` exceeds its count on hand
- [ ] It names the work orders waiting on each listed item
- [ ] It leaves out an item whose count on hand covers its outstanding demand
- [ ] It ignores demand from work orders in any state other than `IN_EXECUTION`
- [ ] It leaves out a part on a round that was rejected, and a draft item on no round at all - spec.md's sixth edge case
- [ ] It never reads `stock_movements`: an item with a large `PENDING` consumption and nothing outstanding is absent from the list
- [ ] It returns an empty list rather than an error when nothing is short
- [ ] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [ ] The integration suite passes twice consecutively
- [ ] Test count: 8 tests pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `feat(inventory): add the stock shortage query`

---

### T11: The consume stock batch handler

**What**: `ConsumeStockBatchCommand` and its handler, the inventory side of the cross-module write.
**Where**: `src/modules/inventory/application/commands/consume-stock-batch/consume-stock-batch.handler.ts`
**Depends on**: T1, T9
**Reuses**: `findAllByIdsForUpdate` (T9), `InventoryItem.consume` (T1), the `ID_GENERATOR` and `CLOCK` ports
**Requirement**: WOP-01, WOP-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The handler loads every addressed item through `findAllByIdsForUpdate` and applies one consumption per line
- [ ] It returns one minted movement id per line, which is what the return path later points at
- [ ] It writes the inventory item's catalog price at that moment on the movement, never the work order's budgeted price - spec.md's fourth edge case at this layer
- [ ] It refuses the whole command with `InsufficientStockError` when any line exceeds its item's count on hand
- [ ] It refuses with `InventoryItemNotFoundError` when an addressed id matches no item
- [ ] Nothing is saved when any line is refused
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: 7 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(inventory): add the consume stock batch command handler`

---

### T12: The restore stock batch handler

**What**: `RestoreStockBatchCommand` and its handler.
**Where**: `src/modules/inventory/application/commands/restore-stock-batch/restore-stock-batch.handler.ts`
**Depends on**: T1, T9
**Reuses**: The same shape as T11
**Requirement**: WOP-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The handler loads every addressed item through `findAllByIdsForUpdate` and applies one restoration per line
- [ ] Each appended `RETURN` movement names the consumption it undoes, taken from the command
- [ ] It never edits the original consumption
- [ ] It refuses with `InventoryItemNotFoundError` when an addressed id matches no item
- [ ] Nothing is saved when any line is refused
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: 6 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(inventory): add the restore stock batch command handler`

---

### T13: The withdraw parts command handler

**What**: `WithdrawPartsCommand` and its handler, which owns the transaction that spans both modules.
**Where**: `src/modules/work-orders/application/commands/withdraw-parts/withdraw-parts.handler.ts`
**Depends on**: T5, T11
**Reuses**: `RegisterUserHandler` as the structural template for a handler that saves its own aggregate and dispatches a cross-module command inside one `transactionRunner.run`
**Requirement**: WOP-01, WOP-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The handler loads by number and throws `WorkOrderNotFoundError` when nothing carries it
- [ ] It validates on the aggregate before opening the transaction, so a rejected batch never starts one
- [ ] It opens exactly one `transactionRunner.run`, saves the work order, then dispatches `ConsumeStockBatchCommand`
- [ ] It publishes the recorded events after the transaction, with `pullDomainEvents`
- [ ] `InsufficientStockError` raised by the inventory side travels out untouched
- [ ] Every aggregate guard error travels out untouched rather than being translated
- [ ] The movement ids the inventory side returns are recorded on the work order items, so a later return can point at them
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: 8 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): add the withdraw parts command handler`

---

### T14: The return parts command handler

**What**: `ReturnPartsCommand` and its handler.
**Where**: `src/modules/work-orders/application/commands/return-parts/return-parts.handler.ts`
**Depends on**: T6, T12
**Reuses**: The same transaction shape as T13
**Requirement**: WOP-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The handler loads by number and throws `WorkOrderNotFoundError` when nothing carries it
- [ ] It opens one `transactionRunner.run`, saves the work order, then dispatches `RestoreStockBatchCommand`
- [ ] It resolves which consumptions each returned line undoes, newest first, and passes them to the inventory side
- [ ] A return spanning two consumptions produces one `RETURN` per consumption drawn from
- [ ] Every aggregate guard error travels out untouched
- [ ] It publishes the recorded events after the transaction
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: 8 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): add the return parts command handler`

---

### T15: The list stock shortages query handler

**What**: `ListStockShortagesQuery` and its handler over the port T10 extended.
**Where**: `src/modules/inventory/application/queries/list-stock-shortages/list-stock-shortages.handler.ts`
**Depends on**: T10
**Reuses**: `ListInventoryItemsHandler` as the structural template
**Requirement**: WOP-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The handler returns what the port answers, unchanged
- [ ] An empty result is an empty list, never an error
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: 3 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(inventory): add the list stock shortages query handler`

---

### T16: Expose the withdrawal and return routes and walk them end to end

**What**: Both batch routes on the existing work orders controller, their request DTOs, the module registrations, and the e2e walk of a withdrawal with every refusal on that path. Also touches `withdraw-parts.request.dto.ts`, `work-orders.module.ts` and `test/e2e/work-order-withdrawals.e2e.spec.ts`.
**Where**: `src/modules/work-orders/presentation/controllers/work-orders.controller.ts`
**Depends on**: T13, T14
**Reuses**: `getWorkOrderOrThrow`, the Swagger decorator set, and `test/e2e/work-order-budgets.e2e.spec.ts`'s fixtures for reaching `IN_EXECUTION`
**Requirement**: WOP-01, WOP-02, WOP-03, WOP-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Both routes exist at the paths design.md names, carrying `@HttpCode(HttpStatus.OK)` and `@RequirePermissions(AppPermission.WorkOrdersExecute)`
- [ ] A mechanic withdraws two parts in one call and the counts on hand drop by exactly what left
- [ ] The work order reads back showing planned against withdrawn
- [ ] An empty batch answers 400 through the DTO's own validation - spec.md's first edge case
- [ ] A zero or negative quantity answers 400
- [ ] Withdrawing past the planned quantity answers 422
- [ ] Withdrawing an item on a round still awaiting approval answers 422, while the approved line on the same work order succeeds - spec.md's fifth edge case
- [ ] Withdrawing more than the shelf holds answers 422 and leaves the count, the ledger and the work order item untouched
- [ ] A catalog price change between approval and withdrawal writes the new price on the movement and leaves the budgeted price untouched - spec.md's fourth edge case
- [ ] Each of the two routes answers 403 to an actor genuinely lacking `work-orders:execute`, one test per route (L-003)
- [ ] Each of the two routes answers 404 for a number nobody carries
- [ ] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [ ] The e2e suite passes twice consecutively
- [ ] Test count: 14 tests pass (no silent deletions)

**Tests**: e2e
**Gate**: build

**Commit**: `feat(work-orders): expose the part withdrawal and return routes`

---

### T17: Expose the stock shortages route

**What**: `GET /api/v1/inventory-items/shortages`, declared above the `:externalId` route, its response DTO and its e2e coverage.
**Where**: `src/modules/inventory/presentation/controllers/inventory-items.controller.ts`
**Depends on**: T15
**Reuses**: The controller's existing Swagger decorator set and permission decorator
**Requirement**: WOP-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The route is declared **before** `GET /api/v1/inventory-items/:externalId`, with a comment saying why, and answers 200 rather than the 400 a `ParseUUIDPipe` would give
- [ ] It carries `@RequirePermissions(AppPermission.InventoryRead)`
- [ ] An administrator sees an item whose demand from a work order in execution exceeds the shelf, named with the work order waiting on it
- [ ] Replenishing to cover the demand removes the item from the list
- [ ] It answers 403 to an actor genuinely lacking `inventory:read`
- [ ] It answers an empty list, not an error, when nothing is short
- [ ] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [ ] The e2e suite passes twice consecutively
- [ ] Test count: 5 tests pass (no silent deletions)

**Tests**: e2e
**Gate**: build

**Commit**: `feat(inventory): expose the stock shortages route`

---

### T18: Cover the return path and the cross-module atomicity end to end

**What**: The e2e return round trip, the shortage signal appearing after a refused withdrawal, and the proof that a refused batch moved nothing in either module.
**Where**: `test/e2e/work-order-withdrawals.e2e.spec.ts`
**Depends on**: T16
**Reuses**: T16's fixtures
**Requirement**: WOP-02, WOP-03, WOP-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] A part withdrawn, returned in full and withdrawn again ends at a single withdrawal's count, with three movements on the item's history - spec.md's third edge case
- [ ] A return puts the units back on the shelf and lowers the work order item's withdrawn quantity
- [ ] The item's movement history shows the `CONSUMPTION` and the `RETURN`, each naming the work order
- [ ] Returning more than was withdrawn answers 422 and changes nothing
- [ ] A refused withdrawal leaves the count on hand, the movement history and the work order item all exactly as they were, read back through the API
- [ ] A refused withdrawal makes the item appear on the shortages list, which is the whole signal path H31 describes
- [ ] Replenishing after a refusal lets the same withdrawal succeed
- [ ] The trail shows the withdrawal and the return, each naming the acting mechanic
- [ ] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [ ] The e2e suite passes twice consecutively
- [ ] Test count: 8 tests pass (no silent deletions)

**Tests**: e2e
**Gate**: build

**Commit**: `test(work-orders): cover the part return and withdrawal atomicity end to end`

---

## Phase Execution Map

Every arrow is a real `Depends on`. Tasks with no arrow into them have no dependency.

```
T2 -> T5
T3 -> T5
T4 -> T5
T5 -> T6
T1 -> T7
T7 -> T8
T8 -> T9
T1 -> T11
T9 -> T11
T1 -> T12
T9 -> T12
T5 -> T13
T11 -> T13
T6 -> T14
T12 -> T14
T10 -> T15
T13 -> T16
T14 -> T16
T15 -> T17
T16 -> T18
```

Execution is strictly sequential, with no intra-phase parallelism.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 2 factories plus the 2 aggregate methods that call them | Cohesive, one vocabulary with one spec file |
| T2 | 4 error classes | Cohesive, 8 lines each |
| T3 | 2 sibling event classes | Cohesive, one spec file |
| T4 | 2 methods and 1 getter on one entity | Granular |
| T5, T6 | 1 aggregate transition each | Granular |
| T7 | 1 arithmetic fix plus the columns it unblocks | Granular, the smallest change with the largest blast radius |
| T8 | 1 helper, added to 2 repositories | Cohesive, one architectural rule (AD-008) proven once |
| T9 | 1 port method | Granular |
| T10 | 1 query | Granular |
| T11, T12 | 1 command handler each | Granular |
| T13, T14 | 1 command handler each | Granular |
| T15 | 1 thin query handler | Granular |
| T16 | 1 controller pair of routes plus its DTOs, wiring and e2e | Cohesive, the closing checkpoint, same shape as the prior three features |
| T17 | 1 route | Granular |
| T18 | 1 e2e spec covering what T16 does not | Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends on (task body) | Diagram shows | Status |
| --- | --- | --- | --- |
| T1 | None | no inbound arrow | Match |
| T2 | None | no inbound arrow | Match |
| T3 | None | no inbound arrow | Match |
| T4 | None | no inbound arrow | Match |
| T5 | T2, T3, T4 | `T2 -> T5`, `T3 -> T5`, `T4 -> T5` | Match |
| T6 | T5 | `T5 -> T6` | Match |
| T7 | T1 | `T1 -> T7` | Match |
| T8 | T7 | `T7 -> T8` | Match |
| T9 | T8 | `T8 -> T9` | Match |
| T10 | None | no inbound arrow | Match |
| T11 | T1, T9 | `T1 -> T11`, `T9 -> T11` | Match |
| T12 | T1, T9 | `T1 -> T12`, `T9 -> T12` | Match |
| T13 | T5, T11 | `T5 -> T13`, `T11 -> T13` | Match |
| T14 | T6, T12 | `T6 -> T14`, `T12 -> T14` | Match |
| T15 | T10 | `T10 -> T15` | Match |
| T16 | T13, T14 | `T13 -> T16`, `T14 -> T16` | Match |
| T17 | T15 | `T15 -> T17` | Match |
| T18 | T16 | `T16 -> T18` | Match |

No task depends on a later phase.

---

## Test Co-location Validation

| Task | Code layer created | Matrix requires | Task says | Status |
| --- | --- | --- | --- | --- |
| T1 | domain entity and child entity | unit | unit | OK |
| T2 | domain errors | unit | unit | OK |
| T3 | domain events | unit | unit | OK |
| T4 | domain child entity | unit | unit | OK |
| T5, T6 | domain aggregate | unit | unit | OK |
| T7 | repository and mapper | integration | integration | OK |
| T8 | two repositories, one transaction guarantee | integration | integration | OK |
| T9 | repository port method | integration | integration | OK |
| T10 | query adapter and its port | integration | integration | OK |
| T11 to T15 | application handlers | unit | unit | OK |
| T16 | controller, DTOs, module wiring | e2e (highest of the layers touched) | e2e | OK |
| T17 | controller route | e2e | e2e | OK |
| T18 | routes already built, exercised further | e2e | e2e | OK |

No task carries `Tests: none`.

---

## MCPs and Skills

No task needs an MCP or a further skill. Every dependency is in this repository, every pattern has a local precedent named in its `Reuses` line, and the one external contract this feature leans on hardest (TypeORM's `FOR UPDATE` through `lock: { mode: 'pessimistic_write' }` and `AsyncLocalStorage`-carried `EntityManager`) is already exercised by `inventory-and-stock-movements` and `identity-foundation` respectively.
