# Work Order Closing Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/work-order-closing/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Generated from codebase, project guidelines and spec. Guidelines found: `vitest.config.ts`, `vitest.integration.config.ts`, `vitest.e2e.config.ts`, `package.json` scripts, `eslint.config.mjs`. No coverage threshold is configured, so the strong defaults below apply.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Domain value object / entity / aggregate | unit | All branches; 1:1 to spec ACs; every listed edge case owned by a task has a test here when the rule lives here | `src/modules/**/domain/**/*.spec.ts` | `npm run test:unit` |
| Application handler / service | unit | Every branch it owns, including each error-producing call site at this layer (L-003) | `src/modules/**/application/**/*.spec.ts` | `npm run test:unit` |
| Repository / query adapter / migration | integration | Key query paths, every constraint the design claims, and any transaction or concurrency guarantee it claims | `test/integration/*.spec.ts` | `npm run test:integration` |
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

`.specs/LESSONS.md` carries two `confirmed` lessons plus the five that feature 7's verification loop produced. All of them shape this file directly:

- **L-002** (every spec Edge Case needs an owning task): the Edge Case Ownership table below assigns each of spec.md's eight edge cases to the task that proves it and the layer that proves it. Each assignment also appears as its own **Done when** line inside that task.
- **L-003** (a sibling call site's test does not substitute for this one's own, x4): each of the four new routes gets its own error-path e2e cases. The two authorizers get their own unit tests even though they share a shape, and the two inventory handlers get their own even though they are near-twins.
- **L-008** (two layers enforcing the same rule need a test the inner one cannot satisfy): the discount ceiling is checked in `applyDiscount` and again in `complete`. T6 owns a case that only the completion check can fail, since `applyDiscount` accepted the amount when the total was higher.
- **L-009** (every threshold needs a fixture on its boundary): a discount exactly equal to the charged total is allowed, one cent above is refused. T5 owns both.
- **L-010** (assert every field an AC names): the settlement and write-off transition rows name a previous status, a new status, an actor, a moment and a quantity. T11's integration tests assert all five, not the status alone.
- **L-014** (every aggregate function needs a fixture whose group holds more than one row): the charged total sums over a collection, and the write-off aggregates across movements. T4 uses two services and two part items; T11 uses a work order with two consumptions of different sizes.

One design-level rule also lands here:

**No task may write the net-loss expression a second time.** T11 extracts the `quantity - COALESCE(SUM(returns pointing at it), 0)` fragment that `findPendingConsumptions` already uses, and both callers read the one fragment. Feature 7's round 3 verification found exactly this formula duplicated with only one copy tested.

## Edge Case Ownership

| spec.md Edge Case | Owning task | Proof layer |
| --- | --- | --- |
| A work order in execution with no withdrawn part cancels on `work-orders:cancel` alone and writes off nothing | T19, T21 | unit handler, e2e |
| A work order completed with no part withdrawn charges the approved services alone | T6 | unit aggregate |
| A part withdrawn 4 and returned 3 records a loss of exactly one unit on cancellation | T11, T21 | integration repository, e2e |
| A work order carrying withdrawn parts in `AWAITING_APPROVAL` after a supplementary round requires the elevated permission | T18, T21 | unit authorizer, e2e |
| A discount that a later return pushes above the charged total refuses the completion | T6, T22 | unit aggregate, e2e |
| A delivery settles a consumption that was already fully returned like any other, leaving the count untouched | T11 | integration repository |
| Cancelling an already cancelled work order answers 422 | T8, T21 | unit aggregate, e2e |
| Delivering from `RECEIVED` answers 422 | T7, T20 | unit aggregate, e2e |

---

## Preconditions

- No database reset. The test database is never truncated (STATE.md Conventions), so every test here generates its own customer, vehicle, plate, work order number and SKU.
- **This feature adds a migration**, the first since feature 6. `test/support/global-setup.ts`'s hardcoded migration array takes the new entry in T1, and `test/support/db.ts`'s entity list needs no change, since no new entity class is introduced.
- The whole existing suite (534 unit, 198 integration, 152 e2e - 884 total) is the regression net for T10's change to the shared work-order write path. Nothing in it drives two concurrent writes to one work order, so every existing test exercises the single-writer path and must stay green.
- `stock_movement_transitions` exists since feature 4 and has been written by nothing. This feature is its first writer.

## Database actions

One migration, `1787702400008-add-work-order-closing-columns`: eleven closing columns and `version` on `work_orders`, and a nullable `quantity` on `stock_movement_transitions`. No new table, no data backfill - no work order has ever reached `COMPLETED`, since this feature is what makes the state reachable.

## Commit rules

One atomic commit per task, with that task's checkboxes flipped in this file in the same commit. Conventional Commits, no trailers. Validate every message with `python3 .claude/skills/tlc-spec-driven/scripts/check_commit.py --message "..."` before committing.

---

## Execution Plan

### Phase 1: Schema

```
T1
```

### Phase 2: Domain

```
T2  T3  T4  T5  T6  T7  T8
```

T2, T3 and T4 have no dependencies and come first; T5, T6 and T8 each need T4's arithmetic, and T7 needs only the errors and events.

### Phase 3: Persistence

```
T9  T10  T11
```

