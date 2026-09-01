# Work Order Part Withdrawal Validation

**Date**: 2026-09-01
**Spec**: `.specs/features/work-order-part-withdrawal/spec.md`
**Diff range**: `639fe7e..HEAD` (`8ffb123`), 25 commits, 54 files
**Verifier**: independent sub-agent (author != verifier), second pass
**Verdict**: FAIL (2 surviving mutants, both newly found in this pass)

This is a rewrite of the first-pass report, carrying its history forward. Round 1 is preserved in
the "Round 1" section below; everything above it is the current state of the tree at `8ffb123`.

**All five of round 1's fix plans hold.** I re-ran the two mutants that survived round 1 and both
are killed by the tests the fix round added, the eight acceptance criteria that had no assertion on
the spec-defined outcome now have one, and the documentation no longer describes the superseded
design. The gate is green at 880 tests.

The FAIL comes from three fresh mutations of my own, run to check that the fix round did not weaken
discrimination elsewhere. Two of them survived the entire 880-test gate. Neither is a regression the
fix round introduced: both holes pre-date it and round 1 simply did not probe those two places. Both
are proven non-equivalent (a throwaway probe fails with the mutation active and passes once it is
reverted), and both sit on an outcome `spec.md` states precisely.

---

## Round 2: what was re-checked

### The five fix plans

| Fix | Claim | Re-derived evidence | Holds? |
| --- | --- | --- | --- |
| Fix 1 | A two-line batch test the inner guard cannot satisfy, killing M3 | `src/modules/work-orders/domain/entities/work-order.spec.ts:1139-1171`, asserting `withdrawnQuantity` on line one is still 0 after the throw at `:1170`. M3 re-injected: killed | Yes |
| Fix 2 | A demand-equals-count fixture, killing M7 | `test/integration/stock-shortages.query.spec.ts:147-159`, `expect(shortages.some(...)).toBe(false)` at `:158` for count 3 against demand 3. M7 re-injected: killed | Yes |
| Fix 3 | The acting user asserted on both movement kinds | `test/integration/inventory-item.repository.spec.ts:465` (`CONSUMPTION`) and `:536` (`RETURN`), both `expect(rows[0].actor_external_id).toBe(actorExternalId)` through a `JOIN users`; plus `withdraw-parts.handler.spec.ts:151` and `return-parts.handler.spec.ts:149` on the dispatched command. Mutation N2 confirms the handler-layer assertion bites | Yes |
| Fix 4 | Route-level tests for the three missing HTTP statuses | `test/e2e/work-order-withdrawals.e2e.spec.ts:433` (404), `:440` and `:441` (422 on each route), over the new `createAwaitingApprovalWorkOrder` fixture at `:231` | Yes |
| Fix 5 | Documentation back in line with the shipped design | `inventory-item.ts:200-205` now names `RestoreStockBatchHandler` and `findPendingConsumptions`; `design.md:190` and `:202` both marked **Superseded during Execute**. A tree-wide grep for "supplied by the caller", "already knows the movement id" and "passes the target back" returns nothing outside this report's own history section | Yes |

### Diff surface of the fix round

`git diff ac810aa..HEAD --stat` touches 12 files. Exactly one is non-test production code:
`src/modules/inventory/domain/entities/inventory-item.ts`, and its change is the JSDoc block on
`restoreUnits` with no line of executable code altered. The other src changes are three `.spec.ts`
files. The rest is `test/`, `design.md`, `tasks.md`, this report and the lessons store. No migration,
no schema change, no handler, no route, no repository. **The fix round changed no behaviour**, which
is what a test-only fix round should look like.

### Spot-check of criteria round 1 already confirmed

Four of the 29, chosen across layers, re-derived independently and all still holding:

| Criterion | `file:line` + assertion | Result |
| --- | --- | --- |
| WOP-01 AC13 / WOP-03 AC8 (trail names the actor) | `test/e2e/work-order-withdrawals.e2e.spec.ts:548-549` `expect(withdrawn?.actorUserId).toBe(mechanic.userId)`, same for `returned` | PASS |
| WOP-02 AC2 (a refused call changes nothing) | `test/e2e/work-order-withdrawals.e2e.spec.ts:363` `expect(item.quantityOnHand).toBe(2)`, `:365` no `CONSUMPTION` on the ledger, `:367` `withdrawnQuantity` still 0 | PASS |
| WOP-02 AC5 (a mid-transaction failure persists neither module) | `test/integration/cross-module-transaction.spec.ts:183-184` | PASS |
| WOP-05 AC3 (withdrawn reads back as the net) | `test/e2e/work-order-withdrawals.e2e.spec.ts:471` `expect(reread.partItems[0].withdrawnQuantity).toBe(1)` after withdrawing 2 and returning 1 | PASS |

---

## Spec-Anchored Acceptance Criteria - current state

### The eight criteria round 1 flagged, re-checked

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| WOP-01 AC2 (the movement carries the acting user) | the user who made the call | `test/integration/inventory-item.repository.spec.ts:465` `expect(rows[0].actor_external_id).toBe(actorExternalId)` on the `CONSUMPTION` row, joined through `users` | PASS |
| WOP-01 AC5 (past planned refuses the whole call and changes nothing) | HTTP 422; every line in the batch untouched | route status `test/e2e/work-order-withdrawals.e2e.spec.ts:324` `.expect(422)`; the multi-line half at `src/modules/work-orders/domain/entities/work-order.spec.ts:1169-1170` - throws, and line one's `withdrawnQuantity` is still 0 | PASS |
| WOP-01 AC6 (an item of another work order refuses with 404) | HTTP 404 | `test/e2e/work-order-withdrawals.e2e.spec.ts:433` `await withdraw(workOrder.number, otherWorkOrder.approvedItemId, 1).expect(404)` - a real item id from a real sibling work order, so the 404 can only come from `WorkOrderItemNotFoundError`, not from an unresolved work order number | PASS |
| WOP-01 AC10 (any state but `IN_EXECUTION` refuses with 422) | HTTP 422 | `test/e2e/work-order-withdrawals.e2e.spec.ts:440` `.expect(422)` against an `AWAITING_APPROVAL` work order. The batch names an item id that exists on no work order, so a missing state guard would answer 404 - the test discriminates the guard rather than resting on it | PASS |
| WOP-03 AC2 (the `RETURN` carries the acting user) | the user who made the call | `test/integration/inventory-item.repository.spec.ts:536` `expect(rows[0].actor_external_id).toBe(actorExternalId)` on the `RETURN` row | PASS |
| WOP-03 AC5 (any state but `IN_EXECUTION` refuses the return with 422) | HTTP 422 | `test/e2e/work-order-withdrawals.e2e.spec.ts:441` `.expect(422)` on the returns route, same fixture and the same discrimination as AC10 | PASS |
| WOP-04 AC1 (lists items whose demand *exceeds* the count) | strictly greater | `test/integration/stock-shortages.query.spec.ts:131-133` for the listed case, and the boundary at `:158` proving an equal-demand item is absent | PASS |
| WOP-04 AC4 (an item whose count *covers* its demand stays off) | absent, equality included | `test/integration/stock-shortages.query.spec.ts:144` (count 5, demand 3) and `:158` (count 3, demand 3) | PASS |

**All eight are closed.** Each now has an assertion whose value is the one `spec.md` names, at the
layer `tasks.md`'s Test Coverage Matrix assigns to it.

### Two criteria this pass downgrades

| Criterion | Spec-defined outcome | What the evidence actually proves | Result |
| --- | --- | --- | --- |
| WOP-03 AC4 (a return below zero withdrawn refuses the whole call and changes nothing) | HTTP 422; nothing changed, for every line in the batch | The single-line case is proven end to end (`test/e2e/work-order-withdrawals.e2e.spec.ts:491` `.expect(422)`, `:494` count still 8, `:498` no `RETURN` on the ledger) and at the aggregate (`work-order.spec.ts` returnParts block, "refuses returning more than was withdrawn ... leaving it unchanged"). **No test covers a multi-line return batch where one line overflows**, so "change nothing" for the covered lines is unproven - see mutation N1 | GAP |
| WOP-04 AC2 (demand is `SUM(planned - withdrawn)` over approved parts of work orders in `IN_EXECUTION`) | that exact difference | Every shortage fixture in the suite leaves `withdrawn_quantity` at 0, where `planned - withdrawn` and `planned` are the same number. `stock-shortages.query.spec.ts:132` `expect(found?.outstandingQuantity).toBe(3)` is planned 3 / withdrawn 0; the e2e at `inventory-items.e2e.spec.ts:410` is planned 5 / withdrawn 0, and its own helper comment says "a shortage by construction, with no withdrawal needed". The one fixture that does set `withdrawn_quantity` (`:191`, planned 3 / withdrawn 3) is excluded by the `WHERE planned_quantity > withdrawn_quantity` filter before the sum is reached. **The `- withdrawn` term has no fixture that can see it** - see mutation N3 | GAP |

