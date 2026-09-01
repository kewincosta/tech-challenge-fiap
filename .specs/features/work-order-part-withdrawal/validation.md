# Work Order Part Withdrawal Validation

**Date**: 2026-09-01
**Spec**: `.specs/features/work-order-part-withdrawal/spec.md`
**Diff range**: `639fe7e..HEAD` (`ac810aa`), 24 commits, 54 files, +5583/-27
**Verifier**: independent sub-agent (author != verifier)
**Verdict**: FAIL (2 surviving mutants, 8 acceptance criteria with no evidence at the layer the spec names)

The implementation is correct in every behaviour I could probe. The failing grade measures test discrimination: five of the seven injected faults were caught, two were not, and eight acceptance criteria state an outcome that no assertion targets. Those eight trace back to four root causes, each one a small, bounded fix task.

---

## Task Completion

All 18 tasks plus the documented T12 correction are marked done in `tasks.md`, with 147 checked Done-when boxes and none left open. Each task maps to exactly one commit in the range, and the commit subjects match the `Commit:` lines in `tasks.md`.

| Task | Status | Notes |
| --- | --- | --- |
| T1 to T6 | Done | Domain: movement factories, four errors, two trail events, part-item arithmetic, both batch validators |
| T7 | Done | Stock delta keyed on movement kind; the read-path extension it names as unplanned is real and integration-tested |
| T8 | Done | AD-008 `inTransaction` helper on both repositories |
| T9 | Done | `findAllByIdsForUpdate` with the ordering guarantee inside the repository |
| T10 | Done | Shortage SQL, no read of `stock_movements` |
| T11 to T15 | Done | Four command handlers plus the shortages query handler |
| T12 correction | Done | `undoesMovementId` resolved from the ledger; see the dedicated section below |
| T16 to T18 | Done | Three routes, wiring, and the two e2e specs |

---

## Spec-Anchored Acceptance Criteria

### WOP-01: The mechanic takes planned parts off the shelf

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 withdrawal lowers the count, raises the withdrawn quantity, appends one `CONSUMPTION` per part | count down by exactly the withdrawn quantity; withdrawn up by the same; one movement per part | `test/e2e/work-order-withdrawals.e2e.spec.ts:250` `expect(body.partItems[0].withdrawnQuantity).toBe(3)`; `:253` `expect(item.quantityOnHand).toBe(7)`; `:408` `expect(own.map(m => m.kind)).toEqual(['CONSUMPTION','RETURN','CONSUMPTION'])` | PASS |
| AC2 the movement records the work order, the acting user, `PENDING`, and the catalog price | four named fields | work order and status: `test/integration/inventory-item.repository.spec.ts:456-458` `expect(rows[0].status).toBe('PENDING')`, `expect(rows[0].work_order_external_id).toBe(workOrderExternalId)`; price: `test/e2e/work-order-withdrawals.e2e.spec.ts:350` `expect(consumption?.unitPriceCents).toBe(3200)`. **Acting user: no assertion anywhere on a `CONSUMPTION`** | GAP |
| AC3 several parts in one call, one movement each | every line registered | `src/modules/inventory/application/commands/consume-stock-batch/consume-stock-batch.handler.spec.ts:71-77` `expect(results).toHaveLength(2)`, `expect(updatedA?.quantityOnHand.units).toBe(3)`, `expect(updatedB?.quantityOnHand.units).toBe(4)` | PASS |
| AC4 withdrawal across several calls accumulates up to planned | running total, capped at planned | `src/modules/work-orders/domain/entities/work-order-part-item.spec.ts:139-155` accumulation across calls; `:156-170` refusal at the cap | PASS |
| AC5 past the planned quantity refuses the whole call with 422 and changes nothing | HTTP 422; nothing changed, for every line in the batch | 422: `test/e2e/work-order-withdrawals.e2e.spec.ts:288` `.expect(422)`; single-line refusal: `src/modules/work-orders/domain/entities/work-order.spec.ts:1117` `toThrow(WithdrawalExceedsPlannedError)`. **"changes nothing" is untested for a multi-line batch on this guard** (see mutation M3) | GAP |
| AC6 a part that is not an item of that work order refuses with 404 | HTTP 404 | `src/modules/work-orders/domain/entities/work-order.spec.ts:1063` `toThrow(WorkOrderItemNotFoundError)` plus `ErrorKind.NotFound` on the class. **No test asserts HTTP 404 on either new route for this path** | GAP |
| AC7 no round, or a round that is not `APPROVED`, refuses with 422 | HTTP 422 | `test/e2e/work-order-withdrawals.e2e.spec.ts:308` `.expect(422)` for a draft item, with `:311-315` proving the approved line on the same work order still answers 200 | PASS |
| AC8 the same item twice in one call refuses with 422 | HTTP 422 | `test/e2e/work-order-withdrawals.e2e.spec.ts:464` `.expect(422)` on a two-line batch naming one item twice | PASS |
| AC9 zero or negative quantity refuses with 400 | HTTP 400 | `test/e2e/work-order-withdrawals.e2e.spec.ts:273` and `:278` `.expect(400)` for 0 and -1 | PASS |
| AC10 any state other than `IN_EXECUTION` refuses with 422 | HTTP 422 | `src/modules/work-orders/domain/entities/work-order.spec.ts:1035` `toThrow(WorkOrderStateError)`; `withdraw-parts.handler.spec.ts:118-121` same error before any transaction. **No test asserts HTTP 422 on the route for this path** | GAP |
| AC11 an actor without `work-orders:execute` gets 403 | HTTP 403 | `test/e2e/work-order-withdrawals.e2e.spec.ts:362` `.expect(403)` with `:363` `toMatchObject({ code: 'AUTH_FORBIDDEN' })` | PASS |
| AC12 an unknown work order number answers 404 | HTTP 404 | `test/e2e/work-order-withdrawals.e2e.spec.ts:385` and `:390` `.expect(404)`, both routes | PASS |
| AC13 a successful withdrawal appends `Part Withdrawn` naming the actor | trail entry with the acting user | `test/e2e/work-order-withdrawals.e2e.spec.ts:497` `expect(withdrawn?.actorUserId).toBe(mechanic.userId)` | PASS |

