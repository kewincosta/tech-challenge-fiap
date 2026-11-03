# 0028. Each module queries only its own tables

**Status**: Accepted
**Source**: AD-013 in `.specs/STATE.md`
**Recorded**: 2026-10-28, from AD-013, taken during the `clean-architecture` feature

## Context

Nine adapters read tables that another module owns. None writes one.

Four repositories (`customers`, `vehicles`, `inventory` and `work-orders`) read foreign tables to
translate identifiers. Saving runs a lookup such as
`SELECT id FROM customers WHERE external_id = $1`, loading runs the reverse lookup, and some queries
join on `external_id`. The `work-orders` and `inventory` repositories build the table name at
runtime, so a text search for a table name misses them.

Five read adapters join foreign tables to assemble responses. The customer listing takes name, email
and document from `users` and filters on them. The vehicle listing takes the owner's UUID from
`customers`. The work order board and detail join `customers`, `vehicles`, `users`, `services` and
`inventory_items`. The execution time metric filters by a service UUID through `services`. The
shortage report starts from `work_order_parts` and joins `work_orders` and `work_order_budgets`, and
the movement history joins `users` and `work_orders`.

ADR 0006 is the root of the lookups: foreign keys use internal ids, so turning a UUID into a key
means reading the owner's table. The adapters carry comments that treat these reads as known
exceptions to ADR 0008.

## Decision

Each module queries only its own tables, and a module writes only its own tables. The shared schema
and its foreign keys stay as they are.

Each owner of a referenced table provides a key resolver that turns its UUIDs into internal keys and
back, one at a time and in batch. The resolver lives in the owner's `infrastructure`, because
internal keys are a persistence detail that no use case or port exposes. It reads through the
caller's transaction when there is one, so a row written earlier in that transaction resolves. For
`work_orders`, the `WorkOrderReads` interface of ADR 0027 does this job.

Data that another module owns comes from that module's public API, in batch, and the consumer
composes it in memory. `identity` gains a user search by name and document and a batch read, with
the exact document match and the partial, case-insensitive name match kept in its own SQL.
`work-orders` provides the outstanding demand per item and the open work orders that plan a given
item. Every ordering stays on the consumer's own columns, so nothing sorts in memory.

A check run by `npm run lint` fails when an adapter references a table that another module owns.

Three reasons support the rule.

It avoids coupling between modules. A query that reads another module's table depends on that
table's columns, types and status values, and the owner cannot change them without breaking SQL it
does not know about.

It avoids dependency cycles. A join is a dependency that the import graph does not show. The
shortage report reads `work_orders` from inside `inventory`, while `work-orders` already calls
`inventory` to move stock, so the two modules depend on each other and only the SQL says so. Reading
through the owner's public API turns each such dependency into an import that the cycle check
counts.

It keeps each module responsible for its own data. The owner decides how its rows are filtered and
exposed: `identity` owns the normalization of a document and the matching of a name, and `customers`
owns the rule that a deactivated customer stays readable by id.

## Alternatives

A narrower rule, discussed on 2026-10-28, kept the joins and sent only the standalone lookups
through the owner. It was rejected because the three reasons apply to a join as much as to a lookup,
so the rule carries no exception for joins.

Keeping the nine reads as documented exceptions to ADR 0008 was rejected for the same reason.

## Consequences

A read that crosses modules runs several batch queries where one join ran before. The work order
detail gains five batch queries, and the customer listing goes from one query to two or three.
Resolver and owner API methods take lists, so a request makes one call per owner and no query per
row.

A read composed from two modules no longer comes from one database snapshot. No rule in this system
depends on reading two modules in the same snapshot.

Each owner carries its own key resolver, with about 40 duplicated lines across five modules. The
duplication is accepted because `src/shared` must not grow.

The 11 integration specs of the rewritten adapters will be redone against the real resolvers and
owner use cases.

`scripts/architecture/check-table-ownership.ts` will map each of the 19 tables to its module. It
fails on a table another module owns, on a table it does not know, on a table name built at runtime
and on a table of the schema that the map lacks. ADR 0006 still holds: the translation of external
ids into internal keys that it requires runs through the owner's resolver.
