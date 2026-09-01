# Work Order Creation Validation

**Date**: 2026-08-31
**Spec**: `.specs/features/work-order-creation/spec.md`
**Diff range**: `04861a1..ca0261a` (pass 1, T1-T19) + `8b1a96b` (T20 fix round, this pass)
**Verifier**: independent sub-agent (author ≠ verifier) - re-verification pass 2

## Verdict: PASS ✅ (both coverage gaps closed, gate clean, nothing new found)

**Judgment call**: pass 1 found no failing test, no failed AC assertion, and a clean discrimination
sensor (3/3 mutations killed) - the sole gap was two spec.md criteria (WO-05 AC6 and one Edge Case) with
zero test evidence at any layer, even though both behaved correctly by code inspection. T20 (commit
`8b1a96b`) added exactly two e2e tests to `test/e2e/work-orders.e2e.spec.ts` and touched no production
code (`git diff --stat ca0261a..HEAD -- src/` is empty). This pass independently re-read both new tests,
confirmed each exercises the correct actor and route and asserts the spec-defined outcome (not just that
an assertion exists), re-ran the full gate twice for integration/e2e, and found nothing new.

**Result**: PASS ✅ - 0 open gaps, zero failing tests, zero suspected production bugs.

---

## Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T1   | ✅ Done | `domainEvents` getter added, `aggregate-root.spec.ts` (3 tests) |
| T2   | ✅ Done | `work-order-number.spec.ts` (6 tests) |
| T3   | ✅ Done | `planned-quantity.spec.ts` (4 tests) |
| T4   | ✅ Done | `work-order-events.spec.ts` (6 tests) |
| T5   | ✅ Done | `work-order-service-item.spec.ts` (3 tests) |
| T6   | ✅ Done | `work-order-part-item.spec.ts` (4 tests) |
| T7   | ✅ Done | `work-order.spec.ts` (13 tests) |
| T8   | ✅ Done | `work-orders-schema.migration.spec.ts` (8 tests) |
| T9+T10 | ✅ Done | `work-order.repository.spec.ts` (12 tests, T9's 6 + T10's 6, same file) |
| T11  | ✅ Done | `work-order-query.adapter.spec.ts` (6 tests) |
| T12  | ✅ Done | `random-work-order-number.generator.spec.ts` (3 tests) |
| T13  | ✅ Done | `create-work-order.handler.spec.ts` (9 tests) |
| T14  | ✅ Done | `add-requested-service.handler.spec.ts` (4 tests) |
| T15  | ✅ Done | `plan-part.handler.spec.ts` (6 tests) |
| T16  | ✅ Done | `remove-work-order-item.handler.spec.ts` (3 tests) |
| T17  | ✅ Done | `assign-mechanic.handler.spec.ts` (5 tests) |
| T18  | ✅ Done | `work-order-read-queries.spec.ts` (5 tests) |
| T19  | ✅ Done | `work-orders.e2e.spec.ts` (13 tests) - all Done-when boxes literally satisfied; two spec.md items tasks.md's own Done-when list omitted were closed by T20, see below |
| T20  | ✅ Done | `test(work-orders): close the coverage gaps validation.md flagged` (`8b1a96b`) - two new e2e tests, no production code. Closes Gap 1 and Gap 2 (see Fix Plans) |

