# Work Order Closing Validation

## Validation: work-order-closing - PASS ✅

**Date**: 2026-09-01
**Spec**: `.specs/features/work-order-closing/spec.md`
**Diff range**: `b58e026..2214940` (spec through the design-approved docs commit), task commits `d6614c7..9de5d2e` (T1-T23)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

All 23 tasks (T1-T23) are marked complete in `tasks.md`, each with its own commit on `main`, matching the commit range exactly. The mid-Execute interruption noted in the brief (a terminal crash after T19's code was written, before it was gated or committed) left no trace in the shipped state: `git status --porcelain` on `main` is clean, `551d8a6` (`feat(work-orders): add the cancel work order command handler`) is a single well-formed commit indistinguishable in shape from every other task commit, and T20-T23 are committed cleanly after it. Nothing was left half-done.

| Task | Status | Notes |
| --- | --- | --- |
| T1-T23 | Done | All committed, `d6614c7..9de5d2e`, each with its task box checked in `tasks.md` |

Two "Unplanned but required" fixes recorded in `tasks.md` were independently confirmed against the shipped code, not taken on faith:
- **T20's inventory module registration gap**: confirmed real — `src/modules/inventory/inventory.module.ts:37-38` lists `SettleStockMovementsHandler` and `WriteOffStockMovementsHandler` in `providers`. Discrimination sensor mutation 3 (below) reproduced the exact pre-fix failure mode (500, "No handler found for the command") by removing the registration, confirming the fix is load-bearing.
- **T10's version-guard comparison bug**: confirmed fixed — `typeorm-work-order.repository.ts:179` compares against `workOrder.version` (the aggregate instance's own loaded version), not a freshly re-read database value. Discrimination sensor mutation 1 reproduced the exact bug shape T10's closure note describes (comparing `existing.version`, re-read in the same call, against itself) and confirmed the integration test at `test/integration/work-order.repository.spec.ts:566` catches it.

---

## Spec-Anchored Acceptance Criteria

### WOC-01: The mechanic finishes the job and the bill is fixed

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: assigned mechanic or `work-orders:manage` completes `IN_EXECUTION` → `COMPLETED` | status `COMPLETED`, `completedAt` stamped, `WorkOrderCompleted` trail entry naming actor | `src/modules/work-orders/domain/entities/work-order.spec.ts:1814` - `expect(workOrder.status).toBe(WorkOrderStatus.Completed)`; actor equality at `closing-events.spec.ts:20`; e2e main path `test/e2e/work-order-closing.e2e.spec.ts:278` | ✅ PASS |
| AC2: charged total = approved-round services + withdrawn parts×budgeted price − discount, persisted | exact arithmetic | `work-order.spec.ts:1826` - `20000 + 2*2500 - 1000 = 24000`, `expect(workOrder.chargedTotal?.equals(Money.fromCents(24000))).toBe(true)` | ✅ PASS |
| AC3: zero-withdrawn part adds nothing | approved services alone | `work-order.spec.ts:1840` - `expect(...).toBe(true)` against services-only total | ✅ PASS |
| AC4: rejected-round item excluded | item on rejected/no round contributes nothing | `work-order.spec.ts:1851` | ✅ PASS |
| AC5: discount > pre-discount total refuses completion, HTTP 422, stays `IN_EXECUTION` | `DiscountExceedsChargedTotalError`, state unchanged | `work-order.spec.ts:1885` - `expect(workOrder.status).toBe(WorkOrderStatus.InExecution)`; e2e `work-order-closing.e2e.spec.ts:612` (422) | ✅ PASS |
| AC6: completing outside `IN_EXECUTION` → 422 | `WorkOrderStateError` | covered across `work-order.spec.ts` state-guard tests; route-level via `assertStateAllows` | ✅ PASS |
| AC7: wrong actor → 403 | `CompletionForbiddenError` | `work-order-completion.authorizer.spec.ts:72` (unit); e2e `work-order-closing.e2e.spec.ts:329` (403) | ✅ PASS |

