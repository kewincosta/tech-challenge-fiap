# 0013. One InventoryItem aggregate covering parts and supplies

**Status**: Accepted
**Recorded**: 2026-09-02, from the decisions taken during the build

## Context

The briefing names parts and supplies as two things the workshop holds. A part is fitted to a
vehicle and a supply is consumed while working on one, which is a real distinction in conversation
but not in any rule the system enforces.

Both are counted in whole units per SKU, both are replenished, both are withdrawn against a work
order, both can run short, and both are written off the same way when a work order is cancelled.
H11 in the event storming states the answer directly: whole units per SKU, and parts and supplies
share one stock model.

## Decision

One `InventoryItem` aggregate covers both, distinguished by a `kind` label with two values, `PART`
and `SUPPLY`, enforced by the `chk_inventory_items_kind` check constraint.

## Alternatives

Separate `Part` and `Supply` aggregates were rejected: two identical rule sets for one adjective.

## Consequences

Every stock rule is written once. A change to how shortages are detected, or to how a withdrawal
is charged, lands in one aggregate rather than in two that have to be kept in step.

`kind` is a label, not a behaviour. Nothing in the domain branches on it today, and a rule that
did would be the signal that this decision needs revisiting.

Listing or filtering by kind is a read concern, answered by the query adapter, not by a second
aggregate.
