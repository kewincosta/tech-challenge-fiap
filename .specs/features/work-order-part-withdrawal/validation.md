# Work Order Part Withdrawal Validation

**Date**: 2026-09-01
**Spec**: `.specs/features/work-order-part-withdrawal/spec.md`
**Diff range**: `639fe7e..HEAD` (`3115a90`), 26 commits, 57 files, +6600/-36
**Verifier**: independent sub-agent (author != verifier), fourth pass
**Verdict**: FAIL (2 surviving mutants, both new to this pass)

Rounds 1, 2 and 3 are preserved below. Everything above them is the state of the tree at `3115a90`.

**Both of round 3's findings are fixed.** I re-injected P1 and P2 myself in a throwaway worktree
and both die on the two assertions the fix round added. Round 3's fix commit again changed no
production code. The gate is green at 883 tests.

The FAIL comes from five fresh mutations of my own, run in four parts of the feature the first
three passes never probed. Three died. Two survived the entire 883-test gate, and a single
throwaway probe kills both, which makes them one gap rather than two: **the shortage query's
aggregation across rows has no fixture with more than one row in a group.** Every shortage fixture
in the suite, integration and e2e alike, gives an inventory item exactly one contributing work
order part, so `SUM` is indistinguishable from `MAX` and `array_agg` from picking the first
element.

---

## Round 4: what was re-checked

### Round 3's two fix plans

| Fix | Claim | Re-derived evidence | Holds? |
| --- | --- | --- | --- |
| Fix 8 (P1) | A listed, partly withdrawn fixture asserting the projected figure | `test/integration/stock-shortages.query.spec.ts:150-164`: count 1, planned 5, withdrawn 3, `expect(found?.outstandingQuantity).toBe(2)` at `:163`. P1 re-injected (drop `- wop.withdrawn_quantity` from `typeorm-inventory-query.adapter.ts:57` alone, `:65` intact): **killed**, `expected 5 to be 2` at `:163` | Yes |
| Fix 9 (P2) | Each `RETURN` in a split asserted against its own consumption | `restore-stock-batch.handler.spec.ts:122-123`: `expect(fromNewest?.undoesMovementId).toBe(newestConsumptionId)` and `expect(fromOldest?.undoesMovementId).toBe(oldestConsumptionId)`. P2 re-injected (`consumption.movementId` to `pending[0].movementId` at `restore-stock-batch.handler.ts:59`): **killed**, `expected '...0002' to be '...0001'` at `:123` | Yes |

The `found?.outstandingQuantity` form in Fix 8 also carries the membership assertion: an absent row
makes the expression `undefined`, which fails against 2. One assertion covers both halves.

### Diff surface of round 3's fix

`git diff b85c999..HEAD --stat` touches 6 files: two test files
(`restore-stock-batch.handler.spec.ts` +11/-2, `stock-shortages.query.spec.ts` +16) and four
documents (`tasks.md`, `validation.md`, `LESSONS.md`, `lessons.json`). No production file.
Across all three fix rounds together (`ac810aa..HEAD`), the only non-test source change is the
JSDoc block on `inventory-item.ts:200-205`, with no executable line altered. **The production code
under test has been unchanged since `ac810aa`**, and every mutation across four passes confirms it
behaves as the spec describes. What the four passes have been correcting is the tests' ability to
see that.

---

## Spec-anchored acceptance criteria: full fresh pass over all 37

Re-derived from `spec.md` against the current tree, not carried over from earlier rounds.

### WOP-01: the mechanic takes planned parts off the shelf (13)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 count drops, withdrawn rises, one `CONSUMPTION` per part | shelf down by exactly the withdrawn quantity | `test/e2e/work-order-withdrawals.e2e.spec.ts:286` `expect(body.partItems[0].withdrawnQuantity).toBe(3)`, `:289` `expect(item.quantityOnHand).toBe(7)` from 10; one row at `test/integration/inventory-item.repository.spec.ts:461` `expect(rows).toHaveLength(1)` | PASS |
| AC2 movement carries work order, actor, `PENDING`, catalog price | all four fields | `inventory-item.repository.spec.ts:462` `PENDING`, `:463` `3000`, `:464` the work order external id, `:465` the actor external id, all read back through a real join | PASS |
| AC3 several parts in one call, one movement each | every line registered | `consume-stock-batch.handler.spec.ts:71-77`: two lines, `results` length 2, `new Set(...).size` 2 distinct movement ids, counts 5 to 3 and 5 to 4 | PASS |
| AC4 accumulates across calls up to planned | the running total | `work-order-part-item.spec.ts:152` `expect(item.withdrawnQuantity).toBe(2)` after two separate withdrawals, `:153` outstanding 1 | PASS |
| AC5 past planned refuses the whole call, changes nothing | HTTP 422, every line untouched | route `e2e:324` `.expect(422)`; multi-line `work-order.spec.ts:1170` first line's `withdrawnQuantity` still 0 after the throw | PASS |
| AC6 an item of another work order | HTTP 404 | `e2e:433` `await withdraw(workOrder.number, otherWorkOrder.approvedItemId, 1).expect(404)` | PASS |
| AC7 no round, or a round not `APPROVED` | HTTP 422 | `e2e:344` `.expect(422)` on a draft line while `:350` `.expect(200)` on the approved one; `work-order.spec.ts:1077` and `:1092` `PartNotWithdrawableError` | PASS |
| AC8 the same item twice in one call | HTTP 422 | `e2e:515` `.expect(422)`; `work-order.spec.ts:1041` `DuplicateBatchLineError` | PASS |
| AC9 zero or negative quantity | HTTP 400 | `e2e:309` `.expect(400)` for 0 and `:314` for -1 | PASS |
| AC10 any state but `IN_EXECUTION` | HTTP 422 | `e2e:440` `.expect(422)` against an `AWAITING_APPROVAL` work order, over an item id that exists nowhere, so a missing guard would answer 404 | PASS |
| AC11 actor lacks `work-orders:execute` | HTTP 403 | `e2e:398` `.expect(403)`, `:399` `code: 'AUTH_FORBIDDEN'` | PASS |
| AC12 no work order with that number | HTTP 404 | `e2e:421` and `:426`, both routes | PASS |
| AC13 trail entry naming the acting user | a `Part Withdrawn` entry, the actor named | `e2e:548` `expect(withdrawn?.actorUserId).toBe(mechanic.userId)`; exactly one per batch at `work-order.spec.ts:1201` | PASS |