### WOP-02: A short count refuses everything and moves nothing

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 a count that cannot cover any line refuses with 422 and a rule violation naming insufficient stock | HTTP 422 | `test/e2e/work-order-withdrawals.e2e.spec.ts:324` `.expect(422)`; the error identity at `src/modules/inventory/application/commands/consume-stock-batch/consume-stock-batch.handler.spec.ts:102-105` `rejects.toThrow(InsufficientStockError)` | PASS |
| AC2 a refused call leaves the count, the withdrawn quantity and the ledger exactly as they were | all three unchanged | `test/e2e/work-order-withdrawals.e2e.spec.ts:327` `expect(item.quantityOnHand).toBe(2)`, `:329` no `CONSUMPTION` on the ledger, `:331` `expect(reread.partItems[0].withdrawnQuantity).toBe(0)` | PASS |
| AC3 the count on hand never goes below zero | floor of zero under any command | `test/integration/inventory-item-batch-lock.spec.ts:209` `expect(final?.quantityOnHand.units).toBe(0)` under a real race; the `chk_inventory_items_quantity_on_hand` backstop mapped at `typeorm-inventory-item.repository.ts:162` | PASS |
| AC4 one short part refuses the whole call, covered parts included | every line refused | `src/modules/inventory/application/commands/consume-stock-batch/consume-stock-batch.handler.spec.ts:150` `expect(untouchedA?.quantityOnHand.units).toBe(5)` after a later line was refused | PASS |
| AC5 a failure after one module applied persists neither | both aggregates unchanged | `test/integration/cross-module-transaction.spec.ts:183` `expect(finalWorkOrder?.assignedMechanicUserId).toBeNull()` and `:184` `expect(finalItem?.quantityOnHand.units).toBe(0)` after a throw inside the shared transaction | PASS |
| AC6 a refusal for insufficient stock leaves the work order in `IN_EXECUTION` | status unchanged | `test/e2e/work-order-withdrawals.e2e.spec.ts:477-486`: 422, then replenish, then the same withdrawal answers 200 and `expect(reread.partItems[0].withdrawnQuantity).toBe(3)`. The proof is behavioural (the aggregate refuses a withdrawal outside `IN_EXECUTION`, so the retry could not succeed otherwise) rather than a direct status read | PASS |