### Phase 4: Application

```
T12  T13  T14  T15  T16  T17  T18  T19
```

### Phase 5: Presentation and end to end

```
T20  T21  T22  T23
```

---

## Task Breakdown

### T1: The closing columns migration

**What**: The migration adding eleven closing columns and `version` to `work_orders`, and a nullable `quantity` to `stock_movement_transitions`, plus its entry in the test bootstrap.
**Where**: `src/shared/infrastructure/database/migrations/1787702400008-add-work-order-closing-columns.ts`
**Depends on**: None
**Reuses**: `1787702400007-create-work-order-budgets.ts` as the shape, `test/integration/inventory-schema.migration.spec.ts` as the test shape
**Requirement**: WOC-01, WOC-02, WOC-03, WOC-04, AD-009

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `work_orders` gains `charged_total_cents`, `discount_cents`, `discount_note`, `discount_applied_by_user_id`, `discount_applied_at`, `completed_at`, `delivered_at`, `delivered_by_user_id`, `canceled_at`, `canceled_by_user_id`, `cancellation_reason` and `version`
- [x] `discount_cents` is `NOT NULL DEFAULT 0` and `version` is `NOT NULL DEFAULT 0`; every other new column is nullable
- [x] The three user columns carry a foreign key to `users (id)` with `ON DELETE RESTRICT`, matching `budget_decided_by_user_id`
- [x] `stock_movement_transitions` gains a nullable `quantity integer`
- [x] `down` drops every column it added
- [x] `test/support/global-setup.ts`'s migration array carries the new class
- [x] An integration test asserts every column exists with the right nullability and default, and that the foreign keys are in place
- [x] Gate check passes: `npm run test:integration`
- [x] Test count: 4 tests pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `feat(work-orders): add the closing columns migration`

---

### T2: The closing rule violation errors

**What**: The three domain errors the closing transitions raise.
**Where**: `src/modules/work-orders/domain/errors/`
**Depends on**: None
**Reuses**: `return-exceeds-withdrawn.error.ts` as the shape for a `RuleViolation`, `work-order-not-found.error.ts` for a non-rule kind
**Requirement**: WOC-01, WOC-03, WOC-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `DiscountExceedsChargedTotalError` carries kind `RuleViolation`
- [x] `CompletionForbiddenError` carries kind `Forbidden`
- [x] `CancelInExecutionForbiddenError` carries kind `Forbidden` and code `WORK_ORDER_CANCEL_IN_EXECUTION_FORBIDDEN`, the code H36 names verbatim
- [x] Each error's message names why it fired, not just what fired
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 6 tests pass (planned 3; the existing two-test-per-error shape in `budget-rule-violation-errors.spec.ts` splits "code and kind" from "message names why" per class, so three error classes give six, not padding - no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): add the closing rule violation errors`

---

### T3: The closing trail events

**What**: The four trail events the closing transitions record.
**Where**: `src/modules/work-orders/domain/events/`
**Depends on**: None
**Reuses**: `part-withdrawn.event.ts` and `budget-approved.event.ts` as the shapes, `WorkOrderTrailEvent` as the base
**Requirement**: WOC-01, WOC-02, WOC-03, WOC-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `WorkOrderCompleted` carries `fromStatus` `IN_EXECUTION` and `toStatus` `COMPLETED`
- [x] `VehicleDelivered` carries `fromStatus` `COMPLETED` and `toStatus` `DELIVERED`
- [x] `WorkOrderCanceled` carries the state it left and `toStatus` `CANCELED`
- [x] `DiscountApplied` carries null on both statuses, since it changes no state
- [x] Each declares its own `eventType` constant rather than deriving it from the class name
- [x] Every event carries its acting user, which AD-007's trail needs
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 6 tests pass (planned 4; `WorkOrderCanceled`'s dynamic `fromStatus` needed its own case beyond the one-test-per-event baseline, plus the constants-uniqueness check the sibling `part-withdrawal-events.spec.ts` also carries - no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): add the closing trail events`

---

### T4: The charged total arithmetic on the aggregate