Round 1 recorded both of these as PASS. WOP-03 AC4 was graded on the single-line evidence, which is
real but does not reach the multi-line half of the same sentence. WOP-04 AC2 was graded on
`outstandingQuantity).toBe(3)`, an assertion that cannot distinguish the spec's formula from
`SUM(planned)` because the subtrahend is zero. Correcting a round-1 grade is what a second
independent pass is for.

### The other 27

Unchanged from round 1 and re-confirmed by the green gate. The fix round touched no code they cover.
Their evidence is in the Round 1 section below; where the fix commit inserted lines into
`test/e2e/work-order-withdrawals.e2e.spec.ts`, the citations there have shifted by 36 lines from
`:222` onward.

**Status**: 35 of 37 criteria matched the spec-defined outcome. 2 have evidence that does not reach
the outcome the spec names, each one the direct twin of a surviving mutant. No spec-precision gaps:
`spec.md` pins a precise outcome for every criterion in scope.

---

## Discrimination Sensor

Isolated in a temporary `git worktree` at `HEAD` with `node_modules` symlinked. Real-tree
`git status --porcelain` was empty before the sensor and empty after `git worktree remove --force`,
with `HEAD` still at `8ffb123`. No `git stash` at any point.

| # | File:line | Mutation | Suite run | Result |
| --- | --- | --- | --- | --- |
| M3 (re-run) | `work-order.ts:473` | Planned guard loosened by one: `> plannedQuantity.units` becomes `> plannedQuantity.units + 1` | `work-order.spec.ts` + `work-order-part-item.spec.ts` (73 tests) | **Killed.** `work-order.spec.ts:1170` expected 0, got 1 |
| M7 (re-run) | `typeorm-inventory-query.adapter.ts:65` | Shortage threshold `HAVING SUM(...) > ii.quantity_on_hand` becomes `>=` | `stock-shortages.query.spec.ts` | **Killed.** `:158` expected false, got true |
| N1 (new) | `work-order.ts:447` | The mirror of M3 on the return side: `returnParts`' outer guard `withdrawnQuantity - quantity < 0` becomes `< -1` | full `src/modules/work-orders` unit suite (211 tests) | **Survived** |
| N2 (new) | `withdraw-parts.handler.ts:61` | The wrong actor threaded into the cross-module consumption: `command.actorUserId` becomes `workOrder.createdByUserId` | unit + full integration + `work-order-withdrawals.e2e.spec.ts` | **Killed.** `withdraw-parts.handler.spec.ts:151` - Fix 3's own new assertion |
| N3 (new) | `typeorm-inventory-query.adapter.ts:57,65` | WOP-04 AC2's demand formula loses its subtrahend: `SUM(wop.planned_quantity - wop.withdrawn_quantity)` becomes `SUM(wop.planned_quantity)`, in both the projection and the threshold | full unit (533) + full integration (195) + full e2e (152) | **Survived** all 880 |

**Sensor depth**: P0-full for the feature across both passes (7 mutations in round 1, 5 here, 12
distinct faults; this is a data-integrity path).
**Result**: 3 of 5 killed this pass. FAIL.

### N1, in detail

