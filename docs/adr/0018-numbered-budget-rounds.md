# 0018. Numbered budget rounds, so additional repairs are authorised in place

**Status**: Accepted
**Supersedes**: [0025](0025-deviation-from-the-budget-cancels-the-work-order.md)
**Recorded**: 2026-09-02, from the aggregate invariants in `docs/ddd/event-storming.md` section 9 and its main flow in section 5

## Context

A mechanic in execution finds work the approved budget does not cover. That is the ordinary case,
not the exception: a car opened up shows what a diagnosis could not.

The original answer was to cancel the work order and open a new one naming its predecessor, which
ADR 0025 records. That decision was reversed at revision 8 of the event storming. H18 states the
consequence plainly: "Since revision 8 there is no successor work order, because extra work is
authorised on the same one, so the transfer case disappeared."

## Decision

Budgets are numbered rounds on the same work order. Round one comes from the diagnosis; later
rounds come from extra work found during execution.

Items belong to a round. The items of an approved or rejected round are frozen, and new items go
into the draft round. A round is generated from the items of its own round, and its total is
always the sum of those items.

Submitting a supplementary budget moves the work order from `IN_EXECUTION` back to
`AWAITING_APPROVAL`. The customer authorises the additional repairs or refuses them, and either
way the work order returns to execution: with the extra scope when approved, with the original
scope when refused. The parts of a refused round are never withdrawn and never charged.

## Alternatives

Cancelling and opening a successor work order is the alternative, and it is not hypothetical: it
was the decision until revision 8. ADR 0025 carries its original reasoning and the alternative it
rejected in turn, which was this one. It was reversed because a cancellation per discovery
fragments one repair across several work orders, loses the thread the customer is following, and
takes the stock consumptions with it.

## Consequences

One repair is one work order, whatever it turns out to need. The trail, the parts and the history
stay in one place.

A work order can be in `AWAITING_APPROVAL` more than once in its life, so status alone does not
tell you which round is pending. `Budget.round` and `BudgetStatus` do.

`ux_work_orders_active_vehicle` allows a vehicle only one non-terminal work order, which is
consistent precisely because a discovery no longer opens a second one.

Every price in a round is frozen when that round is generated, which is what makes ADR 0019's
charge-at-the-budgeted-price rule well defined across rounds.
