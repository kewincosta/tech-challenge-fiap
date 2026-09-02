# 0006. Internal sequential key plus external UUID on every addressable table

**Status**: Accepted
**Source**: AD-001 in `.specs/STATE.md`
**Recorded**: 2026-09-02, from the block in `docs/ddd/implementation-plan.md` section 7

## Context

Every table a route can address needs two things that pull in opposite directions. Internally it
wants a compact key for foreign keys and indexes. Externally it must expose nothing enumerable, so
that a caller who holds one identifier learns nothing about how many exist or which came next.

The identity tables already existed when this rule was set, with a single identifier serving both
purposes. H17, H20 and H23 in the event storming state the need directly.

## Decision

Every table a route can address carries `id bigserial` for internal use and foreign keys, plus
`external_id uuid` for anything that leaves the process. Join tables that no route addresses keep
a composite key of internal ids and get no UUID.

The rule applies to the tables that already existed, not only to new ones.

## Alternatives

Applying the rule only to new tables was rejected: two identifier rules in one schema is worse
than one migration that unifies them.

## Consequences

Every write that references another table resolves an external identifier into an internal key at
the repository boundary. That translation is a real cost paid on every cross-table write, and it
is where an unresolved identifier surfaces as a not-found error rather than as a foreign key
violation.

Applying it retroactively cost a phase of its own: phase 1 rewrote six tables, their foreign keys,
their mappers and the seed, and delivered no visible feature.

No route, payload or response carries a `bigserial`. What leaves the process is always the UUID.