`WorkOrder.returnParts` (`work-order.ts:444-450`) and `WorkOrderPartItem.returnUnits`
(`work-order-part-item.ts:82-88`) enforce the same below-zero rule, exactly the redundant-guard shape
M3 exposed on the withdrawal side. Every existing return test fires a single line, so the inner guard
throws the identical `ReturnExceedsWithdrawnError` whether the outer one is intact or not, and the
`withdrawnQuantity` assertion still reads the unchanged value because there is no earlier line to
have been applied.

**Non-equivalence, proven.** I added a throwaway probe in the scratch worktree: two withdrawn items
(A at 2, B at 1), returning 1 of A and 2 of B in one batch. With N1 active the probe fails
(`expected 1 to be 2` - A was decremented before B threw); with N1 reverted and the probe unchanged,
it passes. Reverted before removing the worktree; the probe is not in the real tree.

The consequence is contained today, because `ReturnPartsHandler` validates before opening a
transaction and discards the aggregate when it throws. It is still WOP-03 AC4's "refuse the whole
call and change nothing" going unproven for the multi-line case. The fix round closed this exact
class of hole on the withdrawal side (Fix 1) and left its mirror open, which is what lesson L-008
already warns about in general terms.

### N3, in detail

`spec.md` WOP-04 AC2 is precise: outstanding demand is "the sum, over the approved planned part items
of work orders in `IN_EXECUTION`, of the planned quantity minus the withdrawn quantity". Dropping the
subtrahend leaves every current fixture green because every one of them has `withdrawn_quantity` at 0
or is filtered out before the sum:

| Fixture | count / planned / withdrawn | True demand | Mutated demand | Listed either way? |
| --- | --- | --- | --- | --- |
| `stock-shortages.query.spec.ts:122` | 1 / 3 / 0 | 3 | 3 | listed, `outstandingQuantity` 3 both ways |
| `:136` | 5 / 3 / 0 | 3 | 3 | absent both ways |
| `:147` (Fix 2's boundary) | 3 / 3 / 0 | 3 | 3 | absent both ways |
| `:191` | 0 / 3 / 3 | 0 | 3 | absent both ways - the `WHERE planned_quantity > withdrawn_quantity` filter drops the row before `HAVING` |
| `inventory-items.e2e.spec.ts:397` | 2 / 5 / 0 | 5 | 5 | listed both ways |

**Non-equivalence, proven.** Probe: count 2, approved round, planned 5, withdrawn 3 on a work order
in `IN_EXECUTION`. True demand is 2, which does not exceed a shelf of 2, so the item must be absent.
With N3 active the probe fails (demand reads 5, the item is listed); with N3 reverted it passes.

This one matters more than N1. The shortage list is the whole point of WOP-04 - the signal the
administration acts on without a mechanic telling them - and with the subtrahend gone it names items
that are in fact covered, which is the false-positive direction that trains people to ignore the
list. A future edit that "simplifies" the SQL would ship silently past all 880 tests.

---

## Gate Check

- **Gate command**: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- **Result**: exit 0. Lint clean, build clean, 533 unit passed (81 files), 195 integration passed (33 files), 152 e2e passed (13 files). **880 total, 0 failed, 0 skipped.**
- **Test count at round 1** (`ac810aa`): 532 / 194 / 150 = 876. **At `8ffb123`**: 533 / 195 / 152 = 880. **Delta: +4**, matching the fix round's own accounting in `tasks.md` (+1 unit for Fix 1, +1 integration for Fix 2, +2 e2e for Fix 4; Fix 3 extended existing assertions rather than adding cases).
- **Test count before the feature** (per `tasks.md` Preconditions): 471 / 172 / 128 = 771. **Feature delta: +109.**
- **Test integrity**: no suite lost a test, and no assertion in the fix-round diff was weakened. Every change in it is an added test or a strengthened assertion.

### The e2e suite is not deterministic

I ran the e2e suite five times in the real tree. Four passed at 152. **One failed**, and it took out
this feature's own spec file:

```
FAIL  test/e2e/work-order-withdrawals.e2e.spec.ts
Error: expected 201 "Created", got 409 "Conflict"
 ❯ registerUser test/support/http.ts:31:6
 ❯ test/e2e/work-order-withdrawals.e2e.spec.ts:26:34
Test Files  1 failed | 12 passed (13)
Tests  133 passed | 19 skipped (152)
```

`registerUser` builds its email from `faker.internet.email()` (`test/support/http.ts:25`) against a
`workshop_test` database that is never truncated between runs, so a collision on the unique email
constraint answers 409. Because it fires in `beforeAll`, all 19 of the file's tests are skipped
rather than failed. Three immediate re-runs came back clean at 152.

This is pre-existing infrastructure entropy, already recorded as **L-004** from
`customer-and-vehicle-registry`, and `tasks.md` T18 notes the same signature. It is **not** a defect
this feature introduced and it does not change the verdict on its own. It is worth recording that the
failure reproduced here at roughly one run in five, and that the file it disables is this feature's
main e2e evidence - `document` is generated by a `uniqueValidCpf()` helper while `email` is not, so
the fix is one line in a shared helper whenever someone picks it up. That belongs to L-004 and to
whoever owns the test-support layer, not to this feature's fix round.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | Pass. The fix round added no production code at all |
| Surgical changes | Pass. One comment, three spec files, three test files, two docs |
| No scope creep | Pass |
| Matches patterns | Pass. The new e2e fixture follows `createInExecutionWorkOrder`'s shape; the new integration case follows its neighbours' |
| Spec-anchored outcome check | Fail. 2 criteria (WOP-03 AC4, WOP-04 AC2) have evidence that does not reach the stated outcome |
| Per-layer Coverage Expectation | Pass. Fix 4 closed the route-level error paths the matrix promised; the two remaining gaps are domain and query-adapter, not route |
| Every test maps to a spec requirement | Pass. Each of the four new tests carries a comment naming the AC or the mutant it exists for |
| Documented guidelines followed | Pass. `tasks.md`'s Test Coverage Matrix and Gate Check Commands; L-002, L-003, L-008, L-009 and L-010 all visibly applied in the fix round |
| `// SPEC_DEVIATION` markers | None in the tree |
| Documentation accuracy | Pass. Fix 5 verified by grep; `design.md` and `inventory-item.ts` both describe the shipped `findPendingConsumptions` design |

---

## Fix Plans (round 3)

Both are test-only, both are one case, and neither touches production behaviour.

### Fix 6: The return batch needs the same multi-line test the withdrawal batch got

- **Priority**: Major
- **Root cause**: `WorkOrder.returnParts` and `WorkOrderPartItem.returnUnits` enforce the same below-zero rule. Every return test fires one line, so the inner guard satisfies the assertion whether or not the outer guard is intact, and mutation N1 survives. This is Fix 1's problem on the other side of the aggregate; Fix 1 solved the instance, not the class.
- **Fix task**: Add a case to `work-order.spec.ts`'s `WorkOrder.returnParts` block, mirroring `:1139-1171`: two withdrawn items, a batch returning a valid quantity from the first and one more than was withdrawn from the second. Assert `ReturnExceedsWithdrawnError`, then assert the first item's `withdrawnQuantity` is unchanged. The existing `withdrawnPart(id, inventoryItemId, withdrawnQuantity)` and `restoreInExecution` helpers already take everything the fixture needs.
- **Done when**: the first item's `withdrawnQuantity` is asserted unchanged after the batch throws, and re-injecting N1 (`< 0` to `< -1` at `work-order.ts:447`) fails the unit suite.

### Fix 7: The shortage query needs a fixture with a partly withdrawn part

- **Priority**: Major
- **Root cause**: every shortage fixture leaves `withdrawn_quantity` at 0, where WOP-04 AC2's `planned - withdrawn` is indistinguishable from `planned`. The one fixture that sets it (`:191`) is fully withdrawn and the `WHERE` filter drops it before the sum. Mutation N3 survives all 880 tests.
- **Fix task**: Add a case to `test/integration/stock-shortages.query.spec.ts`: an item with count 2, one approved planned part of 5 with `withdrawnQuantity: 3` on a work order in `IN_EXECUTION`, asserted absent from the list (true demand 2 does not exceed a shelf of 2). `insertWorkOrderPart` already accepts `withdrawnQuantity` in its overrides. A second assertion on `outstandingQuantity` for a still-short partly-withdrawn item would pin the reported figure as well as the membership, and is worth adding in the same case.
- **Done when**: a fixture with `0 < withdrawn < planned` is asserted, and re-injecting N3 (dropping `- wop.withdrawn_quantity` from `typeorm-inventory-query.adapter.ts:57` and `:65`) fails the integration suite.

### Not a fix task, but worth someone's attention

`test/support/http.ts:25` generates `registerUser`'s email from bare faker against a database that is
never truncated. It cost one e2e run in five during this pass and it disables whole spec files when
it fires. It belongs to L-004 and to the test-support layer, not to this feature.

---

## Requirement Traceability Update

| Requirement | Round 1 | Round 2 |
| --- | --- | --- |
| WOP-01 | Needs Fix (AC2, AC5, AC6, AC10) | Verified |
| WOP-02 | Verified | Verified |
| WOP-03 | Needs Fix (AC2, AC5) | Needs Fix (AC4 multi-line, found this pass) |
| WOP-04 | Needs Fix (AC1, AC4) | Needs Fix (AC2 demand formula, found this pass) |
| WOP-05 | Verified | Verified |

---

## Summary

**Overall**: Not ready. Two acceptance criteria out of 37 have evidence that cannot see the behaviour
they claim to cover, each one confirmed by a surviving, non-equivalent mutant.

**Spec-anchored check**: 35 of 37 matched the spec-defined outcome (up from 29 of 37 at round 1). 2
gaps, both new to this pass. 0 spec-precision gaps.
**Sensor**: 3 of 5 killed this pass (M3 and M7 both now die; N2 dies on Fix 3's own assertion). 12
distinct faults across both passes.
**Gate**: 880 passed, 0 failed, 0 skipped. One of five e2e runs hit the pre-existing L-004 email
collision.

**What the fix round got right**: all five fix plans hold, verified independently rather than taken
on the commit's word. M3 and M7 are dead. The acting user is now asserted on a `CONSUMPTION` row, on
a `RETURN` row, and on both dispatched cross-module commands. The three route-level HTTP statuses are
asserted at the route, over fixtures built so the guard under test is the only thing that can produce
the status. `design.md` and the aggregate comment describe the shipped design. And it did all of that
without changing a line of executable production code.

**What is still open**: the return path has the same redundant-guard hole the withdrawal path had
(N1), and the shortage query's demand formula has never been tested with a part that was partly
withdrawn (N3), which is the arithmetic WOP-04 exists to get right.

**Next steps**: Fixes 6 and 7, one test case each, then re-inject N1 and N3 to confirm both die. This
is fix round 2 of the 3 the skill allows; a third FAIL escalates to the user.

---
---

# Round 1 (historical record)

**Date**: 2026-09-01
**Diff range**: `639fe7e..ac810aa`, 24 commits, 54 files, +5583/-27
**Verdict**: FAIL (2 surviving mutants, 8 acceptance criteria with no evidence at the layer the spec names)

Preserved so the fix round has something to be measured against. Line citations here are as of
`ac810aa`; the fix commit inserted 36 lines into `test/e2e/work-order-withdrawals.e2e.spec.ts` from
`:222` onward, so citations into that file past that point read 36 lines low against the current tree.

## Task completion

All 18 tasks plus the documented T12 correction marked done in `tasks.md`, 147 checked Done-when
boxes, none open. Each task maps to exactly one commit in the range and the subjects match the
`Commit:` lines. T1-T6 domain (movement factories, four errors, two trail events, part-item
arithmetic, both batch validators); T7 stock delta keyed on movement kind; T8 the AD-008
`inTransaction` helper on both repositories; T9 `findAllByIdsForUpdate` with its ordering guarantee;
T10 the shortage SQL; T11-T15 four command handlers plus the shortages query handler; T16-T18 three
routes, wiring, two e2e specs.

## The eight gaps round 1 found

| Criterion | What was missing |
| --- | --- |
| WOP-01 AC2 | The acting user on a `CONSUMPTION` had no assertion anywhere; work order, status and price did |
| WOP-01 AC5 | "Changes nothing" untested for a multi-line batch on the planned guard (mutation M3) |
| WOP-01 AC6 | Domain-level `WorkOrderItemNotFoundError` only; no test asserted HTTP 404 on either route |
| WOP-01 AC10 | Domain-level `WorkOrderStateError` only; no test asserted HTTP 422 on the withdrawals route |
| WOP-03 AC2 | The acting user on a `RETURN` had no assertion anywhere |
| WOP-03 AC5 | Domain-level only; no test asserted HTTP 422 on the returns route |
| WOP-04 AC1 | The `demand == count` boundary untested (mutation M7) |
| WOP-04 AC4 | Same boundary, other direction |

29 of 37 criteria matched the spec-defined outcome; 0 spec-precision gaps. All six edge cases had
direct evidence at the layer `tasks.md` assigns to them.

## Round 1 sensor

| # | File:line | Mutation | Result |
| --- | --- | --- | --- |
| M1 | `typeorm-inventory-item.repository.ts:118-122` | Stock delta drops `RETURN` from the adding branch, restoring the pre-T7 bug | Killed - `inventory-item.repository.spec.ts:403` expected 10, got 4 |
| M2 | `work-order.ts:414` | `assertNoDuplicateLines` removed from `withdrawParts` | Killed - `work-order.spec.ts:1050` |
| M3 | `work-order.ts:473` | Planned guard off-by-one | **Survived** -> Fix 1 |
| M4 | `withdraw-parts.handler.ts:64` | `eventBus.publishAll` removed after the transaction | Killed - `withdraw-parts.handler.spec.ts:161` |
| M5 | `typeorm-inventory-item.repository.ts:96` | `findPendingConsumptions` ordered `ASC` instead of `DESC` | Killed - `:565` |
| M6 | `typeorm-work-order.repository.ts:317` | The work order repository ignores `currentEntityManager()`, violating AD-008 | Killed - `cross-module-transaction.spec.ts:183` |
| M7 | `typeorm-inventory-query.adapter.ts:65` | Shortage threshold `>` becomes `>=` | **Survived** -> Fix 2 |

5 of 7 killed. Gate at round 1: 876 passed, 0 failed, 0 skipped, across two consecutive e2e runs.

## Round 1 fix plans

1. **Fix 1** (Major) - a two-line batch test the inner guard cannot pass, to kill M3.
2. **Fix 2** (Major) - a demand-equals-count fixture, to kill M7.
3. **Fix 3** (Major) - assert the acting user on a `CONSUMPTION` row and a `RETURN` row.
4. **Fix 4** (Minor) - route-level tests for the 404 and the two 422s.
5. **Fix 5** (Minor) - bring `design.md` and `inventory-item.ts`'s comment in line with the shipped T12 correction.

All five were addressed in `8ffb123` and all five are confirmed holding in the round 2 section above.

## The T12 correction (round 1's finding, still accurate)

The original design had work-orders record the movement ids `ConsumeStockBatchHandler` returns and
pass them back on the return call. That cannot survive a reload: `WorkOrder.restore` rebuilds every
part item from `work_order_parts` columns and no column holds a movement id. The shipped shape is
`RestoreStockBatchCommand` carrying `{ inventoryItemId, quantity }` only
(`restore-stock-batch.command.ts:1-11`), with `RestoreStockBatchHandler` resolving the target itself
through `findPendingConsumptions`, drawing newest first and splitting one requested return across as
many consumptions as it takes (`restore-stock-batch.handler.ts:45-71`). The SQL subtracts prior
returns per consumption and drops a drained one
(`typeorm-inventory-item.repository.ts:83-99`). Nothing in the tree constructs a
`RestoreStockBatchCommand` with a caller-supplied `undoesMovementId`. `ConsumeStockBatchHandler`
still returns `ConsumedLineDto[]` with no caller; the fix round recorded the decision to keep it.

---

**Final verdict (round 2, `8ffb123`): FAIL.** Gate green at 880 tests; 35 of 37 acceptance criteria
matched the spec-defined outcome; all five of round 1's fix plans hold. Two surviving mutants remain,
N1 (`work-order.ts:447`, the return batch's outer guard) and N3
(`typeorm-inventory-query.adapter.ts:57,65`, WOP-04 AC2's demand formula), each with a one-case fix
task above. Feature not done.
