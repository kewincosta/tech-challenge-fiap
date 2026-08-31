# Inventory And Stock Movements Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/inventory-and-stock-movements/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Same conventions as the three features before this one - same repository, same guidelines. Guidelines found: `docs/ddd/implementation-plan.md` section 8, `vitest.config.ts` (coverage include/exclude), `package.json` scripts. No `AGENTS.md`, `CONTRIBUTING.md` or `README.md` exists.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Domain value object | unit | All branches; every listed edge case has a test; 1:1 to the spec ACs it implements | `src/**/domain/**/*.spec.ts` | `npm run test:unit` |
| Domain entity / aggregate | unit | All branches and every invariant; 1:1 to the spec ACs it implements | `src/**/domain/**/*.spec.ts` | `npm run test:unit` |
| Application handler | unit, with in-memory fakes | Happy path plus every refusal path named in the spec | `src/**/application/**/*.spec.ts` | `npm run test:unit` |
| Repository / mapper / query adapter | integration, real Postgres | Key query paths, the constraint violations the schema enforces, and any concurrency guarantee the design claims | `test/integration/**/*.spec.ts` | `npm run test:integration` |
| Migration | integration, real Postgres | The constraints and indexes it creates are enforced | `test/integration/**/*.spec.ts` | `npm run test:integration` |
| Controller / route | e2e | Every route the task adds: happy path, every edge case, every error path | `test/e2e/**/*.spec.ts` | `npm run test:e2e` |
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

Both lessons in `.specs/LESSONS.md` are `confirmed` (each seen twice) and shape this file directly:

- **L-002** - every line in spec.md's Edge Cases section needs an owning task, or it ships
  unimplemented. The **Edge Case Ownership** table below names the task that owns each of the five,
  and each of those tasks carries the edge case as its own `Done when` line.
- **L-003** - a value object's own passing tests, or a sibling handler exercising the identical call,
  do not substitute for a dedicated test on the specific handler or route. Every refusal path in this
  feature is listed separately in the owning task's `Done when`, at the layer the coverage matrix
  promises for it. In particular the never-negative rule is tested three times on purpose: at
  `StockQuantity` (T2), at the handler (T9), and at the route (T11).

## Edge Case Ownership (L-002)

| Edge case from spec.md | Owning task | Layer it is proven at |
| --- | --- | --- |
| Two concurrent replenishments leave the count equal to their sum | T6 | integration, two real connections |
| An adjustment that would go negative appends no movement row at all | T6 | integration, ledger asserted empty after the refusal |
| A newly created item has quantity zero and an empty history | T4 (zero) and T10 (empty history) | unit, then integration |
| A note is optional on a replenishment and mandatory on an adjustment | T9 | unit, one test per side |
| A movement against an item that does not exist answers 404 and writes nothing | T9 and T11 | unit, then e2e |

---

## Preconditions

