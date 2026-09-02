# 0010. No aggregate for Mechanic, Service advisor and Administrator

**Status**: Accepted
**Source**: AD-004 in `.specs/STATE.md`
**Recorded**: 2026-09-02, from the block in `docs/ddd/implementation-plan.md` section 7

## Context

Four business actors work in this system. Customer got an aggregate of its own (ADR 0009), which
raises the symmetric question for the other three. H28 in the event storming states the answer
directly.

## Decision

Mechanic, Service advisor and Administrator get no aggregate. In this system they have no state,
no behaviour and no invariant beyond their access, which the `authorization` module already holds
as roles and permissions.

Linking a work order to a mechanic needs a user reference and a role check, which is what
`assigned_mechanic_user_id` and the assignment handler do.

## Alternatives

One aggregate per profile was rejected: three tables each holding a foreign key to `users` and a
copy of the user status, with no invariant of their own to justify them.

## Consequences

A work order points at `customer_id` and at `assigned_mechanic_user_id`. That asymmetry is
deliberate and it reflects exactly what is modelled and what is not.

The decision has a stated trigger to revisit, which this record keeps rather than dropping: a
specialty, an hourly cost or a shift for the mechanic; a sale as a concept for the service
advisor, which would need a cash register the MVP does not have; or staff records carrying data of
their own. Any of those turns a profile into something with state, and then it earns an aggregate.