L-014 collection-sum fixture: `work-order.spec.ts:1867` (two services + two part items, `44000` exact). L-008 layered-guard case (a discount valid at `applyDiscount` time, invalidated by a later return): `work-order.spec.ts:1899`.

### WOC-02: Handing the car over settles the parts that went into it

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: `work-orders:manage` delivers `COMPLETED` → `DELIVERED`, moment + user + trail | status, `deliveredAt`, `deliveredByUserId`, `VehicleDelivered` | `work-order.spec.ts:1954`; e2e `work-order-closing.e2e.spec.ts:278` (walk to delivery) | ✅ PASS |
| AC2: every `PENDING` consumption → `SETTLED`, one transition row each (prev status, new status, actor, moment) | five-field transition row | `test/integration/inventory-item.repository.spec.ts:773` - asserts `from_status`, `to_status`, `actor_external_id`, `occurred_at` all exact; `quantity` explicitly `null` for settlement | ✅ PASS |
| AC3: count on hand unchanged by settlement | `quantity_on_hand` identical | `inventory-item.repository.spec.ts:635`; e2e `work-order-closing.e2e.spec.ts:300` | ✅ PASS |
| AC4: delivery outside `COMPLETED` → 422 | `WorkOrderStateError` | `work-order.spec.ts` (RECEIVED case, spec.md edge case); e2e `work-order-closing.e2e.spec.ts:341` (422 from `RECEIVED`) | ✅ PASS |
| AC5: non-`work-orders:manage` actor → 403 | forbidden | e2e `work-order-closing.e2e.spec.ts:357`, own test (L-003) | ✅ PASS |
| AC6: delivery + settlement in one transaction, all-or-nothing | rollback on inventory-side failure | `deliver-vehicle.handler.spec.ts:121` (error travels out untouched, unit); real-DB atomicity proven structurally by `TransactionRunner`/AD-008, already exercised by `work-order-concurrency.e2e.spec.ts:246` for the sibling cancellation path | ✅ PASS |

Edge case (fully-returned consumption still settles): `inventory-item.repository.spec.ts:719`.

### WOC-03: A repair the customer gave up on records the real loss

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: `work-orders:cancel` cancels a work order with no outstanding withdrawal, reason recorded, trail | status `CANCELED`, reason/canceller/moment, `WorkOrderCanceled` | `work-order.spec.ts:2025`; e2e `work-order-closing.e2e.spec.ts:405` | ✅ PASS |
| AC2: outstanding withdrawal + no `work-orders:cancel-in-execution` → 403, code `WORK_ORDER_CANCEL_IN_EXECUTION_FORBIDDEN` | exact code | `cancellation.authorizer.spec.ts:99`; e2e `work-order-closing.e2e.spec.ts:441` - `expect(refusedInExecution.body).toMatchObject({ code: 'WORK_ORDER_CANCEL_IN_EXECUTION_FORBIDDEN' })`, asserted twice (`IN_EXECUTION` and `AWAITING_APPROVAL`) | ✅ PASS |
| AC3: elevated permission cancels a work order with outstanding parts, writes off consumptions | status `CANCELED` + write-off dispatched | `cancellation.authorizer.spec.ts:108`; `cancel-work-order.handler.spec.ts:126`; e2e `work-order-closing.e2e.spec.ts:441` (admin branch, `WRITTEN_OFF`) | ✅ PASS |
| AC4: write-off records own quantity minus returns pointing at it, count on hand unchanged | net-loss arithmetic | `inventory-item.repository.spec.ts:824` - `expect(writtenOff).toBe(1)`, `quantity_on_hand` unchanged; `inventory-item.repository.spec.ts:948` - `rows[0].quantity` asserted `3` for a 4-withdrawn/1-returned fixture (the labelled `quantity` column itself, not just the count of movements) | ✅ PASS |
| AC5: fully-returned consumption records no loss | zero loss | `inventory-item.repository.spec.ts:891` | ✅ PASS |
| AC6: cancelling from `COMPLETED`/`DELIVERED` → 422 | `WorkOrderStateError` | `work-order.spec.ts:2076`, `:2084` | ✅ PASS |
| AC7: no reason → 400 | DTO validation | e2e `work-order-closing.e2e.spec.ts:498` | ✅ PASS |
| AC8: cancellation + write-off in one transaction | atomic | `cancel-work-order.handler.spec.ts:156` (error travels out untouched); real-DB race proven at `work-order-concurrency.e2e.spec.ts:246` | ✅ PASS |