**What**: The closing props on `WorkOrder`, the private `chargedTotalBeforeDiscount`, and `hasOutstandingWithdrawals`, with `restore` carrying them.
**Where**: `src/modules/work-orders/domain/entities/work-order.ts`
**Depends on**: None
**Reuses**: `generateRound`'s summing shape, `Budget.status` for the approved-round filter, `Money.add`/`multiply`
**Requirement**: WOC-01, WOC-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `WorkOrderProps` carries `chargedTotal`, `discount`, `discountNote`, `discountAppliedByUserId`, `discountAppliedAt`, `completedAt`, `deliveredAt`, `deliveredByUserId`, `canceledAt`, `canceledByUserId` and `cancellationReason`, and `restore` accepts every one
- [x] `chargedTotalBeforeDiscount` exists as a private method with the summing logic design.md specifies
- [~] `chargedTotalBeforeDiscount` sums the service items on approved rounds plus each part item's withdrawn quantity times its budgeted unit price - **moved to T6**, see the correction note below
- [~] A part item with a withdrawn quantity of zero adds nothing - **moved to T6**
- [~] An item on a rejected round adds nothing, and an item on no round at all adds nothing - **moved to T6**
- [~] A fixture with two services and two part items proves the sum is over the whole collection, not over its first row (L-014) - **moved to T6**
- [x] `hasOutstandingWithdrawals` is true when any part item's withdrawn quantity is above zero, false when every one is zero, and false for a work order carrying no part item at all
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 6 tests pass (planned 8; see the correction note)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): compute the charged total on the aggregate`

---

### T4 correction (surfaced while writing T4's own tests)

**What went wrong**: `chargedTotalBeforeDiscount` is `private` by design (design.md names it so), and this task has no public method that calls it - `complete` (T6) and `applyDiscount` (T5) are both later tasks. Writing its planned tests immediately hit implement.md's documented case: "a task creates code that can't be tested until a later task completes." Testing it through a throwaway public accessor would have added surface area no consumer needs, which Check C forbids.

**The fix, per implement.md's merge-forward rule**: the four arithmetic-specific criteria move to T6, whose `complete()` is the earliest point they become reachable - T6's own Done-when below is amended to carry them, including the L-014 fixture and the rejected/no-round cases verbatim. T4 keeps everything that was already testable without a later task: the props, the defaults, `restore`'s backward compatibility, and `hasOutstandingWithdrawals` (which only reads `partItems`, needing no transition method at all).

**A second thing surfaced by the same block**: making the eleven closing fields required on `WorkOrderProps` would have broken every existing `WorkOrder.restore(...)` call site in the codebase (14 files, none of them in this task's `Where`) - none of them could supply fields no production row has ever carried, since this feature is what first makes `COMPLETED`, `DELIVERED` and `CANCELED` reachable. Fixed by splitting `ClosingProps` out of `WorkOrderProps` and typing `restore`'s parameter as `Omit<WorkOrderProps, keyof ClosingProps> & Partial<ClosingProps>`, defaulted through a shared `CLOSING_DEFAULTS` constant that `open` also uses. Every existing call site compiles unchanged; `npm run build` confirmed it touches nothing outside `work-order.ts`. This is a stronger fix than the `Where` scope of a later task could have provided without touching 14 files.

Both the default-handling fix and the test-scope correction land inside T4's own commit (`a0bb8d2`) rather than a separate one - they are how T4 needed to be built correctly, not a defect found after the fact.

---

### T5: Applying a discount on the aggregate

**What**: `WorkOrder.applyDiscount`, with its ceiling, its state guard and its replace semantics.
**Where**: `src/modules/work-orders/domain/entities/work-order.ts`
**Depends on**: T2, T3, T4
**Reuses**: `assertStateAllows`, `chargedTotalBeforeDiscount` from T4, `approveBudget`'s transition shape
**Requirement**: WOC-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Applying in `IN_EXECUTION` or `COMPLETED` records the amount, note, actor and moment and records `DiscountApplied`
- [x] Applying in any other state throws `WorkOrderStateError`
- [x] An amount above the pre-discount total throws `DiscountExceedsChargedTotalError`
- [x] An amount exactly equal to the pre-discount total is allowed, and one cent above is refused (L-009's boundary, both directions)
- [x] A second application replaces the amount, note, actor and moment rather than accumulating
- [x] Applying while already `COMPLETED` recomputes and stores the charged total with the new discount
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 8 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): apply a discount on the aggregate`

---

### T6: Completing the work order on the aggregate

