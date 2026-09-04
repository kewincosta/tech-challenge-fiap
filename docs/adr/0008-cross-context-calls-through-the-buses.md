# 0008. Cross context communication through the CommandBus and the QueryBus

**Status**: Accepted
**Source**: AD-003 in `.specs/STATE.md`
**Recorded**: 2026-09-02, from the decisions taken during the build

## Context

The system is one deployable application holding five bounded contexts (ADR 0001), so nothing
physically stops one module from importing another's repository. What keeps the boundary real has
to be a rule, because the compiler will not enforce it on its own.

The pattern already existed between `users` and `authorization`: registration assigns the
`CUSTOMER` role by dispatching a command rather than by reaching into the authorization module.

## Decision

Modules talk only through the `CommandBus` and the `QueryBus`, exchanging identifiers and DTOs. No
module injects another module's repository, and no module imports another's entities.

## Alternatives

Exporting repositories from each module was rejected: it turns the module boundary into a
suggestion.

## Consequences

A cross-module read costs a bus round trip instead of a join. Finding a customer by document goes
`customers` to `users` over the `QueryBus` rather than joining the two tables.

A write that spans two modules has to be given an explicit shared transaction, because two
handlers reached through the bus would otherwise open one each. ADR 0023 is the rule that makes
those repositories join the caller's transaction instead.

The boundary is checkable by reading imports: a module importing another module's repository is
visible in the import list, which is what makes the rule enforceable in review.
