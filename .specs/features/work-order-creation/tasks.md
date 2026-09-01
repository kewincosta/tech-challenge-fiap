# Work Order Creation Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/work-order-creation/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Generated from codebase, project guidelines and spec. Guidelines found: `vitest.config.ts`, `vitest.integration.config.ts`, `vitest.e2e.config.ts`, `package.json` scripts, `eslint.config.mjs`. No coverage threshold is configured, so the strong defaults below apply.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Domain value object / entity / aggregate | unit | All branches; 1:1 to spec ACs; every listed edge case owned by a task has a test here when the rule lives here | `src/modules/**/domain/**/*.spec.ts` | `npm run test:unit` |
| Application handler (command / query) | unit | Every branch the handler owns, including each error-producing call site at this layer (L-003) | `src/modules/**/application/**/*.spec.ts` | `npm run test:unit` |
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

- **L-002** (every spec Edge Case needs an owning task): the Edge Case Ownership table below assigns each of spec.md's six edge cases to the task that proves it and the layer that proves it.
- **L-003** (a sibling call site's test does not substitute for this one's own, and it recurred three times through `inventory-and-stock-movements`): the state guard is proven at three layers with a dedicated test each (T7 aggregate, T15 handler, T19 e2e). Every route gets its own 403 case in T19 rather than one 403 standing in for the group. Every handler that can throw a not-found gets its own case.

