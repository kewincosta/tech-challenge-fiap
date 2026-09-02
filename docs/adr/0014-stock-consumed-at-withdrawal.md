# 0014. Stock consumed at withdrawal, with no reservation phase

**Status**: Accepted
**Recorded**: 2026-09-02, from H5 in `docs/ddd/event-storming.md`

## Context

A work order plans parts during diagnosis and uses them during execution. Between those two
moments the system could hold the units in some intermediate state, reserved for that work order
and unavailable to any other, or it could leave them on the shelf until somebody physically takes
them.

H5 in the event storming asks exactly this: stock reservation or direct consumption.

## Decision

No reservation. Planning a part records an intent on the work order and touches stock not at all.
The mechanic withdraws the part when it is used, during execution, and that withdrawal is what
decrements stock.

## Alternatives

No alternative is recorded in this repository beyond the one the question itself names. H5 is
framed as a choice between reservation and direct consumption and answers it without arguing
against reservation, so no rejection reasoning is claimed here.

## Consequences

Planned quantity and withdrawn quantity are two different numbers on a work order part item, and
only the second one has touched stock. The charged total counts what was withdrawn, not what was
planned.

A shortage surfaces at withdrawal rather than at planning. Two work orders can plan the same last
unit, and the second mechanic to reach for it is the one who finds it gone. The stock shortage
read model exists to make that visible before it happens rather than to prevent it.

Because units leave the shelf before the work order closes, a consumption is not final when it is
made. It is `PENDING` until delivery settles it or cancellation writes it off, which is what ADR
0015's status set carries.