**What**: `WorkOrder.complete`, which freezes the charged total.
**Where**: `src/modules/work-orders/domain/entities/work-order.ts`
**Depends on**: T2, T3, T4
**Reuses**: `assertStateAllows`, `chargedTotalBeforeDiscount` from T4
**Requirement**: WOC-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when** (four bullets below absorbed from T4's correction - `complete` is the earliest public method that can exercise `chargedTotalBeforeDiscount`):

- [x] Completing from `IN_EXECUTION` moves to `COMPLETED`, stamps `completedAt` and records `WorkOrderCompleted`
- [x] The stored charged total is the pre-discount total minus the recorded discount, where the pre-discount total sums the service items on approved rounds plus each part item's withdrawn quantity times its budgeted unit price
- [x] A work order with no part withdrawn stores the approved services alone (spec.md edge case)
- [x] An item on a rejected round adds nothing to the total, and an item on no round at all adds nothing (from T4)
- [x] A fixture with two services and two part items proves the total sums over the whole collection, not just the first row (L-014, from T4)
- [x] A discount larger than the pre-discount total throws `DiscountExceedsChargedTotalError` and leaves the state `IN_EXECUTION` (spec.md edge case: a return dropped the total after the discount was accepted)
- [x] That refusal has a case only `complete` can fail: the discount was valid when `applyDiscount` accepted it, and a return lowered the total afterwards (L-008 - the inner guard cannot see this)
- [x] Completing from any other state throws `WorkOrderStateError`
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 8 tests pass (planned 9; L-008's refusal case and the plain over-ceiling refusal both assert via the same `DiscountExceedsChargedTotalError` type, and the L-014 fixture doubles as the "sums the whole collection" bullet, so one fewer standalone case was needed than estimated - no silent deletions, every bullet above has a direct assertion)

Unplanned but required: writing this task's tests surfaced that `WorkOrder.restore` used a blind object spread (`{...CLOSING_DEFAULTS, ...props}`) to default the closing props, which silently breaks when a caller passes a key explicitly set to `undefined` (object spread does not fall back to the earlier value in that case, unlike `??`) - exactly what this task's own test helper did for `discount` when no override was given. Fixed by replacing the spread with a per-field `??` fallback in `restore`, which is immune to that shape regardless of caller. No test regression; the whole existing suite still passes unchanged.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): complete a work order on the aggregate`

---

### T7: Delivering the vehicle on the aggregate

**What**: `WorkOrder.deliver`.
**Where**: `src/modules/work-orders/domain/entities/work-order.ts`
**Depends on**: T2, T3
**Reuses**: `assertStateAllows`, `approveBudget`'s transition shape
**Requirement**: WOC-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Delivering from `COMPLETED` moves to `DELIVERED`, stamps `deliveredAt` and `deliveredByUserId`, and records `VehicleDelivered`
- [x] Delivering from `RECEIVED` throws `WorkOrderStateError` (spec.md edge case)
- [x] Delivering from `IN_EXECUTION`, `DELIVERED` and `CANCELED` each throws `WorkOrderStateError`
- [x] Delivering leaves the charged total exactly as completion froze it
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 5 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): deliver the vehicle on the aggregate`

---

### T8: Cancelling the work order on the aggregate

**What**: `WorkOrder.cancel`, reachable from every non-terminal state.
**Where**: `src/modules/work-orders/domain/entities/work-order.ts`
**Depends on**: T2, T3, T4
**Reuses**: `assertStateAllows`, `hasOutstandingWithdrawals` from T4
**Requirement**: WOC-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cancelling from `RECEIVED`, `IN_DIAGNOSIS`, `AWAITING_APPROVAL` and `IN_EXECUTION` each moves to `CANCELED`, stamps the reason, canceller and moment, and records `WorkOrderCanceled`
- [x] The recorded event carries the state the work order left, so the trail says where it was cancelled from
- [x] Cancelling from `COMPLETED` and from `DELIVERED` each throws `WorkOrderStateError`
- [x] Cancelling an already `CANCELED` work order throws `WorkOrderStateError` (spec.md edge case)
- [x] The aggregate does not check any permission - that belongs to the authorizer in T18
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 8 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): cancel a work order on the aggregate`

---

### T9: Persist and restore the closing columns

**What**: The ORM entity, the mapper and the repository carrying every closing field through a save and a reload.
**Where**: `src/modules/work-orders/infrastructure/persistence/work-order.orm-entity.ts`
**Depends on**: T1, T4, T5, T6, T7, T8
**Reuses**: the existing mapper's `Money`-to-`bigint` handling (AD-002), `resolveInternalId` for the three user columns (AD-001)
**Requirement**: WOC-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The ORM entity declares every column T1 added except `version`, which T10 owns
- [x] The mapper writes and reads the charged total and the discount as integer cents, never as a string
- [x] The three user columns are resolved from external id to internal id on write and back on read
- [x] An integration test round-trips a completed work order and reads back the charged total, the discount, the note, the actor and the moment
- [x] An integration test round-trips a cancelled work order and reads back the reason, the canceller and the moment
- [x] A work order that has not been completed reads back a null charged total
- [x] Gate check passes: `npm run test:integration`
- [x] Test count: 4 tests pass (no silent deletions)

Unplanned but required: `WorkOrderMapper`'s own spec file (`work-order.mapper.spec.ts`) constructed a `ResolvedWorkOrderIds` literal and a bare `WorkOrderOrmEntity` row missing the fields this task added. Neither `npm run build` (excludes `*.spec.ts` via `tsconfig.build.json`) nor `npm run lint` catches this - only `npx tsc --noEmit` against the full `tsconfig.json` does, and the row-fixture gap was a genuine runtime failure waiting to happen (`Money.fromDatabase(undefined)` throws), not just a type error. Fixed both fixtures with the same defaults the migration gives a pre-existing row.

**Tests**: integration
**Gate**: full

**Commit**: `feat(work-orders): persist the closing columns`

---

### T10: The version guard on the work order write path

**What**: Optimistic concurrency in `TypeOrmWorkOrderRepository.save`, with the version carried through the aggregate and the mapper (AD-009).
**Where**: `src/modules/work-orders/infrastructure/persistence/typeorm-work-order.repository.ts`
**Depends on**: T1, T9
**Reuses**: the existing `inTransaction` helper (AD-008), `BaseError`'s shape for the new error
**Requirement**: AD-009

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `ConcurrentModificationError` lives in `src/shared/application/errors/`, carries kind `Conflict` and is reachable by any module that later adopts the guard
- [x] `WorkOrder` carries a `version`, set by `restore` and readable by the mapper, and `create` starts it at zero
- [x] `save` updates with `WHERE id = :id AND version = :loadedVersion` and bumps the version in the same statement
- [x] Zero affected rows throws `ConcurrentModificationError`
- [x] A first insert writes version zero and does not throw
- [x] `version` is never exposed on any response DTO
- [x] An integration test loads the same work order twice, saves the first, and asserts the second save throws
- [x] An integration test asserts a sequential load-save-load-save pair both succeed, so the guard does not refuse an honest second write
- [x] An integration test asserts the version column actually advances by one per save
- [x] The whole existing suite stays green, which is the regression net for a change to a shared write path
- [x] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: 3 tests pass (no silent deletions)

Unplanned but required: the first implementation compared the freshly re-read database version against itself (`WHERE version = :version` using the very value `existing.version` had just read moments earlier in the same call), which can never mismatch and made the guard a no-op - the direct-conflict test caught it immediately (`loadedB`'s save resolved instead of throwing). Fixed by comparing against `workOrder.version`, the version the *aggregate instance* was loaded at, which is what a concurrent caller's stale copy actually carries. This is exactly the property optimistic concurrency depends on, and it only surfaced because the test exercised a genuine two-loads-one-write-between-them scenario rather than asserting the happy path alone.

**Tests**: integration
**Gate**: build

**Commit**: `fix(work-orders): guard the work order write path against a lost update`

---

### T11: Settle and write off a work order's consumptions

**What**: The two repository methods that end a movement's life, plus the extracted net-quantity SQL fragment they share with `findPendingConsumptions`.
**Where**: `src/modules/inventory/infrastructure/persistence/typeorm-inventory-item.repository.ts`
**Depends on**: T1
**Reuses**: `findPendingConsumptions`' net-quantity expression, `inTransaction` (AD-008), `resolveInternalId`
**Requirement**: WOC-02, WOC-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The `quantity - COALESCE(SUM(returns pointing at it), 0)` expression exists once, as a named fragment, and both `findPendingConsumptions` and the write-off read it
- [x] A test asserts a partly returned consumption yields the same number through both callers, so the two cannot drift
- [x] `settleWorkOrderConsumptions` moves every `PENDING` consumption of that work order to `SETTLED` and touches no other work order's movements
- [x] `writeOffWorkOrderConsumptions` moves them to `WRITTEN_OFF` and records the net lost quantity on the transition row
- [x] A consumption of 4 with a return of 3 records a loss of one (spec.md edge case)
- [x] A consumption returned in full records no loss at all
- [x] A fully returned consumption still settles on delivery like any other (spec.md edge case)
- [x] Neither method changes any inventory item's count on hand
- [x] Each appends one `stock_movement_transitions` row per movement, asserting all five of the previous status, the new status, the acting user, the moment and the quantity (L-010)
- [x] A fixture with two consumptions of different sizes proves the aggregate runs over the whole set, not over its first row (L-014)
- [x] Gate check passes: `npm run test:integration`
- [x] Test count: 8 tests pass (planned 10; several Done-when bullets share one test where they were already testing the same fixture - "touches no other work order" folded into the main settle/write-off tests rather than standing alone, and the write-off L-010 assertion was folded into the shared-formula test rather than a tenth, separate case - every bullet above still has direct evidence, no silent deletions)

Unplanned but required: `settleWorkOrderConsumptions`' first version used `UPDATE ... RETURNING` via `manager.query()` and read the result as a plain rows array, which threw `null value in column "stock_movement_id"` on every insert. TypeORM's Postgres query runner returns `[rows, rowCount]` for UPDATE/DELETE specifically (confirmed by reading `PostgresQueryRunner.query`'s own source), unlike the plain rows array a SELECT or INSERT returns - a distinction this codebase's existing raw-SQL calls never had to know, since none of them used UPDATE with RETURNING before. Fixed by destructuring `[rows]` and documented in the query's own comment so the next `UPDATE ... RETURNING` in this codebase does not repeat it. `writeOffWorkOrderConsumptions`' own UPDATE never reads the RETURNING equivalent (it discards the result, reading candidates from a separate SELECT beforehand), so it was never exposed to this.

**Tests**: integration
**Gate**: full

**Commit**: `feat(inventory): settle and write off a work order's consumptions`

