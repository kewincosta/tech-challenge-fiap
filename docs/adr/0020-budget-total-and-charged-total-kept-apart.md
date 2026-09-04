# 0020. Budget total and charged total kept as two separate values

**Status**: Accepted
**Recorded**: 2026-09-02, from the decisions taken during the build

## Context

What the customer approved and what the customer pays are not the same number, and the difference
is legitimate. A part planned in an approved round may never be withdrawn, because the mechanic
found it unnecessary. A discount may be applied at the counter. The approved value still has to be
visible afterwards, because it is what the customer agreed to.

This follows from the answers to H12 and H21 in the event storming.

## Decision

The work order carries two totals. The budget total belongs to its round and never changes after
approval. The charged total is computed at completion from the approved services plus the parts
actually withdrawn, minus the discount, and is stored as `charged_total_cents`.

## Alternatives

One total, adjusted in place, was rejected: it would erase what the customer approved. After the
adjustment there would be no record of the figure they said yes to.

## Consequences

A planned part that was never withdrawn is not charged, and the gap between the two totals is
where that shows.

Both numbers are answerable at any time after completion. "What did they approve" and "what did
they pay" are different questions with different answers, and the work order holds both.

`charged_total_cents` is null before completion, because until the work is finished there is no
final answer to give. That nullability is meaningful rather than incidental.

A discount changes the charged total and never the budget total, which is what keeps the discount
visible as a deliberate act rather than as a smaller quote.
