# Tracking And Metrics Validation

**Date**: 2026-09-01
**Spec**: `.specs/features/tracking-and-metrics/spec.md`
**Diff range**: `a88d005^..HEAD` (`aee52ca..c66d8c1`)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Validation: tracking-and-metrics - PASS ✅

---

## Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T1   | ✅ Done | `listByCustomerId` on the query port and adapter, 4 integration tests |
| T2   | ✅ Done | `GetMyWorkOrdersHandler`, 3 unit tests |
| T3   | ✅ Done | `GetMyWorkOrderHandler`, 5 unit tests |
| T4   | ✅ Done | Metrics port + adapter, 8 integration tests, `EXISTS`-not-`JOIN` bug and `randomDay()` durability bug both fixed before commit |
| T5   | ✅ Done | `GetAverageExecutionTimeHandler`, 3 unit tests |
| T6   | ✅ Done | `/work-orders/me`, `/work-orders/me/:number`, 10 e2e tests |
| T7   | ✅ Done | `/work-orders/metrics/average-execution-time`, 5 e2e tests |
| T8   | ✅ Done | `address.spec.ts` + `phone-number.spec.ts` extended, 6 unit tests |
| T9   | ✅ Done | `vitest.config.ts` thresholds, 4 unit tests (vehicles value-object gap closed) |
| T10  | ✅ Done | README, no new tests, proven by execution |

All 10 tasks closed, no partial or blocked tasks.

---

## Spec-Anchored Acceptance Criteria

### TAM-01: A customer follows their own work orders

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: reads own list, gets every own work order and no other | Own numbers present, other customer's number absent | `test/e2e/work-order-tracking.e2e.spec.ts:163-178` - `expect(numbers).toContain(firstWorkOrder.number); expect(numbers).not.toContain(secondWorkOrder.number)` | ✅ PASS |
| AC2: no customer record → empty list, not error | `[]`, HTTP 200 | `src/modules/work-orders/application/queries/get-my-work-orders/get-my-work-orders.handler.spec.ts:59` - `expect(result).toEqual([])`; `test/e2e/work-order-tracking.e2e.spec.ts:180-191` - `expect(response.body).toEqual([])` after `.expect(200)` | ✅ PASS |
| AC3: lacks `work-orders:read-own` → 403 | HTTP 403 | `test/e2e/work-order-tracking.e2e.spec.ts:237-245` (`/me`), `:247-255` (`/me/:number`) - `.expect(403)`, `expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' })` | ✅ PASS |
| AC4: no token → 401 | HTTP 401 | `test/e2e/work-order-tracking.e2e.spec.ts:257-259`, `:261-263` - `.expect(401)` | ✅ PASS |
| AC5: reads own work order by number → in full, items, budget rounds, closing fields | `serviceItems`, `budgets` present; closing fields carried by the same DTO | `test/e2e/work-order-tracking.e2e.spec.ts:193-213` - `expect(body.serviceItems).toHaveLength(1); expect(body.budgets).toEqual([])`. Closing fields (`chargedTotalCents`, `deliveredAt`) are not re-asserted at this route - the route reuses `toResponseDto` unchanged (`src/modules/work-orders/presentation/controllers/work-orders.controller.ts:151` calls the same private method the staff route uses), and that mapping's closing fields are already proven at `test/e2e/work-order-closing.e2e.spec.ts:288,296-297,326` | ✅ PASS (closing-fields coverage is transitive through the reused, already-tested mapping - flagged for transparency, not a gap) |
| AC6: another customer's work order → 404, never 403/200 | HTTP 404 | `src/modules/work-orders/application/queries/get-my-work-order/get-my-work-order.handler.spec.ts:72` - `expect(result).toBeNull()` (owned-by-other case); `test/e2e/work-order-tracking.e2e.spec.ts:215-234` - both `.expect(404)` | ✅ PASS |
| AC7: unknown number → 404, indistinguishable from AC6 | Identical body/code to AC6 | `test/e2e/work-order-tracking.e2e.spec.ts:230-234` - `expect(strangerBody).toEqual(unknownBody); expect(strangerReference).not.toBe(unknownReference)` | ✅ PASS |