Out-of-band commit `63a2e6a` (updates `inventory-schema.migration.spec.ts`'s FK assertion for the `stock_movements.work_order_id` foreign key T8 adds) is in scope and legitimate, not scope creep.

Every task checkbox in `tasks.md` reads `[x]`, T20 included. All claimed per-task test counts were independently re-run and matched exactly (T1: 3, T2: 6, T3: 4, T4: 6, T5: 3, T6: 4, T7: 13, T8: 8, T9+T10: 12, T11: 6, T12: 3, T13: 9, T14: 4, T15: 6, T16: 3, T17: 5, T18: 5, T19: 13, T20: 2).

---

## Spec-Anchored Acceptance Criteria

### WO-01: A visit becomes one record with a number

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: create as RECEIVED, number `[A-Z0-9]{6}-[0-9]{4}`, creator recorded, number+id returned | exact regex, exact status | `src/modules/work-orders/application/commands/create-work-order/create-work-order.handler.spec.ts:90-101` - `expect(result.number).toMatch(/^[A-Z0-9]{6}-\d{4}$/)`, `expect(workOrders.workOrders[0].status).toBe('RECEIVED')`; e2e `test/e2e/work-orders.e2e.spec.ts:104-107` | ✅ PASS |
| AC2: copy customer name, vehicle plate/brand/model/year | exact field values | `create-work-order.handler.spec.ts:103-114` - `expect(created.customerName).toBe('Jane Doe')` etc. (4 fields) | ✅ PASS |
| AC3: snapshot survives later edits | unchanged after edit | `test/e2e/work-orders.e2e.spec.ts:316-337` - vehicle patched to Honda/Civic, re-read WO still shows `vehicleBrand: 'Toyota', vehicleModel: 'Corolla'` | ✅ PASS |
| AC4: deactivated customer → 422 | HTTP 422 | `create-work-order.handler.spec.ts:116-126` - `CustomerInactiveError` thrown, 0 persisted; e2e `test/e2e/work-orders.e2e.spec.ts:140-152` - `.expect(422)` | ✅ PASS |
| AC5: vehicle owned by different customer → 422 | HTTP 422 | `create-work-order.handler.spec.ts:128-138` - `VehicleNotOwnedByCustomerError` (maps to `ErrorKind.RuleViolation` = 422) | ✅ PASS |
| AC6: customer/vehicle not found → 404 | HTTP 404 | `create-work-order.handler.spec.ts:140-156`; e2e `test/e2e/work-orders.e2e.spec.ts:154-159` - `.expect(404)` | ✅ PASS |
| AC7/AC8: only one non-terminal WO per vehicle, DB-enforced | index refuses 2nd non-terminal, accepts after DELIVERED | `test/integration/work-orders-schema.migration.spec.ts:173-189` (sequential insert, refused then accepted after `UPDATE ... SET status='DELIVERED'`); `test/integration/work-order.repository.spec.ts:443-456` (real concurrent `Promise.allSettled`, one fulfilled, one rejected `VehicleAlreadyHasActiveWorkOrderError`); e2e `test/e2e/work-orders.e2e.spec.ts:124-138` - `.expect(409)`. Index text confirmed as the complement form: `1787702400006-create-work-orders-schema.ts:35` - `WHERE status NOT IN ('DELIVERED', 'CANCELED')` | ✅ PASS |
| AC9: retry up to 5 on number collision, fail after 5th | exact attempt count | `create-work-order.handler.spec.ts:158-181` - `expect(save).toHaveBeenCalledTimes(2)` (collide once, succeed); `:183-203` - `expect(save).toHaveBeenCalledTimes(5)` then rejects `WorkOrderNumberTakenError`; `:205-225` - `VehicleAlreadyHasActiveWorkOrderError` propagates with `expect(save).toHaveBeenCalledTimes(1)` (never retried) | ✅ PASS |
| AC10: lacks `work-orders:manage` → 403 | HTTP 403 | `test/e2e/work-orders.e2e.spec.ts:110-122` - `.expect(403)`, `code: 'AUTH_FORBIDDEN'` | ✅ PASS |

### WO-02: The requested work sits on the work order

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: add service in RECEIVED/IN_DIAGNOSIS/IN_EXECUTION, snapshot id/name/price | exact snapshot fields | `src/modules/work-orders/domain/entities/work-order.spec.ts:92-108`; `add-requested-service.handler.spec.ts:63-74` | ✅ PASS |
| AC2: same service twice → two items, no quantity | 2 separate items | `work-order.spec.ts:110-131` - `expect(workOrder.serviceItems).toHaveLength(2)` | ✅ PASS |
| AC3: deactivated service → 422 | HTTP 422 | `add-requested-service.handler.spec.ts:75-84` - `ServiceInactiveError` | ✅ PASS |
| AC4: service not found → 404 | HTTP 404 | `add-requested-service.handler.spec.ts:85-94` - `ReferencedServiceNotFoundError` | ✅ PASS |
| AC5: plan part in IN_DIAGNOSIS/IN_EXECUTION, full snapshot + withdrawn=0 | exact fields | `work-order.spec.ts:160-178`; `plan-part.handler.spec.ts:88-100` - sku/name/price/qty asserted; `work-order-part-item.ts` sets `withdrawnQuantity: 0` on `add` | ✅ PASS |
| AC6: planning leaves quantity on hand untouched | no inventory write | `plan-part.handler.spec.ts:102-110` - `expect(queryBus.execute).toHaveBeenCalledTimes(1)` (read-only, handler has no `CommandBus`) | ✅ PASS |
| AC7: part in any other state → 422 | HTTP 422 | Three dedicated layers (L-003): `work-order.spec.ts:180-195` (aggregate unit); `plan-part.handler.spec.ts:112-120` (handler unit); `test/e2e/work-orders.e2e.spec.ts:183-201` (e2e, `.expect(422)`, `code: 'WORK_ORDER_INVALID_STATE'`) | ✅ PASS |
| AC8: quantity ≤0 → 400 | HTTP 400 | `plan-part.handler.spec.ts:122-130` - `InvalidPlannedQuantityError`; DTO-level `@IsInt @IsPositive` in `plan-part.request.dto.ts:10-11` | ✅ PASS |
| AC9: inventory item not found → 404 | HTTP 404 | `plan-part.handler.spec.ts:132-140` - `ReferencedInventoryItemNotFoundError` | ✅ PASS |
| AC10: remove item, others survive | other items unaffected | `work-order.spec.ts:197-225` (service), `:227-246` (part); `test/integration/work-order.repository.spec.ts:284-323` - persisted removal, kept item's row confirmed by query | ✅ PASS |
| AC11: item of another/nonexistent WO → 404 | HTTP 404 | `work-order.spec.ts:248-258` - `WorkOrderItemNotFoundError`; e2e `test/e2e/work-orders.e2e.spec.ts:220-224` - cross-work-order id, `.expect(404)` | ✅ PASS |
| AC12: lacks `work-orders:manage` → 403 on add/plan/remove | HTTP 403, each route | `test/e2e/work-orders.e2e.spec.ts:167-172` (services), `:188-193` (parts), `:214-218` (items) - three separate assertions, not one standing in for the group | ✅ PASS |

### WO-03: Every step lands on the trail, with the record

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: one trail row per event, same transaction | exact row count, same tx | `test/integration/work-order.repository.spec.ts:325-347` - `addService` on an opened WO yields `expect(rows).toHaveLength(2)` (create + add, one `save()` call) | ✅ PASS |
| AC2: failure leaves neither WO nor trail row | 0 rows on both after rollback | `work-order.repository.spec.ts:349-391` - forced real unique-violation mid-transaction (duplicate item `external_id`), `expect(workOrderRows).toHaveLength(0)`, `expect(trailRows).toHaveLength(0)` | ✅ PASS |
| AC3: recorded events still available to the publisher after `save()` | events not drained by `save()` | `work-order.repository.spec.ts:393-401` - `expect(workOrder.pullDomainEvents()).toHaveLength(1)` called *after* `repository.save()`, would be `0` if `save()` drained. Confirmed via sensor mutation 1 (below): swapping `save()` to `pullDomainEvents()` fails exactly this test | ✅ PASS |
| AC4: entry carries event type, actor, moment, from/to | exact field values | `work-order.repository.spec.ts:404-430` - `event_type`, `from_status` null, `to_status: 'RECEIVED'`, `actor_user_id` = internal key, `occurred_at` all asserted | ✅ PASS |
| AC5: trail entries never updated/deleted | structural guarantee | No `UPDATE`/`DELETE` statement against `work_order_events` exists anywhere in `typeorm-work-order.repository.ts` (only `manager.save(WorkOrderEventOrmEntity, rows)` inside `appendTrail`, `typeorm-work-order.repository.ts:134-167`) - confirmed by code review, not a runtime test, since no write path exists to attempt an update | ✅ PASS (code-review evidence) |
| AC6: `event_type` from a literal constant, not the class name | exact literal per class | `src/modules/work-orders/domain/events/work-order-events.spec.ts:27-82` - one assertion per class (`WORK_ORDER_CREATED`, `SERVICE_ADDED_TO_WORK_ORDER`, `PART_PLANNED_FOR_WORK_ORDER`, `ITEM_REMOVED_FROM_WORK_ORDER`, `MECHANIC_ASSIGNED`); `work-order-trail.event.ts:10` declares `abstract readonly eventType: string` (no `constructor.name` anywhere) | ✅ PASS |

### WO-04: A work order carries the mechanic responsible for it

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: assign a MECHANIC-role user to a non-terminal WO, trail entry | exact assignment + event | `assign-mechanic.handler.spec.ts:81-91`; `work-order.spec.ts:260-269` - `events[0]` is `MechanicAssigned` | ✅ PASS |
| AC2: target lacks MECHANIC role → 422 | HTTP 422 | `assign-mechanic.handler.spec.ts:93-104` - `AssignedUserNotMechanicError`; e2e `test/e2e/work-orders.e2e.spec.ts:245-251` - `code: 'WORK_ORDER_ASSIGNED_USER_NOT_MECHANIC'` | ✅ PASS |
| AC3: target user does not exist → 404 | HTTP 404, existence read runs first | `assign-mechanic.handler.spec.ts:106-114` - `AssignedMechanicNotFoundError`, proves `GetUserByIdQuery` is checked before `GetUserEffectiveAccessQuery` | ✅ PASS |
| AC4: reassignment replaces | new mechanic recorded | `assign-mechanic.handler.spec.ts:116-132`; `work-order.spec.ts:271-283`; e2e `test/e2e/work-orders.e2e.spec.ts:232-259` | ✅ PASS |
| AC5: lacks `work-orders:manage` → 403 | HTTP 403 | `test/e2e/work-orders.e2e.spec.ts:238-243` | ✅ PASS |

### WO-05: The board and the trail read back

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: list with number/status/customer/plate/created, filterable | exact fields, filter works | `test/integration/work-order-read-queries.spec.ts:156-179`; e2e `test/e2e/work-orders.e2e.spec.ts:261-276` | ✅ PASS |
| AC2: get by number returns snapshot/status/mechanic/items | full detail | `work-order-read-queries.spec.ts:181-189`; e2e `:278-291` | ✅ PASS |
| AC3: unknown number → 404 | HTTP 404 | `work-order-read-queries.spec.ts:191-194`; e2e `test/e2e/work-orders.e2e.spec.ts:287-290` (`GET /work-orders/ZZZZZZ-2026`) | ✅ PASS |
| AC4: `audit:read` reads trail, chronological | ordered rows | `work-order-read-queries.spec.ts:195-217`; e2e `:300-307` | ✅ PASS |
| AC5: lacks `audit:read` → 403 regardless of `work-orders:read` | HTTP 403 | `test/e2e/work-orders.e2e.spec.ts:309-313` - service advisor (holds `work-orders:read`) still gets 403 on `/trail` | ✅ PASS |
| AC6: lacks `work-orders:read` → 403 on list and detail | HTTP 403 | **Closed by T20.** `test/e2e/work-orders.e2e.spec.ts:346-361` - `registerAndLogin(app)` (`test/support/http.ts:51-53`) creates and logs in a user with zero roles granted (no `grantRole` call), so the actor holds zero permissions, strictly weaker than merely lacking `work-orders:read` alone. `GET /api/v1/work-orders` (`:350-354`) and `GET /api/v1/work-orders/{number}` (`:356-360`) both asserted `.expect(403)` with `expect(...).toMatchObject({ code: 'AUTH_FORBIDDEN' })`. Cross-referenced against the controller: both routes carry `@RequirePermissions(AppPermission.WorkOrdersRead)` (`work-orders.controller.ts:88,102`) and the RBAC seed (`1787702400001-seed-rbac-catalog.ts`) never grants any permission to an unassigned user | ✅ PASS |
| Edge case: trail requested for a nonexistent number → 404, not an empty list | HTTP 404 | **Closed by T20.** `test/e2e/work-orders.e2e.spec.ts:363-368` - `GET /api/v1/work-orders/ZZZZZZ-2026/trail` as `admin` (who holds `audit:read`, so the request reaches the handler rather than being stopped by the permission guard) asserts `.expect(404)`. `ZZZZZZ-2026` matches the well-formed number pattern `[A-Z0-9]{6}-[0-9]{4}` but is never created by any test in the suite. Controller: `getTrail` (`work-orders.controller.ts:120-129`) calls `this.getWorkOrderOrThrow(number)` before querying the trail, so an unknown number throws `WorkOrderNotFoundError` (404) before the trail query ever runs, ruling out a 200-with-empty-array response | ✅ PASS |

**Status**: 45/45 individual criteria/edge-case rows PASS with direct evidence. 0 open gaps.

---

## Edge Case Ownership Table (tasks.md) Cross-Check

| spec.md Edge Case | Claimed owner | Verified? |
| --- | --- | --- |
| Two concurrent creations, one stored/one 409 | T10 | ✅ `work-order.repository.spec.ts:443-456` |
| Drawn number that collides is redrawn | T13 | ✅ `create-work-order.handler.spec.ts:158-181` |
| Fresh WO already has creation entry on trail, empty item lists | T10 (trail) / T7 (empty items) | ✅ trail: `work-order.repository.spec.ts:404-430`; empty items: structurally guaranteed by `WorkOrder.open()` (`work-order.ts:121-122` sets `serviceItems: [], partItems: []`) - no dedicated assertion but trivially true from construction, confirmed by code review |
| Part planned in RECEIVED → 422 | T7, T15, T19 | ✅ all three layers, see WO-02 AC7 above |
| Customer/vehicle edited afterwards leaves snapshot unchanged | T19 | ✅ `test/e2e/work-orders.e2e.spec.ts:316-337` |
| Trail for nonexistent number → 404, not empty list | T19 (assigned) / T20 (delivered) | ✅ `test/e2e/work-orders.e2e.spec.ts:363-368` - closed by T20 |

---

## Discrimination Sensor

Isolated `git worktree` at a scratchpad path (never `git stash`); `node_modules` symlinked and `.env`/`.env.test` copied in (read-only reuse of the real test DB config, no schema touched by any mutation). Baseline `git status --porcelain` on the real tree was empty before and confirmed identical after.

**This pass did not re-run the sensor.** T20 touched zero production files (`git diff --stat ca0261a..HEAD
-- src/` returns empty output - confirmed directly, no production file has changed since pass 1's sensor
ran against this same code). The three mutations below and their kill results carry forward unchanged
from pass 1.

| # | File:line | Mutation | Killed? |
| - | --- | --- | --- |
| 1 | `src/modules/work-orders/infrastructure/persistence/typeorm-work-order.repository.ts:87` | `workOrder.domainEvents` → `workOrder.pullDomainEvents()` in `save()` | ✅ Killed - `work-order.repository.spec.ts` "should leave the recorded events available to the publisher after save returns" fails (`expected [] to have a length of 1 but got +0`) |
| 2 | `src/modules/work-orders/domain/entities/work-order.ts:91` | Widened `PART_PLANNABLE_STATES` to include `WorkOrderStatus.Received` | ✅ Killed at all three L-003 layers: `work-order.spec.ts` (aggregate), `plan-part.handler.spec.ts` (handler), `test/e2e/work-orders.e2e.spec.ts` (e2e, got 200 instead of 422) |
| 3 | `src/modules/work-orders/infrastructure/persistence/typeorm-work-order.repository.ts:124-126` | Removed the `ACTIVE_VEHICLE_CONSTRAINT` branch from `save()`'s catch block | ✅ Killed deterministically at both layers: `work-order.repository.spec.ts` concurrent-write test (raw `QueryFailedError` instead of `VehicleAlreadyHasActiveWorkOrderError`) and e2e 409 test (`got 500` instead of `409`) |

**Sensor depth**: lightweight (3 targeted mutations on the feature's highest-risk logic: the non-draining trail read, the RECEIVED-state guard, the constraint-to-error mapping).
**Sensor outcome**: 3/3 killed - all three mutants killed, no weak tests found. Notably, mutation 3 (the concurrent-vehicle-conflict path) killed **deterministically** in both real overlapping-write and sequential e2e forms, unlike `inventory-and-stock-movements`' pessimistic-lock mutation, which killed probabilistically (3/15 runs, recorded as candidate lesson `L-005`). This is a second data point on the same general question (constraint-based concurrency enforcement vs. lock-based) and it behaves differently: `L-005` is specifically about a *dropped pessimistic lock*, not about unique-index-backed conflict detection, so this run does not corroborate or contradict `L-005` - it is a different mechanism. No update to `L-005` is warranted.

Worktree removed after all three mutations; `git status --porcelain` on the real tree matched the pre-sensor baseline exactly (empty before, empty after).

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ - no speculative abstractions; `PlannedQuantity` deliberately kept module-local rather than shared, matching design.md's own stated rationale |
| Surgical changes | ✅ - shared-kernel touch is exactly the one additive getter on `AggregateRoot`; migration adds only the columns phase 8 names; T20 touches only the e2e spec file |
| No scope creep | ✅ - the one out-of-band commit (`63a2e6a`) is a legitimate fix to a stale FK assertion in the older `inventory-and-stock-movements` migration test, caused directly by this feature's FK addition; T20 adds exactly the two tests both gaps called for, nothing else |
| Matches patterns | ✅ - repository transaction shape mirrors `TypeOrmSessionRepository`/`TypeOrmInventoryItemRepository`; query adapter mirrors `TypeOrmInventoryQueryAdapter`'s raw-SQL join style; T20's new tests reuse the existing `registerAndLogin`/`admin` fixtures rather than inventing new ones |
| Spec-anchored outcome check (asserted values match spec) | ✅ - see AC table; both former gaps now carry spec-matching assertions (403/`AUTH_FORBIDDEN`, 404) |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ - domain, application, and route layers are exhaustive; both former route-level gaps (WO-05 AC6, trail-404-for-unknown-number) are now covered |
| Every test maps to a spec requirement - no unclaimed tests | ✅ - spot-checked every spec file read, including both new T20 tests; no orphan assertions found |
| Documented guidelines followed | `tasks.md`'s Test Coverage Matrix and Gate Check Commands (project has no separate coding-principles.md reference beyond `.claude/skills/tlc-spec-driven/references/coding-principles.md`, applied as strong defaults) |

**`resolveInternalId`/`resolveExternalId`/`resolveExternalIdsByInternalId` helpers** (`typeorm-work-order.repository.ts:238-279`): the `table` parameter is interpolated directly into a raw SQL string (`SELECT id FROM ${table} WHERE external_id = $1`). Every one of the 8 call sites passes a compile-time string literal (`'customers'`, `'vehicles'`, `'users'`, `'services'`, `'inventory_items'`) - confirmed by reading every call site in `save()`, `findByNumber()`, `appendTrail()`, `replaceServiceItems()`, `replacePartItems()`. No caller ever passes external input as the table name, so this is not a SQL-injection risk in practice. Noted as a minor style finding (a literal union type for `table` would let the compiler enforce that guarantee instead of relying on code review), not a security issue, matching the same pattern already established by `TypeOrmInventoryItemRepository.resolveUserInternalId`.

No dead code, no inconsistent error handling, no contradiction of design.md's architecture found elsewhere.

---

## Gate Check

**Gate command**: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e` (run twice for integration/e2e per project convention - the test DB is never truncated)

| Run | Result |
| --- | --- |
| `npm run lint` | clean, 0 errors |
| `npm run build` | clean, 0 errors |
| `npm run test:unit` | **369 passed**, 0 failed (64 test files) |
| `npm run test:integration` (1st) | **155 passed**, 0 failed (27 test files) |
| `npm run test:integration` (2nd) | **155 passed**, 0 failed - identical count, durability confirmed |
| `npm run test:e2e` (1st) | **113 passed**, 0 failed (11 test files) |
| `npm run test:e2e` (2nd) | **113 passed**, 0 failed - identical count, durability confirmed |

**Total**: 637 tests (369 + 155 + 113), matching `tasks.md` T20's own closing tally exactly.
**Test count at pass 1 PASS-with-gaps**: 635 (369 unit + 155 integration + 111 e2e).
**Delta (T20)**: +2 new e2e tests, zero regressions, zero skips.

---

## Fix Plans

### Gap 1: WO-05 AC6 - "lacks `work-orders:read` → 403 on list and detail" has no test - CLOSED

- **Root cause**: `tasks.md`'s T19 Done-when checklist never listed this AC as a line item, even though `WorkOrdersController`'s `@RequirePermissions(AppPermission.WorkOrdersRead)` decorator on `list()` and `getByNumber()` (`work-orders.controller.ts:88,102`) correctly implements it. The implementer followed the Done-when checklist literally and the AC fell through between spec.md and tasks.md.
- **Fix delivered (T20, `8b1a96b`)**: `test/e2e/work-orders.e2e.spec.ts:346-361` registers and logs in an actor with zero roles (via `registerAndLogin`, no `grantRole` call), then asserts `403`/`AUTH_FORBIDDEN` on both `GET /api/v1/work-orders` and `GET /api/v1/work-orders/:number`. Independently re-derived and confirmed correct in this pass: the actor genuinely lacks `work-orders:read` (stronger than lacking just that one permission - it holds none), and both routes are exercised, not just one standing in for the other.
- **Priority**: was Minor (behavior was already correct - the identical `PermissionsGuard` mechanism is proven generically elsewhere and applied consistently across the whole codebase). No production code changed; this closed the proof, not a defect.

### Gap 2: Edge case - "trail for a nonexistent number → 404, not empty list" has no test - CLOSED

- **Root cause**: The Edge Case Ownership table in `tasks.md` assigns this to T19/e2e, but T19's own Done-when checklist only asked for the trail's 200-vs-403 permission split, not the 404-for-unknown-number case. Table assignment alone did not guarantee a corresponding checklist item, so it shipped correctly implemented (`work-orders.controller.ts:120-129`) but untested.
- **Fix delivered (T20, `8b1a96b`)**: `test/e2e/work-orders.e2e.spec.ts:363-368` calls `GET /api/v1/work-orders/ZZZZZZ-2026/trail` as `admin` and asserts `.expect(404)`. Independently re-derived and confirmed correct in this pass: `admin` holds `audit:read` (the permission this route actually requires), so the request reaches `getTrail`, which calls `getWorkOrderOrThrow` before running the trail query - the right actor and the right ordering are both exercised, not just "some 404 somewhere".
- **Priority**: was Minor (same reasoning as Gap 1 - implementation verified correct by code inspection). No production code changed; this closed the proof, not a defect.

**Post-report update (pass 2, iteration 2)**: both gaps were closed the same fix round, in `tasks.md` T20
(commit `8b1a96b`). T20 touched only `test/e2e/work-orders.e2e.spec.ts` and `tasks.md` - zero production
code changed (`git diff --stat ca0261a..HEAD -- src/` is empty), consistent with pass 1's assessment that
both outcomes were already correct and only the direct proof was missing. This pass independently
re-derived both fixes rather than trusting T20's own Done-when claims, re-ran the full gate twice for
integration/e2e, and found nothing new. Final state: lint clean, build clean, unit 369/369, integration
155/155 (durable across two consecutive runs), e2e 113/113 (durable across two consecutive runs) - 637
total, up from 635 at pass 1. The discrimination sensor was not re-run since no production file changed
(`ca0261a..HEAD -- src/` empty); its pass-1 result (3/3 killed) stands. `work-order-creation` has no
remaining logged gaps.

---

## Requirement Traceability Update

Applied - see `spec.md`'s Requirement Traceability table, updated in the same commit as this report.

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| WO-01 | In Tasks | Verified |
| WO-02 | In Tasks | Verified |
| WO-03 | In Tasks | Verified |
| WO-04 | In Tasks | Verified |
| WO-05 | In Tasks | Verified |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 45/45 criteria/edge-case rows matched spec outcome with direct evidence, 0 open gaps
**Sensor**: 3/3 mutations killed (carried forward unchanged from pass 1 - no production file touched since)
**Gate**: 637/637 passed (369 unit + 155 integration ×2 + 113 e2e ×2), 0 failed, 0 skipped, 0 regressions

**What works**: Every WO-01 through WO-05 acceptance criterion now has precise, spec-matching test evidence, including the two former gaps. The bounded five-attempt retry is proven by exact `save()` call-count assertions (2, 5, 1) rather than inference. The partial unique index is written as the stated complement form and proven by both a real concurrent-write race and a sequential DB test. AD-007's second application is proven by a forced real rollback (both aggregate and trail rows absent) and by a dedicated non-draining-read test that the sensor confirmed is genuinely discriminating. All five trail event classes carry literal `eventType` constants with per-class tests. The malformed-vs-missing work order number distinction is implemented exactly as design.md specifies and proven by a dedicated e2e 400 test. Both cross-module-read handlers (`CreateWorkOrderHandler`, `AssignMechanicHandler`) stub `queryBus.execute` by branching on the query class, never on call order. Each of the five write routes has its own dedicated 403 e2e assertion, and now both read routes (list, detail) do too.

**Issues found**: none remaining. Pass 1's two coverage gaps (WO-05 AC6, trail-404-for-unknown-number) are both closed with direct test evidence, independently re-derived in this pass.

**Next steps**: none required. No blocking gaps.
