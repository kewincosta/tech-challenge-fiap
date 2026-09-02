# 0017. Budget as an entity inside the WorkOrder aggregate

**Status**: Accepted
**Recorded**: 2026-09-02, from the block in `docs/ddd/implementation-plan.md` section 7

## Context

A budget prices what a work order proposes to do. Approving it is not only a fact about the
budget: it moves the work order from awaiting approval into execution, in the same act. Rejecting
it sends the work order back to diagnosis.

A budget with no work order has no meaning in this system. Nobody quotes a price for nothing.

## Decision

`Budget` is an entity inside the `WorkOrder` aggregate, not an aggregate of its own. The work
order owns its budgets, generates them from its own items, and changes its own status when one is
approved or rejected.

## Alternatives

Budget as its own aggregate was rejected: it splits one transaction into two for a decision taken
in one step. Approving would have to write the budget in one aggregate and the work order status
in another, with no way to make both true at once without inventing a coordination the domain does
not need.

## Consequences

Approval is one write to one aggregate, so the budget decision and the status change commit
together or not at all.

Budgets are loaded with their work order and are not addressable on their own. There is no
`GET /budgets/{id}`; a budget is read as part of the work order that owns it.

The aggregate is larger for it, holding budgets alongside service items and part items. That size
is what ADR 0024's version guard protects, since several commands can touch it concurrently.