### TAM-02: The workshop reads how long its work takes

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: `metrics:read` reads the average → mean elapsed seconds + count | Whole-second mean, `workOrderCount` alongside | `test/integration/work-order-metrics-query.adapter.spec.ts:180-181` - `expect(result.workOrderCount).toBe(2); expect(result.averageSeconds).toBe(6600)` | ✅ PASS |
| AC2: only `COMPLETED`/`DELIVERED` included | Both statuses counted | `test/integration/work-order-metrics-query.adapter.spec.ts:157-181` - one `COMPLETED`, one `DELIVERED` seeded, both counted (`workOrderCount: 2`) | ✅ PASS |
| AC3: exclude in-execution and cancelled | 0 counted | `test/integration/work-order-metrics-query.adapter.spec.ts:183-207` - `expect(result.workOrderCount).toBe(0)` with one `IN_EXECUTION` and one `CANCELED` row present | ✅ PASS |
| AC4: nothing ever completed → avg 0, count 0 | `{averageSeconds: 0, workOrderCount: 0}` | `test/integration/work-order-metrics-query.adapter.spec.ts:236-246` - `expect(result.workOrderCount).toBe(0); expect(result.averageSeconds).toBe(0)` | ✅ PASS |
| AC5: service filter → averages only that service, marks `approximated` | Counts once per service, `approximated: true` | `test/integration/work-order-metrics-query.adapter.spec.ts:301-341` (`workOrderCount: 1` despite the service being attached twice); `src/modules/work-orders/application/queries/get-average-execution-time/get-average-execution-time.handler.spec.ts:29-38` - `expect(withFilter.approximated).toBe(true)`; `test/e2e/work-order-tracking.e2e.spec.ts:296-308` | ✅ PASS |
| AC6: date range → only within it, inclusive both ends | Boundary values included | `test/integration/work-order-metrics-query.adapter.spec.ts:271-299` (L-009 boundary) - `expect(result.workOrderCount).toBe(2)` with rows sitting exactly on `completedFrom` and `completedTo` | ✅ PASS |
| AC7: lacks `metrics:read` → 403 | HTTP 403 | `test/e2e/work-order-tracking.e2e.spec.ts:319-325` - `.expect(403)`, `code: 'AUTH_FORBIDDEN'`. Independently confirmed discriminating: sensor mutation 3 (below) flipped this route's permission and the test failed. | ✅ PASS |
| AC8: computed in SQL, never loaded into memory | Adapter's return type carries only the two aggregated numbers; no work-order row crosses into TS | `src/modules/work-orders/infrastructure/persistence/typeorm-work-order-metrics-query.adapter.ts:20-34` (`AVG(EXTRACT(EPOCH FROM ...))`, `COUNT(*)`) and `:47-53` (`AverageExecutionTimeAggregate` carries `averageSeconds`/`workOrderCount` only) | ✅ PASS (structural fact, per T4's own closure note - no dedicated runtime case needed) |

### TAM-03: The critical paths carry an enforced coverage floor

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: floor of 80 on statements/branches/functions/lines per critical path | 7 glob entries at 80/80/80/80 | `vitest.config.ts:20-72` - one `thresholds` entry per path plan section 8 names; independently re-derived from `coverage/coverage-final.json` after a real `npm run test:coverage` run - all 7 paths clear 80 on statements, branches and functions (see Discrimination Sensor / Gate Check below for the run) | ✅ PASS |
| AC2: a run below the floor fails | Non-zero exit | Independently reproduced in a scratch worktree: deleted `license-plate.spec.ts` + `vehicle-year.spec.ts`, ran `npm run test:coverage`, got exit code 1 and `ERROR: Coverage for functions (75%) does not meet "src/modules/vehicles/domain/value-objects/**/*.ts" threshold (80%)` | ✅ PASS |
| AC3: `customers/domain/value-objects` raised above the floor on branches/functions | ≥80 on both | Independently computed from `coverage-final.json`: branches 85.71% (42/49), functions 100% (8/8), both above the 80 floor and above the spec's own recorded pre-feature baseline (76.31 branches / 75 functions) | ✅ PASS |
| AC4: existing suites keep passing unchanged while the floor is enforced | 0 regressions | `npm run test:coverage` exit 0 with all 640 unit tests passing under the thresholds (see Gate Check) | ✅ PASS |