One design-level risk also lands as a rule here: **no handler test that makes more than one cross-module read may stub `queryBus.execute` positionally.** T13 and T17 stub by branching on the query instance, never on call order (design.md's Risks & Concerns, first row).

## Edge Case Ownership

| spec.md Edge Case | Owning task | Proof layer |
| --- | --- | --- |
| Two concurrent creations for the same vehicle, one stored and one refused with 409 | T10 | integration, two overlapping writes against the real partial unique index |
| A drawn number that already exists is drawn again | T13 | unit, a generator stubbed to collide once then succeed |
| A freshly created work order already has its creation entry on the trail and empty item lists | T10 (trail row) and T7 (empty items) | integration and unit |
| A part planned in `RECEIVED` is refused with 422 | T7, T15, T19 | unit aggregate, unit handler, e2e |
| The customer or vehicle edited afterwards leaves the work order snapshot unchanged | T19 | e2e, edit through the owning module then re-read the work order |
| A trail requested for a number that does not exist answers 404 rather than an empty list | T19 | e2e, the controller owns the existence check |

---

## Preconditions

- No database reset. The test database is never truncated (STATE.md Conventions), so every test here generates its own customer, vehicle, plate and work order number.
- `test/support/global-setup.ts` holds a **hardcoded** `migrations` array, not a glob. The new migration must be imported and added there in the same task that creates it, or every later task fails with a misleading "relation does not exist".
- `test/support/db.ts` holds an **explicit** entity list. The four new ORM entities must be added there in the task that creates them.
- Only the CLI datasource globs its migrations, so nothing else needs registering.

## Database actions

None destructive. One additive migration creating four tables and adding one foreign key to `stock_movements`, a column that every existing row carries as `NULL`.

## Commit rules

One atomic commit per task, with that task's checkboxes flipped in this file in the same commit. Conventional Commits, no trailers. Validate every message with `python3 .claude/skills/tlc-spec-driven/scripts/check_commit.py --message "..."` before committing.

---

## Execution Plan

Phases run in order; tasks inside a phase run in order. The real dependencies are the arrows in the Phase Execution Map further down, not this listing.

### Phase 1: Domain

```
T1  T2  T3  T4  T5  T6  T7
```

### Phase 2: Persistence

```
T8  T9  T10  T11
```

### Phase 3: Application

```
T12  T13  T14  T15  T16  T17  T18
```

### Phase 4: Presentation

```
T19
```

---

## Task Breakdown

### T1: The non-draining read on AggregateRoot

**What**: A `domainEvents` getter on the shared `AggregateRoot` returning a copy of the recorded events without emptying the list, beside the existing `pullDomainEvents`, which keeps draining.
**Where**: `src/shared/domain/aggregate-root.ts`
**Depends on**: None
**Reuses**: The existing `record` and `pullDomainEvents`, whose behaviour must not change
**Requirement**: WO-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `domainEvents` returns every recorded event
- [x] Reading `domainEvents` twice returns the same events, proving it does not drain
- [x] `pullDomainEvents` still returns the events and still empties the list after `domainEvents` was read
- [x] The seven aggregates that already extend `AggregateRoot` are untouched
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 3 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(shared): add a non-draining domainEvents read to AggregateRoot`

---

### T2: WorkOrderNumber value object

**What**: The `WorkOrderNumber` value object, validating `[A-Z0-9]{6}-[0-9]{4}` and normalising to upper case, plus `InvalidWorkOrderNumberError`.
**Where**: `src/modules/work-orders/domain/value-objects/work-order-number.ts`
**Depends on**: None
**Reuses**: The private-constructor/static-factory VO shape (`Sku`, `ServiceName`)
**Requirement**: WO-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Accepts `A1B090-2026` and exposes it unchanged
- [x] Normalises a lower-case number to upper case and trims surrounding whitespace
- [x] Rejects a first block shorter or longer than six characters
- [x] Rejects a year block that is not exactly four digits
- [x] Rejects a character outside `A-Z0-9` in the first block
- [x] Rejects an empty or whitespace-only value
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 6 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): add the WorkOrderNumber value object`

---

### T3: PlannedQuantity value object

**What**: The `PlannedQuantity` value object, a strictly positive whole number of units, plus `InvalidPlannedQuantityError`.
**Where**: `src/modules/work-orders/domain/value-objects/planned-quantity.ts`
**Depends on**: None
**Reuses**: The VO shape; deliberately local rather than inventory's `StockQuantity` (design.md's Tech Decisions)
**Requirement**: WO-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Accepts a positive whole number
- [x] Rejects zero
- [x] Rejects a negative value
- [x] Rejects a fractional value
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 4 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): add the PlannedQuantity value object`

---

### T4: Work order status and the five trail events

**What**: The `WorkOrderStatus` enum over the seven states, the `WorkOrderTrailEvent` base carrying the acting user and the from/to statuses, and the five event classes, each exporting its own `eventType` constant.
**Where**: `src/modules/work-orders/domain/events/`
**Depends on**: None
**Reuses**: `DomainEvent` (`src/shared/domain/domain-event.ts`), the `ServiceStatus` enum shape
**Requirement**: WO-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `WorkOrderStatus` carries all seven states, including the five this feature never reaches
- [x] `WorkOrderCreated`, `ServiceAddedToWorkOrder`, `PartPlannedForWorkOrder`, `ItemRemovedFromWorkOrder` and `MechanicAssigned` each expose a distinct literal `eventType`, asserted per class so a rename fails a test instead of silently changing an append-only column
- [x] Each event carries the work order id, the acting user and the moment it happened
- [x] `WorkOrderCreated` carries `toStatus: RECEIVED` and a null `fromStatus`
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 6 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): add the work order status and trail events`

---

### T5: WorkOrderServiceItem child entity

**What**: The `WorkOrderServiceItem` child entity, snapshotting the catalog service at the moment it was added.
**Where**: `src/modules/work-orders/domain/entities/work-order-service-item.ts`
**Depends on**: None
**Reuses**: `RefreshToken` as the child-entity template, `Money`, `EntityId` through `WorkOrderItemId`
**Requirement**: WO-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `add` builds an item carrying the service identifier, its name and its unit price, with no quantity
- [x] `restore` rebuilds an item from persisted props
- [x] The class exposes read-only getters and no mutating method
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 3 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): add the WorkOrderServiceItem child entity`

---

### T6: WorkOrderPartItem child entity

**What**: The `WorkOrderPartItem` child entity, snapshotting the inventory item and carrying the planned and withdrawn quantities.
**Where**: `src/modules/work-orders/domain/entities/work-order-part-item.ts`
**Depends on**: T3
**Reuses**: `PlannedQuantity` from T3, `Money`, the same child-entity template as T5
**Requirement**: WO-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `add` builds an item carrying the inventory item identifier, its SKU, its name, its unit price and the planned quantity
- [ ] A newly added item has a withdrawn quantity of zero
- [ ] `restore` rebuilds an item from persisted props, withdrawn quantity included
- [ ] A zero planned quantity is refused through `PlannedQuantity`
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: 4 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): add the WorkOrderPartItem child entity`