---

### T12: The settle stock movements command handler

**What**: `SettleStockMovementsCommand` and its handler, the inventory side of a delivery.
**Where**: `src/modules/inventory/application/commands/settle-stock-movements/settle-stock-movements.handler.ts`
**Depends on**: T11
**Reuses**: `ConsumeStockBatchHandler` as the structural template
**Requirement**: WOC-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The handler calls `settleWorkOrderConsumptions` with the work order, the actor and the clock's moment
- [x] A work order with no pending consumption settles nothing and does not throw
- [x] The handler carries the comment that it is reached only from inside the caller's transaction (AD-008)
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 3 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(inventory): add the settle stock movements command handler`

---

### T13: The write off stock movements command handler

**What**: `WriteOffStockMovementsCommand` and its handler, the inventory side of a cancellation.
**Where**: `src/modules/inventory/application/commands/write-off-stock-movements/write-off-stock-movements.handler.ts`
**Depends on**: T11
**Reuses**: `RestoreStockBatchHandler` as the structural template
**Requirement**: WOC-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The handler calls `writeOffWorkOrderConsumptions` with the work order, the actor and the clock's moment
- [x] A work order with no pending consumption writes off nothing and does not throw (spec.md edge case)
- [x] It has its own tests rather than leaning on T12's, since the two are near-twins (L-003)
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 3 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(inventory): add the write off stock movements command handler`

---

### T14: The completion authorizer