### TAM-04: The project runs from its README

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: states prerequisites, env, infra start, migrations, seed | All five present | `README.md:7-46` (Prerequisites, Setup, Infrastructure, Migrations, Seed sections) | ✅ PASS |
| AC2: names each test suite and its command | 4 suites listed | `README.md:53-58` (Testing table: `test:unit`, `test:integration`, `test:e2e`, `test:coverage`) | ✅ PASS |
| AC3: gives the API docs URL | A URL | `README.md:49` - `http://localhost:13000/api/docs`; independently curled during this validation, returned `200` | ✅ PASS |
| AC4: every stated command works against a clean clone | All commands succeed | Independently re-run during this validation: `npm run lint`, `npm run build`, `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`, `npm run test:coverage` (all exit 0, see Gate Check), `npm run migration:run` (no-op, confirms already-applied state), `npm run seed:admin` (idempotent, `Super administrator ready`), `curl .../api/docs` (200). Not re-run from a truly clean clone/fresh `docker compose up` by this Verifier - relies on T10's own closure note recording that full sequence once, corroborated by this session's independent re-runs of every command it documents. | ✅ PASS |

**Status**: ✅ All ACs covered. One transparency note on TAM-01 AC5 (closing fields proven transitively through reused, already-tested DTO mapping rather than re-asserted at this specific route) - not treated as a gap because the design explicitly reuses the mapping unchanged and that mapping is independently under test.

---

## Discrimination Sensor

Isolated in a temporary git worktree (`git worktree add`), never `git stash`. Baseline `git status --porcelain` on the real tree was empty before sensor work and confirmed empty again after `git worktree remove --force`.

| Mutation | File:line | Description | Killed? |
| --- | --- | --- | --- |
| 1 | `src/modules/work-orders/application/queries/get-my-work-order/get-my-work-order.handler.ts:41` | Removed the ownership comparison: `if (!workOrder \|\| workOrder.customerId !== customer.id)` → `if (!workOrder)`, so a customer could read another customer's work order by number | ✅ Killed - `get-my-work-order.handler.spec.ts`: 2/5 tests failed (`toBeNull()` got the other customer's work order object instead) |
| 2 | `src/modules/work-orders/infrastructure/persistence/typeorm-work-order-metrics-query.adapter.ts:26` | Narrowed the status filter from `('COMPLETED', 'DELIVERED')` to `('COMPLETED')`, so a `DELIVERED` work order would stop counting | ✅ Killed - `work-order-metrics-query.adapter.spec.ts`: 1/8 tests failed (`expected 1 to be 2` on the DELIVERED-still-counts test) |
| 3 | `src/modules/work-orders/presentation/controllers/work-orders.controller.ts:161` | Weakened the metrics route's permission from `AppPermission.MetricsRead` to `AppPermission.WorkOrdersRead` (a permission the test's actor already holds) | ✅ Killed - `work-order-tracking.e2e.spec.ts`: 1/15 tests failed (`expected 403 "Forbidden", got 200 "OK"`) |

**Sensor depth**: lightweight (default tier, 3 targeted mutations)
**Result**: 3/3 killed - PASS ✅

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ Every new file is a thin handler/port/adapter/DTO; no speculative abstraction |
| Surgical changes | ✅ Diff touches only the files each task names; no unrelated formatting or refactor |
| No scope creep | ✅ `vehicles`/`customers` value-object test additions and `vitest.config.ts` are in-scope per T8/T9's own closure notes (pre-existing coverage gaps the floor exposed), not incidental drive-by changes |
| Matches patterns | ✅ `GetMyWorkOrdersHandler` mirrors `GetMyVehiclesHandler` verbatim; the metrics adapter matches `TypeOrmWorkOrderQueryAdapter`'s raw-SQL style; route ordering matches `UsersController`/`VehiclesController` |
| Spec-anchored outcome check (asserted values match spec) | ✅ See AC table above - every precise spec value (6600s average, `workOrderCount: 2`, 403/401/404 codes, `approximated` boolean) is asserted directly, not merely "an assertion exists" |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ Unit handlers cover every branch (T2: 3, T3: 5, T5: 3); the metrics adapter's integration suite covers every filter and edge case named in design.md (8 tests); both e2e files cover happy path, every edge case, and one 403/401 per permission per route |
| Every test maps to a spec requirement - no unclaimed tests | ✅ New test count (+48: 21 unit, 12 integration, 15 e2e) sums exactly to every task's own self-reported count with no discrepancy; each maps to a task's Done-when line in tasks.md |
| Documented guidelines followed: `.claude/skills/tlc-spec-driven/references/coding-principles.md` | ✅ |

