# 0024. Optimistic version guard on the work order repository

**Status**: Accepted
**Source**: AD-009 in `.specs/STATE.md`
**Recorded**: 2026-09-02, from AD-009, taken during the `work-order-closing` feature

## Context

Every work order handler loaded its aggregate outside the write's transaction, with no version and
no row lock. Two concurrent commands both read the same state and the second `save` overwrote the
first.

This was proven against the running application, not inferred. Two concurrent withdrawals of three
units on one work order both answered 200. Six units left the shelf, and the work order recorded
three withdrawn, which the charged total then bills. The customer is charged for half of what was
taken.

## Decision

`work_orders` carries a `version` column. `TypeOrmWorkOrderRepository.save` writes
`WHERE id = :id AND version = :loadedVersion`, bumping the version in the same statement. Zero
rows affected means another write landed first, and the repository throws
`ConcurrentModificationError`, whose `ErrorKind.Conflict` maps to HTTP 409.

The comparison is against the version the aggregate was loaded at. Comparing against a freshly
re-read database value would make the guard a no-op that always matches.

Handlers carry no concurrency handling of their own. An insert has no prior writer to race, so it
carries no guard, only the starting version.

## Alternatives

A row lock taken at load time was rejected because it depends on every handler remembering to take
it. Enforcing the guard in the repository fixes every existing handler without editing one, and it
cannot be forgotten by a handler written later.

## Consequences

A concurrent write fails with 409 instead of waiting, so the caller decides whether to repeat it.
Nothing retries automatically.

The version travels through the aggregate, its mapper and its `restore`, and it is deliberately
absent from every response. It is a persistence concern, not part of the API contract.

The guard protects all of the work order write handlers, not only the ones written when it was
introduced, because it lives below them.

`ConcurrentModificationError` lives in the shared kernel rather than in `work-orders`, so a module
that later finds the same exposure adopts this guard rather than inventing another.
