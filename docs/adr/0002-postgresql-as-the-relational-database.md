# 0002. PostgreSQL as the relational database

**Status**: Accepted
**Recorded**: 2026-09-02, from the justification the build plan stated for phase 13

## Context

The challenge asks explicitly for a written justification of the database choice, so this record
exists to answer it rather than to document a reversal.

The data this system holds is relational in the strict sense. A work order points at a customer, a
vehicle, a set of service items, a set of part items and a series of budget rounds. A stock
movement points at both an inventory item and the work order that consumed it. A part withdrawal
writes to the work order aggregate and the inventory aggregate inside one transaction, and if
either half fails, both must fail.

## Decision

PostgreSQL, reached through TypeORM with hand-written SQL migrations.

Four properties carry the choice:

**Relational integrity across work orders, items and stock movements.** The foreign keys are
declared and enforced by the database, so an item cannot reference a work order that does not
exist and a movement cannot reference a missing inventory item. The integrity is a property of
the schema rather than of the code that happens to write it.

**The transactional guarantee the part withdrawal needs across two aggregates in two modules.**
A withdrawal decrements stock, records an append-only movement and updates the work order, across
two modules, in one transaction. PostgreSQL gives that as one `COMMIT`. ADR 0023 records the rule
that makes the two repositories join the same transaction rather than opening their own.

**Partial unique indexes for the soft delete rules.** A user's email and document must be unique
among the rows that are not deleted, and a vehicle's plate the same: `ux_users_email`,
`ux_users_document` and `ux_vehicles_plate` are all `CREATE UNIQUE INDEX ... WHERE deleted_at IS
NULL`. The same index shape carries a rule that has nothing to do with deletion,
`ux_work_orders_active_vehicle ON work_orders (vehicle_id) WHERE status NOT IN ('DELIVERED',
'CANCELED')`, which lets a vehicle hold one open work order while its finished ones accumulate. A
uniqueness rule conditional on a column's value is not something a document store enforces for
you.

**Integer arithmetic in `bigint` for money in cents.** Every monetary value in the system is an
integer count of BRL cents, per ADR 0007. `bigint` holds them exactly and sums them exactly, with
no binary floating point anywhere in the path.

## Alternatives

A document store was rejected on the first and third grounds: the integrity would move from the
schema into application code, and a uniqueness rule conditional on a soft-delete column has no
direct expression. The cross-aggregate withdrawal would also need a compensating write on failure
instead of a rollback.

## Consequences

Every write that references another table resolves an external identifier into an internal key at
the repository boundary, which is the cost ADR 0006 records.

TypeORM returns `bigint` as a string, so every mapper converts explicitly rather than letting
JavaScript's number type quietly bound the range.

The schema is managed by hand-written migrations rather than by synchronisation, so a schema
change is a reviewable file. Nine migrations exist, `1787702400000` through `1787702400008`.