**What**: `WorkOrderCompletionAuthorizer`, answering "the assigned mechanic or a holder of `work-orders:manage`".
**Where**: `src/modules/work-orders/application/services/work-order-completion.authorizer.ts`
**Depends on**: None
**Reuses**: `BudgetDecisionAuthorizer` wholesale, including its `QueryBus` read of effective access
**Requirement**: WOC-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A holder of `work-orders:manage` passes, whoever they are
- [x] The assigned mechanic passes without holding `work-orders:manage`
- [x] A mechanic who is not the assignee is refused with `CompletionForbiddenError`
- [x] A work order with no assigned mechanic refuses anyone lacking `work-orders:manage`
- [x] It refuses with a forbidden error rather than a not-found one, unlike `BudgetDecisionAuthorizer`, because every actor in reach already holds `work-orders:read`
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 5 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): add the work order completion authorizer`

---

### T15: The complete work order command handler

**What**: `CompleteWorkOrderCommand` and its handler.
**Where**: `src/modules/work-orders/application/commands/complete-work-order/complete-work-order.handler.ts`
**Depends on**: T6, T14
**Reuses**: `ApproveBudgetHandler` as the structural template for a handler that runs an authorizer between the load and the aggregate call
**Requirement**: WOC-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] An unknown work order number throws `WorkOrderNotFoundError`
- [x] The authorizer runs between the load and the aggregate call, so a refused actor never mutates anything
- [x] Every aggregate guard error travels out untouched
- [x] It publishes the recorded events after the save
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 5 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): add the complete work order command handler`

---

### T16: The apply discount command handler

**What**: `ApplyDiscountCommand` and its handler.
**Where**: `src/modules/work-orders/application/commands/apply-discount/apply-discount.handler.ts`
**Depends on**: T5
**Reuses**: `AssignMechanicHandler` as the template for a handler with no authorizer, guarded only by the route's permission
**Requirement**: WOC-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] An unknown work order number throws `WorkOrderNotFoundError`
- [ ] The amount reaches the aggregate as `Money`, never as a bare number
- [ ] `DiscountExceedsChargedTotalError` and `WorkOrderStateError` both travel out untouched
- [ ] It publishes the recorded events after the save
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: 5 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): add the apply discount command handler`

---

### T17: The deliver vehicle command handler

**What**: `DeliverVehicleCommand` and its handler, which spans both modules.
**Where**: `src/modules/work-orders/application/commands/deliver-vehicle/deliver-vehicle.handler.ts`
**Depends on**: T7, T12
**Reuses**: `WithdrawPartsHandler` as the structural template for the AD-008 transaction, `SettleStockMovementsCommand` from T12
**Requirement**: WOC-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] An unknown work order number throws `WorkOrderNotFoundError`
- [ ] The aggregate validates before any transaction opens, so a refused delivery never starts one
- [ ] It opens exactly one `transactionRunner.run`, saves the work order, then dispatches `SettleStockMovementsCommand` carrying the work order id and the actor
- [ ] An error from the inventory side travels out untouched and leaves neither write applied
- [ ] It publishes the recorded events after the transaction
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: 6 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): add the deliver vehicle command handler`

---

### T18: The cancellation authorizer

**What**: `CancellationAuthorizer`, which requires the elevated permission whenever outstanding parts exist.
**Where**: `src/modules/work-orders/application/services/cancellation.authorizer.ts`
**Depends on**: T2, T4
**Reuses**: `BudgetDecisionAuthorizer`'s shape, `hasOutstandingWithdrawals` from T4
**Requirement**: WOC-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] A work order with no outstanding withdrawn part passes on `work-orders:cancel` alone
- [ ] A work order with an outstanding withdrawn part refuses an actor holding only `work-orders:cancel`, with `CancelInExecutionForbiddenError`
- [ ] The same work order passes for an actor also holding `work-orders:cancel-in-execution`
- [ ] The decision reads the outstanding parts, not the state, so a work order in `AWAITING_APPROVAL` after a supplementary round is refused exactly like one in `IN_EXECUTION` (spec.md edge case, H36 against H38)
- [ ] It has its own tests rather than leaning on T14's, though the two authorizers share a shape (L-003)
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: 5 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): add the cancellation authorizer`

---

### T19: The cancel work order command handler

**What**: `CancelWorkOrderCommand` and its handler, which spans both modules.
**Where**: `src/modules/work-orders/application/commands/cancel-work-order/cancel-work-order.handler.ts`
**Depends on**: T8, T13, T18
**Reuses**: `WithdrawPartsHandler` for the AD-008 transaction, `WriteOffStockMovementsCommand` from T13
**Requirement**: WOC-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] An unknown work order number throws `WorkOrderNotFoundError`
- [ ] The authorizer runs between the load and the aggregate call
- [ ] It opens exactly one `transactionRunner.run`, saves the work order, then dispatches `WriteOffStockMovementsCommand`
- [ ] A work order with no outstanding withdrawn part still dispatches the command, which writes off nothing (spec.md edge case) - the handler does not decide what inventory owns
- [ ] An error from the inventory side travels out untouched and leaves neither write applied
- [ ] It publishes the recorded events after the transaction
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: 6 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): add the cancel work order command handler`

