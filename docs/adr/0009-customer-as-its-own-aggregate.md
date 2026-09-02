# 0009. Customer as its own aggregate, over a user identity

**Status**: Accepted
**Source**: AD-004 in `.specs/STATE.md`
**Recorded**: 2026-09-02, from the block in `docs/ddd/implementation-plan.md` section 7

## Context

A person who brings a car to the workshop is two things at once. They are an identity, with a
document, an email and a password, which is what the `users` module already held. They are also a
relationship the workshop keeps data about: an address, vehicles, a history of work orders.

H25 in the event storming states the need directly.

## Decision

`Customer` is an aggregate of its own, in the Customer Management context, holding a reference to
the user identity rather than absorbing it.

Its invariant is its own and belongs nowhere else: exactly one identity per customer, and at most
one customer per identity.

## Alternatives

A customer as a user holding the `CUSTOMER` role, with no table of its own, was rejected: it has
no home for the address, and every later piece of customer data would land on the `users` table,
growing the identity module with a domain that is not identity.

## Consequences

Finding a customer by document crosses a module boundary, because the document lives on the user
record and the customer record points at it. That lookup goes through the `QueryBus` (ADR 0008)
rather than through a join.

Registering a customer is two writes in two modules, so it needs the shared transaction rule ADR
0023 records.

The `CUSTOMER` role and the customer record are separate facts. Registration assigns the role to
every account; the customer record is created deliberately. An account can hold the role without
being a customer, which is why the customer-scoped reads answer an empty list rather than an error
for such a user.
