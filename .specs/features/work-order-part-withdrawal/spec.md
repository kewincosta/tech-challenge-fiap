# Work Order Part Withdrawal Specification

## Problem Statement

A work order can now be diagnosed, priced and approved, but nothing ever leaves the shelf. The parts an approved budget promised are still counted as available stock, so the count lies from the moment a mechanic starts installing them, and nobody finds out a part is missing until they reach for it. This feature is the moment the stock meets reality: the mechanic registers each part as it comes off the shelf, the count drops in the same breath, and a withdrawal that cannot be covered is refused loudly enough that the administration can act on it.

## Goals

- [ ] A mechanic registers several parts leaving the shelf in one call, and the stock count drops by exactly what left.
- [ ] A withdrawal larger than the count on hand changes nothing at all, in either module.
- [ ] A part that turned out unnecessary goes back, and the customer is never billed for it.
- [ ] The administration can see, without asking anyone, every item whose demand from work orders in execution exceeds what is on the shelf.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| --- | --- |
| Completion, delivery, discount and cancellation | Plan phase 12, specified as feature 8 `work-order-closing`. This feature ends with the work order still `IN_EXECUTION`. |
| Settling and writing off the pending movements | Plan phase 12. A movement recorded here stays `PENDING` for the whole life of this feature; nothing yet moves it to `SETTLED` or `WRITTEN_OFF`. |
| The charged total | Plan phase 12, which computes it at completion. This feature records what was withdrawn and at which price, which is the input that total will read. |
| `Get My Work Orders` and the metrics | Plan phase 13, feature 9. |
| Replenishing stock in response to a shortage | Already built in feature 4 (`POST /inventory-items/{id}/replenishments`). H31 is explicit that the mechanic never replenishes: this feature only makes the shortage visible to the administrator who does. |
| A notification when a shortage appears | H31 settles this: the signal is the refused withdrawal plus the shortage read model, with no dispatch of any kind. |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here. The domain rules come from `docs/ddd/implementation-plan.md` phase 11 and `docs/ddd/event-storming.md` (section 5.1's parts flow, section 9's aggregates, rules 19 to 25 and 32, section 11's state machine, section 13's read models, H5, H31, H32, H38). What follows are the points those documents left unstated or state only in passing.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| What identifies a part inside a withdrawal batch | The work order **item's** external id, not the inventory item's | A work order can carry the same inventory item twice, planned on two different rounds. Keyed by inventory item the request would be ambiguous about which line to decrement. The item's external id is what `DELETE /work-orders/{number}/items/{itemExternalId}` already addresses. | y |
| The same item id appearing twice in one batch | The whole batch is refused with 422 | Summing the two silently would hide a client bug behind a plausible result, and this is the one call in the system where a wrong quantity permanently removes stock. | y |
| Which parts can be withdrawn at all | Only an item attached to a round whose status is `APPROVED` | Section 5.1 and H38 both say a part waiting on a supplementary approval stays on the shelf. A draft item, attached to no round, is never withdrawable either. The guard reads the round's status, not just the item's own fields. | y |
| The price written on the stock movement | The inventory item's catalog price at the moment of withdrawal | Phase 11's Risks states it directly: the catalog price at withdrawal time is read for the movement record only and never changes what the work order charges. The movement values the stock; the work order charges the frozen budgeted price (rule 32). The two deliberately differ once the catalog moves. | y |
| Which consumption a return points at | The work order's pending consumptions for that item, drawn newest first, with one `RETURN` movement appended per consumption it draws from | Rule 22 says a return "points at the consumption it undoes", singular. A part withdrawn across three calls and returned in one would make a single pointer inaccurate, so the return is split to keep every pointer true. | y |
| Who may withdraw or return | Any holder of `work-orders:execute`, with no assigned-mechanic restriction | The state machine's preconditions for `Withdraw Part` are about the part and the stock, never the actor, unlike `Complete Work Order`, which names the assigned mechanic explicitly. Phase 11's e2e title "as the assigned mechanic" describes the scenario, not a restriction. This matches the diagnosis routes feature 6 built. | y |
| What "pending withdrawals" means in the shortage read model | The still-unwithdrawn remainder of approved planned parts, `SUM(planned - withdrawn)`, over work orders in `IN_EXECUTION` | Section 5.1 says the list shows items "whose pending withdrawals across work orders in execution exceed what is on the shelf". A movement in `PENDING` status is stock that already left, so counting those would invert the whole read: the list must show demand still to be met, not consumption already recorded. | y |
| Whether a return may cross the original planned quantity | It cannot exceed what is currently withdrawn on that item | H32 makes the withdrawn quantity the net of withdrawals and returns, so returning more than was taken would drive it negative and bill a negative part. | y |
| Whether withdrawing is required before the work order can leave execution | No | Phase 12's own tests state that a planned part never withdrawn is simply not charged. Nothing here forces a withdrawal. | y |
| Which module owns the transaction that spans both aggregates | Settled in design, not here | Phase 11's Risks names the requirement ("both have to share a transaction") without naming a mechanism, and AD-003 permits it while charging for it. The spec states the guarantee; the design picks how. | y |

