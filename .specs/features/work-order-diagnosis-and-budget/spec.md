# Work Order Diagnosis And Budget Specification

## Problem Statement

A work order today opens, collects requested services and planned parts, and stops there. Nobody has looked at the vehicle, nothing carries a price, and the customer has nothing to say yes or no to. This feature adds the diagnosis, the priced budget the system builds from what the mechanic found, the customer's decision on it, and the move into execution that only an approved budget can trigger. It also handles the work nobody could see at reception: extra repairs found mid-execution go into a new numbered round the customer decides on separately.

## Goals

- [ ] A mechanic opens the diagnosis and the work order records who is responsible for it.
- [ ] Completing the diagnosis produces a total the system computed from the items, with every price frozen at that moment.
- [ ] Only the owning customer or a staff member with the decide permission moves a work order into execution, and only by approving a budget.
- [ ] Extra work found during execution is priced in its own round and decided on its own, without disturbing what was already approved.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| --- | --- |
| Part withdrawal and stock consumption | Plan phase 11. H38's rule that a part is withdrawable only once its own round was approved is recorded by this feature's data (each item carries its round) and enforced where the withdrawal command lives. Phase 10's test list names a withdrawal test that cannot run before that command exists, the same shape as `work-order-creation`'s unreachable `Plan Part` state. |
| Discount, completion, delivery, cancellation and settlement | Plan phase 12, which owns those columns, those transitions and the `work-orders:cancel-in-execution` rule. |
| The charged total | Plan phase 12. It sums the parts actually withdrawn, so it cannot be computed before withdrawals exist. This feature computes only the budget total. |
| `Get My Work Orders`, `Get My Work Order` and the metrics | Plan phase 13, with `work-orders:read-own` and the customer-scoped reads. |
| A notification that the budget went out | H8 settles this: "Sent" means the budget is available to be read, with no real dispatch. The trail entry is the record that it went out. |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here. The domain rules come from `docs/ddd/implementation-plan.md` phases 9 and 10 and `docs/ddd/event-storming.md` (section 9's WorkOrder aggregate, section 10 rules 28 to 38, section 11's state machine, section 13's read models, H3, H8, H15, H38). What follows are the points those documents left unstated or state inconsistently.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Completing the diagnosis again after round one was rejected | Replaces round one rather than opening round two | Phase 9's own test list says "should replace the budget when the diagnosis is completed again after a rejection", and H38 reserves every round above one for extra work found during execution. The replaced round returns to `PENDING` with a new total, a new generation moment and its decision cleared; the rejection itself stays on the trail, so nothing is lost. | y |
| What a part item contributes to a round total | Its budgeted unit price multiplied by its planned quantity | Rule 30 says the total is "the sum of the service items plus the sum of the planned part items" without spelling the multiplication, and a planned quantity exists precisely to be multiplied. A service item carries no quantity, so it contributes its price once. | y |
| `Start Execution` as a command | Not an actor-facing command and not a route | Phase 10's Policies line makes it automatic ("WHEN Budget Approved THEN Start Execution") and its API list names only the approval and the rejection routes. The aggregate performs it as part of deciding a round. | y |
| The permission on the diagnosis routes | `work-orders:execute`, which `MECHANIC` holds | Section 11 says the actor starting a diagnosis is a mechanic, and phase 9's API list states no permission. `work-orders:execute` is the seeded permission that names exactly that capability. | y |
| The permission on the supplementary submission | `work-orders:execute` as well | Section 11 puts the supplementary items and their submission in the mechanic's hands, during execution. | y |
| How "the owning customer or a holder of `work-orders:decide`" is enforced | Inside the handler, not by a route decorator | The existing `RequirePermissions` decorator requires **all** listed permissions (`permissions.guard.ts:36` uses `.every()`), so it cannot express "either of two". The decision check therefore reads the actor's effective access and the work order's owning customer itself. The exact shape is design's to settle. | y |
| Resolving the acting customer from the principal | Through the `customers` module over the `QueryBus` | A work order points at a customer while the principal carries a user, which is the risk phase 10 names directly. `GetCustomerByUserIdQuery` already answers exactly this. | y |
| `work_orders.budget_decided_at` and `budget_decided_by_user_id` against the same columns on each round | The work order columns hold the latest decision; each round row keeps its own | Phase 10 adds both sets. Section 9 asks the work order to carry "the actor of the steps that matter commercially", which is what the work order columns serve. The round rows stay the source of truth for per-round history. | y |
| Which items a round takes when it is generated | Every item of that work order whose round is still unset | That is what "draft" means in H38 and in section 11's `IN_EXECUTION` rows. Items already attached to a decided round are never re-priced. | y |
| `execution_started_at` when a supplementary round returns the work order to execution | Set once, on the first entry into `IN_EXECUTION`, and never overwritten | Section 9's invariants list `executionStartedAt` among the fields set once. A later round returning the work order to execution is not a new execution. | y |
| Removing an item while `IN_EXECUTION` | Allowed only for a draft item | Section 11's forbidden list ends with "touching the items of a round that was already decided", which narrows the guard `removeItem` carries today. | y |
| A rejected round's items | Stay attached to that round | H38 and rule 31b both say so: they are never withdrawn and never charged, and they do not return to the draft for a later round to pick up. | y |

**Open questions:** none, all resolved or logged above.

---

## User Stories

### P1: The diagnosis opens and holds a mechanic responsible ⭐ MVP

**User Story**: As a mechanic, I want to open the diagnosis of a work order that arrived, so that the workshop knows the vehicle is being looked at and by whom.

**Why P1**: Nothing can be priced before somebody has examined the vehicle, and the state machine has no other way out of `RECEIVED`.

**Acceptance Criteria**:

1. WHEN an actor holding `work-orders:execute` starts the diagnosis of a work order in `RECEIVED` THEN the system SHALL move it to `IN_DIAGNOSIS`, record the moment it started, and append a trail entry naming the acting user.
2. WHILE a work order carries no assigned mechanic, WHEN its diagnosis starts THEN the system SHALL record the acting user as its mechanic.
3. WHILE a work order already carries an assigned mechanic, WHEN its diagnosis starts THEN the system SHALL leave that assignment untouched.
4. IF the diagnosis is started on a work order in any state other than `RECEIVED` THEN the system SHALL refuse it with HTTP 422.
5. IF the actor lacks `work-orders:execute` THEN the system SHALL refuse the start with HTTP 403.
6. IF no work order carries the requested number THEN the system SHALL respond with HTTP 404.

**Independent Test**: Start the diagnosis of a freshly opened work order as a mechanic, see it in `IN_DIAGNOSIS` with that mechanic assigned, and receive 422 on a second attempt.

---

### P1: Completing the diagnosis prices what was found ⭐ MVP

**User Story**: As a mechanic, I want completing the diagnosis to produce the budget, so that the customer gets a total built from the vehicle's real needs instead of a number somebody typed.

**Why P1**: Rule 29 makes the system the only author of the total, and the customer has nothing to decide on until a round exists.

**Acceptance Criteria**:

1. WHEN an actor holding `work-orders:execute` completes the diagnosis of a work order in `IN_DIAGNOSIS` carrying at least one item THEN the system SHALL generate budget round one, move the work order to `AWAITING_APPROVAL`, and append trail entries for the completion and for the generated budget.
2. WHEN a budget round is generated THEN the system SHALL compute its total as the sum of its service items' prices plus the sum of each part item's price multiplied by its planned quantity.
3. The system SHALL accept no budget total from any request payload.
4. WHEN a budget round is generated THEN the system SHALL freeze each of its items' current unit price onto that item as its budgeted price, and SHALL attach every draft item of the work order to that round.
5. WHILE a round exists the system SHALL keep its total and its items' budgeted prices unchanged, whichever way the catalog price moves afterwards.
6. IF the diagnosis is completed while the work order carries no service item and no part item THEN the system SHALL refuse it with HTTP 422.
7. IF the diagnosis is completed on a work order in any state other than `IN_DIAGNOSIS` THEN the system SHALL refuse it with HTTP 422.
8. The system SHALL enforce at the database level that one work order never carries two rounds with the same round number.
9. IF the actor lacks `work-orders:execute` THEN the system SHALL refuse the completion with HTTP 403.

**Independent Test**: Add a service at 150.99 and two parts at 25.00 to a work order, complete the diagnosis, and read back a round one total of 200.99 with the work order in `AWAITING_APPROVAL`.

---

### P1: The customer decides, and approval starts the work ⭐ MVP

**User Story**: As a customer, I want to approve or refuse the budget for my own vehicle, so that the workshop only does work I agreed to pay for.

**Why P1**: Rule 37 forbids execution without an approved budget, so this is the only door into `IN_EXECUTION`.

**Acceptance Criteria**:

1. WHEN the owning customer, or an actor holding `work-orders:decide`, approves the pending round of a work order in `AWAITING_APPROVAL` THEN the system SHALL mark that round `APPROVED`, record who decided it and when, move the work order to `IN_EXECUTION`, and record the moment execution started.
2. WHEN round one is rejected THEN the system SHALL mark it `REJECTED`, record who decided it and when, and move the work order back to `IN_DIAGNOSIS`.
3. WHEN the diagnosis is completed again after round one was rejected THEN the system SHALL replace round one with a newly generated round one, priced from the work order's items as they stand at that moment.
4. WHILE a work order has entered `IN_EXECUTION` once the system SHALL keep the recorded moment execution started unchanged, even when a later round returns it to execution.
5. IF the actor is neither the owning customer nor a holder of `work-orders:decide` THEN the system SHALL respond with HTTP 404, never confirming that the number exists.
6. IF a decision is taken on a work order in any state other than `AWAITING_APPROVAL` THEN the system SHALL refuse it with HTTP 422.
7. The system SHALL never move a work order into `IN_EXECUTION` while it carries no approved round.

**Independent Test**: Approve a pending round as the owning customer, see the work order in `IN_EXECUTION` with the round `APPROVED`, then attempt the same call as a different customer and receive 404.

---

### P1: Extra work found during execution goes to its own round ⭐ MVP

**User Story**: As a mechanic, I want to price repairs I only discovered with the car open, so that the customer authorises them without cancelling the work already agreed.

**Why P1**: H38 makes numbered rounds the mechanism for additional repairs, and without them the only way to handle extra work is to cancel the work order.

**Acceptance Criteria**:

1. WHILE a work order is `IN_EXECUTION` the system SHALL accept new service and part items, holding them as a draft attached to no round.
2. IF an item belonging to a round that was already decided is removed THEN the system SHALL refuse it with HTTP 422.
3. WHEN an actor holding `work-orders:execute` submits the supplementary budget of a work order in `IN_EXECUTION` whose draft carries at least one item THEN the system SHALL generate the next numbered round over those draft items, move the work order to `AWAITING_APPROVAL`, and append the trail entries.
4. IF the supplementary budget is submitted while the draft carries no item THEN the system SHALL refuse it with HTTP 422.
5. WHEN a round above one is approved THEN the system SHALL mark it `APPROVED` and return the work order to `IN_EXECUTION`.
6. WHEN a round above one is rejected THEN the system SHALL mark it `REJECTED` and return the work order to `IN_EXECUTION`.
7. WHILE a round is `REJECTED` the system SHALL keep its items attached to it and out of every later round.

**Independent Test**: With a work order in execution, add a part, submit the supplementary budget, refuse it as the customer, and confirm the work order is back in execution with round two `REJECTED` and its item still attached to it.

---

### P2: The budget and its rounds read back

**User Story**: As a service advisor, I want to see every round of a work order with its total and its decision, so that the counter can explain what was quoted and what the customer answered.

**Why P2**: The write side is what features 7 and 8 depend on. The reads over it can follow without blocking them.

**Acceptance Criteria**:

1. WHEN an actor holding `work-orders:read` reads a work order THEN the system SHALL return every budget round with its number, its total, its status, the moment it was generated, and its decision when it carries one.
2. WHEN an actor holding `work-orders:read` reads a work order THEN the system SHALL return each item's budgeted unit price and the round it belongs to, or null for both while it is still a draft.
3. WHEN an actor holding `audit:read` reads the trail THEN the system SHALL show an entry for the diagnosis start, the diagnosis completion, each generated round and each round decision, in chronological order.
4. WHILE a work order carries no budget the system SHALL return an empty round list rather than an error.

**Independent Test**: Walk a work order through a rejection and a re-quote, then read it back and see round one with its current total and status, and the trail showing both decisions in order.

---

## Edge Cases

- IF the diagnosis is started on a work order whose diagnosis already started THEN the system SHALL refuse it with HTTP 422.
- IF two supplementary submissions for the same work order arrive concurrently THEN the system SHALL generate one round and refuse the other, the database's unique round number being what decides.
- WHEN a round is rejected THEN its items SHALL stay attached to it rather than returning to the draft for a later round.
- IF the catalog price of an item changes between a round's generation and its decision THEN the round's total SHALL keep the price it froze.
- WHILE a work order is `AWAITING_APPROVAL` the system SHALL refuse every item addition and removal.
- IF a customer who does not own the work order decides on its budget THEN the system SHALL answer 404 rather than 403.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| WOB-01 | P1: The diagnosis opens and holds a mechanic responsible | Design | In Design |
| WOB-02 | P1: Completing the diagnosis prices what was found | Design | In Design |
| WOB-03 | P1: The customer decides, and approval starts the work | Design | In Design |
| WOB-04 | P1: Extra work found during execution goes to its own round | Design | In Design |
| WOB-05 | P2: The budget and its rounds read back | Design | In Design |

**ID format:** `WOB-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 5 total, 0 mapped to tasks, 5 unmapped

---

## Success Criteria

- [ ] A work order walks from `RECEIVED` through `IN_DIAGNOSIS` and `AWAITING_APPROVAL` into `IN_EXECUTION` through the API alone, with no SQL.
- [ ] No route accepts a budget total, proven by there being no field for one anywhere in the request payloads.
- [ ] A round's frozen prices survive a later catalog change, proven against real PostgreSQL rather than argued.
- [ ] A full supplementary cycle returns a work order to execution with a wider approved scope, and a refused one returns it with the scope it already had.