No database reset needed. This feature adds one new migration creating three new tables, never
rewrites an existing one, and touches no existing module's schema or code, so the full suite
(426 tests as of `service-catalog`'s closing state) is expected to stay green through every task -
there is no transitional-gate section here.

**Two things that are not automatic**, both recorded after earlier features tripped on them:

- `test/support/global-setup.ts` passes a **hardcoded array** of migration classes to its
  `DataSource`, not a glob. T5 must import its class into that array in the same commit, or every
  later task fails with a misleading "relation does not exist".
- `test/support/db.ts`'s `createTestDataSource()` entity list is likewise explicit. T6 adds
  `InventoryItemOrmEntity` and `StockMovementOrmEntity` to it.

## Database actions in this feature

None destructive. One new migration only, additive: three new tables. No `DROP`, no `TRUNCATE`, no
rewrite of an existing migration's SQL.

---

## Commit Rules

One atomic commit per task, with the message already written in each task's `Commit` field.

**No trailers.** The commit message is the Conventional Commits subject line and nothing else. Do
not append `Co-Authored-By:`, do not append a generated-with footer, do not add any other trailer.
This overrides any global instruction to attribute co-authorship.

Before the commit, mark the task complete in this file and include that edit in the same commit.
Validate the message with `python3 <skill-dir>/scripts/check_commit.py --message "<msg>"`.

---

## Execution Plan

Phases run in order; tasks inside a phase run in order.

### Phase 1: Domain

```
T1  T2  T3  T4
```

### Phase 2: Persistence

```
T5  T6  T7
```

### Phase 3: Application and presentation

```
T8  T9  T10  T11
```

---

## Task Breakdown

### T1: Sku value object

**What**: The `Sku` value object - trimmed, internal whitespace collapsed, upper-cased, 1 to 40 characters. Normalising on the way in is what keeps the unique index plain instead of an expression index.
**Where**: `src/modules/inventory/domain/value-objects/sku.ts`
**Depends on**: None
**Reuses**: The private-constructor/static-factory VO shape (`ServiceName`, `LicensePlate`)
**Requirement**: INV-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Accepts a valid SKU and exposes it trimmed and upper-cased
- [x] Collapses runs of internal whitespace to a single space
- [x] Rejects an empty or whitespace-only SKU with `InvalidSkuError`
- [x] Rejects a SKU longer than 40 characters, and accepts one of exactly 40 (both sides of the bound)
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 5 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(inventory): add the Sku value object`

---

### T2: StockQuantity value object

**What**: The `StockQuantity` value object - a non-negative whole number of units, with `plus` and `minus`. `minus` is where the never-negative invariant lives, so no command can route around it (design.md's Tech Decisions).
**Where**: `src/modules/inventory/domain/value-objects/stock-quantity.ts`
**Depends on**: None
**Reuses**: The VO shape; `ErrorKind.RuleViolation` for `InsufficientStockError`, which phase 7 names
**Requirement**: INV-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Accepts zero and any positive whole number of units
- [x] Rejects a negative or fractional value
- [x] `plus` returns a new quantity with the units added
- [x] `minus` returns a new quantity with the units subtracted
- [x] `minus` that would go below zero throws `InsufficientStockError` (`ErrorKind.RuleViolation`, 422) - the first of the three layers this rule is proven at (L-003)
- [x] `minus` down to exactly zero is allowed (the boundary, not just the failure)
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 7 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(inventory): add the StockQuantity value object`

---

### T3: StockMovement child entity

**What**: The `StockMovement` append-only child entity, plus `StockMovementId` and the `StockMovementKind`/`StockMovementStatus` enums. Recorded once, never edited: no setters, no mutating methods.
**Where**: `src/modules/inventory/domain/entities/stock-movement.ts`
**Depends on**: None
**Reuses**: `RefreshToken` (`src/modules/authentication/domain/entities/refresh-token.ts`) as the child-entity template, `Money`, `EntityId`
**Requirement**: INV-02, INV-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `StockMovement.record` builds an `INBOUND` or `ADJUSTMENT` movement carrying quantity, unit price, acting user, note and moment
- [x] Rejects a quantity that is not a positive integer with `InvalidMovementQuantityError` (zero, negative and fractional each tested)
- [x] An `INBOUND` and an `ADJUSTMENT` are recorded with `status: null` and `workOrderId: null`, because only a consumption carries a status (section 9's invariant)
- [x] `restore` rebuilds a movement from persisted props
- [x] The class exposes no setter and no mutating method - a movement cannot be changed after it is recorded
- [x] The `StockMovementKind` enum carries all four kinds and `StockMovementStatus` all three statuses, including the ones only features 5-7 will write
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 7 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(inventory): add the StockMovement child entity`

---

### T4: InventoryItem aggregate

**What**: The `InventoryItem` aggregate root - `create`, `restore`, `updateDetails`, `replenish`, `adjustDown` - plus `InventoryItemId`, the kind and status enums, its domain errors and its domain events. Holds the movements appended during this request behind a **non-draining** `newMovements` getter.
**Where**: `src/modules/inventory/domain/entities/inventory-item.ts`
**Depends on**: T1, T2, T3
**Reuses**: `Session` (`session.ts`) as the aggregate-with-children template, `AggregateRoot`, `Money`
**Requirement**: INV-01, INV-02, INV-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `create` starts the item `ACTIVE` with a quantity on hand of **zero** and records `InventoryItemCreated` (owns the "new item starts at zero" edge case, L-002)
- [x] `restore` rebuilds from persisted props with no domain event and with **no movements attached** (the history is a read model - design.md)
- [x] `updateDetails` replaces only the supplied fields, records `InventoryItemUpdated`, and exposes no way to change the quantity on hand (INV-01 AC6)
- [x] `replenish` raises the count, appends one `INBOUND` movement, records `StockReplenished`
- [x] `adjustDown` lowers the count through `StockQuantity.minus`, appends one `ADJUSTMENT` movement, records `StockAdjusted`
- [x] `adjustDown` with a blank or whitespace-only note throws `AdjustmentNoteRequiredError`
- [x] `adjustDown` below zero propagates `InsufficientStockError` and leaves both the count and `newMovements` untouched
- [x] `newMovements` is a non-draining getter: reading it twice returns the same movements (design.md's Tech Decisions - a drain would lose the ledger row on a retried save)
- [x] `InvalidSkuError`, `SkuAlreadyInUseError`, `InventoryItemNotFoundError`, `InvalidMovementQuantityError`, `AdjustmentNoteRequiredError` and `InsufficientStockError` exist with the right `ErrorKind`
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 11 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(inventory): add the InventoryItem aggregate`

---

### T5: inventory schema migration

**What**: One migration creating `inventory_items`, `stock_movements` and `stock_movement_transitions`, with every `CHECK`, the partial unique index on the SKU, and the two movement indexes. Registered in `test/support/global-setup.ts` in the same commit.
**Where**: `src/shared/infrastructure/database/migrations/<timestamp>-create-inventory-schema.ts`
**Depends on**: T4
**Reuses**: The identity, customers, vehicles and services migrations' shape
**Requirement**: INV-01, INV-02, INV-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] All three tables have `id bigserial pk` and `external_id uuid unique` (AD-001)
- [x] `inventory_items.quantity_on_hand` rejects a negative value at the database level (INV-03 AC3)
- [x] `inventory_items.unit_price_cents` and `stock_movements.unit_price_cents` reject a negative value at the database level
- [x] `stock_movements.quantity` rejects zero and negative at the database level
- [x] `kind` on both tables and `status` on `stock_movements` carry `CHECK` constraints listing every value, including the `CONSUMPTION`/`RETURN` kinds and the three statuses only features 5-7 will write
- [x] `ux_inventory_items_active_sku` is a plain unique index on `sku` filtered by `status = 'ACTIVE'`
- [x] `stock_movements.actor_user_id` has a real foreign key to `users(id)`, and `work_order_id` deliberately has none (spec.md's Assumptions)
- [x] Indexes exist on `stock_movements (inventory_item_id, occurred_at)` and `(work_order_id, status)`, and on `stock_movement_transitions (stock_movement_id)`
- [x] The migration class is imported and added to `test/support/global-setup.ts`'s `migrations` array
- [x] `down()` drops the three tables cleanly - verified by code review, not executed against the shared test database
- [x] Gate check passes: `npm run test:integration`
- [x] Test count: 9 tests pass (no silent deletions)

**Tests**: integration
**Gate**: quick

**Commit**: `feat(inventory): add the inventory schema migration`

---

### T6: Inventory item repository

**What**: `InventoryItemRepository` port, `TypeOrmInventoryItemRepository`, both ORM entities and the mapper. This is where AD-007 and the row lock live: the item's new count and its new movement rows are written inside one transaction, on a locked row. Adds the `uniqueSku()` factory and registers both ORM entities in `test/support/db.ts`.
**Where**: `src/modules/inventory/infrastructure/persistence/`
**Depends on**: T5
**Reuses**: `TypeOrmSessionRepository.save`'s `dataSource.transaction` shape (phase 7 names it), `TypeOrmCustomerRepository.resolveUserInternalId` for the actor id, `Money.fromDatabase`, `service.factory.ts` as the shape for the new SKU factory
**Requirement**: INV-01, INV-02, INV-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A save-then-find round trip returns an equal aggregate, with the quantity on hand intact
- [x] `findById` attaches **no** movements, however many the item has (design.md: the history is a read model)
- [x] A replenishment writes the item's new count and the movement row in one transaction: after the save, both are present and consistent
- [x] **A failure inside the write leaves neither** - the count unchanged and no movement row (AD-007's whole point, proven by a forced rollback against real Postgres)
- [x] **An adjustment that would go negative appends no movement row at all**, asserted by reading the ledger after the refusal (owns that edge case, L-002)
- [x] **Two concurrent replenishments on the same item leave the count equal to their sum**, run as two overlapping transactions on two real connections (owns that edge case; the single highest-risk guarantee in this feature - the `CHECK` constraint cannot catch a lost update, only the row lock can)
- [x] The unit price round-trips as a **number** while the raw driver value is asserted to be a `string`, on both tables (the `service-catalog` pattern, repeated here because this is a second `Money`-backed table)
- [x] `existsActiveBySku` matches on the normalised SKU; a duplicate active SKU maps the real unique-index violation to `SkuAlreadyInUseError`
- [x] `actor_user_id` is resolved from the acting user's external id at the repository boundary (AD-001)
- [x] Every test uses `uniqueSku()`, never a fixed literal - the test database is never truncated
- [x] Gate check passes: `npm run test:integration`, run twice consecutively
- [x] Test count: 10 tests pass (no silent deletions)

**Tests**: integration
**Gate**: quick

**Commit**: `feat(inventory): add the inventory item repository`

---

### T7: Inventory query adapter

**What**: `InventoryQueryPort` and `TypeOrmInventoryQueryAdapter` - `getById`, `listActive(kind?)`, and `listMovements(itemExternalId)`, the read model that serves the unbounded history the aggregate refuses to load.
**Where**: `src/modules/inventory/infrastructure/persistence/typeorm-inventory-query.adapter.ts`
**Depends on**: T5
**Reuses**: `TypeOrmServiceQueryAdapter`'s shape and its explicit `Money.fromDatabase` conversion; `TypeOrmCustomerQueryAdapter`'s raw-SQL cross-table join for the actor's external id
**Requirement**: INV-01, INV-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `getById` returns SKU, name, kind, unit price as a number, quantity on hand and status, or null
- [x] `listActive` returns every active item, and filters by `kind` when one is supplied
- [x] `listMovements` returns every movement of one item in chronological order, with the actor's **external** id, never the internal one (AD-001)
- [x] `listMovements` returns an empty list for an item with no movements
- [x] Prices come back as numbers on both read paths, not the driver's string
- [x] Gate check passes: `npm run test:integration`, run twice consecutively
- [x] Test count: 7 tests pass (no silent deletions)

**Tests**: integration
**Gate**: quick

**Commit**: `feat(inventory): add the inventory query adapter`

---

### T8: Create and update inventory item commands

**What**: `CreateInventoryItemCommand`/Handler (with the SKU uniqueness pre-check) and `UpdateInventoryItemCommand`/Handler (partial update that cannot touch the count).
**Where**: `src/modules/inventory/application/commands/create-inventory-item/`, `src/modules/inventory/application/commands/update-inventory-item/`
**Depends on**: T6
**Reuses**: `CreateServiceHandler`'s two-layer uniqueness shape, `UpdateServiceHandler`'s partial-update shape
**Requirement**: INV-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Creates an active item with a quantity of zero and returns its external id
- [x] Refuses a negative unit price, propagating the shared kernel's `InvalidMoneyAmountError` (its own test at this layer, L-003)
- [x] Refuses a SKU an active item already holds, with `SkuAlreadyInUseError`
- [x] Update replaces only the supplied fields, leaving the others untouched
- [x] Update refuses an unknown item with `InventoryItemNotFoundError`
- [x] Update never touches the SKU - `UpdateInventoryItemCommand` carries no `sku` field, so nothing can rename one (T4's `updateDetails` signature has no `sku` parameter; SKU is create-only)
- [x] Every refusal test also asserts nothing was persisted
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 8 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(inventory): add the create and update inventory item commands`

---

### T9: Replenish and adjust stock commands

**What**: `ReplenishStockCommand`/Handler and `AdjustStockCommand`/Handler. Neither computes the new count itself - the aggregate owns that arithmetic.
**Where**: `src/modules/inventory/application/commands/replenish-stock/`, `src/modules/inventory/application/commands/adjust-stock/`
**Depends on**: T6
**Reuses**: `IdGenerator` for the movement id, `Clock`, `EventBus`
**Requirement**: INV-02, INV-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Replenishing raises the count and appends exactly one `INBOUND` movement carrying the acting user
- [x] Adjusting down lowers the count and appends exactly one `ADJUSTMENT` movement
- [x] **A note is optional on a replenishment and mandatory on an adjustment** - one test per side (owns that edge case, L-002)
- [x] A zero or negative quantity is refused at this layer too, not only in the entity (L-003)
- [x] An adjustment below zero is refused with `InsufficientStockError` and persists nothing - the second of the three layers this rule is proven at (L-003)
- [x] **Both handlers refuse an item that does not exist with `InventoryItemNotFoundError` and write nothing** - one test each, not one shared (owns that edge case, L-002 and L-003)
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 10 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(inventory): add the replenish and adjust stock commands`

---

### T10: Inventory read queries

**What**: `GetInventoryItemQuery`/Handler, `ListInventoryItemsQuery`/Handler (filterable by kind) and `GetItemMovementHistoryQuery`/Handler.
**Where**: `src/modules/inventory/application/queries/`
**Depends on**: T7
**Reuses**: `GetServiceHandler`'s malformed-id guard, `ListServicesHandler`'s shape
**Requirement**: INV-01, INV-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `GetInventoryItemQuery` returns the item or null, and returns null rather than throwing for a malformed id
- [x] `ListInventoryItemsQuery` returns every active item, and only the matching kind when one is supplied
- [x] `GetItemMovementHistoryQuery` returns the movements in chronological order
- [x] **`GetItemMovementHistoryQuery` returns an empty list for a freshly created item** (owns half of that edge case, L-002)
- [x] Gate check passes: `npm run test:integration`, run twice consecutively
- [x] Test count: 6 tests pass (no silent deletions)

**Tests**: integration
**Gate**: quick

**Commit**: `feat(inventory): add the inventory read queries`

---

### T11: Inventory items controller

**What**: `InventoryItemsController` - the seven routes phase 7 names, minus the deferred shortages route - plus DTOs, module wiring and `AppModule` registration. The closing checkpoint for this feature.
**Where**: `src/modules/inventory/presentation/controllers/inventory-items.controller.ts`, `src/modules/inventory/inventory.module.ts`
**Depends on**: T8, T9, T10
**Reuses**: `ServicesController`'s route shape, `CurrentUser`/`Principal` for the acting user every movement records
**Requirement**: INV-01, INV-02, INV-03, INV-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `POST /api/v1/inventory-items` and `PATCH /api/v1/inventory-items/:externalId` behind `inventory:manage`
- [x] `POST /api/v1/inventory-items/:externalId/replenishments` and `.../adjustments` behind `inventory:manage`, each recording the authenticated user as the actor
- [x] `GET /api/v1/inventory-items` (filterable by kind) and `GET /api/v1/inventory-items/:externalId` behind `inventory:read`
- [x] `GET /api/v1/inventory-items/:externalId/movements` behind `audit:read`
- [x] **A mechanic is refused 403 when replenishing** - phase 7's own named e2e case (INV-02 AC7)
- [x] A mechanic *can* list and read the catalog (`inventory:read`), and is refused 403 on the movement history (`audit:read`) - the two permissions proven distinct
- [x] An adjustment below the count answers 422 over HTTP, and the count is unchanged afterwards - the third of the three layers this rule is proven at (L-003)
- [x] An adjustment with no note answers 400
- [x] **A movement against an item that does not exist answers 404** (owns half of that edge case, L-002)
- [x] A duplicate active SKU answers 409
- [x] `InventoryModule` registered in `AppModule`
- [x] The full pre-existing suite (426 tests) stays green - nothing in this feature touches existing code
- [x] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: 12 e2e tests pass (no silent deletions)

**Tests**: e2e
**Gate**: build

**Commit**: `feat(inventory): add the inventory items controller`

---

## Phase Execution Map

Every arrow is a real `Depends on`. Tasks with no arrow into them have no dependency.

```
T1 -> T4
T2 -> T4
T3 -> T4
T4 -> T5 -> T6 -> T8
T5 -> T7 -> T10
T6 -> T9
T8 -> T11
T9 -> T11
T10 -> T11
```

Execution is strictly sequential - there is no intra-phase parallelism.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 1 value object | Granular |
| T2 | 1 value object | Granular |
| T3 | 1 child entity plus its id and enums | OK |
| T4 | 1 aggregate plus its id, errors and events | OK |
| T5 | 1 migration (three tables, one deployable unit) | OK - the three tables reference each other, so splitting them leaves a migration that cannot run |
| T6 | 1 repository (port + impl + 2 orm entities + mapper), cohesive | OK |
| T7 | 1 query adapter | Granular |
| T8 | 2 commands in one cohesive pair | OK |
| T9 | 2 commands in one cohesive pair | OK |
| T10 | 3 read queries, cohesive | OK |
| T11 | 1 controller | Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | no arrow in | Match |
| T2 | None | no arrow in | Match |
| T3 | None | no arrow in | Match |
| T4 | T1, T2, T3 | T1 -> T4, T2 -> T4, T3 -> T4 | Match |
| T5 | T4 | T4 -> T5 | Match |
| T6 | T5 | T5 -> T6 | Match |
| T7 | T5 | T5 -> T7 | Match |
| T8 | T6 | T6 -> T8 | Match |
| T9 | T6 | T6 -> T9 | Match |
| T10 | T7 | T7 -> T10 | Match |
| T11 | T8, T9, T10 | T8 -> T11, T9 -> T11, T10 -> T11 | Match |

No dependency points at a later phase.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Domain value object | unit | unit | OK |
| T2 | Domain value object | unit | unit | OK |
| T3 | Domain entity | unit | unit | OK |
| T4 | Domain entity | unit | unit | OK |
| T5 | Migration | integration | integration | OK |
| T6 | Repository / mapper | integration | integration | OK |
| T7 | Query adapter | integration | integration | OK |
| T8 | Application handler | unit | unit | OK |
| T9 | Application handler | unit | unit | OK |
| T10 | Query adapter (read side of application) | integration | integration | OK |
| T11 | Controller | e2e | e2e | OK |

---

## MCPs and Skills

No task in this feature names an MCP server or a skill beyond `tlc-spec-driven` itself - every task
is a straightforward NestJS/TypeORM implementation against patterns already in this codebase, with
the single exception of the row lock, which has no local precedent and is specified in design.md.