### WOP-03: A part that turned out unnecessary goes back

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 a return raises the count and lowers the withdrawn quantity | both by the returned quantity | `test/e2e/work-order-withdrawals.e2e.spec.ts:418` `expect(item.quantityOnHand).toBe(9)` and `:420` `expect(reread.partItems[0].withdrawnQuantity).toBe(1)` after returning 1 of 2 | PASS |
| AC2 one `RETURN` per consumption drawn from, each naming the consumption, the actor and the quantity | pointer, actor, quantity | pointer and quantity: `test/e2e/work-order-withdrawals.e2e.spec.ts:432-433` `toMatchObject({ status: null, workOrderId, quantity: 1 })`, `expect(returned?.undoesMovementId).toBe(consumption?.id)`; the split across two consumptions: `restore-stock-batch.handler.spec.ts:114-116` `expect(returns).toHaveLength(2)`, quantities `[1, 3]`. **Acting user: no assertion anywhere on a `RETURN`** | GAP |
| AC3 the original `CONSUMPTION` is never edited or deleted | consumption untouched | `src/modules/inventory/domain/entities/inventory-item.spec.ts:352-353` `expect(stillThere?.status).toBe(Pending)`, `expect(stillThere?.quantity).toBe(3)`; persisted proof at `test/integration/inventory-item.repository.spec.ts:461-529` | PASS |
| AC4 a return below zero withdrawn refuses with 422 and changes nothing | HTTP 422; nothing changed | `test/e2e/work-order-withdrawals.e2e.spec.ts:440` `.expect(422)`, `:443` count still 8, `:445` withdrawn still 2, `:447` no `RETURN` on the ledger | PASS |
| AC5 any state other than `IN_EXECUTION` refuses with 422 | HTTP 422 | `src/modules/work-orders/domain/entities/work-order.spec.ts:1255` `toThrow(WorkOrderStateError)`; `return-parts.handler.spec.ts:113-120`. **No test asserts HTTP 422 on the returns route for this path** | GAP |
| AC6 a part never withdrawn on that work order refuses with 422 | HTTP 422 | `src/modules/work-orders/domain/entities/work-order.spec.ts:1308` `toThrow(ReturnExceedsWithdrawnError)` for a never-withdrawn item; the route-level 422 for the same error class at `test/e2e/work-order-withdrawals.e2e.spec.ts:440` | PASS |
| AC7 an actor without `work-orders:execute` gets 403 | HTTP 403 | `test/e2e/work-order-withdrawals.e2e.spec.ts:373` `.expect(403)` on the returns route, its own test per L-003 | PASS |
| AC8 a successful return appends `Part Returned` naming the actor | trail entry with the acting user | `test/e2e/work-order-withdrawals.e2e.spec.ts:498` `expect(returned?.actorUserId).toBe(mechanic.userId)` | PASS |