**Open questions:** none, all resolved or logged above.

---

## User Stories

### P1: The mechanic takes planned parts off the shelf ⭐ MVP

**User Story**: As a mechanic, I want to register the parts I take for a work order, in one call for several parts, so that the stock count matches the shelf at the moment I use them.

**Why P1**: Without it the count is fiction from the first installed part, and phase 12 has nothing to charge.

**Acceptance Criteria**:

1. WHEN an actor holding `work-orders:execute` withdraws one or more planned parts from a work order in `IN_EXECUTION` THEN the system SHALL decrease each inventory item's count on hand by the withdrawn quantity, raise each work order item's withdrawn quantity by the same amount, and append one `CONSUMPTION` movement per part.
2. The system SHALL record every `CONSUMPTION` movement with the work order that caused it, the acting user, a `PENDING` status, and the inventory item's catalog price at that moment.
3. WHEN several parts are withdrawn in one call THEN the system SHALL register every one of them, appending one movement each.
4. WHEN a part is withdrawn across several calls THEN the system SHALL accumulate the withdrawn quantity up to the planned quantity.
5. IF a withdrawal would take a work order item past its planned quantity THEN the system SHALL refuse the whole call with HTTP 422 and change nothing.
6. IF a part addressed by the call is not an item of that work order THEN the system SHALL refuse the whole call with HTTP 404.
7. IF an addressed item is attached to no budget round, or to a round that is not `APPROVED`, THEN the system SHALL refuse the whole call with HTTP 422.
8. IF the same work order item appears more than once in one call THEN the system SHALL refuse the whole call with HTTP 422.
9. IF any requested quantity is zero or negative THEN the system SHALL refuse the whole call with HTTP 400.
10. IF the work order is in any state other than `IN_EXECUTION` THEN the system SHALL refuse the withdrawal with HTTP 422.
11. IF the actor lacks `work-orders:execute` THEN the system SHALL refuse the withdrawal with HTTP 403.
12. IF no work order carries the requested number THEN the system SHALL respond with HTTP 404.
13. WHEN a withdrawal succeeds THEN the system SHALL append a `Part Withdrawn` entry to the work order trail naming the acting user.

**Independent Test**: Approve a budget carrying two planned parts, withdraw both in one call, and read back the two count-on-hand values dropped by exactly the withdrawn quantities, two `CONSUMPTION` movements in `PENDING`, and the work order showing planned against withdrawn.

---

### P1: A short count refuses everything and moves nothing ⭐ MVP

**User Story**: As the workshop owner, I want a withdrawal that the shelf cannot cover to leave both the stock and the work order exactly as they were, so that a failed call never invents units or bills for parts nobody took.

**Why P1**: This is the write that spans two modules and two aggregates. A partial application here is a silent inventory loss, and it is the one failure mode that cannot be corrected by reading the ledger afterwards.

**Acceptance Criteria**:

1. IF the count on hand of any part in the call does not cover its requested quantity THEN the system SHALL refuse the whole call with HTTP 422 and a rule-violation error naming insufficient stock.
2. WHILE a call is being refused for insufficient stock, the system SHALL leave every inventory item's count on hand, every work order item's withdrawn quantity, and the movement ledger exactly as they were before the call.
3. The system SHALL never let an inventory item's count on hand go below zero, through this or any other command.
4. IF one part in a multi-part call is short THEN the system SHALL refuse the whole call, including the parts that were covered.
5. IF the write into either module fails for any reason after the other has already been applied in memory THEN the system SHALL persist neither, leaving both aggregates as they were.
6. WHEN a withdrawal is refused for insufficient stock THEN the system SHALL leave the work order in `IN_EXECUTION`, so the mechanic can retry once the administration replenishes.

**Independent Test**: Plan a part for three units against a shelf holding one, withdraw all three, see 422, then read the count on hand, the movement ledger and the work order item all unchanged. Replenish, withdraw again, and see it succeed.

---

### P2: A part that turned out unnecessary goes back

**User Story**: As a mechanic, I want to put back a part I took but did not use, so that the shelf is right again and the customer is not billed for it.

**Why P2**: The withdrawal is what the workshop cannot run without; the return corrects a mistake that is real but less frequent. H32 requires it before the work order closes, which is feature 8.

**Acceptance Criteria**:

1. WHEN an actor holding `work-orders:execute` returns one or more parts on a work order in `IN_EXECUTION` THEN the system SHALL raise each inventory item's count on hand by the returned quantity and lower the work order item's withdrawn quantity by the same amount.
2. WHEN a part is returned THEN the system SHALL append one `RETURN` movement per consumption it draws from, each naming the consumption it undoes, the acting user and the returned quantity.
3. The system SHALL never edit or delete the original `CONSUMPTION` movement when a return is registered.
4. IF a return would take a work order item's withdrawn quantity below zero THEN the system SHALL refuse the whole call with HTTP 422 and change nothing.
5. IF the work order is in any state other than `IN_EXECUTION` THEN the system SHALL refuse the return with HTTP 422.
6. IF a part addressed by the call was never withdrawn on that work order THEN the system SHALL refuse the whole call with HTTP 422.
7. IF the actor lacks `work-orders:execute` THEN the system SHALL refuse the return with HTTP 403.
8. WHEN a return succeeds THEN the system SHALL append a `Part Returned` entry to the work order trail naming the acting user.

**Independent Test**: Withdraw two units of a part, return one, and read back the count on hand up by one, the work order item's withdrawn quantity down to one, the original consumption untouched, and a new `RETURN` movement pointing at it.

---

### P2: The administration sees what is blocking the shop

**User Story**: As an administrator, I want a list of every item whose demand from work orders in execution exceeds what is on the shelf, so that I know what to buy without a mechanic having to tell me.

**Why P2**: H31 makes this the path the mechanic's signal travels. Feature 4 deferred it here because its inputs, pending demand and work orders in execution, did not exist until this feature creates them.

**Acceptance Criteria**:

1. WHEN an actor holding `inventory:read` lists the stock shortages THEN the system SHALL return every inventory item whose outstanding demand exceeds its count on hand.
2. The system SHALL compute outstanding demand as the sum, over the approved planned part items of work orders in `IN_EXECUTION`, of the planned quantity minus the withdrawn quantity.
3. WHEN an item is listed as short THEN the system SHALL name the work orders waiting on it.
4. WHILE an item's count on hand covers its outstanding demand, the system SHALL leave that item out of the list.
5. The system SHALL ignore demand from work orders in any state other than `IN_EXECUTION`.
6. WHEN nothing is short THEN the system SHALL return an empty list rather than an error.
7. IF the actor lacks `inventory:read` THEN the system SHALL refuse the read with HTTP 403.

**Independent Test**: Plan three units of a part against a shelf holding one on a work order in execution, list the shortages, and see that item named with the work order waiting on it. Replenish to three, list again, and see it gone.

---

### P3: Planned against withdrawn reads back

**User Story**: As a service advisor, I want the work order to show how much of each planned part has actually been taken, so that I can answer the customer without walking to the shop floor.

**Why P3**: The data is already written by the stories above; this exposes it. Nothing depends on it inside this feature.

**Acceptance Criteria**:

1. WHEN a work order is read THEN the system SHALL return, for each planned part, both its planned quantity and the quantity withdrawn so far.
2. WHEN an item's movement history is read THEN the system SHALL include every `CONSUMPTION` and `RETURN` movement, each naming the work order that caused it.
3. WHILE a part has been withdrawn and partly returned, the system SHALL report the withdrawn quantity as the net of the two.

**Independent Test**: Withdraw two of three planned units, read the work order, and see planned 3 against withdrawn 2; read the item's movement history and see the consumption naming that work order.

---

## Edge Cases

- IF a batch is empty THEN the system SHALL refuse it with HTTP 400 rather than succeeding silently.
- IF two mechanics withdraw the last unit of the same item at the same moment THEN the system SHALL let exactly one succeed and refuse the other with HTTP 422, leaving the count at zero and never below.
- IF a part is withdrawn, returned in full, and withdrawn again THEN the system SHALL end with the count on hand and the withdrawn quantity matching a single withdrawal, and three movements on the ledger.
- IF the catalog price of an item changes between the approval of its round and the withdrawal THEN the system SHALL write the new price on the movement and leave the item's budgeted price untouched.
- IF an item is planned on an approved round and again on a later round still awaiting approval THEN the system SHALL allow the withdrawal of the approved line only, and refuse a call addressing the pending one.
- IF a work order in execution has a planned part on a round that was rejected THEN the system SHALL leave that part out of the shortage list, since it will never be withdrawn.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| WOP-01 | P1: The mechanic takes planned parts off the shelf | Execute | Verified |
| WOP-02 | P1: A short count refuses everything and moves nothing | Execute | Verified |
| WOP-03 | P2: A part that turned out unnecessary goes back | Execute | Verified |
| WOP-04 | P2: The administration sees what is blocking the shop | Execute | Verified |
| WOP-05 | P3: Planned against withdrawn reads back | Execute | Verified |

**ID format:** `WOP-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 5 total, 0 mapped to tasks yet

---

## Success Criteria

- [ ] A mechanic withdraws several parts in one call and the shelf count drops by exactly what left.
- [ ] A refused withdrawal leaves the count on hand, the movement ledger and the work order item byte-for-byte as they were, proven against a real database.
- [ ] Two concurrent withdrawals of the last unit end with one success, one 422, and a count of zero.
- [ ] A returned part is back on the shelf, off the work order's withdrawn quantity, and its consumption is still on the ledger unedited.
- [ ] The shortage list names every item blocking a work order in execution, and only those.