### WOP-02: a short count refuses everything and moves nothing (6)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 insufficient stock refuses the whole call | HTTP 422 and a rule-violation error naming insufficient stock | `e2e:360` `.expect(422)`; the error's identity at `consume-stock-batch.handler.spec.ts:113` and `withdraw-parts.handler.spec.ts:171` (`InsufficientStockError`), its `RuleViolation` kind at `inventory-item.spec.ts:227`, its `INVENTORY_INSUFFICIENT_STOCK` code over HTTP at `test/e2e/inventory-items.e2e.spec.ts:177` | PASS |
| AC2 a refused call leaves count, withdrawn and ledger as they were | all three unchanged | `e2e:363` count still 2, `:365` no `CONSUMPTION` on the ledger, `:367` `withdrawnQuantity` still 0 | PASS |
| AC3 the count never goes below zero, through any command | never negative | `inventory-item.spec.ts:300-302` (consume refuses, count and movements unchanged), `:159` (adjustDown), and the real race at `inventory-item-batch-lock.spec.ts:202-209`: one fulfilled, one rejected with `InsufficientStockError`, final count 0 | PASS |
| AC4 one short part refuses the covered ones too | the whole call | `consume-stock-batch.handler.spec.ts:113` (line A covered, line B short, whole command rejects) and `:131` saves nothing | PASS |
| AC5 a failure after one module applied persists neither | both aggregates as they were | `cross-module-transaction.spec.ts:183` `expect(finalWorkOrder?.assignedMechanicUserId).toBeNull()` and `:184` `expect(finalItem?.quantityOnHand.units).toBe(0)` after a forced mid-transaction failure | PASS |
| AC6 a refused withdrawal leaves the work order in `IN_EXECUTION` | the state survives, so a retry works | `e2e:528` `.expect(422)`, then `:533` replenish and `:534` the same withdrawal `.expect(200)`, which the state guard would refuse with 422 if the refusal had moved the work order | PASS |

### WOP-03: a part that turned out unnecessary goes back (8)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 count up, withdrawn down by the returned quantity | both by exactly that amount | `e2e:469` `expect(item.quantityOnHand).toBe(9)` and `:471` `withdrawnQuantity` 1 after withdrawing 2 and returning 1 | PASS |
| AC2 one `RETURN` per consumption drawn from, each naming its consumption, the actor and the quantity | every pointer true | `restore-stock-batch.handler.spec.ts:114` two returns, `:116-121` quantities 3 and 1, `:122` and `:123` each pointer against its own consumption's id; actor at `inventory-item.repository.spec.ts:536`; quantity over HTTP at `e2e:483` | PASS (closed this pass) |
| AC3 never edits or deletes the original `CONSUMPTION` | the consumption stays on the ledger | `inventory-item.spec.ts:331` block, `restore-stock-batch.handler.spec.ts:126` block, `e2e:481` the `CONSUMPTION` still `PENDING` with quantity 2 after a partial return | PASS |
| AC4 a return below zero refuses the whole call and changes nothing | HTTP 422, every line untouched | `e2e:491` `.expect(422)`, `:494` count still 8, `:496` withdrawn still 2, `:498` no `RETURN`; multi-line at `work-order.spec.ts:1352` | PASS |
| AC5 any state but `IN_EXECUTION` | HTTP 422 | `e2e:441` `.expect(422)` on the returns route | PASS |
| AC6 a part never withdrawn on that work order | HTTP 422 | `work-order.spec.ts:1358` `ReturnExceedsWithdrawnError`; over HTTP at `e2e:491` | PASS |
| AC7 actor lacks `work-orders:execute` | HTTP 403 | `e2e:409` `.expect(403)`, `:410` `code: 'AUTH_FORBIDDEN'` | PASS |
| AC8 trail entry naming the acting user | a `Part Returned` entry, the actor named | `e2e:549` `expect(returned?.actorUserId).toBe(mechanic.userId)`; exactly one per batch at `work-order.spec.ts:1383` | PASS |

### WOP-04: the administration sees what is blocking the shop (7)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 lists every item whose demand exceeds the count | strictly greater | `stock-shortages.query.spec.ts:131-133` for the listed case, boundary at `:188` | PASS |
| AC2 demand is the **sum, over the approved planned part items of work orders in `IN_EXECUTION`**, of planned minus withdrawn | that exact aggregate | The per-row difference is now proven in both copies of the formula: `:147` (threshold) and `:163` (projection). **The sum across rows is not.** Every fixture in the file, and the e2e helper `createShortage` (`test/e2e/inventory-items.e2e.spec.ts:344`), gives each inventory item exactly one work order part, so a single-row group makes `SUM` equal to `MAX`, `MIN` or `AVG`. See mutation Q5 | GAP |
| AC3 names the work orders waiting on it | every one of them | `:133` `expect(found?.workOrderNumbers).toEqual([workOrder.number])` and `test/e2e/inventory-items.e2e.spec.ts:411` `toContain(workOrderNumber)`, both single-element arrays over fixtures with exactly one work order. **No fixture has two work orders waiting on one item**, so `array_agg` never aggregates. See mutation Q4 | GAP |
| AC4 an item whose count covers its demand stays off the list | absent, equality included | `:174` (count 5, demand 3) and `:188` (count 3, demand 3) | PASS |
| AC5 ignores demand from any state but `IN_EXECUTION` | excluded | `:199` for `AWAITING_APPROVAL`; the rejected round and the draft item at `:217-218` | PASS |
| AC6 nothing short returns an empty list | a list, never an error | `:246` `expect(Array.isArray(shortages)).toBe(true)`; over HTTP at `test/e2e/inventory-items.e2e.spec.ts:449` | PASS |
| AC7 actor lacks `inventory:read` | HTTP 403 | `test/e2e/inventory-items.e2e.spec.ts:437` `.expect(403)`, `:438` `code: 'AUTH_FORBIDDEN'` | PASS |

