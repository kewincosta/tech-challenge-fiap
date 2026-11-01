# Work Order Diagnosis And Budget Validation

**Date**: 2026-09-01
**Spec**: `.specs/features/work-order-diagnosis-and-budget/spec.md`
**Diff range**: `389d57c..f97ea9d` (3a0f1dd spec/design/tasks docs + a79ab48..f97ea9d, T1-T20)
**Verifier**: independent sub-agent (author != verifier)

---

## Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T1   | Done | `Budget`, `BudgetId`, `BudgetStatus` - 14 unit tests |
| T2   | Done | Item `attachToBudget`/`isDraft` - 15 unit tests (8+7 across both item spec files) |
| T3   | Done | 8 trail events - 10 unit tests |
| T4   | Done | 3 rule-violation errors - 7 unit tests |
| T5   | Done | `startDiagnosis` - 7 dedicated cases inside `work-order.spec.ts` |
| T6   | Done | `completeDiagnosis` + `generateRound` - 7 cases, plan-part fixture repaired |
| T7   | Done | `approveBudget`/`rejectBudget` - 8 cases |
| T8   | Done | `submitSupplementaryBudget` + narrowed `removeItem` - 8 cases |
| T9   | Done | Migration `1787702400007` - 8 integration tests, both support files updated, `budgets` stopgap (`[]`) documented and closed by T10/T11 |
| T10  | Done | Mapper both ways - 8 unit tests |
| T11  | Done | `replaceBudgets` + `save` write order - 5 integration tests, 3 more fixture call sites fixed |
| T12  | Done | Query adapter budgets/item fields - 4 integration tests |
| T13  | Done | `BudgetDecisionAuthorizer` - 4 unit tests |
| T14  | Done | Start diagnosis handler - 4 unit tests |
| T15  | Done | Complete diagnosis handler - 4 unit tests |
| T16  | Done | Submit supplementary handler - 4 unit tests |
| T17  | Done | Approve budget handler - 4 unit tests |
| T18  | Done | Reject budget handler - 5 unit tests |
| T19  | Done | 5 routes + wiring + main-path e2e - 9 e2e tests, `addPart`/`startDiagnosis` ordering fix documented |
| T20  | Done | Supplementary cycle e2e - 6 e2e tests, `loginAsCustomer` helper added |

All 20 tasks' checkboxes in `tasks.md` are `[x]`, and the code and tests behind every "Done when" line were independently re-derived below rather than trusted from the file's own closure notes.

---

## Spec-Anchored Acceptance Criteria

### WOB-01: The diagnosis opens and holds a mechanic responsible

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 start moves RECEIVED->IN_DIAGNOSIS, records moment, trail entry | status `IN_DIAGNOSIS`, `diagnosisStartedAt` set, `DiagnosisStarted` recorded | `src/modules/work-orders/domain/entities/work-order.ts:240-249` (`startDiagnosis`); unit `work-order.spec.ts:319-328` `expect(workOrder.status).toBe(InDiagnosis)`; e2e `test/e2e/work-order-budgets.e2e.spec.ts:174-178` `expect(started.body.status).toBe('IN_DIAGNOSIS')` | PASS |
| AC2 no assigned mechanic -> actor becomes mechanic | `assignedMechanicUserId` = actor | `work-order.ts:244-246`; `work-order.spec.ts:329-336` | PASS |
| AC3 existing mechanic untouched | assignment unchanged | `work-order.spec.ts:337-345` | PASS |
| AC4 wrong state -> 422 | `WorkOrderStateError` -> 422 | `work-order.ts:241` `assertStateAllows([Received])`; unit `work-order.spec.ts:346-353`; e2e 422 on double-start `work-order-budgets.e2e.spec.ts:204-215` | PASS |
| AC5 lacks `work-orders:execute` -> 403 | 403, `AUTH_FORBIDDEN` | route decorator `work-orders.controller.ts:215`; e2e `work-order-budgets.e2e.spec.ts:255-263` `expect(response.body).toMatchObject({code:'AUTH_FORBIDDEN'})` | PASS |
| AC6 unknown number -> 404 | 404 | e2e `work-order-budgets.e2e.spec.ts:293-298` | PASS |
| Edge: diagnosis started twice -> 422 | 422 | unit `work-order.spec.ts:354-362`; e2e `work-order-budgets.e2e.spec.ts:204-215` | PASS |

