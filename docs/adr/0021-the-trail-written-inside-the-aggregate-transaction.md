# 0021. The work order trail written by the repository in the same transaction

**Status**: Accepted
**Source**: AD-007 in `.specs/STATE.md`
**Recorded**: 2026-09-02, from AD-007 and the decisions taken during the build

## Context

The workshop needs to know who did what to a work order and to a stock movement: who opened it,
who diagnosed it, who approved the budget, who withdrew which part, who cancelled and why. H29 in
the event storming states the need.

Where that history lives is the first question, and how it gets written is the second. The second
one was answered twice, because the first answer did not survive contact with the requirement.

## Decision

Actions are traced with append only trails attached to the thing they happened to, not to the
person who did them. `work_order_events` belongs to the work order; the stock movement transitions
belong to the movement.

The trail is written by `TypeOrmWorkOrderRepository.save`, through the same `EntityManager` that
persists the aggregate, inside the same transaction. It is not written by an event subscriber.

`AggregateRoot` therefore exposes a read of its recorded events that does not drain them, so the
repository can write the trail from the same events the handler will publish afterwards, and every
domain event that feeds a trail carries the acting user.

## Alternatives

An `Administrator` aggregate holding what it did was rejected: it puts the history of a work order
somewhere other than the work order, and it would not cover actions by service advisors and
mechanics.

A post-commit event subscriber was the original mechanism and was rejected before any trail code
shipped. A subscriber runs after the commit, so a failure inside it loses an entry while the fact
it describes is already saved. The section 7 block still lists that subscriber under its Cost
line, which is the version this record replaces.

## Consequences

A trail entry and the fact it describes commit together or not at all. There is no window in which
a work order changed state and nothing recorded it.

The repository does more than persist an aggregate: it also derives trail rows from that
aggregate's events. That is a deliberate widening of the repository's job, taken because the
alternative loses entries.

Two trails overlap on a withdrawal, one in `work_order_events` and one in
`stock_movement_transitions`, written from two aggregates in one transaction. They answer different
questions. If they ever disagree, the movement history is the authority on stock and the trail is
the authority on the work order.