### WOP-05: planned against withdrawn reads back (3)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 the work order returns planned and withdrawn per part | both numbers | `e2e:285` `plannedQuantity` 5 and `:286` `withdrawnQuantity` 3 on the response body | PASS |
| AC2 the movement history carries every `CONSUMPTION` and `RETURN`, each naming its work order | both kinds, each with the work order | `e2e:481` and `:483` both `toMatchObject({ ..., workOrderId: workOrder.id })`; the full sequence at `:459` `['CONSUMPTION', 'RETURN', 'CONSUMPTION']` | PASS |
| AC3 the withdrawn quantity reads back as the net | withdrawals minus returns | `e2e:471` `withdrawnQuantity` 1 after withdrawing 2 and returning 1; `work-order-part-item.spec.ts:215` a full round trip ends at 0 | PASS |

**Status**: 35 of 37 criteria matched the spec-defined outcome. The 2 gaps are both in WOP-04 and
both fall to the same missing fixture. No spec-precision gaps: `spec.md` pins a precise outcome for
every criterion in scope, AC2's "sum, over ... work orders" and AC3's plural "work orders"
included.

Every criterion the three earlier rounds closed is re-derived above and still holds. Nothing read
as stale: the citations shifted by round 3's insertions (+16 lines in `stock-shortages.query.spec.ts`
from `:150`, +9 net in `restore-stock-batch.handler.spec.ts` from `:114`) and are given here against
the current tree.

---

## Discrimination Sensor

Isolated in a temporary `git worktree` at `HEAD` with `node_modules` symlinked and `.env`/`.env.test`
copied in. Real-tree `git status --porcelain` was empty before the sensor and empty after
`git worktree remove --force`, with `HEAD` still at `3115a90` and no worktree registered. No
`git stash` at any point.

| # | File:line | Mutation | Suite run | Result |
| --- | --- | --- | --- | --- |
| P1 (re-run) | `typeorm-inventory-query.adapter.ts:57` | The projection alone loses the subtrahend, `HAVING` at `:65` intact | `stock-shortages.query.spec.ts` | **Killed.** `:163` expected 2, got 5 |
| P2 (re-run) | `restore-stock-batch.handler.ts:59` | Every `RETURN` names `pending[0].movementId` | `restore-stock-batch.handler.spec.ts` | **Killed.** `:123` expected `...0001`, got `...0002` |
| Q1 (new) | `typeorm-inventory-query.adapter.ts:61` | The budget JOIN stops excluding non-`APPROVED` rounds: `AND wob.status = 'APPROVED'` dropped | integration (197) | **Killed.** `stock-shortages.query.spec.ts:217` expected false, got true |
| Q2 (new) | `work-order.ts:456` | `returnParts` stops recording the `PartReturned` trail event | full unit (534) | **Killed.** `work-order.spec.ts:1383` expected length 1, got 0 |
| Q3 (new) | `withdraw-parts.request.dto.ts:12` | The batch line DTO drops `@IsPositive()` on `quantity` | `work-order-withdrawals.e2e.spec.ts` | **Killed.** `:314` expected 400, got 500 |
| Q4 (new) | `typeorm-inventory-query.adapter.ts:58` | The row names only its first work order: `array_agg(DISTINCT wo.number)` becomes `(array_agg(DISTINCT wo.number))[1:1]` | full unit (534) + full integration (197) + full e2e (152) | **Survived** all 883 |
| Q5 (new) | `typeorm-inventory-query.adapter.ts:57,65` | The cross-row aggregate becomes a per-row maximum: `SUM(...)` becomes `MAX(...)` in both the projection and the threshold | full unit (534) + full integration (197) + full e2e (152) | **Survived** all 883 |

**Sensor depth**: P0-full across the four passes: 7 mutations in round 1, 5 in round 2, 6 in round 3,
7 here, 21 distinct faults on a data-integrity path.
**Result**: 5 of 7 killed this pass. FAIL.

### Q4 and Q5: one gap, not two

Both live in `SELECT_SHORTAGES` and both survive for the same reason. The query groups
`work_order_parts` rows by inventory item and then aggregates twice, once with `SUM` for the
demand figure and once with `array_agg` for the work order names. **Every fixture in the suite puts
exactly one row in each group**, and an aggregate over one row returns that row whatever the
aggregate is.

| Fixture | Work orders demanding the item | What the aggregation has to do |
| --- | --- | --- |
| `stock-shortages.query.spec.ts:122`, `:136`, `:150`, `:166`, `:177`, `:191`, `:221`, `:238` | one each | nothing: one row per group |
| `:202` | one per item, two items | nothing: one row per group |
| `test/e2e/inventory-items.e2e.spec.ts:396`, `:414` (via `createShortage` at `:344`) | one, over a freshly created item | nothing: one row per group |

**Non-equivalence, proven.** One probe in the scratch worktree covers both: an inventory item with
3 on hand, and two work orders in `IN_EXECUTION`, each carrying an `APPROVED` round that plans 2 of
it. True demand is 4, which exceeds the shelf of 3, so the item must be listed
with `outstandingQuantity` 4 and both work order numbers.

- With **Q5** active the probe fails with `expected undefined to be defined`: demand reads 2, which
  does not exceed 3, so the item never appears at all.
- With **Q4** active it fails with `expected [ 'II3RU3-2026' ] to deeply equal [ 'II3RU3-2026', 'SYA6WW-2026' ]`.
- With both reverted and the probe unchanged, it passes.

Reverted before removing the worktree; the probe is not in the real tree.

The consequence is the read model's whole purpose. `SUM` is what makes the list an aggregate view:
three work orders each waiting on 2 units of an item with 3 on the shelf are collectively short,
and only the sum can say so. Under Q5 that item never appears, which is the false-negative
direction, the one that leaves the administration unaware of a part the shop cannot cover.
Under Q4 the item appears with only one of the work orders named, so whoever reads it
underestimates who is blocked. `spec.md` states both plainly: AC2's demand is "the sum, over the
approved planned part items of work orders in `IN_EXECUTION`", and AC3 says the system "SHALL name
the work orders waiting on it".

### Where the five fresh mutations went

Deliberately outside the two files the previous two rounds worked in. Q2 probed the trail-event
recording, Q3 the DTO validation layer, Q1 the query adapter's JOIN conditions, and only Q4 and Q5
returned to the shortage SQL, on a different behaviour (aggregation arity) from the per-row formula
rounds 2 and 3 covered. Three of the four areas came back clean on the first probe.