### WOB-02: Completing the diagnosis prices what was found

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 complete generates round 1, moves to AWAITING_APPROVAL, trail entries | status `AWAITING_APPROVAL`, round 1 `PENDING` | `work-order.ts:258-278`; unit `work-order.spec.ts:451-458`; e2e `work-order-budgets.e2e.spec.ts:183-195` | PASS |
| AC2 total = services + (part price x qty) | exact cents total | `work-order.ts:293-308` `generateRound`; unit `work-order.spec.ts:476-485` `expect(...total.cents).toBe(20099)` (150.99 + 2x25.00); e2e `work-order-budgets.e2e.spec.ts:194` `expect(completedBody.budgets[0].totalCents).toBe(20099)` | PASS |
| AC3 no total accepted from any payload | no price/total param anywhere in the call chain | `CompleteDiagnosisInput` (`work-order.ts:108-112`) and `CompleteDiagnosisCommand` (`complete-diagnosis.command.ts`) carry no such field - a type-level fact confirmed by reading both signatures; routes take no body (`work-orders.controller.ts:233-236`, no `@Body()`) | PASS |
| AC4 freeze unit price onto item, attach every draft item | `budgetRound`=1, `budgetedUnitPrice`=frozen `unitPrice` | `work-order-service-item.ts:47-50` / `work-order-part-item.ts:57-60` `attachToBudget`; unit `work-order.spec.ts:487-498` | PASS |
| AC5 catalog price change after generation leaves round frozen | round total and item's `budgetedUnitPriceCents` unchanged | `generateRound` reads only `item.unitPrice`, an immutable snapshot on the aggregate's own item (`work-order.ts:293-308`); real-route proof e2e `work-order-budgets.e2e.spec.ts:399-430` edits the catalog price via `PATCH /services/:id` then re-reads the work order and asserts `budgets[0].totalCents === originalTotal` and `serviceItems[0].budgetedUnitPriceCents === 15099` | PASS |
| AC6 no items -> 422 | `DiagnosisWithoutItemsError` -> 422 | unit `work-order.spec.ts:460-466`; e2e `work-order-budgets.e2e.spec.ts:217-228` | PASS |
| AC7 wrong state -> 422 | `WorkOrderStateError` | unit `work-order.spec.ts:468-474` | PASS |
| AC8 DB-level uniqueness on (work_order, round) | `ux_work_order_budgets_round` unique index | migration `1787702400007-create-work-order-budgets.ts:35-38`; integration `work-order-budgets-schema.migration.spec.ts:120-129`, and race test `work-order-budgets.repository.spec.ts:260-333` | PASS |
| AC9 lacks `work-orders:execute` -> 403 | 403 | e2e `work-order-budgets.e2e.spec.ts:265-277` | PASS |

### WOB-03: The customer decides, and approval starts the work

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 approve -> `APPROVED`, decider/moment recorded, `IN_EXECUTION`, `executionStartedAt` set | exact state + timestamps | `work-order.ts:315-328`; unit `work-order.spec.ts:610-621`; e2e `work-order-budgets.e2e.spec.ts:197-201` | PASS |
| AC2 round-1 reject -> `REJECTED`, back to `IN_DIAGNOSIS` | `work-order.ts:335-349`; unit `work-order.spec.ts:632-639` | PASS |
| AC3 re-complete after round-1 rejection replaces round 1 | same round row, new total, decision cleared | `Budget.regenerate` (`budget.ts:58-66`) called from `completeDiagnosis` (`work-order.ts:264-271`); unit `work-order.spec.ts:500-549` `expect(workOrder.budgets).toHaveLength(1)`; integration `work-order-budgets.repository.spec.ts:202-258` asserts exactly 1 DB row after two `completeDiagnosis` calls | PASS |
| AC4 `executionStartedAt` unchanged on later re-entry | same value across approvals | unit `work-order.spec.ts:623-630`; e2e full cycle `work-order-budgets.e2e.spec.ts:319-344` | PASS |
| AC5 non-owner, non-decider -> 404 (never 403) | `WorkOrderNotFoundError` -> 404 | `BudgetDecisionAuthorizer.assertMayDecide` (`budget-decision.authorizer.ts:33-37`) throws `WorkOrderNotFoundError`, never a forbidden error; unit `budget-decision.authorizer.spec.ts:81-98`; e2e `work-order-budgets.e2e.spec.ts:374-387` (`.expect(404)` on both routes) | PASS |
| AC6 wrong state -> 422 | `WorkOrderStateError` | unit `work-order.spec.ts:665-674` (both `approveBudget`/`rejectBudget`) | PASS |
| AC7 never IN_EXECUTION without an approved round | structural: only `approveBudget` sets `IN_EXECUTION`, and only after `budget.approve()` | `work-order.ts:315-328` - the only writer of `WorkOrderStatus.InExecution` besides `rejectBudget`'s round>1 return path, itself gated by a prior approval; confirmed by reading every assignment site of `this.props.status =` in the file | PASS |

