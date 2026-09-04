# 0016. Cancellation writes movements off instead of returning units to stock

**Status**: Accepted
**Recorded**: 2026-09-02, from the decisions taken during the build

## Context

A work order can be cancelled after the mechanic has already withdrawn parts for it. Those units
are gone from the shelf, and in the ordinary case they are installed in a car the workshop will
not charge for.

H18 in the event storming asks what happens to them.

## Decision

Cancelling a work order writes its pending consumptions off. The units never return to stock. Each
write-off appends a transition carrying its actor and reason, so the loss stays visible in the
movement history rather than being absorbed silently.

This is distinct from a return. A part that turns out unnecessary and is physically put back on
the shelf is returned through its own command while the work order is still open, and that does
restore the quantity. Cancellation is for what was already used.

## Alternatives

Reversing the movement and returning the units was rejected: it would invent stock that does not
physically exist and hide a real loss. The shelf count would say the part is available and the
first person to reach for it would find nothing.

## Consequences

Stock stays honest. The quantity the system reports is the quantity somebody can pick up.

The loss is attributable. The write-off names who cancelled and why, so a pattern of cancellations
after withdrawal is visible in the ledger rather than only in the work order trail.

Cancellation and withdrawal cannot race into an inconsistent state: a work order cancelled while a
withdrawal is in flight leaves no orphan pending consumption, which the concurrency guard in ADR
0024 is what makes true.