---

## Gate Check

- **Gate command**: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- **Result**: lint clean, build clean, 534 unit passed (81 files), 197 integration passed (33 files), 152 e2e passed (13 files). **883 total, 0 failed, 0 skipped** on the clean runs.
- **Test count at round 3** (`b85c999`): 534 / 196 / 152 = 882. **At `3115a90`**: 534 / 197 / 152 = 883. **Delta: +1**, matching `tasks.md`'s round 3 accounting exactly (unit unchanged because Fix 9 extended an existing case, +1 integration for Fix 8).
- **Test count before the feature** (per `tasks.md` Preconditions): 471 / 172 / 128 = 771. **Feature delta: +112.**
- **Test integrity**: no suite lost a test. Round 3's diff replaces one assertion in `restore-stock-batch.handler.spec.ts` (`returns?.map(...).sort()` `[1, 3]`) with four lines that assert the same two quantities and each pointer, so it is strictly stronger, not weakened.

### The e2e suite is still not deterministic, and the cause is unchanged

Five `npm run test:e2e` runs in the real tree: runs 1 and 4 passed at 152; runs 2, 3 and 5 each
failed with exactly one test, all three with the identical signature:

```
Error: expected 201 "Created", got 409 "Conflict"
 ❯ registerUser test/support/http.ts:31:6
```

`test/support/http.ts:25` builds the email from a bare `faker.internet.email()` against a
`workshop_test` database that is never truncated, while the `document` on the very next line goes
through `uniqueValidCpf()`. This is **L-004**, already recorded from `customer-and-vehicle-registry`.
The three failures landed in `role-escalation.e2e.spec.ts:47` (run 2),
`work-order-withdrawals.e2e.spec.ts:354` (run 3) and `work-orders.e2e.spec.ts` (run 5). Run 3's
landed inside this feature's own spec file, but in the `registerCustomer` fixture setup, never in
an assertion about withdrawal behaviour: **no e2e failure in any of the five runs came from this
feature's code or its assertions.**

The board-listing timeout round 3 recorded did not reproduce. `should list the board and filter by
status` ran in 2.5s to 2.6s in every run here, well inside the 30s limit, so whatever had
accumulated in the test database has since been cleared. `tasks.md`'s round 3 note and this
feature's handoff already carry both items.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | Pass. Round 3's fix round added no production code |
| Surgical changes | Pass. Two test files and four documents |
| No scope creep | Pass |
| Matches patterns | Pass. The new shortage case sits beside its siblings with the same fixture shape; the pointer assertions extend the existing split case rather than duplicating it |
| Spec-anchored outcome check | Fail. 2 criteria (WOP-04 AC2, AC3) have evidence that stops short of the outcome the spec names |
| Per-layer Coverage Expectation | Pass at the route, domain and handler layers. Both open gaps are in one query adapter's aggregation |
| Every test maps to a spec requirement | Pass. Both of round 3's changes carry a comment naming the AC and the mutant |
| Documented guidelines followed | Pass. `tasks.md`'s Test Coverage Matrix and Gate Check Commands; L-012 and L-013 visibly applied in round 3's fix |
| `// SPEC_DEVIATION` markers | None in the tree |
| Documentation accuracy | Pass. `tasks.md`'s round 3 subsection describes exactly what the commit contains, including the 196 to 197 integration delta and the unchanged unit count |

---

## Edge Cases

All six re-confirmed with direct evidence, unchanged from the earlier rounds:

- [x] Empty batch answers 400: `e2e:299`
- [x] Two mechanics racing for the last unit: one succeeds, one gets `InsufficientStockError`, count stays 0, `inventory-item-batch-lock.spec.ts:202-209`
- [x] Withdrawn, returned in full, withdrawn again: count 7, withdrawn 3, three movements, `e2e:454-459`
- [x] Catalog price moves between approval and withdrawal: movement 3200, budgeted price 2500, `e2e:386-388`
- [x] An item on an approved round and again on a pending one: the approved line succeeds, the pending line is refused, `e2e:344` and `:350`
- [x] A part on a rejected round stays off the shortage list: `stock-shortages.query.spec.ts:217`

The two open gaps sit on acceptance criteria, not on this list.

---

## Fix Plans (round 5)

One fix, test-only, one case, killing both surviving mutants.

### Fix 10: Give the shortage query a fixture with two work orders waiting on one item

- **Priority**: Major
- **Root cause**: `SELECT_SHORTAGES` aggregates `work_order_parts` rows per inventory item with `SUM` for the figure and `array_agg` for the names, and every fixture in the suite puts exactly one row in each group. An aggregate over a single row returns that row whatever the aggregate is, so `SUM` reads the same as `MAX` (mutation Q5) and `array_agg` the same as picking the first element (mutation Q4). Both survive all 883 tests.
- **Fix task**: Add one case to `test/integration/stock-shortages.query.spec.ts`: an inventory item with `quantityOnHand` 3, and two work orders in `IN_EXECUTION`, each with an `APPROVED` round planning 2 of that item. True demand is 4, which exceeds the shelf of 3, so the row is listed. Assert `found?.outstandingQuantity` is 4 and that `workOrderNumbers` holds both numbers (sort both sides, since `array_agg` ordering is not guaranteed). `insertInventoryItem`, `insertWorkOrder`, `insertBudget` and `insertWorkOrderPart` already take everything the fixture needs, and `insertWorkOrder` mints its own customer and vehicle per call.
- **Done when**: one fixture has two contributing rows in one group, with both the summed figure and the full name list asserted; re-injecting Q5 (`SUM` to `MAX` at `typeorm-inventory-query.adapter.ts:57` and `:65`) and Q4 (`array_agg(DISTINCT wo.number)` to `(array_agg(DISTINCT wo.number))[1:1]` at `:58`) each fails the integration suite.

### Not a fix task

`test/support/http.ts:25` generates `registerUser`'s email from bare faker against a database that
is never truncated. It cost three e2e runs in five during this pass, one of them inside this
feature's spec file. It belongs to L-004 and to the test-support layer.

---

## Requirement Traceability Update