---

### T7: WorkOrder aggregate

**What**: The `WorkOrder` aggregate root - `open`, `restore`, `addService`, `planPart`, `removeItem`, `assignMechanic` - plus `WorkOrderId`, `WorkOrderItemId` and the domain errors these methods throw.
**Where**: `src/modules/work-orders/domain/entities/work-order.ts`
**Depends on**: T1, T2, T4, T5, T6
**Reuses**: `Session` as the aggregate-with-children template, `AggregateRoot` including T1's new getter
**Requirement**: WO-01, WO-02, WO-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `open` starts the work order `RECEIVED`, stores the customer and vehicle snapshot, records the creator and records `WorkOrderCreated`
- [ ] `restore` rebuilds from persisted props with its items and **no** trail (the trail is a read model)
- [ ] `addService` appends an item and records `ServiceAddedToWorkOrder` in `RECEIVED`
- [ ] Adding the same service twice records two separate items (owns that AC)
- [ ] `addService` in a state the state machine forbids throws `WorkOrderStateError` naming the current status
- [ ] `planPart` appends an item and records `PartPlannedForWorkOrder` in `IN_DIAGNOSIS`
- [ ] **`planPart` in `RECEIVED` throws `WorkOrderStateError`** - the first of the three layers this rule is proven at (L-003, owns half of that edge case)
- [ ] `removeItem` removes a service item and leaves every other item in place
- [ ] `removeItem` removes a part item
- [ ] `removeItem` for an identifier the work order does not hold throws `WorkOrderItemNotFoundError`
- [ ] `assignMechanic` records the assignee and `MechanicAssigned`
- [ ] `assignMechanic` replaces an existing assignee
- [ ] `assignMechanic` on a `DELIVERED` or `CANCELED` work order throws `WorkOrderStateError`
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: 13 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): add the WorkOrder aggregate`

---

### T8: Work order schema migration

**What**: One migration creating `work_orders`, `work_order_services`, `work_order_parts` and `work_order_events` with every `CHECK`, the partial unique index on the vehicle and the trail index, and adding the deferred foreign key from `stock_movements.work_order_id`. Registered in `test/support/global-setup.ts` in the same commit.
**Where**: `src/shared/infrastructure/database/migrations/<timestamp>-create-work-orders-schema.ts`
**Depends on**: T7
**Reuses**: The inventory migration's shape, including its constraint naming
**Requirement**: WO-01, WO-02, WO-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] All four tables have `id bigserial pk` and `external_id uuid unique` (AD-001)
- [ ] `work_orders.status` carries a `CHECK` listing all seven states
- [ ] `work_orders.number` is unique
- [ ] **`ux_work_orders_active_vehicle` refuses a second work order for a vehicle while the first is non-terminal, and accepts one once the first is `DELIVERED`** - written as `where status not in ('DELIVERED', 'CANCELED')`, the complement rather than an enumeration
- [ ] `planned_quantity > 0` and `withdrawn_quantity >= 0` are refused at the database level
- [ ] `unit_price_cents >= 0` is refused at the database level on both item tables
- [ ] `work_order_events` is indexed on `(work_order_id, occurred_at)`
- [ ] **`stock_movements.work_order_id` now has a foreign key to `work_orders(id)`**, the one `inventory-and-stock-movements` deliberately deferred
- [ ] The migration class is imported and added to `test/support/global-setup.ts`'s `migrations` array
- [ ] `down()` drops the four tables and the added constraint cleanly, verified by code review rather than executed against the shared test database
- [ ] Gate check passes: `npm run test:integration`
- [ ] Test count: 8 tests pass (no silent deletions)

**Tests**: integration
**Gate**: quick

**Commit**: `feat(work-orders): add the work order schema migration`

---

### T9: Work order repository, round trip

**What**: The `WorkOrderRepository` port, the four ORM entities, the mapper, and `TypeOrmWorkOrderRepository.findByNumber` plus the basic `save`, resolving every external identifier to its internal key. Registers the entities in `test/support/db.ts`.
**Where**: `src/modules/work-orders/infrastructure/persistence/typeorm-work-order.repository.ts`
**Depends on**: T8
**Reuses**: `TypeOrmInventoryItemRepository` for the id resolution and the mapper split, `Money.fromDatabase`
**Requirement**: WO-01, WO-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] A save-then-find round trip returns an equal aggregate with both item lists intact
- [ ] `findByNumber` attaches **no** trail entries, however many the work order has
- [ ] `findByNumber` returns null for a number no work order carries
- [ ] The customer, vehicle and creator external ids are resolved to internal keys at the repository boundary (AD-001)
- [ ] Unit prices round-trip as **numbers** while the raw driver value is asserted to be a `string`, on both item tables
- [ ] Removing an item from the aggregate deletes only that row on the next save, leaving the others
- [ ] Every test generates its own customer, vehicle and number - the test database is never truncated
- [ ] Gate check passes: `npm run test:integration`, run twice consecutively
- [ ] Test count: 6 tests pass (no silent deletions)

**Tests**: integration
**Gate**: quick

**Commit**: `feat(work-orders): add the work order repository`

---

### T10: The trail write and the two constraint mappings

**What**: `save` extended to append one `work_order_events` row per event read from `workOrder.domainEvents` inside the same transaction, and to map `ux_work_orders_number` and `ux_work_orders_active_vehicle` to two different errors.
**Where**: `src/modules/work-orders/infrastructure/persistence/typeorm-work-order.repository.ts`
**Depends on**: T9
**Reuses**: `TypeOrmInventoryItemRepository`'s `isViolation(error, code, constraint)` helper, T1's `domainEvents` getter
**Requirement**: WO-03, WO-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] A save writes one trail row per recorded event, inside the transaction that persists the aggregate (AD-007)
- [ ] **A failure inside the write leaves neither the work order changes nor any trail row**, proven by a forced rollback against real PostgreSQL
- [ ] The recorded events are still available to the publisher after `save` returns, proven at the repository seam and not only on the base class
- [ ] Each trail row carries its event type, the acting user resolved to an internal key, the from and to statuses, and the moment
- [ ] A freshly created work order already has its creation entry on the trail (owns half of that edge case, L-002)
- [ ] A duplicate number maps to `WorkOrderNumberTakenError`, which the handler retries
- [ ] **A second non-terminal work order for the same vehicle maps to `VehicleAlreadyHasActiveWorkOrderError`**, never to the number error, proven by two overlapping writes (owns that edge case)
- [ ] Gate check passes: `npm run test:integration`, run twice consecutively
- [ ] Test count: 6 tests pass (no silent deletions)

**Tests**: integration
**Gate**: quick

**Commit**: `feat(work-orders): write the work order trail inside the aggregate transaction`

---

### T11: Work order query adapter

**What**: `WorkOrderQueryPort` and `TypeOrmWorkOrderQueryAdapter` - `listByStatus`, `getByNumber` and `listTrail`, the read model over the trail the aggregate refuses to load.
**Where**: `src/modules/work-orders/infrastructure/persistence/typeorm-work-order-query.adapter.ts`
**Depends on**: T10
**Reuses**: `TypeOrmInventoryQueryAdapter`'s shape, its raw-SQL join to `users` and its explicit `Money.fromDatabase` conversion
**Requirement**: WO-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `getByNumber` returns the work order with its snapshot, status, assigned mechanic and both item lists, or null
- [ ] `listByStatus` returns every work order when no status is supplied
- [ ] `listByStatus` returns only the matching ones when a status is supplied
- [ ] `listTrail` returns every entry of one work order in chronological order, with the actor's **external** id, never the internal one (AD-001)
- [ ] Prices come back as numbers on both read paths, not the driver's string
- [ ] Gate check passes: `npm run test:integration`, run twice consecutively
- [ ] Test count: 6 tests pass (no silent deletions)

**Tests**: integration
**Gate**: quick

**Commit**: `feat(work-orders): add the work order query adapter`

---

### T12: Work order number generator

**What**: The `WorkOrderNumberGenerator` port and `RandomWorkOrderNumberGenerator`, drawing six characters from `A-Z0-9` with `node:crypto` and appending the year.
**Where**: `src/modules/work-orders/infrastructure/random-work-order-number.generator.ts`
**Depends on**: T2
**Reuses**: The port-plus-symbol shape of `IdGenerator` (`src/shared/application/ports/id-generator.port.ts`)
**Requirement**: WO-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Produces a number `WorkOrderNumber.create` accepts, for a given year
- [ ] Uses only characters from `A-Z0-9` in the first block
- [ ] Two consecutive draws differ, so a collision is a real event rather than a certainty
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: 3 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): add the work order number generator`