---

### T20: Expose the closing routes and walk completion to delivery

**What**: The four routes, their request DTOs, the response DTO's closing fields, the module wiring, and the main-path e2e. Also touches `work-orders.controller.ts`, `work-order.response.dto.ts` and `work-orders.module.ts`.
**Where**: `test/e2e/work-order-closing.e2e.spec.ts`
**Depends on**: T15, T16, T17, T19
**Reuses**: `test/e2e/work-order-withdrawals.e2e.spec.ts`'s fixtures for reaching `IN_EXECUTION`, the existing Swagger decorator set
**Requirement**: WOC-01, WOC-02, WOC-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The four routes exist with the permissions design.md's table names, and every handler is registered in `work-orders.module.ts`
- [ ] `WorkOrderResponseDto` exposes `chargedTotalCents`, `discountCents`, `discountNote`, `completedAt`, `deliveredAt`, `canceledAt` and `cancellationReason`, and never `version`
- [ ] A work order walks creation to delivery in one test and ends `DELIVERED` with a charged total equal to the approved services plus the withdrawn parts at their budgeted prices
- [ ] After delivery, the item's movement history shows the consumption as `SETTLED` and the count on hand is unchanged by the settlement
- [ ] A work order that has not been completed reads back a null charged total
- [ ] Completing as a mechanic who is not the assignee answers 403
- [ ] Delivering a work order in `RECEIVED` answers 422 (spec.md edge case)
- [ ] Delivering without `work-orders:manage` answers 403, its own test rather than the completion route's standing in (L-003)
- [ ] Both routes answer 404 for a work order number nobody carries
- [ ] The trail shows the completion and the delivery, each naming its actor
- [ ] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [ ] Test count: 10 tests pass (no silent deletions)

**Tests**: e2e
**Gate**: build

**Commit**: `feat(work-orders): expose the closing routes`

---

### T21: Walk the cancellation and its write-off end to end

**What**: The cancellation e2e, covering the loss arithmetic and both permission tiers.
**Where**: `test/e2e/work-order-closing.e2e.spec.ts`
**Depends on**: T20
**Reuses**: T20's fixtures
**Requirement**: WOC-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] A service advisor cancels a work order with nothing withdrawn, and it answers 200 with nothing written off (spec.md edge case)
- [ ] A part withdrawn 4 and returned 3, then cancelled, records a loss of exactly one unit and leaves the three returned units on the shelf (spec.md edge case)
- [ ] A service advisor cancelling a work order carrying withdrawn parts answers 403 with the code `WORK_ORDER_CANCEL_IN_EXECUTION_FORBIDDEN`
- [ ] The same refusal happens in `AWAITING_APPROVAL` after a supplementary round, not only in `IN_EXECUTION` (spec.md edge case)
- [ ] An administrator cancels the same work order and the movements read `WRITTEN_OFF`
- [ ] Cancelling an already cancelled work order answers 422 (spec.md edge case)
- [ ] Cancelling without a reason answers 400
- [ ] The trail shows the cancellation naming its actor
- [ ] Gate check passes: `npm run test:e2e`
- [ ] Test count: 8 tests pass (no silent deletions)

**Tests**: e2e
**Gate**: full

**Commit**: `test(work-orders): cover the cancellation write-off end to end`

---

### T22: Walk the discount end to end