| Requirement | Round 1 | Round 2 | Round 3 | Round 4 |
| --- | --- | --- | --- | --- |
| WOP-01 | Needs Fix (AC2, AC5, AC6, AC10) | Verified | Verified | Verified |
| WOP-02 | Verified | Verified | Verified | Verified |
| WOP-03 | Needs Fix (AC2, AC5) | Needs Fix (AC4) | Needs Fix (AC2) | Verified |
| WOP-04 | Needs Fix (AC1, AC4) | Needs Fix (AC2) | Needs Fix (AC2) | Needs Fix (AC2 sum across rows, AC3 plural names) |
| WOP-05 | Verified | Verified | Verified | Verified |

---

## Summary

**Overall**: Not ready, by one test case. 35 of 37 acceptance criteria match the spec-defined
outcome. The two that do not are both in WOP-04 and both close with the same fixture.

**Spec-anchored check**: 35 of 37. WOP-03 AC2 and the projection half of WOP-04 AC2 both closed
this pass. WOP-04 AC2's aggregation half and AC3's plural naming are newly graded as gaps, on a
fresh read of all 37 rather than a carry-over. 0 spec-precision gaps.
**Sensor**: 5 of 7 killed this pass. P1 and P2 both die on the assertions round 3 added. 21
distinct faults across four passes.
**Gate**: 883 passed, 0 failed, 0 skipped on a clean run; 3 of 5 e2e runs hit the pre-existing
L-004 collision, none of them in an assertion belonging to this feature.

**What round 3's fix round got right**: both fix plans hold, verified independently rather than
taken on the commit's word. P1 and P2 are dead. The shortage projection's copy of the demand
formula is now read on a listed row, and each `RETURN` in a split names its own consumption. It did
that with one added case and four assertion lines, and no production code.

**What is still open**: the shortage query's two aggregates have never had a group with more than
one row in it. `SUM` is doing addition nowhere in the suite, and `array_agg` is aggregating nowhere.
This is the same shape as every gap the earlier rounds closed, a fixture that cannot distinguish
the implementation from a simpler wrong one, in a place none of them looked.

**Worth weighing in the decision**: the production code has not changed since `ac810aa`, three fix
rounds ago. Twenty-one mutations across four passes have found no defect in it. Every finding in
all four rounds has been about what the tests can see, and each round's fix has been one or two
test cases. Fix 10 is one case, and it kills both survivors.

**This pass is the fix loop's bound.** `validate.md` allows a maximum of 3 fix to re-verify
iterations, all three are spent, so the next step belongs to the user rather than to another
automatic fix round.

---
---

# Round 3 (historical record)

**Date**: 2026-09-01
**Spec**: `.specs/features/work-order-part-withdrawal/spec.md`
**Diff range**: `639fe7e..HEAD` (`b85c999`), 25 commits, 57 files, +6237/-36
**Verifier**: independent sub-agent (author != verifier), third pass
**Verdict**: FAIL (2 surviving mutants, both new to this pass)

Rounds 1 and 2 are preserved below. Everything above them is the state of the tree at `b85c999`.

**Both of round 2's findings are fixed.** I re-injected N1 and N3 myself in a throwaway worktree and
both die on the two cases the fix round added. The gate is green at 882 tests, and the fix round
again changed no production code.

The FAIL comes from four fresh mutations of my own, run in code the first two passes never probed.
Two survived all 882 tests. Both are proven non-equivalent (a throwaway probe fails with the
mutation active and passes once it is reverted), and both sit on an outcome `spec.md` states
precisely. One of them, P1, is the half of round 2's own Fix 7 plan that the fix round did not
carry out: that plan named a second assertion on `outstandingQuantity` for a partly withdrawn item
and marked it "worth adding in the same case", and the case shipped without it.

---

## Round 3: what was re-checked

### Round 2's two fix plans

| Fix | Claim | Re-derived evidence | Holds? |
| --- | --- | --- | --- |
| Fix 6 (N1) | A multi-line return batch the inner guard cannot satisfy, killing N1 | `src/modules/work-orders/domain/entities/work-order.spec.ts:1333-1353`: item A withdrawn 2, item B withdrawn 1, a batch returning 1 of A and 2 of B, `.toThrow(ReturnExceedsWithdrawnError)` at `:1351` and `expect(...withdrawnQuantity).toBe(2)` on A at `:1352`. N1 re-injected (`work-order.ts:447`, `< 0` to `< -1`): **killed**, `expected 1 to be 2` at `:1352` | Yes |
| Fix 7 (N3) | A partly withdrawn fixture, killing N3 | `test/integration/stock-shortages.query.spec.ts:136-148`: count 2, planned 5, withdrawn 3, `expect(shortages.some(...)).toBe(false)` at `:147`. N3 re-injected (drop `- wop.withdrawn_quantity` from `typeorm-inventory-query.adapter.ts:57` and `:65`): **killed**, `expected true to be false` at `:147` | Yes for the mutation it was written against; the criterion behind it is still half proven, see P1 |

### Diff surface of round 2's fix

`git diff 8ffb123..HEAD --stat` touches 6 files: two test files (`work-order.spec.ts` +22,
`stock-shortages.query.spec.ts` +14) and four documents (`tasks.md`, `validation.md`, `LESSONS.md`,
`lessons.json`). No production file at all, so the 882-test gate covers the same behaviour it
covered at `8ffb123` plus two cases. Both new cases carry a comment naming the mutant they exist
for, and both sit in the file and block round 2's fix plan named.

---

## Spec-Anchored Acceptance Criteria - current state

### The two criteria round 2 flagged

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| WOP-03 AC4 (a return below zero withdrawn refuses the whole call and changes nothing) | HTTP 422; nothing changed, for every line in the batch | The multi-line half is now direct: `work-order.spec.ts:1352` `expect(workOrder.partItems.find((item) => item.id.equals(ITEM_A_ID))?.withdrawnQuantity).toBe(2)` after the batch throws. The single-line half stays where it was, `test/e2e/work-order-withdrawals.e2e.spec.ts:491` `.expect(422)`, `:494` count still 8, `:498` no `RETURN` on the ledger | PASS |
| WOP-04 AC2 (demand is `SUM(planned - withdrawn)` over approved parts of work orders in `IN_EXECUTION`) | that exact difference, both as the threshold and as the figure the read model reports | `stock-shortages.query.spec.ts:147` proves the `HAVING` clause subtracts the withdrawn quantity: with count 2 / planned 5 / withdrawn 3 the item is absent, which `SUM(planned)` alone cannot produce. The reported `outstandingQuantity` is a separate copy of the same expression at `:57`, and it is asserted in exactly two places, `stock-shortages.query.spec.ts:132` (planned 3 / withdrawn 0) and `test/e2e/inventory-items.e2e.spec.ts:410` (planned 5 / withdrawn 0). **No listed item in the suite has a non-zero withdrawn quantity**, so the projection's copy of the formula is still unproven, see mutation P1 | GAP |

