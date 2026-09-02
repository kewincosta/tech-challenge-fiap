# 0025. Any deviation from an approved budget cancels the work order and opens a new one

**Status**: Superseded by [0018](0018-numbered-budget-rounds.md)
**Recorded**: 2026-09-02, from the block in `docs/ddd/implementation-plan.md` section 7 that section 10 never numbered

## Context

This record exists because the decision was taken, written down, and later reversed. Section 10 of
the implementation plan assigned numbers to 22 decisions and did not assign one to this, which
would have left it homeless once section 7 became an index. It is numbered here so the reasoning
behind the reversal stays readable, which is what section 10's own rule about superseded records
is for.

At the time, work found during execution that the approved budget did not cover had to go
somewhere. The answer chosen was to end the current work order and start a fresh one that names
its predecessor.

## Decision

As originally decided: any deviation from an approved budget cancels the work order and opens a
new one. One rule covered extra work, part swaps and abandonment alike.

H2 in the event storming carries the same answer, and still does: "Work the budget does not cover
means cancelling and opening a new work order, which names its predecessor."

## Alternatives

Budget versioning with a re-approval transition was rejected at the time, on the ground that it
was the complexity the MVP was told to avoid.

That is the alternative that was later adopted. ADR 0018 is it.

## Consequences

This decision is not in force. The code implements 0018:
`WorkOrder.submitSupplementaryBudget` runs from `IN_EXECUTION`, opens the next numbered round and
returns the work order to `AWAITING_APPROVAL`. Nothing cancels a work order because the scope
grew.

Two traces of this decision survive in the documents. H18 records the reversal, noting that since
revision 8 there is no successor work order and the stock transfer case disappeared with it. H2
does not, and still reads as though this record were in force. Reconciling H2 belongs to this
feature's consistency pass, not to this record, which is deliberately left as it was decided.

The reversal is why the write-off in ADR 0016 has no transfer counterpart: with no successor work
order, there is nowhere to transfer a consumption to.