---

### T13: Create work order command

**What**: `CreateWorkOrderCommand` and its handler - two cross-module reads, the rules over them, and the bounded retry loop around the number collision. Adds `InMemoryWorkOrderRepository`.
**Where**: `src/modules/work-orders/application/commands/create-work-order/`
**Depends on**: T7, T12
**Reuses**: `RegisterVehicleHandler`'s cross-module read shape, `InMemoryServiceRepository` as the fake template
**Requirement**: WO-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Creates a `RECEIVED` work order for an active customer and their vehicle, returning the number and the external id
- [ ] Snapshots the customer name and the vehicle plate, brand, model and year onto the work order
- [ ] Refuses a deactivated customer with `CustomerInactiveError`
- [ ] Refuses a vehicle owned by a different customer with `VehicleNotOwnedByCustomerError`
- [ ] Refuses a customer the query answers null for, with `ReferencedCustomerNotFoundError`
- [ ] Refuses a vehicle the query answers null for, with `ReferencedVehicleNotFoundError`
- [ ] **Draws a second number when the first collides and succeeds**, with a generator stubbed to collide once (owns that edge case)
- [ ] Gives up after five collisions rather than storing a work order without a number
- [ ] **Never retries `VehicleAlreadyHasActiveWorkOrderError`**, which propagates on the first attempt
- [ ] **The `queryBus.execute` stub branches on the query instance, never on call order** (design.md's Risks & Concerns)
- [ ] Every refusal test also asserts nothing was persisted
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: 9 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): add the create work order command`

---

### T14: Add requested service command

**What**: `AddRequestedServiceCommand` and its handler, resolving the catalog service and snapshotting it onto the work order.
**Where**: `src/modules/work-orders/application/commands/add-requested-service/`
**Depends on**: T13
**Reuses**: The `QueryBus` read shape, `GetServiceQuery` and `ServiceSummaryDto` from `services`
**Requirement**: WO-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Adds an active service, snapshotting its name and unit price at that moment
- [ ] Refuses a deactivated service with `ServiceInactiveError` (its own test at this layer, L-003)
- [ ] Refuses a service the query answers null for, with `ReferencedServiceNotFoundError`
- [ ] Refuses an unknown work order with `WorkOrderNotFoundError`
- [ ] Every refusal test also asserts nothing was persisted
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: 4 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): add the add requested service command`