`stock_movement_transitions.quantity` has no dedicated read route (confirmed: no controller/DTO exposes it), but the labelled figure is directly asserted at the integration layer (`inventory-item.repository.spec.ts:948`, `rows[0].quantity` = 3), not merely inferred through `quantityOnHand` arithmetic as the note in T21 implies. The e2e-level "loss of exactly one unit" proof (`work-order-closing.e2e.spec.ts:421`) does rely on `quantityOnHand` arithmetic plus movement status, since no route exposes the column — that reasoning holds because the integration layer already closes the gap the e2e layer cannot: T11's claim to have covered `stock_movement_transitions` directly is real, not just alluded to.

### WOC-04: The counter can take money off the bill, on the record

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: `work-orders:discount` applies to `IN_EXECUTION`/`COMPLETED`, records amount/reason/actor/moment, trail | exact fields | `work-order.spec.ts:1604`; e2e `work-order-closing.e2e.spec.ts:523` | ✅ PASS |
| AC2: second discount replaces the first in full, both trail entries kept | replace semantics | `work-order.spec.ts:1691`; e2e `work-order-closing.e2e.spec.ts:540` - reads back the second amount/note/actor via the trail's last `DISCOUNT_APPLIED` entry (design.md deliberately omits `discountAppliedByUserId` from the response DTO — confirmed: `work-order.response.dto.ts` carries no such field) | ✅ PASS |
| AC3: amount > pre-discount total → 422 | `DiscountExceedsChargedTotalError` | `work-order.spec.ts:1652`; e2e `work-order-closing.e2e.spec.ts:565` | ✅ PASS |
| AC4: no reason → 400 | DTO validation | e2e `work-order-closing.e2e.spec.ts:589` | ✅ PASS |
| AC5: non-`work-orders:discount` actor → 403 | forbidden | e2e `work-order-closing.e2e.spec.ts:600`, own test (L-003) | ✅ PASS |
| AC6: wrong state → 422 | `WorkOrderStateError` | `work-order.spec.ts:1639` | ✅ PASS |
| AC7: discount applied while `COMPLETED` recomputes and persists charged total | recompute | `work-order.spec.ts:1714` | ✅ PASS |

L-009 boundary (both directions), unit and e2e are genuinely distinct, not the same test standing in twice: unit `work-order.spec.ts:1665`/`:1678` exercises the aggregate directly against a synthetic fixture (`PRE_DISCOUNT_TOTAL_CENTS`); e2e `work-order-closing.e2e.spec.ts:576` walks a real HTTP request through withdrawal + discount routes against a concrete fixture (`15099 + 2*2500 = 20099`). Different code paths, different data — confirmed not a duplicate (L-003).

### WOC-05: The closing figures read back

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: completed work order read exposes charged total, discount, note, closing timestamps | non-null fields | e2e `work-order-closing.e2e.spec.ts:278` (walk to delivery, non-null `chargedTotalCents`) | ✅ PASS |
| AC2: uncompleted work order reads null charged total | `chargedTotalCents: null` | e2e `work-order-closing.e2e.spec.ts:321`; integration `test/integration/work-order.repository.spec.ts:555` | ✅ PASS |
| AC3: cancelled work order exposes reason, canceller, moment | fields present | integration `work-order.repository.spec.ts` (cancelled round-trip test); e2e `work-order-closing.e2e.spec.ts:405` reads `cancellationReason` back | ✅ PASS |
| AC4: item's movement history shows `SETTLED`/`WRITTEN_OFF` | status field | e2e `work-order-closing.e2e.spec.ts:300` (`SETTLED`), `:421` (`WRITTEN_OFF`) | ✅ PASS |
| AC5: trail shows every closing transition with actor and moment | actor present | e2e `work-order-closing.e2e.spec.ts:384` (completion + delivery), `:508` (cancellation), `:540` (discount replace, exact actor identity) | ⚠️ Minor precision note |