### WOB-04: Extra work found during execution goes to its own round

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 IN_EXECUTION accepts new items as draft | `budgetRound` null | `addService`/`planPart` allow `InExecution` via `ITEM_EDITABLE_STATES`/`PART_PLANNABLE_STATES` (`work-order.ts:126-133`); unit `work-order.spec.ts:747-756` `addDraftService` | PASS |
| AC2 removing a decided-round item -> 422 | `BudgetedItemNotRemovableError` | `work-order.ts:218-238`; unit `work-order.spec.ts:852-890`; e2e `work-order-budgets.e2e.spec.ts:241-253` | PASS |
| AC3 submit supplementary generates round max+1, moves to AWAITING_APPROVAL | round number and status | `work-order.ts:357-373`; unit `work-order.spec.ts:758-772`; e2e `work-order-budgets.e2e.spec.ts:319-344` | PASS |
| AC4 empty draft -> 422 | `EmptyDraftBudgetError` | unit `work-order.spec.ts:774-784` | PASS |
| AC5 round>1 approved -> `APPROVED`, back to `IN_EXECUTION` | unit `work-order.spec.ts:641-654` (rejection path proves the destination logic; approval path proven by AC1's mechanism shared across rounds), e2e `work-order-budgets.e2e.spec.ts:319-344` | PASS |
| AC6 round>1 rejected -> `REJECTED`, back to `IN_EXECUTION` | `work-order.ts:335-349`; unit `work-order.spec.ts:641-654`; e2e `work-order-budgets.e2e.spec.ts:346-372` | PASS |
| AC7 rejected round's items stay attached, out of later rounds | `budgetRound` unchanged, never re-picked up | unit `work-order.spec.ts:656-663`; e2e `work-order-budgets.e2e.spec.ts:346-372` `expect(extraItem?.budgetRound).toBe(2)` after rejection | PASS |
| Edge: two concurrent supplementary submissions -> one generated, one refused via unique index | 1 fulfilled, 1 rejected, exactly 1 round-2 row | integration `work-order-budgets.repository.spec.ts:260-333` - real `Promise.allSettled` race against two independently loaded aggregates | PASS |
| Edge: `AWAITING_APPROVAL` refuses add/remove | 422 both | e2e `work-order-budgets.e2e.spec.ts:230-253`, one test per route | PASS |

### WOB-05: The budget and its rounds read back

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 every round with number/total/status/generation/decision | `WorkOrderBudgetDto` shape | port `work-order-query.port.ts:22-30`; adapter `typeorm-work-order-query.adapter.ts:104-109,157-159`; integration `work-order-budgets.query.spec.ts:136-193` | PASS |
| AC2 item budgeted price + round, null while draft | `budgetRound`/`budgetedUnitPriceCents` | adapter `typeorm-work-order-query.adapter.ts:87-102`; integration `work-order-budgets.query.spec.ts:194-240` | PASS |
| AC3 trail shows diagnosis start/completion/each round/each decision, chronological | exact event-type sequence | `typeorm-work-order-query.adapter.ts:142` `ORDER BY we.occurred_at ASC`; e2e `work-order-budgets.e2e.spec.ts:432-456` asserts the full 9-entry ordered array | PASS |
| AC4 no budget -> empty list, not an error | `[]` | integration `work-order-budgets.query.spec.ts:126-135` | PASS |

**Status**: All ACs and listed Edge Cases covered with `file:line` evidence. No spec-precision gaps.

**Note on AC3's chronological ordering**: `completeDiagnosis`, `approveBudget`, `rejectBudget` (round>1) and `submitSupplementaryBudget` each record 2-3 trail events sharing the exact same `now` timestamp (millisecond-precision `Date`), and `listTrail`'s query orders by `occurred_at ASC` alone, with no secondary tie-breaker such as `id`. This was tested directly against the real PostgreSQL instance (`docker exec ... psql`, both forced sequential scan and forced index scan via `SET enable_seqscan = off`, against a table shaped like `work_order_events` with its own `(work_order_id, occurred_at)` index): ties consistently returned in insertion order across 5 repeated runs. The e2e chronological-order test also passed on every run of this session's gate (2/2 consecutive full e2e passes). This is not a documented SQL ordering guarantee, but it is empirically stable, matches the pattern feature 5 already shipped and passed verification with, and is not a demonstrated failure - so it is not treated as a gap here, only recorded as an observation for awareness.

---

## Discrimination Sensor

Ran in an isolated `git worktree` at `/tmp/claude-1001/.../scratchpad/sensor-worktree` (`git worktree add <scratch> HEAD`, `node_modules` symlinked from the real tree, never `git stash`). Real-tree `git status --porcelain` was empty before the sensor ran and empty again after `git worktree remove --force`.

| # | Mutation | File:line | Description | Test run | Killed? |
| - | -------- | --------- | ----------- | -------- | ------- |
| 1 | `generateRound`'s regeneration clause | `src/modules/work-orders/domain/entities/work-order.ts:296,302` | Dropped `\|\| item.budgetRound === round`, leaving only `if (item.isDraft)` | `npx vitest run work-order.spec.ts` | Killed - `WorkOrder.completeDiagnosis > regenerates an existing rejected round one in place rather than opening round two`: `expected +0 to be 15099` |
| 2 | `TypeOrmWorkOrderRepository.save` write order | `src/modules/work-orders/infrastructure/persistence/typeorm-work-order.repository.ts:143-153` | Items written before budgets, with an empty `Map()` in place of `replaceBudgets`'s return value, breaking the round-to-internal-id linkage the item writers depend on | `npx vitest run test/integration/work-order-budgets.repository.spec.ts` (real Postgres) | Killed - `writes the work order row, the budget row and the item rows in one transaction...`: `expected null to be 1` on `final.serviceItems[0].budgetRound` |
| 3 | `BudgetDecisionAuthorizer`'s ownership comparison | `src/modules/work-orders/application/services/budget-decision.authorizer.ts:33` | Flipped `customer.id === workOrder.customerId` to `!==` | `npx vitest run budget-decision.authorizer.spec.ts approve-budget.handler.spec.ts reject-budget.handler.spec.ts` | Killed - 8 tests failed: the authorizer's own "admits the owning customer" case now throws, and both handlers' "refuses an actor the authorizer refuses" cases now resolve instead of rejecting |

**Sensor depth**: lightweight (3 targeted mutations, default tier)
**Result**: 3/3 killed - PASS

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | Yes |
| Surgical changes | Yes |
| No scope creep | Yes - phase 11 (withdrawal), phase 12 (completion/delivery/cancellation/charged total) correctly left untouched |
| Matches patterns | Yes - private-constructor/static-factory/read-only-getter shape, `AggregateRoot.domainEvents` non-draining read, `QueryBus`-only cross-module reads all match the last 3 features |
| Spec-anchored outcome check | Yes - see table above, every AC traced to an assertion on the exact spec-defined value |
| Per-layer Coverage Expectation met | Yes - domain 1:1 to ACs, routes cover happy + every listed edge case + one 403 per permission per route (L-003 applied: 3 separate 403 tests, not one shared) |
| Every test maps to a spec AC/edge case/Done-when | Yes - spot-checked `work-order.spec.ts`, `budget.spec.ts`, both e2e files; no orphan test found |
| Documented guidelines followed | `vitest.config.ts`, `vitest.integration.config.ts`, `vitest.e2e.config.ts`, `package.json` scripts, `eslint.config.mjs` (as tasks.md's own Test Coverage Matrix names) |

---

## Edge Cases

- [x] Diagnosis started twice -> 422
- [x] Two concurrent supplementary submissions -> one generated, one refused (real DB race)
- [x] Rejected round keeps its items attached, not returned to the draft
- [x] Catalog price change between generation and decision leaves the round frozen (real route)
- [x] `AWAITING_APPROVAL` refuses every item addition and removal
- [x] A non-owning customer gets 404, not 403

---

## Gate Check

- **Gate command**: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:integration && npm run test:e2e && npm run test:e2e` (integration and e2e each run twice consecutively, per STATE.md's never-truncated-DB convention)
- **Result**: lint clean, build clean, all suites green
- **Unit**: 471 passed, 0 failed (baseline before feature: 369)
- **Integration**: 172 passed, 0 failed, both runs identical (baseline before feature: 155)
- **E2E**: 128 passed, 0 failed, both runs identical (baseline before feature: 113)
- **Total**: 771 (baseline 637, delta +134)
- **Test count vs tasks.md's own claim**: tasks.md's Handoff-style estimate was "roughly unit 471 / integration 172 / e2e 128 (total 771)" - the real run matches exactly.
- **Skipped tests**: none
- **Failures**: none

---

## AD Compliance

| Decision | Check | Result |
| --- | --- | --- |
| AD-001 (bigserial + external_id) | `work_order_budgets.id bigserial PRIMARY KEY`, `external_id uuid` with `ux_work_order_budgets_external_id` | `1787702400007-create-work-order-budgets.ts:18-19,30` | Honored |
| AD-002 (Money integer cents) | `total_cents bigint`, `budgeted_unit_price_cents bigint`, `Money.fromCents`/`.cents` used throughout | migration + `budget.ts`, `work-order.spec.ts:482` (20099) | Honored |
| AD-003 (cross-module only via QueryBus) | No import of another module's repository or domain entities inside `work-orders`; `BudgetDecisionAuthorizer` reaches `customers`/`authorization` only through `QueryBus.execute` | grep found zero direct cross-module repository/entity imports; `budget-decision.authorizer.ts:1-38` | Honored |
| AD-007 (trail inside the aggregate's own transaction) | `appendTrail` called inside `dataSource.transaction`, after item writes, never a post-commit subscriber | `typeorm-work-order.repository.ts:111-154` (`appendTrail` at line 153, inside the `manager` callback) | Honored |

---

## "Unplanned but required" Consistency Check

- `plan-part.handler.spec.ts` fixture (T6): confirmed carries `budgets: []` and the other new required props (`plan-part.handler.spec.ts:69-71`).
- Three integration fixtures fixed in T9 (`work-order.repository.spec.ts`, `work-order-query.adapter.spec.ts`, `work-order-read-queries.spec.ts`): confirmed all three now pass `budgets: [] `via `WorkOrder.restore`, and all three build/pass.
- `TypeOrmWorkOrderRepository` constructor-arity ripple (T11) into 3 more integration files: confirmed all 5 real construction sites (`work-order.repository.spec.ts`, `work-order-budgets.repository.spec.ts`, `work-order-budgets.query.spec.ts`, `work-order-query.adapter.spec.ts`, `work-order-read-queries.spec.ts`) pass the same 5 args in the same order (`workOrders`, `serviceItems`, `partItems`, `budgets`, `dataSource`).
- `WorkOrderBudgetOrmEntity` registered in `work-orders.module.ts`'s `TypeOrmModule.forFeature` (T11's note) and in `test/support/db.ts`'s entity list (T9's note): confirmed present in both.
- Nothing found half-fixed.

---

## Fix Plans

None. No FAIL, no surviving mutant, no spec-precision gap.

---

## Requirement Traceability Update

| Requirement ID | Previous Status | New Status |
| --- | --- | --- |
| WOB-01 | In Design | Verified |
| WOB-02 | In Design | Verified |
| WOB-03 | In Design | Verified |
| WOB-04 | In Design | Verified |
| WOB-05 | In Design | Verified |

---

## Summary

**Overall**: Ready

**Spec-anchored check**: 27/27 ACs + 8/8 listed Edge Cases matched their spec-defined outcome, evidence-or-zero, all with `file:line` citations
**Sensor**: 3/3 mutations killed
**Gate**: lint clean, build clean, unit 471/471, integration 172/172 (x2), e2e 128/128 (x2) - 771 total, +134 over baseline

**What works**: the full RECEIVED -> IN_DIAGNOSIS -> AWAITING_APPROVAL -> IN_EXECUTION walk through the API alone; round-one regeneration in place after a rejection; the supplementary-round cycle both ways; rule 29 held by construction (no command/aggregate method signature anywhere accepts a price or total); the 404-not-403 ownership rule; frozen prices surviving a real catalog price edit; the DB-enforced one-round-per-number constraint proven against a real concurrent write; the trail's transactional atomicity proven by a forced mid-transaction rollback.

**Issues found**: none blocking. One observation recorded above (trail ordering for same-instant events relies on Postgres's practical tie-behavior rather than a documented `ORDER BY` guarantee) - empirically verified stable, not a demonstrated failure, no lesson recorded.

**Next steps**: none required.