---

## Edge Cases

All six from spec.md, verified independently against the actual test files (not the Edge Case Ownership table alone):

- [x] No customer record → empty list, never an error - `get-my-work-orders.handler.spec.ts:59` (unit), `work-order-tracking.e2e.spec.ts:180-191` (e2e)
- [x] A stranger's work order number answers identically to a missing one - `get-my-work-order.handler.spec.ts:72,82,109-111` (unit, same `null`), `work-order-tracking.e2e.spec.ts:215-234` (e2e, same body/code, different `reference`)
- [x] No work order ever completed → zero average, zero count - `work-order-metrics-query.adapter.spec.ts:236-246`
- [x] A date range excluding everything → same zero shape - `work-order-metrics-query.adapter.spec.ts:249-269`
- [x] Three services on one work order → counts once per service, response says approximation - `work-order-metrics-query.adapter.spec.ts:301-341` (counts once despite the service being attached twice to the same work order), `get-average-execution-time.handler.spec.ts:29-38` (`approximated` flag)
- [x] A `DELIVERED` work order still counts - `work-order-metrics-query.adapter.spec.ts:157-181`

---

## Gate Check

- **Gate command**: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`, plus `npm run test:coverage`
- **Result**: lint clean, build clean, 640 unit + 228 integration + 194 e2e = 1062 tests passed, 0 failed, 0 skipped. `npm run test:coverage` exit 0 (all 7 critical-path thresholds cleared).
- **Test count before feature**: unit 619, integration 216, e2e 179 (1014 total) - from `.specs/features/work-order-closing/validation.md`'s own Gate Check, the immediately-preceding feature
- **Test count after feature**: unit 640, integration 228, e2e 194 (1062 total) - directly observed by this run
- **Delta**: +21 unit, +12 integration, +15 e2e = **+48 new tests**, zero regressions. Matches the sum of every task's own self-reported "Test count: N tests pass" line exactly (T1:4, T2:3, T3:5, T4:8, T5:3, T6:10, T7:5, T8:6, T9:4 = 48), no discrepancy.
- **Skipped tests**: none
- **Failures**: none
- **Stability check**: `test:e2e` run twice consecutively, 194/194 both times. `work-order-metrics-query.adapter.spec.ts` (the file rewritten in `99041b5` for its `pickClearDay` probe strategy) run 8 consecutive times in isolation, 8/8 passed every time - no flake observed.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status  |
| --- | --- | --- |
| TAM-01 | Pending | ✅ Verified |
| TAM-02 | Pending | ✅ Verified |
| TAM-03 | Pending | ✅ Verified |
| TAM-04 | Pending | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 19/19 ACs matched spec outcome (0 spec-precision gaps; one transparency note on TAM-01 AC5's transitive closing-fields evidence, not a gap)
**Sensor**: 3/3 mutations killed
**Gate**: 1062 passed, 0 failed, 0 skipped (lint, build, unit, integration, e2e, coverage all green)

**What works**: Both customer reads resolve strictly from the token and answer identical 404s for "not yours" and "doesn't exist"; the metrics adapter computes the average in SQL with `COALESCE`-driven zero handling, correct `DELIVERED` inclusion, correct exclusion of in-execution/cancelled, correct inclusive date-range bounds, and correct once-per-service counting under the service filter; all three new routes are permission-gated and route-ordered ahead of `:number`; the coverage floor is independently confirmed to both pass today and fail when a critical-path test is removed; the README's every stated command was independently re-run and succeeded.

**Issues found**: none blocking. One transparency note recorded above (TAM-01 AC5).

**Next steps**: none - feature ready to mark Verified in `.specs/STATE.md`.