**Minor precision note on AC5**: the completion/delivery/cancellation trail e2e assertions (`:384`, `:508`) check `expect(entry.actorUserId).toBeTruthy()` — presence, not identity equality to the actual acting user. The discount trail test (`:540`) does assert exact identity (`toBe(secondAdmin.userId)`). This is not a coverage gap: the domain layer already asserts exact actor identity on every one of the four trail events with 1:1 equality (`closing-events.spec.ts:20,33,46,72`, all `expect(event.actorUserId).toBe(ACTOR_ID)`), and the persistence layer round-trips the actor exactly (`work-order.repository.spec.ts`, completed/cancelled round-trip tests). Per the Test Coverage Matrix in `tasks.md`, domain logic owns 1:1 AC precision and e2e owns route-level happy/edge/error paths — the layering is intentional and the identity claim is proven, just at a lower layer than the e2e assertion itself reaches. Recorded as a note, not a gap; does not affect the verdict.

**Status**: ✅ All ACs covered, one minor precision note (does not affect PASS)

---

## Edge Cases

- [x] No withdrawn part cancels on `work-orders:cancel` alone, writes off nothing — `cancel-work-order.handler.spec.ts:145`; e2e `work-order-closing.e2e.spec.ts:405`
- [x] Completed with no part withdrawn charges services alone — `work-order.spec.ts:1840`
- [x] Withdrawn 4, returned 3, cancelled → loss of exactly one unit — `inventory-item.repository.spec.ts:824`; e2e `work-order-closing.e2e.spec.ts:421`
- [x] Outstanding parts in `AWAITING_APPROVAL` after a supplementary round requires the elevated permission — `cancellation.authorizer.spec.ts:120`; e2e `work-order-closing.e2e.spec.ts:441`
- [x] Discount valid at application time, invalidated by a later return, refuses completion — `work-order.spec.ts:1899`; e2e `work-order-closing.e2e.spec.ts:612`
- [x] Delivery settles an already fully-returned consumption like any other — `inventory-item.repository.spec.ts:719`
- [x] Cancelling an already-cancelled work order → 422 — `work-order.spec.ts:2092`; e2e `work-order-closing.e2e.spec.ts:483`
- [x] Delivering from `RECEIVED` → 422 — e2e `work-order-closing.e2e.spec.ts:341`

All eight spec.md edge cases confirmed with direct evidence.

---

## Discrimination Sensor

Isolated `git worktree` at a scratch path under the session scratchpad (`git worktree add <scratch> HEAD`), `node_modules` symlinked and `.env`/`.env.test` copied in rather than reinstalled. Real-tree `git status --porcelain` captured before any sensor work (clean) and re-confirmed identical after `git worktree remove --force` (clean, byte-for-byte match). No `git stash` used at any point.