### WOP-04: The administration sees what is blocking the shop

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 lists every item whose outstanding demand exceeds its count on hand | strictly greater | `test/integration/stock-shortages.query.spec.ts:131-132` `expect(found).toBeDefined()`, `expect(found?.outstandingQuantity).toBe(3)`; `test/e2e/inventory-items.e2e.spec.ts:410` `toMatchObject({ quantityOnHand: 2, outstandingQuantity: 5 })`. **The `demand == count` boundary is untested** (see mutation M7) | GAP |
| AC2 demand is `SUM(planned - withdrawn)` over approved parts of work orders in `IN_EXECUTION` | that exact sum | `test/integration/stock-shortages.query.spec.ts:132` `expect(found?.outstandingQuantity).toBe(3)` against planned 3 / withdrawn 0 on an approved round | PASS |
| AC3 a listed item names the work orders waiting on it | the work order numbers | `test/integration/stock-shortages.query.spec.ts:133` `expect(found?.workOrderNumbers).toEqual([workOrder.number])`; `test/e2e/inventory-items.e2e.spec.ts:411` `expect(row?.workOrderNumbers).toContain(workOrderNumber)` | PASS |
| AC4 an item whose count covers its demand stays off the list | absent | `test/integration/stock-shortages.query.spec.ts:144` `expect(shortages.some(...)).toBe(false)` for count 5 against demand 3. Same boundary gap as AC1 | GAP |
| AC5 demand from any state other than `IN_EXECUTION` is ignored | absent | `test/integration/stock-shortages.query.spec.ts:155` `expect(shortages.some(...)).toBe(false)` for an `AWAITING_APPROVAL` work order | PASS |
| AC6 nothing short returns an empty list, not an error | empty list | `test/integration/stock-shortages.query.spec.ts:202-203` `expect(Array.isArray(shortages)).toBe(true)`; `test/e2e/inventory-items.e2e.spec.ts:449-450` at HTTP 200 | PASS |
| AC7 an actor without `inventory:read` gets 403 | HTTP 403 | `test/e2e/inventory-items.e2e.spec.ts:437-438` `.expect(403)`, `toMatchObject({ code: 'AUTH_FORBIDDEN' })` with an actor holding neither inventory permission | PASS |

### WOP-05: Planned against withdrawn reads back

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 a read work order returns planned and withdrawn per planned part | both figures | `test/e2e/work-order-withdrawals.e2e.spec.ts:249-250` `expect(...plannedQuantity).toBe(5)`, `expect(...withdrawnQuantity).toBe(3)` | PASS |
| AC2 the movement history includes every `CONSUMPTION` and `RETURN`, each naming the work order | both kinds, each with its work order | `test/e2e/work-order-withdrawals.e2e.spec.ts:430` and `:432` both `toMatchObject({ ..., workOrderId: workOrder.id, ... })` | PASS |
| AC3 a partly returned part reports the net | withdrawn minus returned | `test/e2e/work-order-withdrawals.e2e.spec.ts:420` `expect(reread.partItems[0].withdrawnQuantity).toBe(1)` after withdrawing 2 and returning 1 | PASS |

**Status**: 29 of 37 criteria matched the spec-defined outcome. 8 have no assertion targeting the outcome the spec names, and they trace to four root causes: the acting-user leg of WOP-01 AC2 and WOP-03 AC2; the multi-line half of WOP-01 AC5; the route-level HTTP status of WOP-01 AC6, WOP-01 AC10 and WOP-03 AC5; the threshold boundary shared by WOP-04 AC1 and AC4. No spec-precision gaps: `spec.md` pins a precise outcome for every criterion in scope, so every gap below is a test gap rather than an ambiguous requirement.

---

## Edge Cases

- [x] **An empty batch answers 400** rather than succeeding silently. `test/e2e/work-order-withdrawals.e2e.spec.ts:263` `.expect(400)` through `@ArrayNotEmpty` on the request DTO.
- [x] **Two mechanics take the last unit at the same moment**: one succeeds, one 422, the count never below zero. `test/integration/inventory-item-batch-lock.spec.ts:202-209` `expect(fulfilled).toHaveLength(1)`, `expect(rejected[0].reason).toBeInstanceOf(InsufficientStockError)`, `expect(final?.quantityOnHand.units).toBe(0)`.
- [x] **Withdraw, return in full, withdraw again** ends at a single withdrawal's count with three movements. `test/e2e/work-order-withdrawals.e2e.spec.ts:403-408`; the delta arithmetic underneath it at `test/integration/inventory-item.repository.spec.ts:403` `expect(final[0].quantity_on_hand).toBe(10)`.
- [x] **A catalog price change between approval and withdrawal** writes the new price and leaves the budgeted price alone. `test/e2e/work-order-withdrawals.e2e.spec.ts:350` `expect(consumption?.unitPriceCents).toBe(3200)` and `:352` `expect(reread.partItems[0].budgetedUnitPriceCents).toBe(2500)`.
- [x] **The same item on an approved round and on a round awaiting approval**: the approved line only. `src/modules/work-orders/domain/entities/work-order.spec.ts:1086-1107`; end to end at `test/e2e/work-order-withdrawals.e2e.spec.ts:291-315`.
- [x] **A part on a rejected round stays off the shortage list.** `test/integration/stock-shortages.query.spec.ts:173-174`, covering the rejected round and the draft item on no round in one case.