---

### T15: Plan part command

**What**: `PlanPartCommand` and its handler, resolving the inventory item and snapshotting it, without touching the stock.
**Where**: `src/modules/work-orders/application/commands/plan-part/`
**Depends on**: T13
**Reuses**: The `QueryBus` read shape, `GetInventoryItemQuery` and `InventoryItemSummaryDto` from `inventory`
**Requirement**: WO-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Plans a part on a work order in `IN_DIAGNOSIS`, snapshotting the SKU, name and unit price
- [ ] Leaves the inventory item's quantity on hand untouched, no command reaching `inventory`
- [ ] **Refuses a part planned on a work order in `RECEIVED` with `WorkOrderStateError`** - the second of the three layers this rule is proven at (L-003)
- [ ] Refuses a zero or negative quantity with `InvalidPlannedQuantityError`
- [ ] Refuses an inventory item the query answers null for, with `ReferencedInventoryItemNotFoundError`
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: 5 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): add the plan part command`

---

### T16: Remove work order item command

**What**: `RemoveWorkOrderItemCommand` and its handler, removing a service item or a part item by its own external identifier.
**Where**: `src/modules/work-orders/application/commands/remove-work-order-item/`
**Depends on**: T13
**Reuses**: The aggregate's `removeItem`, which owns the search across both collections
**Requirement**: WO-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Removes an item and leaves every other item of that work order in place
- [ ] Refuses an item identifier the addressed work order does not hold, with `WorkOrderItemNotFoundError`
- [ ] Refuses an unknown work order with `WorkOrderNotFoundError` (its own test at this layer, L-003)
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: 3 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): add the remove work order item command`

