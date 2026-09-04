# 0015. Stock movements append only, with transitions for the consumption status

**Status**: Accepted
**Recorded**: 2026-09-02, from the decisions taken during the build

## Context

A part taken for a work order is not money entering the till. It leaves the shelf before anyone
knows whether the job will be delivered, cancelled, or need the part returned, and the workshop
has to be able to trace where each unit went afterwards.

H5 and H18 in the event storming state the need directly.

## Decision

`stock_movements` is append only. A movement carries the work order it was taken for, the actor
who took it, and a status. No row is ever updated to a different meaning and no row is deleted.

Every status change appends a history entry to `stock_movement_transitions` rather than
overwriting the movement. Three statuses exist, in `StockMovementStatus`: `PENDING`, `SETTLED` and
`WRITTEN_OFF`. Only a consumption ever carries one; an inbound or adjustment movement's status is
null.

## Alternatives

Only a quantity column on the item was rejected: it cannot express a consumption waiting on a
delivery, a transfer between work orders, or a loss. A single number tells you what is left and
nothing about how it got there.

## Consequences

The ledger is the authority on stock, and the item's quantity is derived from it rather than the
other way round. When the two disagree, the movements are right.

The history answers questions a quantity cannot: which work order took a unit, who withdrew it,
when it settled, and whether it was written off rather than returned.

The transfer case named in the rejected alternative above no longer exists. Since revision 8 of
the event storming, extra work is authorised on the same work order (ADR 0018) instead of opening
a successor, so there is no second work order to transfer a consumption to. H18 records that
change. The status set is three, not four, and the code carries no transfer command.

Append only means the table grows monotonically. At one workshop's volume that is not a concern
worth designing around today.