All six edge cases are handled and each has direct evidence at the layer `tasks.md`'s Edge Case Ownership table assigns to it.

---

## The T12 correction

`tasks.md` records that the original design (work-orders records the movement ids `ConsumeStockBatchHandler` returns, and passes them back on the return call) cannot survive a reload, because `WorkOrder.restore` rebuilds every part item from `work_order_parts` columns and no column holds a movement id. I re-derived the final shape and it is consistent end to end.

**Code**: `RestoreStockBatchCommand` carries `{ inventoryItemId, quantity }` and nothing else (`restore-stock-batch.command.ts:1-11`). `ReturnPartsHandler` builds exactly those lines (`return-parts.handler.ts:52-62`). `RestoreStockBatchHandler` resolves the target itself through `findPendingConsumptions`, drawing newest first and splitting one requested return across as many consumptions as it takes (`restore-stock-batch.handler.ts:45-71`). The SQL subtracts prior returns per consumption and drops a drained one, which is the only correct reading given that a `RETURN` never edits the consumption it undoes (`typeorm-inventory-item.repository.ts:83-99`).

**Tests**: the split behaviour at `restore-stock-batch.handler.spec.ts:96-117`, the ordering at `test/integration/inventory-item.repository.spec.ts:530-570`, the drained-consumption arithmetic at `:571-620`. Mutation M5 confirms the ordering is genuinely enforced by a test.

**No leftover in code or tests.** Nothing constructs a `RestoreStockBatchCommand` with a caller-supplied `undoesMovementId`, and no test passes one.

**Two stale references remain, both documentation:**

1. `src/modules/inventory/domain/entities/inventory-item.ts:201-203` still reads "`undoesMovementId` is supplied by the caller, which already knows the consumption it points at (design.md's Risks & Concerns)". The caller no longer knows it; it looks it up. The code is correct and the comment describes the superseded design.
2. `design.md` was never amended for the correction. Its Risks & Concerns last row ("The work-orders side already knows the movement ids: `ConsumeStockBatchHandler` returns them and the return path passes the target back in") and its Tech Decisions row "Where the movement id for a return comes from" both still describe the design that was replaced. `tasks.md` documents the correction, so the history is not lost, but `design.md` read alone is now wrong about the shipped system.

**One leftover in code, unused rather than wrong:** `ConsumeStockBatchHandler` still returns `ConsumedLineDto[]`, one minted movement id per line (`consume-stock-batch.handler.ts:34-62`). Its only stated purpose was feeding the superseded return path, and nothing in `src/` reads it now. It is harmless and asserted by `consume-stock-batch.handler.spec.ts:71-73`, but it is surface with no caller.

---

## Discrimination Sensor

Isolated in a temporary `git worktree` at `HEAD` with `node_modules` symlinked. Real-tree `git status --porcelain` was empty before the sensor and empty after `git worktree remove --force`, with `HEAD` still at `ac810aa`. No `git stash` was used at any point.