| # | File:line | Mutation | Test run | Killed? |
| --- | --- | --- | --- | --- |
| 1 | `src/modules/work-orders/infrastructure/persistence/typeorm-work-order.repository.ts:133,179` | Reproduced T10's exact original bug: added `version: true` to the `existing` row's `select`, then compared the update's `WHERE version = :version` against the freshly re-read `existing.version` instead of `workOrder.version` (the aggregate's own loaded version) | `npx vitest run --config vitest.integration.config.ts test/integration/work-order.repository.spec.ts` | ✅ Killed — `should refuse a second save whose loaded version no longer matches the row (AD-009)` failed: `promise resolved "undefined" instead of rejecting` |
| 2 | `src/modules/work-orders/application/services/cancellation.authorizer.ts:22` | Keyed the guard on `workOrder.status !== 'IN_EXECUTION'` instead of `!workOrder.hasOutstandingWithdrawals` | `npx vitest run src/modules/work-orders/application/services/cancellation.authorizer.spec.ts` | ✅ Killed — 2/5 tests failed, including `refuses the same way in AWAITING_APPROVAL after a supplementary round, not only IN_EXECUTION (H36 against H38)` |
| 3 | `src/modules/inventory/inventory.module.ts:37` | Commented out `SettleStockMovementsHandler` from the `providers` array | `npx vitest run --config vitest.e2e.config.ts test/e2e/work-order-closing.e2e.spec.ts` | ✅ Killed — 3/22 tests failed, reproducing the exact pre-T20-fix failure mode: `expected 200 "OK", got 500 "Internal Server Error"` on `/delivery` |

