# 0023. A repository reachable from a cross-module write honours an ambient transaction

**Status**: Accepted
**Source**: AD-008 in `.specs/STATE.md`
**Recorded**: 2026-09-02, from AD-008, taken during the `work-order-part-withdrawal` feature

## Context

Modules talk over the buses (ADR 0008), and a write that spans two of them has to commit as one.
`TransactionRunner` carries a single transaction across a `CommandBus` dispatch through
`AsyncLocalStorage`, because a command payload cannot carry an `EntityManager`.

That only works if the repository on the far side of the dispatch uses the manager it finds. A
repository that calls `dataSource.transaction` unconditionally opens a second transaction on a
second connection, and the two writes become independent while looking, from the calling handler,
exactly like one.

The failure is invisible from the calling module. Its own unit tests pass, its own integration
tests pass, and the inconsistency only appears when one half fails in production.

## Decision

A repository whose aggregate can take part in a write spanning two modules resolves its
`EntityManager` through `currentEntityManager()` first, and opens its own `dataSource.transaction`
only when there is none.

## Alternatives

Passing the manager explicitly through the command payload was not available: the payload crosses
a bus and carries data, not a live database handle. That constraint is what `AsyncLocalStorage` is
there to work around, and it is recorded in the transaction runner's own comment.

## Consequences

Every repository reachable from a cross-module write carries a small branch on the ambient
manager. Today that means `users`, `authorization`, `inventory` and `work-orders`.

A row lock taken inside such a repository is held until the outer transaction commits, not until
its own write finishes. That is a longer hold than the repository alone would take, and it is the
price of the guarantee.

The rule cannot be verified from inside one module. Only a test that drives both halves, or a real
request through the bootstrapped application, distinguishes one transaction from two.