| # | File:line | Mutation | Suite run | Result |
| --- | --- | --- | --- | --- |
| M1 | `typeorm-inventory-item.repository.ts:118-122` | Stock delta drops `RETURN` from the adding branch, restoring the pre-T7 "anything but INBOUND subtracts" bug | `test:integration` | Killed. `inventory-item.repository.spec.ts:403` expected 10, got 4 |
| M2 | `work-order.ts:414` | `assertNoDuplicateLines(input.lines)` removed from `withdrawParts` | `work-order.spec.ts` | Killed. `work-order.spec.ts:1050` expected a throw, got none |
| M3 | `work-order.ts:473` | Off-by-one on the planned guard: `withdrawnQuantity + quantity > plannedQuantity.units` becomes `> plannedQuantity.units + 1` | `work-order.spec.ts` + `work-order-part-item.spec.ts` (72 tests) | **Survived** |
| M4 | `withdraw-parts.handler.ts:64` | `eventBus.publishAll(workOrder.pullDomainEvents())` removed after the transaction | `src/modules/work-orders/application` | Killed. `withdraw-parts.handler.spec.ts:161` |
| M5 | `typeorm-inventory-item.repository.ts:96` | `findPendingConsumptions` orders `ORDER BY sm.occurred_at ASC` instead of `DESC` | `inventory-item.repository.spec.ts` | Killed. `:565` newest-first list came back oldest-first |
| M6 | `typeorm-work-order.repository.ts:317` | The work order repository ignores `currentEntityManager()` and always opens its own transaction, violating AD-008 | `cross-module-transaction.spec.ts` | Killed. `:183` the work order write survived a rollback that should have undone it |
| M7 | `typeorm-inventory-query.adapter.ts:65` | Shortage threshold `HAVING SUM(...) > ii.quantity_on_hand` becomes `>=` | `stock-shortages.query.spec.ts`, then `inventory-items.e2e.spec.ts` + `work-order-withdrawals.e2e.spec.ts` (38 tests) | **Survived** in both |

**Sensor depth**: P0-full (7 mutations, above the >= 5 the tier requires; this is a data-integrity path).
**Result**: 5 of 7 killed. FAIL.

### M3, in detail

`WorkOrderPartItem.withdraw` (`work-order-part-item.ts:73-79`) carries the same planned-quantity guard as `WorkOrder.assertWithdrawable`. That redundancy is why the single-line test at `work-order.spec.ts:1108` cannot see the mutation: the inner guard throws the same `WithdrawalExceedsPlannedError` either way.

The mutation is not equivalent. `withdrawParts` documents and depends on validate-everything-then-apply-everything, and with the outer guard loosened, a two-line batch whose second line exceeds its planned quantity passes validation, applies line one, then throws on line two, leaving line one mutated. I confirmed this with a throwaway probe spec in the scratch worktree: it failed with the mutation active and passed once the mutation was reverted, so the behaviour genuinely differs and no existing test covers it.

The consequence is contained today, because `WithdrawPartsHandler` validates before opening a transaction and the aggregate is discarded when it throws. It is still WOP-01 AC5's "refuse the whole call and change nothing" going unproven for the multi-line case, and it is exactly the property the aggregate's own comment claims.

### M7, in detail

`spec.md` is precise here: WOP-04 AC1 lists an item whose demand *exceeds* the count, and AC4 leaves it out while the count *covers* the demand, which includes exact equality. No fixture in the suite sits on that boundary. The integration case at `stock-shortages.query.spec.ts:136` uses count 5 against demand 3, and the e2e at `inventory-items.e2e.spec.ts:414` replenishes 2 to 7 against demand 5, so both clear the boundary by a margin. Swapping `>` for `>=` lists every item whose demand exactly equals its shelf, and the whole covering suite stays green.

---

## Payload and conjunction check

Cross-module dispatch assertions target field values, not call counts:

- `withdraw-parts.handler.spec.ts:147-150`: `expect(dispatched).toBeInstanceOf(ConsumeStockBatchCommand)`, `expect(dispatched.lines).toEqual([{ inventoryItemId: APPROVED_INVENTORY_ITEM_ID, quantity: 2 }])`, `expect(dispatched.workOrderId).toBe(updated.id.value)`.
- `return-parts.handler.spec.ts:145-148`: the same three assertions for `RestoreStockBatchCommand`.

Both stop short of `actorUserId` on the dispatched command. That is the same missing leg as WOP-01 AC2 and WOP-03 AC2: the acting user is threaded from the controller into the movement row correctly, and the `actor_user_id NOT NULL REFERENCES users (id)` column means a missing value fails the write loudly, but no test would notice a wrong one. The only actor assertion on a stock movement in the suite is `test/integration/inventory-item.repository.spec.ts:334`, and that exercises an `INBOUND` from `replenish`, which is a sibling call site of exactly the kind L-003 says cannot stand in.

---

## Gate Check