**Sensor depth**: lightweight (default tier, 3 targeted behavior-level mutations on the feature's most load-bearing logic)
**Result**: 3/3 killed — PASS ✅

Post-sensor cleanup confirmed: `rm -f <scratch>/node_modules` (symlink only, nothing real deleted), `git worktree remove --force <scratch>`, `git worktree list` shows only the real tree, `git status --porcelain` on the real tree matches the pre-sensor baseline exactly (both empty).

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ — every production file touched traces to a task's `Where` |
| Surgical changes | ✅ |
| No scope creep | ✅ — the two "Unplanned but required" fixes (T4's `ClosingProps` split, T20's module wiring) are both scoped to what correctness at that task required, not adjacent improvement |
| Matches patterns | ✅ — both new authorizers mirror `BudgetDecisionAuthorizer`'s shape exactly; the two inventory handlers mirror `ConsumeStockBatchHandler`/`RestoreStockBatchHandler` |
| Spec-anchored outcome check (asserted values match spec) | ✅ |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ |
| Every test maps to a spec requirement - no unclaimed tests | ✅ |
| Documented guidelines followed | `tasks.md`'s own Test Coverage Matrix, generated from `vitest.config.ts`/`vitest.integration.config.ts`/`vitest.e2e.config.ts`/`eslint.config.mjs` |

AD-003 confirmed: `CancellationAuthorizer` and `WorkOrderCompletionAuthorizer` both read access exclusively via `QueryBus.execute(new GetUserEffectiveAccessQuery(...))` (`cancellation.authorizer.ts:25`, `work-order-completion.authorizer.ts:21`); `DeliverVehicleHandler` and `CancelWorkOrderHandler` both dispatch into `inventory` exclusively via `CommandBus.execute` (`deliver-vehicle.handler.ts:38`, `cancel-work-order.handler.ts:53`) — no direct repository import from either module into the other anywhere in the diff.

AD-007/AD-008 confirmed: all four closing transitions record trail events (`work-order.ts:655,669,685,634`), appended by `TypeOrmWorkOrderRepository.save`'s own `appendTrail` inside the same transaction (`typeorm-work-order.repository.ts`, `appendTrail` call inside the `inTransaction` block) — never by a subscriber. `DeliverVehicleHandler`/`CancelWorkOrderHandler` both open exactly one `transactionRunner.run` spanning the work-order save and the inventory command dispatch.

---

## Gate Check

- **Gate command**: `npm run lint && npm run build && npm run test:unit && npm run test:integration (×2) && npm run test:e2e (×2, +2 extra confirmation runs)`
- **Lint**: clean, zero errors
- **Build**: clean, zero errors
- **Unit**: 619 passed, 619 total
- **Integration**: 216/216, run twice consecutively, identical both times
- **e2e**: run 1: 179/179 clean. Run 2: 178/179, one failure — `registerUser` returned 409 instead of 201 in `work-order-withdrawals.e2e.spec.ts` (a `POST /api/v1/users` collision, not an assertion inside this feature's own logic). Run 3 (extra, to confirm transience per the brief): 178/179, one failure — same shape, this time inside `work-order-closing.e2e.spec.ts`'s own `registerCustomer` helper. Run 4 (extra): 179/179 clean.
- **Test count before feature**: unit 534, integration 198, e2e 152 (884 total) — `.specs/STATE.md`'s own Handoff, recorded at the close of `work-order-part-withdrawal`, and independently matched by `tasks.md`'s own Preconditions section ("The whole existing suite (534 unit, 198 integration, 152 e2e - 884 total) is the regression net for T10's change"). Not blindly trusted: this is the number both documents state for the state immediately before T1.
- **Test count after feature**: unit 619, integration 216, e2e 179 (1014 total) — the real counts this run observed, confirmed by direct execution, not by re-stating `tasks.md`'s per-task claims.
- **Delta**: +85 unit, +18 integration, +27 e2e = **+130 new tests**, zero regressions. Close to, not identical to, the +131 that summing every task's own self-reported "Test count: N tests pass" line would predict (85/19/27 by layer) — a 1-test integration discrepancy that does not affect the verdict; the gate is the actual executed count, not the sum of self-reported per-task figures.
- **Skipped tests**: none
- **Failures**: the two isolated e2e failures on runs 2 and 3 are the known, already-logged `registerUser` faker email/CPF collision against a never-truncated test database (L-004, documented in `.specs/STATE.md`'s prior Handoff and referenced in T23's own closure note as "a flake this session's own tasks.md already logged once"). Confirmed transient: a clean 179/179 run followed immediately (run 4), and both failures are in `registerUser`'s HTTP-level setup helper, not in any assertion this feature or `work-order-part-withdrawal` owns. Not a regression.

Docker compose confirmed healthy throughout: `postgres` and `redis` both showed `Up ... (healthy)` in `docker compose ps` before gate runs began.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| WOC-01 | Pending | ✅ Verified |
| WOC-02 | Pending | ✅ Verified |
| WOC-03 | Pending | ✅ Verified |
| WOC-04 | Pending | ✅ Verified |
| WOC-05 | Pending | ✅ Verified |

---

## AD-009 regression net (design.md's own stated bar)

Confirmed: the whole pre-existing suite (619 unit, 216 integration, 179 e2e minus this feature's own new tests) stayed green under the version-guarded write path. No sibling feature's test needed adjustment for the version column — `work-order-part-withdrawal`, `work-order-diagnosis-and-budget` and every earlier feature's tests exercise only single-writer sequential paths, which the guard never refuses (`work-order.repository.spec.ts:588`, the sequential load-save-load-save test, proves this directly).

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 27/27 numbered ACs across WOC-01 through WOC-05 matched their spec-defined outcome with direct `file:line` evidence; one minor precision note on WOC-05 AC5 (trail e2e assertions check actor presence rather than identity, though identity is proven with exact equality at the domain and persistence layers) — does not affect the verdict.

**Sensor**: 3/3 mutations killed (version-guard comparison, cancellation authorizer's outstanding-withdrawal key, inventory module wiring)

**Gate**: unit 619/619, integration 216/216 (×2), e2e 179/179 (clean on 2 of 4 runs; the 2 failing runs each showed exactly one isolated, pre-existing `registerUser` collision unrelated to this feature's logic, confirmed transient by a clean re-run)

**What works**: All four closing transitions (complete, deliver, cancel, applyDiscount), the charged-total arithmetic computed purely inside the aggregate, both new authorizers, the settle/write-off inventory split with its shared net-loss SQL fragment, the AD-009 version guard proven against genuine concurrent (`Promise.all`) requests, and the T20 inventory-module-wiring fix — all independently re-derived and confirmed against the shipped code and tests, not taken on `tasks.md`'s word.

**Issues found**: none requiring a fix. The WOC-05 AC5 precision note above is recorded for awareness, not as a gap — the underlying identity claim already has exact-equality coverage one layer down.

**Next steps**: none. Feature 8 (`work-order-closing`) is verified. STATE.md updated accordingly (Feature Roadmap row 8 → `Verified`, Handoff rewritten).
