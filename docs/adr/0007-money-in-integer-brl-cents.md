# 0007. Money in the shared kernel, integer BRL cents across the backend

**Status**: Accepted
**Source**: AD-002 in `.specs/STATE.md`
**Recorded**: 2026-09-02, from the block in `docs/ddd/implementation-plan.md` section 7

## Context

Three contexts hold monetary values and their totals have to agree. The service catalog prices
labour. Inventory prices parts. A work order sums both into a budget total, and later into a
charged total that a customer is billed for. H14 in the event storming states the need directly.

Money that is added in one context and compared in another has to use identical arithmetic, or the
totals stop matching and there is no single place to fix it.

## Decision

`Money` lives in the shared kernel, at `src/shared/domain/value-objects/money.ts`, and the backend
works in integer BRL cents everywhere. Columns are `bigint`. Formatting and any currency
conversion belong to the client, not to the API.

## Alternatives

Decimal columns with one `Money` implementation per module was rejected: three rounding
implementations is how totals stop matching.

## Consequences

TypeORM returns `bigint` as a string, so every mapper converts explicitly. That conversion is
mechanical but it is not optional, and skipping it is how a total becomes a concatenation.

No binary floating point appears anywhere in the money path, so a sum of cents is exact by
construction rather than by rounding at the end.

The API answers in cents. A client that wants "R$ 150,99" formats it; the backend never does.