- **Gate command**: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- **Result**: exit 0. 532 unit passed (81 files), 194 integration passed (33 files), 150 e2e passed (13 files). 876 total, 0 failed, 0 skipped.
- **Second e2e run**: exit 0, 150 passed. No flake reproduced.
- **Test count before feature** (per `tasks.md` Preconditions): 471 unit, 172 integration, 128 e2e = 771.
- **Test count after**: 532 / 194 / 150 = 876. **Delta: +105** (+61 unit, +22 integration, +22 e2e).
- **Skipped**: none.
- **Failures**: none.
- **Test integrity**: no count decreased in any suite, and no pre-existing assertion in the diff was weakened. The two repositories T8 changed keep their original `dataSource.transaction` call as the no-ambient-manager branch, so every pre-feature test exercises the untouched path.

**On the flake `tasks.md` T18 records.** I ran the e2e suite twice in full and once partially in the scratch worktree, with no failure. That neither confirms nor refutes a one-off. The note is credible on its mechanism: `LESSONS.md` L-004 already documents `registerUser`'s faker-based email colliding against a never-truncated test database, recorded from `customer-and-vehicle-registry`, and the failure T18 describes has that exact signature in that exact fixture. It is pre-existing test-infrastructure entropy rather than anything this feature introduced, and it belongs to L-004 rather than to this validation, which had no gate failure of its own to ground it.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | Pass, with one leftover: `ConsumedLineDto` on `ConsumeStockBatchHandler` no longer has a caller |
| Surgical changes | Pass. The two pre-existing repositories gained one private helper each, with the original call preserved as the fallback branch |
| No scope creep | Pass. No migration, no new table, no new column, exactly as `tasks.md` Preconditions promised |
| Matches patterns | Pass. `RegisterUserHandler`'s cross-module shape, `TypeOrmUserRepository`'s ambient-manager `repo()` helper, and `TypeOrmWorkOrderQueryAdapter`'s raw cross-module join are each followed where `design.md` names them |
| Route ordering | Pass. `@Get('shortages')` at `inventory-items.controller.ts:110` sits above `@Get(':externalId')` at `:123`, with the comment explaining why, and `test/e2e/inventory-items.e2e.spec.ts:389` proves 200 rather than the `ParseUUIDPipe` 400 |
| Wiring | Pass. All five handlers registered (`inventory.module.ts:32-34`, `work-orders.module.ts:54-55`) |
| Spec-anchored outcome check | Fail. 8 criteria have no assertion on the outcome the spec names |
| Per-layer Coverage Expectation | Fail. The matrix promises e2e coverage of "every error path" per route; the wrong-state 422 and the item-not-found 404 have no e2e case on either new route |
| Every test maps to a spec requirement | Pass. No unclaimed tests in the diff |
| Documented guidelines followed | Pass. `tasks.md`'s Test Coverage Matrix and Gate Check Commands; `LESSONS.md` L-002 and L-003 were both applied to the breakdown, L-003 partially (see above) |
| `// SPEC_DEVIATION` markers | None in the tree |
| Documentation accuracy | Fail. `design.md` still describes the pre-T12-correction return path, and `inventory-item.ts:201` repeats it |

---

## Fix Plans

### Fix 1: The batch guard needs a test the inner guard cannot pass

- **Priority**: Major
- **Root cause**: `WorkOrder.assertWithdrawable` and `WorkOrderPartItem.withdraw` enforce the same planned-quantity rule. Every current test fires both at once, so the outer one has no independent evidence, and mutation M3 survives.
- **Fix task**: Add a case to `work-order.spec.ts`'s `WorkOrder.withdrawParts` block: a two-line batch where line one is fully withdrawable and line two exceeds its planned quantity. Assert the throw and assert line one's `withdrawnQuantity` is still 0. Re-run M3 to confirm it is killed.
- **Done when**: `withdrawnQuantity` on the first item is asserted unchanged after the batch throws, and M3 fails the suite.

### Fix 2: The shortage threshold needs its boundary

- **Priority**: Major
- **Root cause**: no fixture places outstanding demand exactly equal to the count on hand, so `>` and `>=` are indistinguishable to the suite.
- **Fix task**: Add a case to `test/integration/stock-shortages.query.spec.ts`: an item with count 3 and a single approved planned part of 3 on a work order in `IN_EXECUTION`, asserted absent from the list. Re-run M7 to confirm it is killed.
- **Done when**: the equal-demand item is asserted absent, and M7 fails the suite.

