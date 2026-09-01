# Work Order Closing Specification

## Problem Statement

A work order can be opened, diagnosed, priced, approved and worked on, and then it stops. There is no way to say the job is finished, no way to record that the customer took the car, and no way to give up on a repair the customer no longer wants. The parts a mechanic withdrew sit in `PENDING` forever, which means the ledger never states whether they were paid for or lost, and nothing anywhere computes what the customer owes. This feature closes the work order the two ways it can end, and makes each ending say what happened to the parts.

## Goals

- [ ] A finished job records what the customer owes, computed from what was actually withdrawn, never from what was planned.
- [ ] Handing the car over settles every part that went into it, so the ledger stops calling them pending.
- [ ] A repair the customer gave up on records the parts already installed as a loss, in the exact amount that was lost, and never touches the ones that came back to the shelf.
- [ ] Cancelling a job that already consumed parts needs an administrator, whatever state the work order happens to be sitting in.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| --- | --- |
| `Get My Work Orders` and `Get My Work Order` | Plan phase 13, feature 9. This feature adds no customer-scoped route. |
| The average execution time metric | Plan phase 13. This feature records `completed_at` and `delivered_at`, which is the input that metric will read. |
| Coverage thresholds, `README.md`, the ADR and architecture consistency pass | Plan phase 13's non-domain work, listed there explicitly. |
| Invoicing, payment, receipts | No phase of `docs/ddd/implementation-plan.md` covers them. The charged total is a figure on the work order, not a financial document. |
| Reopening a delivered or cancelled work order | Rule 40 makes both terminal, and the state machine lists every transition out of them as forbidden. |
| A successor work order naming its predecessor | H38 removed it. Extra work is authorised in place through supplementary rounds, so cancellation no longer needs to point anywhere. |
| Returning parts to stock on a cancellation | Rule 24 is explicit: the units are not returned, because the parts are installed in the car. The return path built in feature 7 stays the only way units come back, and it only runs in `IN_EXECUTION`. |
| Partial delivery or partial cancellation | Neither exists in the state machine. A work order ends whole. |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here. The domain rules come from `docs/ddd/implementation-plan.md` phase 12 and `docs/ddd/event-storming.md` (section 9's aggregates, rules 22 to 25, 31b, 31c, 32 to 34, 34a and 39 to 41, section 11's state machine, section 12's context interactions, H4, H36 and H38). What follows are the points those documents left unstated, state only in passing, or state in terms that a later revision undercut.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| What a write-off records when the part was partly returned | The consumption's own quantity minus every return that points at it | Rule 24 justifies the write-off physically: the units are lost "because the parts are installed in the car". A returned unit is on the shelf, so writing it off states a loss the workshop did not take. Feature 7 already computes this figure in `findPendingConsumptions`, because rule 22 forbids a return from editing the consumption it undoes, which leaves `PENDING` unable to distinguish a drained consumption from an untouched one. | y |
| A discount that a later return pushes above the charged total | Completion is refused with a rule violation naming the discount | Phase 12's own Risks require the charged total not to drift from the sum of the lines. Flooring the total at zero keeps a discount that no longer relates to the lines; clamping it silently rewrites an amount a person authorised. Refusing surfaces it while it still costs nothing to fix, before delivery and before any invoice exists. | y |
| A second discount on the same work order | It replaces the first, in full | The columns phase 12 defines are singular: one amount, one note, one author, one moment. The trail is append-only (rule 41, H39), so every application stays visible with its actor and timestamp, and nothing is lost by overwriting the current value. Correcting a mistyped amount stays one call. | y |
| Which permission a cancellation needs | `work-orders:cancel` always, plus `work-orders:cancel-in-execution` whenever the work order carries any outstanding withdrawn part, in any state | H36 tiers by state and justifies the tiering by whether anything left the shelf. H38, a later revision, opened `IN_EXECUTION` to `AWAITING_APPROVAL` through a supplementary round, so a work order can now sit in `AWAITING_APPROVAL` with parts already installed. Keying on outstanding consumption follows H36's stated reason instead of its state list, and changes nothing for the states where no withdrawal is possible. | y |
| How the handler knows there is outstanding consumption | From the aggregate's own part items, with no cross-module read | Feature 7 maintains each part item's `withdrawnQuantity` as the net of withdrawals and returns, inside the same transaction that writes the inventory side (AD-008). The two ledgers state the same fact, so the work order can answer the question itself. | y |
| Who may complete a work order | The assigned mechanic, or any holder of `work-orders:manage` | The state machine names "the assigned mechanic or an administrator" for `Complete Work Order`, which no single permission expresses and `PermissionsGuard.every()` cannot combine. Feature 6 hit the identical shape and answered it with `BudgetDecisionAuthorizer`, checked in the handler after the load. `work-orders:manage` is the permission an administrator and a service advisor hold and a mechanic does not. | y |
| The refusal a wrong completing actor gets | HTTP 403 | `BudgetDecisionAuthorizer` answers 404 instead, to avoid confirming a work order's existence to a stranger, but every actor in reach of this route already holds `work-orders:read` and can read the work order. There is nothing to hide, so the honest status applies. | y |
| Who may deliver | Any holder of `work-orders:manage` | The state machine names "a service advisor or an administrator", which is exactly the set holding `work-orders:manage`. Unlike completion, no assignment is involved, so a plain permission check on the route is enough. | y |
| When the charged total is computed | Once, at completion, and persisted | Phase 12's Risks state it directly. Before completion the figure is still moving with every withdrawal and return, so persisting it earlier would guarantee the drift the same note forbids. A discount applied before completion validates against the figure computed live at that moment. | y |
| What the charged total counts | Service items on approved rounds, plus each part item's withdrawn quantity at its budgeted unit price, minus the discount | Rule 33 defines it as services plus withdrawn parts minus discount, rule 32 fixes the price at the budgeted one whichever way the catalog moved, and rule 31b keeps a rejected round's items uncharged. A planned part never withdrawn contributes nothing, which phase 12's own test list states as its own case. | y |
| Whether settling or writing off touches the count on hand | Neither does | The units left the shelf at withdrawal, which is the only moment stock moves for a work order. Settlement records that they were paid for; a write-off records that they were not. Rule 24 says so for the write-off, and the settlement has no reason to differ. | y |
| Where a settlement or a write-off is recorded | On the movement's own status, plus one row per movement in `stock_movement_transitions` | Rule 25 requires every status change to append an entry naming who did it and when. The table was created in feature 4's migration and has been written by nothing since, with a comment saying it waits for the phase that changes a consumption's status. This is that phase. | y |
| Whether a cancellation reason is mandatory | Yes | Phase 12's API Changes state it: `POST /work-orders/{number}/cancellation`, "with a mandatory reason". | y |
| Whether the board listing needs work to show cancelled work orders | No | `listByStatus` already filters only on an optional status argument, with no exclusion of any state. Cancelled and delivered work orders appear the moment those states become reachable. | y |

**Open questions:** none, all resolved or logged above.

---

## User Stories

### P1: The mechanic finishes the job and the bill is fixed ⭐ MVP

**User Story**: As the mechanic who did the work, I want to mark the job finished, so that the counter knows the car is ready and the customer owes a figure computed from the parts that were actually used.

**Why P1**: Nothing else in this feature is reachable without it. Delivery only happens from `COMPLETED`, and the charged total has no other moment where it can be computed.

**Acceptance Criteria**:

1. WHEN the assigned mechanic or a holder of `work-orders:manage` completes a work order in `IN_EXECUTION` THEN the system SHALL move it to `COMPLETED`, record the completion moment, and append a `Work Order Completed` trail entry naming the acting user.
2. WHEN a work order is completed THEN the system SHALL compute its charged total as the sum of the service items on approved rounds, plus each part item's withdrawn quantity multiplied by its budgeted unit price, minus the recorded discount, and SHALL persist that figure.
3. WHILE a planned part has a withdrawn quantity of zero the system SHALL add nothing for that part to the charged total.
4. The system SHALL exclude every item attached to a rejected round from the charged total.
5. IF the recorded discount is larger than the charged total before the discount THEN the system SHALL refuse the completion with HTTP 422 and SHALL leave the work order in `IN_EXECUTION`.
6. IF the work order is in any state other than `IN_EXECUTION` THEN the system SHALL refuse the completion with HTTP 422.
7. IF the acting user is neither the assigned mechanic nor a holder of `work-orders:manage` THEN the system SHALL refuse the completion with HTTP 403.

**Independent Test**: Reach `IN_EXECUTION` with two services and a part planned at 4 and withdrawn at 3, complete as the assigned mechanic, and read the work order back: status `COMPLETED`, charged total equal to both services plus three units at the budgeted price, and a `Work Order Completed` entry on the trail.

---

### P1: Handing the car over settles the parts that went into it ⭐ MVP

**User Story**: As a service advisor, I want to register that the customer took the car, so that the work order is closed and the parts that went into it stop reading as pending in the stock ledger.

**Why P1**: Delivery is the normal ending. Without it every consumption stays `PENDING` forever and the ledger never states that the parts were paid for.

**Acceptance Criteria**:

1. WHEN a holder of `work-orders:manage` delivers a work order in `COMPLETED` THEN the system SHALL move it to `DELIVERED`, record the delivery moment and the delivering user, and append a `Vehicle Delivered` trail entry.
2. WHEN a vehicle is delivered THEN the system SHALL move every `PENDING` consumption of that work order to `SETTLED` and SHALL append one transition entry per movement recording the previous status, the new status, the acting user and the moment.
3. WHILE settling a work order's consumptions the system SHALL leave every inventory item's count on hand unchanged.
4. IF the work order is in any state other than `COMPLETED` THEN the system SHALL refuse the delivery with HTTP 422.
5. IF the acting user does not hold `work-orders:manage` THEN the system SHALL refuse the delivery with HTTP 403.
6. The system SHALL apply the delivery and the settlement in one transaction, so a failure on either side leaves neither of them applied.

**Independent Test**: Complete a work order that withdrew a part, deliver it as a service advisor, and read the inventory item's movement history: the consumption reads `SETTLED`, the count on hand is what it was before the delivery, and the work order reads `DELIVERED`.

---

### P1: A repair the customer gave up on records the real loss ⭐ MVP

**User Story**: As an administrator, I want to cancel a repair the customer no longer wants, so that the work order stops occupying the vehicle and the parts already installed are recorded as a loss in the amount they were actually lost.

**Why P1**: H4 makes cancellation a first-class ending, and rule 24 makes it the only place in the system where stock leaves without anyone paying for it. Getting the figure wrong hides a loss or invents one.

**Acceptance Criteria**:

1. WHEN a holder of `work-orders:cancel` cancels a work order carrying no outstanding withdrawn part, with a reason, THEN the system SHALL move it to `CANCELED`, record the reason, the cancelling user and the moment, and append a `Work Order Canceled` trail entry.
2. IF a work order carries any outstanding withdrawn part and the acting user does not hold `work-orders:cancel-in-execution` THEN the system SHALL refuse the cancellation with the error code `WORK_ORDER_CANCEL_IN_EXECUTION_FORBIDDEN` and HTTP 403.
3. WHEN a holder of `work-orders:cancel-in-execution` cancels a work order carrying outstanding withdrawn parts THEN the system SHALL move it to `CANCELED` and SHALL write off that work order's outstanding consumptions.
4. WHEN a consumption is written off THEN the system SHALL record as lost its own quantity minus every return that points at it, and SHALL leave the inventory item's count on hand unchanged.
5. WHILE a consumption has been returned in full the system SHALL record no loss for it.
6. IF the work order is in `COMPLETED` or `DELIVERED` THEN the system SHALL refuse the cancellation with HTTP 422.
7. IF the cancellation request carries no reason THEN the system SHALL refuse it with HTTP 400.
8. The system SHALL apply the cancellation and the write-off in one transaction, so a failure on either side leaves neither of them applied.

**Independent Test**: Withdraw 4 units of a part on a work order in execution, return 3, cancel as an administrator, and read the inventory item's movement history: one unit is recorded as written off, the count on hand still holds the three that came back, and a service advisor attempting the same cancellation first receives 403 with `WORK_ORDER_CANCEL_IN_EXECUTION_FORBIDDEN`.

---

### P2: The counter can take money off the bill, on the record

**User Story**: As an administrator, I want to apply a discount with a written reason, so that a customer complaint is answered without anyone editing prices or budgets.

**Why P2**: Rule 32 names the discount as the answer to a price complaint after approval, and rule 33 puts it in the charged total. The two P1 endings work without it, so it ships second.

**Acceptance Criteria**:

1. WHEN a holder of `work-orders:discount` applies a discount carrying a reason to a work order in `IN_EXECUTION` or `COMPLETED` THEN the system SHALL record the amount, the reason, the applying user and the moment, and SHALL append a `Discount Applied` trail entry.
2. WHEN a discount is applied to a work order that already carries one THEN the system SHALL replace the recorded amount, reason, user and moment, and SHALL leave both trail entries in place.
3. IF the discount is larger than the charged total before the discount THEN the system SHALL refuse it with HTTP 422.
4. IF the request carries no reason THEN the system SHALL refuse it with HTTP 400.
5. IF the acting user does not hold `work-orders:discount` THEN the system SHALL refuse the discount with HTTP 403.
6. IF the work order is in any state other than `IN_EXECUTION` or `COMPLETED` THEN the system SHALL refuse the discount with HTTP 422.
7. WHEN a discount is applied to a work order already in `COMPLETED` THEN the system SHALL recompute and persist the charged total with the new discount subtracted.

**Independent Test**: On a work order in execution totalling 30000 cents before discount, apply 25000 with a reason as an administrator, apply 20000 again, and read the work order: the recorded discount is 20000 with the second reason and the second actor, the trail carries both applications, and 35000 is refused with 422.

---

### P2: The closing figures read back

**User Story**: As a service advisor, I want the closing figures and timestamps on the work order I read, so that I can answer a customer without opening the database.

**Why P2**: The writes above are useless if nothing exposes them, but they are testable through the existing read routes on their own.

**Acceptance Criteria**:

1. WHEN a work order that has been completed is read THEN the system SHALL return its charged total, its discount amount, its discount reason and its closing timestamps.
2. WHILE a work order has not been completed the system SHALL return a null charged total.
3. WHEN a work order that has been cancelled is read THEN the system SHALL return its cancellation reason, the cancelling user and the cancellation moment.
4. WHEN an inventory item's movement history is read THEN the system SHALL show each consumption's current status, including `SETTLED` and `WRITTEN_OFF`.
5. WHEN a work order's trail is read THEN the system SHALL show every closing transition with the acting user and the moment.

**Independent Test**: Walk a work order from creation to delivery, read it, and see a non-null charged total with both closing timestamps; cancel a second one and see its reason and canceller; read both trails and see every transition with its actor.

---

## Edge Cases

- IF a work order in execution has no withdrawn part at all THEN the system SHALL cancel it on `work-orders:cancel` alone and SHALL write off nothing.
- IF a work order is completed with no part withdrawn THEN the system SHALL set the charged total to the approved services alone.
- WHEN a part was withdrawn 4 and returned 3 and the work order is then cancelled THEN the system SHALL record a loss of exactly one unit for that consumption.
- WHEN a work order carrying withdrawn parts sits in `AWAITING_APPROVAL` after a supplementary round was submitted THEN the system SHALL require `work-orders:cancel-in-execution` to cancel it.
- IF a discount is applied and a later return drops the charged total below it THEN the system SHALL refuse the completion until the discount is reapplied within the new total.
- WHEN a work order is delivered while carrying a consumption that was already fully returned THEN the system SHALL settle it like any other pending consumption, leaving the count on hand untouched.
- IF a work order is cancelled twice THEN the system SHALL refuse the second attempt with HTTP 422, since `CANCELED` is terminal.
- IF a work order in `RECEIVED` is delivered THEN the system SHALL refuse with HTTP 422, since delivery only happens from `COMPLETED`.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| WOC-01 | P1: The mechanic finishes the job and the bill is fixed | Execute | ✅ Verified |
| WOC-02 | P1: Handing the car over settles the parts that went into it | Execute | ✅ Verified |
| WOC-03 | P1: A repair the customer gave up on records the real loss | Execute | ✅ Verified |
| WOC-04 | P2: The counter can take money off the bill, on the record | Execute | ✅ Verified |
| WOC-05 | P2: The closing figures read back | Execute | ✅ Verified |

**ID format:** `WOC-NN`

**Coverage:** 5 total, 5 verified. See `.specs/features/work-order-closing/validation.md`.

---

## Success Criteria

- [ ] A work order walks from creation to delivery in one e2e run, ending `DELIVERED` with a charged total that equals the approved services plus the withdrawn parts at their budgeted prices, minus any discount.
- [ ] A part withdrawn and never returned reads `SETTLED` after delivery and `WRITTEN_OFF` after a cancellation, and the count on hand is identical either way.
- [ ] A part withdrawn 4 and returned 3 records exactly one unit of loss on cancellation.
- [ ] A service advisor cancelling a work order that carries withdrawn parts receives 403 with `WORK_ORDER_CANCEL_IN_EXECUTION_FORBIDDEN`, in `IN_EXECUTION` and in `AWAITING_APPROVAL` alike.
- [ ] Every closing transition appears on the trail with the user who caused it.
- [ ] The full gate stays green, with no regression in the 884 tests this feature starts from.
