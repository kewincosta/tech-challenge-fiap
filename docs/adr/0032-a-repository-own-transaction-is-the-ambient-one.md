# 0032. A repository's own transaction is the ambient one

**Status**: Accepted
**Source**: AD-008 in `.specs/STATE.md`
**Recorded**: 2026-10-31, from the refinement of AD-008 that T62 made during the `clean-architecture` feature

## Context

ADR 0023 requires a repository reachable from a cross-module write to use the ambient
`EntityManager` when one exists and to open its own `dataSource.transaction` otherwise. The second
half left a gap. A repository that opened its own transaction did not publish the manager it
opened, so every call it made from inside that transaction to another module's key resolver or
read ran without an ambient manager and took a second connection from the pool.

Batch 6 of the `clean-architecture` feature proved it. `TypeOrmInventoryItemRepository.save` opens
its own transaction and then calls `UserKeyResolver` and `WorkOrderReads`. With a pool of two
connections, two concurrent saves each held one connection for the transaction and waited for a
second one for the resolver. Neither could proceed, and one of them timed out. The application's
pool has ten connections and no connection timeout, so ten concurrent saves would wait forever.

## Decision

A repository that finds no ambient transaction opens its own through `runInNewTransaction`, in
`shared/infrastructure/database/typeorm-transaction-runner.ts`. The function opens a transaction
on the data source and publishes its manager as the ambient one while the work runs.
`TypeOrmTransactionRunner.run` uses the same function for a use case. The key resolvers and the
reads that the repository calls inside the work then find the manager and join the transaction, so
the whole save holds one connection.

`TypeOrmInventoryItemRepository` and `TypeOrmWorkOrderRepository` open their own transaction this
way. A repository that already runs under an ambient manager keeps using it, as ADR 0023 says.

## Alternatives

Resolving every key before the transaction opens is the approach the work order repository's
`save` takes (T35). It reads the external ids through the owners' resolvers first and then opens a
transaction that spans only the writes, so no resolver runs while a connection is held. It fits a
save whose keys are known before the first write. The inventory repository's `save` calls the
resolver and the work order reads from inside the write, so publishing the manager is the change
that fits it, and the work order repository also publishes it to cover the reads that remain
inside its transaction.

## Consequences

Both repositories hold one connection per save, whatever number of resolvers they call, and a
regression case on a pool of two connections (`repository-own-transaction.spec.ts`) fails when the
manager stops being published.

`src/shared` gains `runInNewTransaction` next to `currentEntityManager`. Code outside a repository
should not call it: a use case that needs a transaction uses the `TransactionRunner` port.

A key resolver or read that a repository calls inside its transaction now takes part in that
transaction, so it sees the writes made before it and shares its row locks, as ADR 0023 already
describes for an ambient transaction.