**What**: The discount e2e, covering the ceiling, the replace semantics and the permission.
**Where**: `test/e2e/work-order-closing.e2e.spec.ts`
**Depends on**: T20
**Reuses**: T20's fixtures
**Requirement**: WOC-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] An administrator applies a discount with a reason and the work order reads it back
- [ ] A second discount replaces the first, and the work order reads the second amount, note and actor
- [ ] A discount above the pre-discount total answers 422
- [ ] A discount exactly equal to the total is accepted (L-009's boundary at the route)
- [ ] A discount without a reason answers 400
- [ ] A service advisor, who lacks `work-orders:discount`, answers 403 - its own test rather than another route's standing in (L-003)
- [ ] A discount applied, then a return that drops the total below it, refuses the completion with 422 (spec.md edge case)
- [ ] Completion after the discount charges the total minus the discount
- [ ] Gate check passes: `npm run test:e2e`
- [ ] Test count: 8 tests pass (no silent deletions)

**Tests**: e2e
**Gate**: full

**Commit**: `test(work-orders): cover the discount end to end`

---

### T23: Prove the version guard end to end

**What**: The concurrency e2e that reproduces the lost update this feature fixes.
**Where**: `test/e2e/work-order-concurrency.e2e.spec.ts`
**Depends on**: T10, T20
**Reuses**: `test/e2e/work-order-withdrawals.e2e.spec.ts`'s fixtures
**Requirement**: AD-009

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Two concurrent withdrawals of 3 on one work order answer one 200 and one 409, rather than the two 200s `main` answers today
- [ ] After that pair, the units that left the shelf equal the work order's withdrawn quantity - the assertion that fails on `main`
- [ ] Repeating the refused call after the conflict succeeds, and the second withdrawal is then correctly refused when it would exceed the planned quantity
- [ ] A concurrent cancellation and withdrawal end with one refused, never with a pending consumption on a cancelled work order
- [ ] Sequential calls on the same work order never answer 409, so the guard does not refuse honest traffic
- [ ] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [ ] The e2e suite passes twice consecutively
- [ ] Test count: 5 tests pass (no silent deletions)

**Tests**: e2e
**Gate**: build

**Commit**: `test(work-orders): prove the version guard against concurrent writes`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1
Phase 2:  T2   T3   T4   T5   T6   T7   T8
Phase 3:  T9   T10  T11
Phase 4:  T12  T13  T14  T15  T16  T17  T18  T19
Phase 5:  T20  T21  T22  T23
```

Dependency edges:

```
T1 -> T9
T1 -> T10
T1 -> T11
T2 -> T5
T2 -> T6
T2 -> T7
T2 -> T8
T2 -> T18
T3 -> T5
T3 -> T6
T3 -> T7
T3 -> T8
T4 -> T5
T4 -> T6
T4 -> T8
T4 -> T9
T4 -> T18
T5 -> T9
T5 -> T16
T6 -> T9
T6 -> T15
T7 -> T9
T7 -> T17
T8 -> T9
T8 -> T19
T9 -> T10
T11 -> T12
T11 -> T13
T12 -> T17
T13 -> T19
T14 -> T15
T18 -> T19
T15 -> T20
T16 -> T20
T17 -> T20
T19 -> T20
T10 -> T23
T20 -> T21
T20 -> T22
T20 -> T23
```

No task depends on a later phase.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 1 migration | Granular |
| T2 | 3 error classes, one concept | Granular |
| T3 | 4 event classes, one concept | Granular |
| T4 | 1 aggregate, the arithmetic only | Granular |
| T5 to T8 | 1 aggregate method each | Granular |
| T9 | 1 mapper and its entity | Granular |
| T10 | 1 repository guarantee | Granular |
| T11 | 2 repository methods sharing one fragment | Granular |
| T12, T13 | 1 command handler each | Granular |
| T14, T18 | 1 authorizer each | Granular |
| T15 to T17, T19 | 1 command handler each | Granular |
| T20 | 4 routes plus the wiring that makes them testable | OK if cohesive - the routes cannot be e2e tested without the wiring |
| T21 to T23 | 1 e2e concern each | Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends on (task body) | Diagram shows | Status |
| --- | --- | --- | --- |
| T1 | None | no inbound arrow | Match |
| T2 | None | no inbound arrow | Match |
| T3 | None | no inbound arrow | Match |
| T4 | None | no inbound arrow | Match |
| T5 | T2, T3, T4 | `T2 -> T5`, `T3 -> T5`, `T4 -> T5` | Match |
| T6 | T2, T3, T4 | `T2 -> T6`, `T3 -> T6`, `T4 -> T6` | Match |
| T7 | T2, T3 | `T2 -> T7`, `T3 -> T7` | Match |
| T8 | T2, T3, T4 | `T2 -> T8`, `T3 -> T8`, `T4 -> T8` | Match |
| T9 | T1, T4, T5, T6, T7, T8 | `T1 -> T9`, `T4 -> T9`, `T5 -> T9`, `T6 -> T9`, `T7 -> T9`, `T8 -> T9` | Match |
| T10 | T1, T9 | `T1 -> T10`, `T9 -> T10` | Match |
| T11 | T1 | `T1 -> T11` | Match |
| T12 | T11 | `T11 -> T12` | Match |
| T13 | T11 | `T11 -> T13` | Match |
| T14 | None | no inbound arrow | Match |
| T15 | T6, T14 | `T6 -> T15`, `T14 -> T15` | Match |
| T16 | T5 | `T5 -> T16` | Match |
| T17 | T7, T12 | `T7 -> T17`, `T12 -> T17` | Match |
| T18 | T2, T4 | `T2 -> T18`, `T4 -> T18` | Match |
| T19 | T8, T13, T18 | `T8 -> T19`, `T13 -> T19`, `T18 -> T19` | Match |
| T20 | T15, T16, T17, T19 | `T15 -> T20`, `T16 -> T20`, `T17 -> T20`, `T19 -> T20` | Match |
| T21 | T20 | `T20 -> T21` | Match |
| T22 | T20 | `T20 -> T22` | Match |
| T23 | T10, T20 | `T10 -> T23`, `T20 -> T23` | Match |

---

## Test Co-location Validation

| Task | Code layer created | Matrix requires | Task says | Status |
| --- | --- | --- | --- | --- |
| T1 | migration | integration | integration | OK |
| T2 | domain errors | unit | unit | OK |
| T3 | domain events | unit | unit | OK |
| T4 to T8 | domain aggregate | unit | unit | OK |
| T9 | mapper and ORM entity | integration | integration | OK |
| T10 | repository guarantee | integration | integration | OK |
| T11 | repository methods | integration | integration | OK |
| T12 to T19 | application handlers and services | unit | unit | OK |
| T20 | controller, DTOs, module wiring | e2e (highest of the layers touched) | e2e | OK |
| T21 to T23 | routes already built, exercised further | e2e | e2e | OK |

No task carries `Tests: none`.

---

## MCPs and Skills

No task needs an MCP or a further skill. Every dependency is in this repository and every pattern has a local precedent named in its `Reuses` line.