---

### T17: Assign mechanic command

**What**: `AssignMechanicCommand` and its handler, checking that the target user exists before checking that they hold `MECHANIC`.
**Where**: `src/modules/work-orders/application/commands/assign-mechanic/`
**Depends on**: T13
**Reuses**: `GetUserByIdQuery` from `users` and `GetUserEffectiveAccessQuery` from `authorization`
**Requirement**: WO-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Assigns a user who holds `MECHANIC` and records the assignment
- [ ] Refuses a user who exists without the role, with `AssignedUserNotMechanicError`
- [ ] **Refuses a user that does not exist with `AssignedMechanicNotFoundError`**, proving the existence read runs first, because the effective-access read alone answers empty roles for both cases (design.md's Risks & Concerns)
- [ ] Replaces an existing assignee
- [ ] Refuses an unknown work order with `WorkOrderNotFoundError`
- [ ] **The `queryBus.execute` stub branches on the query instance, never on call order**
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: 5 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): add the assign mechanic command`

---

### T18: Work order read queries

**What**: `ListWorkOrdersQuery`, `GetWorkOrderQuery` and `GetWorkOrderTrailQuery` with their handlers.
**Where**: `src/modules/work-orders/application/queries/`
**Depends on**: T11
**Reuses**: `GetServiceHandler`'s malformed-id guard shape, `ListInventoryItemsHandler`'s filter shape
**Requirement**: WO-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `ListWorkOrdersQuery` returns the board
- [ ] `ListWorkOrdersQuery` returns only the matching status when one is supplied
- [ ] `GetWorkOrderQuery` returns one work order by its number
- [ ] `GetWorkOrderQuery` returns null for a well-formed number no work order carries, rather than throwing
- [ ] `GetWorkOrderTrailQuery` returns the entries in chronological order
- [ ] Gate check passes: `npm run test:integration`, run twice consecutively
- [ ] Test count: 5 tests pass (no silent deletions)

**Tests**: integration
**Gate**: quick

**Commit**: `feat(work-orders): add the work order read queries`

---

### T19: Work orders controller

**What**: `WorkOrdersController` - the seven routes phase 8 names - plus the request and response DTOs, `WorkOrdersModule` and its `AppModule` registration. The closing checkpoint for this feature.
**Where**: `src/modules/work-orders/presentation/controllers/work-orders.controller.ts`
**Depends on**: T14, T15, T16, T17, T18
**Reuses**: `InventoryItemsController`'s route shape, `CurrentUser`/`Principal` for the acting user every command records
**Requirement**: WO-01, WO-02, WO-03, WO-04, WO-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `POST /api/v1/work-orders` creates a work order as a service advisor and answers 201 with the number
- [ ] A mechanic creating a work order answers 403, holding `work-orders:read` and not `work-orders:manage`
- [ ] A second work order for the same vehicle answers 409
- [ ] A deactivated customer answers 422 and a vehicle that does not exist answers 404
- [ ] `POST .../services` adds a service and it appears on the detail
- [ ] **`POST .../parts` on a `RECEIVED` work order answers 422** - the third of the three layers this rule is proven at (L-003)
- [ ] `DELETE .../items/:itemExternalId` removes the item, and an item of another work order answers 404
- [ ] `PUT .../mechanic` assigns a mechanic, and a user without the role answers 422
- [ ] `GET /api/v1/work-orders` lists the board and filters by status
- [ ] `GET /api/v1/work-orders/:number` returns one work order, and an unknown number answers 404
- [ ] A malformed number answers 400 rather than 404
- [ ] **`GET .../trail` answers 200 to an administrator and 403 to a service advisor**, the two permissions proven distinct
- [ ] **Editing the customer or the vehicle afterwards leaves the work order snapshot unchanged** (owns that edge case)
- [ ] Each of the five write routes has its own 403 case rather than one standing in for the group (L-003)
- [ ] `WorkOrdersModule` registered in `AppModule`
- [ ] The full pre-existing suite (522 tests) stays green
- [ ] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [ ] Test count: 13 e2e tests pass (no silent deletions)

**Tests**: e2e
**Gate**: build

**Commit**: `feat(work-orders): add the work orders controller`

---

## Phase Execution Map

Every arrow is a real `Depends on`. Tasks with no arrow into them have no dependency.

```
T1 -> T7
T2 -> T7
T2 -> T12
T3 -> T6 -> T7
T4 -> T7
T5 -> T7
T7 -> T8 -> T9 -> T10 -> T11 -> T18
T7 -> T13
T12 -> T13
T13 -> T14 -> T19
T13 -> T15 -> T19
T13 -> T16 -> T19
T13 -> T17 -> T19
T18 -> T19
```

Execution is strictly sequential, with no intra-phase parallelism.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 1 method on 1 shared class | Granular |
| T2, T3 | 1 value object each | Granular |
| T4 | 1 enum plus 5 sibling event classes in one directory | Cohesive, one vocabulary with one spec file |
| T5, T6 | 1 child entity each | Granular |
| T7 | 1 aggregate | Granular, the largest single unit here |
| T8 | 1 migration | Granular |
| T9 | 1 repository plus the entities and mapper it cannot be tested without | Cohesive, merged forward per the test co-location rule |
| T10 | 1 method extended on the repository T9 created | Granular |
| T11 | 1 query adapter | Granular |
| T12 | 1 generator | Granular |
| T13 to T17 | 1 command handler each | Granular |
| T18 | 3 thin query handlers over one port | Cohesive, one integration spec |
| T19 | 1 controller plus its DTOs and wiring | Cohesive, the closing checkpoint, same shape as the prior four features |

---

## Diagram-Definition Cross-Check

| Task | Depends on (task body) | Diagram shows | Status |
| --- | --- | --- | --- |
| T1 | None | no inbound arrow | Match |
| T2 | None | no inbound arrow | Match |
| T3 | None | no inbound arrow | Match |
| T4 | None | no inbound arrow | Match |
| T5 | None | no inbound arrow | Match |
| T6 | T3 | T3 -> T6 | Match |
| T7 | T1, T2, T4, T5, T6 | T1/T2/T4/T5 -> T7, T6 -> T7 | Match |
| T8 | T7 | T7 -> T8 | Match |
| T9 | T8 | T8 -> T9 | Match |
| T10 | T9 | T9 -> T10 | Match |
| T11 | T10 | T10 -> T11 | Match |
| T12 | T2 | T2 -> T12 | Match |
| T13 | T7, T12 | T7 -> T13, T12 -> T13 | Match |
| T14 | T13 | T13 -> T14 | Match |
| T15 | T13 | T13 -> T15 | Match |
| T16 | T13 | T13 -> T16 | Match |
| T17 | T13 | T13 -> T17 | Match |
| T18 | T11 | T11 -> T18 | Match |
| T19 | T14, T15, T16, T17, T18 | all five -> T19 | Match |

No dependency points at a later phase.

---

## Test Co-location Validation

| Task | Code layer created | Matrix requires | Task says | Status |
| --- | --- | --- | --- | --- |
| T1 | shared domain base class | unit | unit | OK |
| T2, T3 | domain value object | unit | unit | OK |
| T4 | domain events | unit | unit | OK |
| T5, T6 | domain child entity | unit | unit | OK |
| T7 | domain aggregate | unit | unit | OK |
| T8 | migration | integration | integration | OK |
| T9, T10 | repository, ORM entities, mapper | integration (highest of the layers touched) | integration | OK |
| T11 | query adapter | integration | integration | OK |
| T12 | infrastructure generator | unit | unit | OK |
| T13 to T17 | application command handler | unit | unit | OK |
| T18 | application query handlers over the real adapter | integration | integration | OK |
| T19 | controller, DTOs, module wiring | e2e (highest of the layers touched) | e2e | OK |

No task carries `Tests: none`. The ORM entities that the matrix would allow to skip tests are merged into T9, which tests them through the repository, so no task produces unverified code.

---

## MCPs and Skills

No task needs an MCP or a further skill. Every dependency is in this repository, every pattern has a local precedent named in its `Reuses` line, and the one external contract (TypeORM's `lock` and transaction API) is already exercised by `inventory-and-stock-movements`.