### Fix 3: Assert the acting user on both movement kinds

- **Priority**: Major
- **Root cause**: WOP-01 AC2 and WOP-03 AC2 each name four things the movement must carry; three are asserted. The only actor assertion on a movement covers `INBOUND`.
- **Fix task**: Extend `test/integration/inventory-item.repository.spec.ts:413`'s `CONSUMPTION` query to join `users` and assert the actor's external id, and do the same for the `RETURN` case at `:461`. Optionally assert `actorUserId` on the dispatched command in both handler specs.
- **Done when**: a `CONSUMPTION` row and a `RETURN` row each have their acting user asserted against the id the caller supplied.

### Fix 4: Route-level tests for the two missing error paths

- **Priority**: Minor
- **Root cause**: T16's Done-when list never asked for them. WOP-01 AC6, WOP-01 AC10 and WOP-03 AC5 state HTTP statuses that no test asserts on either route; the domain unit test plus the `ErrorKind` mapping is the substitution L-003 rules out.
- **Fix task**: Add to `test/e2e/work-order-withdrawals.e2e.spec.ts`: an item id that belongs to another work order answering 404 on the withdrawals route, and a work order in `AWAITING_APPROVAL` answering 422 on each of the two routes.
- **Done when**: 404 and 422 are asserted at the route for those three criteria.

### Fix 5: Bring the documentation back in line with the shipped design

- **Priority**: Minor
- **Root cause**: the T12 correction was recorded in `tasks.md` and never propagated to `design.md` or to the aggregate's own comment.
- **Fix task**: Amend `design.md`'s Risks & Concerns last row and its "Where the movement id for a return comes from" Tech Decision to describe `findPendingConsumptions`. Rewrite `inventory-item.ts:201-203` to say the caller resolves the consumption from the ledger. Decide whether `ConsumedLineDto` stays on `ConsumeStockBatchHandler` or is dropped now that nothing reads it.
- **Done when**: no document or comment in the tree describes the caller as knowing the movement id.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| WOP-01 | Implementing | Needs Fix (AC2 acting user, AC5 multi-line atomicity, AC6 and AC10 route status) |
| WOP-02 | Implementing | Verified |
| WOP-03 | Implementing | Needs Fix (AC2 acting user, AC5 route status) |
| WOP-04 | Implementing | Needs Fix (AC1 and AC4 boundary) |
| WOP-05 | Implementing | Verified |

---

## Summary

**Overall**: Issues. The feature behaves correctly everywhere I could probe it, and the gaps are all in test discrimination.

**Spec-anchored check**: 29 of 37 acceptance criteria matched the spec-defined outcome; 8 have no assertion on the outcome the spec names, tracing to four root causes. 0 spec-precision gaps.
**Sensor**: 5 of 7 mutations killed.
**Gate**: 876 passed, 0 failed, 0 skipped, across two consecutive e2e runs.

**What works**: The cross-module transaction is proven by an actual rollback that leaves neither write behind (M6 died immediately). The stock delta keys on the movement kind, which was `design.md`'s top-listed risk and a live trap in feature 4's code (M1 died). The deterministic lock order holds under two genuinely concurrent batches against a real database. The T12 correction is fully implemented: a return really does split across consumptions newest first, and the ordering has a test that kills a reversal. All six edge cases have direct evidence at the assigned layer, and the shortages route is declared above `:externalId` with an e2e proving 200.

**Issues found**: Two surviving mutants (a redundant inner guard hiding the outer one; an untested threshold boundary) and one missing conjunct repeated across two criteria (the acting user on a movement). Three ACs state an HTTP status that only the domain layer proves. `design.md` still documents the return path the T12 correction replaced.

**Next steps**: Fixes 1 through 3 are the blockers; each is one test case. Fixes 4 and 5 are small and can ride along. Re-run the sensor on M3 and M7 after Fixes 1 and 2 to confirm both die.
