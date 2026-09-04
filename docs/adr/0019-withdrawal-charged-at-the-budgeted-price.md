# 0019. A withdrawal is charged at the price its budget round froze

**Status**: Accepted
**Recorded**: 2026-09-02, from the decisions taken during the build

## Context

A budget freezes catalog prices when it is generated. Between approval and withdrawal the catalog
can move in either direction, and the part the mechanic takes off the shelf may now be listed
higher or lower than the customer approved.

H12 and H22 in the event storming ask which price is charged.

## Decision

Always the price the budget round froze, whichever way the catalog moved. The frozen price travels
on the work order item as `budgetedUnitPriceCents`, alongside the round it belongs to, and the
charged total is computed from it rather than from the catalog.

A price drop is answered by a person applying a discount, with a reason recorded (ADR 0020's
charged total is where that lands).

## Alternatives

Charging the lower of the budgeted and the current price was rejected: it moves a commercial
decision into an automatic rule and leaves no reason behind for why the bill changed. A customer
asking why they were charged less would get an answer from a pricing table rather than from a
person.

## Consequences

The customer pays what was approved. The bill is predictable from the document they said yes to.

A catalog price change never rewrites history. It applies to rounds generated after it, and to
nothing already frozen.

A drop that the workshop wants to pass on is a deliberate act with an actor and a reason attached,
which is visible on the work order rather than inferred from arithmetic.

Because each round freezes its own prices, two items of the same service on one work order can
legitimately carry different unit prices when they were budgeted in different rounds.