### One criterion this pass downgrades

| Criterion | Spec-defined outcome | What the evidence actually proves | Result |
| --- | --- | --- | --- |
| WOP-03 AC2 (one `RETURN` per consumption drawn from, each naming the consumption it undoes, the acting user and the returned quantity) | every pointer true, per the spec's Assumptions row: the return is split "to keep every pointer true" | Count and quantities of the split are proven: `restore-stock-batch.handler.spec.ts:114` `expect(returns).toHaveLength(2)` and `:116` `[1, 3]` for a return of 4 across consumptions of 2 and 3. The acting user is proven at `test/integration/inventory-item.repository.spec.ts:536`. **`undoesMovementId` is asserted only where a single consumption exists** (`test/e2e/work-order-withdrawals.e2e.spec.ts:484`, `inventory-item.spec.ts:327`, `inventory-item.repository.spec.ts:468`), a shape in which every candidate target is the same movement and any resolution logic passes. The split case, the only one where the pointer can be wrong, asserts everything about the two returns except which consumption each undoes, see mutation P2 | GAP |

Rounds 1 and 2 both recorded WOP-03 AC2 as PASS. Round 1 graded it on the movement kind and
quantity, round 2 on the acting user assertion Fix 3 added. Neither reached the pointer, because
the assertion that exists for it sits in a fixture with one possible answer.

### The other 34

Unchanged from round 2 and re-confirmed by the green gate. Round 2's fix commit touched no
production code, and its two added test cases inserted 22 lines into `work-order.spec.ts` from
`:1333` and 14 lines into `stock-shortages.query.spec.ts` from `:136`, so citations into those two
files past those points read low against the current tree by that much.

**Status**: 35 of 37 criteria matched the spec-defined outcome. 2 have evidence that stops short of
the outcome the spec names, each one the twin of a surviving mutant. No spec-precision gaps:
`spec.md` pins a precise outcome for every criterion in scope.

---

## Discrimination Sensor

Isolated in a temporary `git worktree` at `HEAD` with `node_modules` symlinked and `.env`/`.env.test`
copied in. Real-tree `git status --porcelain` was empty before the sensor and empty after
`git worktree remove --force`, with `HEAD` still at `b85c999` and no worktree left registered. No
`git stash` at any point.

| # | File:line | Mutation | Suite run | Result |
| --- | --- | --- | --- | --- |
| N1 (re-run) | `work-order.ts:447` | `returnParts`' outer below-zero guard `withdrawnQuantity - quantity < 0` becomes `< -1` | `src/modules/work-orders` unit (212 tests) | **Killed.** `work-order.spec.ts:1352` expected 2, got 1 |
| N3 (re-run) | `typeorm-inventory-query.adapter.ts:57,65` | `SUM(planned_quantity - withdrawn_quantity)` becomes `SUM(planned_quantity)` in both the projection and the threshold | `stock-shortages.query.spec.ts` | **Killed.** `:147` expected false, got true |
| P1 (new) | `typeorm-inventory-query.adapter.ts:57` | The projection alone loses the subtrahend; the `HAVING` clause at `:65` keeps it | full unit (534) + full integration (196) + full e2e (152) | **Survived** all 882 |
| P2 (new) | `restore-stock-batch.handler.ts:59` | Every `RETURN` names `pending[0].movementId` instead of `consumption.movementId`, so a split return points every movement at the newest consumption | full unit (534) + full integration (196) + full e2e (152) | **Survived** all 882 |
| P3 (new) | `work-order.ts:430` | The line handed to `ConsumeStockBatchCommand` carries `item.plannedQuantity.units` instead of the withdrawn quantity, so the shelf drops by what was planned | full unit (534) | **Killed.** 3 tests: `work-order.spec.ts` `WorkOrder.withdrawParts` twice, `withdraw-parts.handler.spec.ts` once |
| P4 (new) | `work-order.ts:459` | The return-side mirror of P3 on `RestoreStockBatchCommand` | full unit (534) | **Killed.** 2 tests: `work-order.spec.ts` `WorkOrder.returnParts`, `return-parts.handler.spec.ts` |

**Sensor depth**: P0-full across the three passes: 7 mutations in round 1, 5 in round 2, 6 here, 16
distinct faults on a data-integrity path.
**Result**: 4 of 6 killed this pass. FAIL.

### P1, in detail

`SELECT_SHORTAGES` writes WOP-04 AC2's formula twice: once at `:57` to fill the `outstanding`
column the API returns as `outstandingQuantity`, once at `:65` to decide which items the list
contains. Round 2's new fixture asserts membership only (`expect(shortages.some(...)).toBe(false)`),
and membership is decided by `:65`. The projection at `:57` is read by two assertions, both over
fixtures with `withdrawn_quantity` at 0:

| Fixture | count / planned / withdrawn | Asserted | Sees the subtrahend? |
| --- | --- | --- | --- |
| `stock-shortages.query.spec.ts:122` | 1 / 3 / 0 | `outstandingQuantity` is 3 (`:132`) | No, `3 - 0 = 3` |
| `test/e2e/inventory-items.e2e.spec.ts:397` | 2 / 5 / 0 | `outstandingQuantity` is 5 (`:410`) | No, `5 - 0 = 5` |
| `stock-shortages.query.spec.ts:136` (round 2's fix) | 2 / 5 / 3 | absent from the list (`:147`) | Threshold only; the row is never listed, so its projection is never read |

**Non-equivalence, proven.** Probe in the scratch worktree: count 1, approved round, planned 5,
withdrawn 3, work order in `IN_EXECUTION`. True demand is 2, which exceeds a shelf of 1, so the item
is listed and `outstandingQuantity` must be 2. With P1 active the probe fails (`expected 5 to be
2`); with P1 reverted and the probe unchanged, it passes. Reverted before removing the worktree;
the probe is not in the real tree.

The consequence is the number the administration acts on. The list would name the right items and
overstate every one of their outstanding quantities by whatever has already been withdrawn, which
is the direction that makes someone order parts the shop already has.

### P2, in detail

`RestoreStockBatchHandler` splits a return across as many pending consumptions as it takes, newest
first, and appends one `RETURN` per consumption drawn from, each carrying `undoesMovementId`
(`restore-stock-batch.handler.ts:47-63`). The split itself is well covered. The pointer is not: the
one test with two consumptions asserts how many returns were appended and their quantities, and
never which consumption each one names, while every test that does assert `undoesMovementId` has a
single pending consumption, where `pending[0]` and the drawn consumption are the same row.

**Non-equivalence, proven.** Probe added to `restore-stock-batch.handler.spec.ts`'s existing split
case (consumptions of 2 then 3, one return of 4): `expect(new Set(drawnFrom).size).toBe(2)` and the
1-unit return naming the older consumption's movement id. With P2 active the probe fails
(`expected 1 to be 2`, both returns naming the newest); with P2 reverted it passes.

The consequence reaches beyond the ledger's readability. `findPendingConsumptions`
(`typeorm-inventory-item.repository.ts:83-99`) subtracts prior returns per consumption and drops a
drained one, so pointers that all name the newest consumption leave the older one looking fully
pending and the newer one over-drained. The next return on the same item would then draw from a
consumption that was already given back. Rule 22's "points at the consumption it undoes" and the
spec's own reason for splitting are both unproven for the case the split exists to handle.

---

## Gate Check

- **Gate command**: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- **Result**: lint clean, build clean, 534 unit passed (81 files), 196 integration passed (33 files), 152 e2e passed (13 files). **882 total, 0 failed, 0 skipped** on the clean runs.
- **Test count at round 2** (`8ffb123`): 533 / 195 / 152 = 880. **At `b85c999`**: 534 / 196 / 152 = 882. **Delta: +2**, matching round 2's own accounting in `tasks.md` (+1 unit for N1, +1 integration for N3).
- **Test count before the feature** (per `tasks.md` Preconditions): 471 / 172 / 128 = 771. **Feature delta: +111.**
- **Test integrity**: no suite lost a test, no assertion was weakened. Both added cases assert a value the suite could not see before.

### The e2e suite is still not deterministic, and it got worse

Five `npm run test:e2e` runs in the real tree: runs 2 and 3 passed back to back at 152, runs 1, 4
and 5 each failed with exactly one test. Two distinct signatures, both outside this feature's diff
surface:

- **Run 5**, the known one: `change-password.e2e.spec.ts` got `expected 201 "Created", got 409
  "Conflict"` from `registerUser` (`test/support/http.ts:31`), the faker email colliding against a
  never-truncated `workshop_test`. This is **L-004**, recorded from `customer-and-vehicle-registry`.
- **Run 4**, new this pass: `work-orders.e2e.spec.ts > should list the board and filter by status`
  timed out at 30000ms. `GET /api/v1/work-orders` has no pagination and hydrates each row with three
  more queries (`typeorm-work-order-query.adapter.ts:131-137` calling `toDto` per row, which fires
  the service, part and budget selects), so the board request now issues roughly four queries per
  work order. The test database holds **4,750 work orders, 18,643 users and 3,525 stock movements**
  accumulated across every run since the project started, so the endpoint is now near the 30s
  timeout on this machine. The SQL itself is fast (a filtered count over `work_orders` answers in
  2.6ms); the cost is the per-row fan-out.
- **Run 1** failed one test whose name was not captured before the output scrolled.

Neither belongs to this feature. `work-orders.e2e.spec.ts` and the board adapter are outside
`639fe7e..HEAD` entirely: the adapter was last touched by `88ce1d5`, in feature 6's range. The
accumulation is what changed, not the code. Round 2 measured this class of failure at about one run
in five; this pass measured three in five, with the new timeout as the second cause. That belongs
to L-004 and to whoever owns the test-support layer, and it is worth someone's attention soon:
the gate that guards every feature is now failing more often than it passes cleanly on the first
try.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | Pass. Round 2's fix round added no production code |
| Surgical changes | Pass. Two test files and four documents |
| No scope creep | Pass |
| Matches patterns | Pass. The return-batch case mirrors Fix 1's withdrawal-batch case; the shortage case follows its neighbours' fixture shape |
| Spec-anchored outcome check | Fail. 2 criteria (WOP-03 AC2, WOP-04 AC2) have evidence that stops short of the stated outcome |
| Per-layer Coverage Expectation | Pass at the route and domain layers; the two open gaps are a query projection and an application handler's resolution logic |
| Every test maps to a spec requirement | Pass. Both new cases carry a comment naming the AC and the mutant |
| Documented guidelines followed | Pass. `tasks.md`'s Test Coverage Matrix and Gate Check Commands; L-008 and L-011 visibly applied in round 2's fix |
| `// SPEC_DEVIATION` markers | None in the tree |
| Documentation accuracy | Pass. `tasks.md`'s round 2 subsection describes exactly what the commit contains, including the test-count delta |

---

## Edge Cases

All six re-confirmed as covered, unchanged from rounds 1 and 2. The two open gaps sit on acceptance
criteria, not on the Edge Cases list.

---

## Fix Plans (round 4)

Both are test-only, both are one assertion or one case, and neither touches production behaviour.
Round 2's fix round already wrote the fixture P1 needs; only its assertion is missing.

### Fix 8: Assert the reported outstanding quantity on a listed, partly withdrawn item

- **Priority**: Major
- **Root cause**: WOP-04 AC2's formula appears twice in `SELECT_SHORTAGES`, at `:57` for the reported figure and at `:65` for membership. Round 2's new fixture asserts membership only, and the two assertions that read `outstandingQuantity` both use fixtures with `withdrawn_quantity` at 0, so the projection's copy of the formula has never been observed. Mutation P1 survives all 882 tests.
- **Fix task**: Add a case to `test/integration/stock-shortages.query.spec.ts` with an item whose count on hand is 1, one approved planned part of 5 with `withdrawnQuantity: 3` on a work order in `IN_EXECUTION`. True demand is 2, which exceeds the shelf of 1, so the item is listed. Assert `found?.outstandingQuantity` is 2. `insertInventoryItem`, `insertBudget` and `insertWorkOrderPart` already take everything the fixture needs; this is the "second assertion" round 2's own Fix 7 plan described.
- **Done when**: a listed item with `0 < withdrawn < planned` has its `outstandingQuantity` asserted, and re-injecting P1 (dropping `- wop.withdrawn_quantity` from `typeorm-inventory-query.adapter.ts:57` alone, leaving `:65` intact) fails the integration suite.

### Fix 9: Assert which consumption each `RETURN` in a split undoes

- **Priority**: Major
- **Root cause**: `undoesMovementId` is asserted only in fixtures with a single pending consumption, where every candidate target is the same movement. The one test with two consumptions asserts the count and the quantities of the split and nothing about the pointers. Mutation P2 survives all 882 tests, and a wrong pointer corrupts `findPendingConsumptions`' per-consumption remaining calculation for every later return.
- **Fix task**: Extend `restore-stock-batch.handler.spec.ts`'s existing "splits one return across two consumptions" case (`:96-117`). It already builds consumptions of 2 then 3 with deterministic movement ids and returns 4. Add two assertions: the two `RETURN` movements name two different consumptions, and the 1-unit return names the older consumption (`11111111-0000-4000-8000-000000000001`), which is the one it drew from.
- **Done when**: the split case asserts each return's `undoesMovementId`, and re-injecting P2 (`consumption.movementId` to `pending[0].movementId` at `restore-stock-batch.handler.ts:59`) fails the unit suite.

### Not a fix task, and now more urgent than it was

The e2e suite failed 3 of 5 runs this pass, from two causes that both live in shared test
infrastructure: L-004's faker email against a never-truncated database, and an unpaginated board
endpoint whose per-row fan-out has grown into the 30s test timeout as the same database
accumulated 4,750 work orders. Both are outside this feature. Both make every future gate check
less trustworthy, and the second one will keep getting slower on its own.

---

## Requirement Traceability Update

| Requirement | Round 1 | Round 2 | Round 3 |
| --- | --- | --- | --- |
| WOP-01 | Needs Fix (AC2, AC5, AC6, AC10) | Verified | Verified |
| WOP-02 | Verified | Verified | Verified |
| WOP-03 | Needs Fix (AC2, AC5) | Needs Fix (AC4 multi-line) | Needs Fix (AC2, the pointer in a split) |
| WOP-04 | Needs Fix (AC1, AC4) | Needs Fix (AC2 demand formula) | Needs Fix (AC2, the projection half) |
| WOP-05 | Verified | Verified | Verified |

---

## Summary

**Overall**: Not ready. Two acceptance criteria out of 37 have evidence that cannot see the
behaviour they claim to cover, each confirmed by a surviving, non-equivalent mutant.

**Spec-anchored check**: 35 of 37 matched the spec-defined outcome. WOP-03 AC4 closed this pass;
WOP-04 AC2 half closed; WOP-03 AC2 downgraded on evidence rounds 1 and 2 both graded too
generously. 0 spec-precision gaps.
**Sensor**: 4 of 6 killed this pass. N1 and N3 both die on the cases round 2 added. 16 distinct
faults across three passes.
**Gate**: 882 passed, 0 failed, 0 skipped on a clean run; 3 of 5 e2e runs hit one of two
pre-existing infrastructure failures.

**What round 2's fix round got right**: both fix plans hold, verified independently rather than
taken on the commit's word. N1 and N3 are dead, the multi-line return batch is now proven to leave
earlier lines untouched, and the shortage threshold is proven to subtract the withdrawn quantity.
It did that with two test cases and no production code.

**What is still open**: the shortage query reports a figure computed by a second copy of the same
formula that no fixture has ever exercised with a non-zero withdrawn quantity (P1), and a split
return's pointers are asserted only where there is exactly one possible answer (P2). Both are the
same shape as the gaps the two previous rounds closed: a fixture that cannot distinguish the
implementation from a simpler wrong one.

**This is the third verification pass, and the fix loop's bound.** `validate.md` allows a maximum
of 3 fix to re-verify iterations before escalation, so the next step belongs to the user rather than
to another automatic fix round. Fixes 8 and 9 are one assertion and one case, in files the previous
fix rounds already opened.

---
---

# Round 2 (historical record)

**Date**: 2026-09-01
**Diff range**: `639fe7e..8ffb123`, re-verifying fix round 1
**Verdict**: FAIL (2 surviving mutants, N1 and N3, both new to that pass)

Preserved so round 2's fix round has something to be measured against. Line citations here are as
of `8ffb123`; the round 2 fix commit inserted 22 lines into `work-order.spec.ts` from `:1333` and
14 lines into `stock-shortages.query.spec.ts` from `:136`, so citations past those points read low
against the current tree by that much.

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

**Round 3 verdict (historical, `b85c999`): FAIL.** Gate green at 882 tests; 35 of 37 acceptance
criteria matched the spec-defined outcome; both of round 2's fix plans hold and N1 and N3 are dead.
Two surviving mutants, P1 (`typeorm-inventory-query.adapter.ts:57`, the shortage projection's copy
of WOP-04 AC2's formula) and P2 (`restore-stock-batch.handler.ts:59`, which consumption each
`RETURN` in a split undoes), each with a one-assertion fix task above. Both were fixed in `3115a90`
and both are confirmed dead in round 4. The file's standing verdict is the round 4 one below.

---
---

**Final verdict for this feature (round 4, `3115a90`): FAIL.** Gate green at 883 tests; 35 of 37
acceptance criteria matched the spec-defined outcome; both of round 3's fix plans hold and P1 and
P2 are dead. Two new mutants survive, Q4 (`typeorm-inventory-query.adapter.ts:58`, the shortage
row names only its first work order) and Q5 (`:57` and `:65`, the demand aggregate reduced to a
per-row maximum), both because no shortage fixture ever puts two rows in one group. One integration
case, described as Fix 10 above, kills both. This was the fourth and last automatic verification
pass, so the feature is not done and the decision escalates to the user.
