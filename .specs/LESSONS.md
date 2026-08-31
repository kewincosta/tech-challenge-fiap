# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

### L-002 - Every line in a spec's Edge Cases section needs an owning task in tasks.md - an edge case with no task assigned to it typically ships unimplemented and untested.
- signal: `ac_gap` · recurrence: 2 feature(s) · scope: `planning` · harmful: 0
- features: identity-foundation, service-catalog
- evidence: .specs/features/identity-foundation/spec.md:206 (planning) (+1 more)
- last seen: 2026-08-31T17:48:37Z

### L-003 - A value object's own passing unit tests, or a sibling handler exercising the identical call pattern, do not substitute for a dedicated test on the specific handler or route that also calls it - give every error-producing call site its own asserting test at the layer the Test Coverage Matrix promises for that route.
- signal: `ac_gap` · recurrence: 3 feature(s) · scope: `application-handlers` · harmful: 0
- features: customer-and-vehicle-registry, service-catalog, inventory-and-stock-movements
- evidence: CVR-01-AC7 (register-customer.handler.spec.ts has no malformed-address/phone case) (application-handlers) (+3 more)
- last seen: 2026-08-31T22:33:37Z

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 - A task's Done-when note that defers an acceptance criterion to a later feature does not amend the spec - confirm the spec itself still assigns that AC to the current feature before treating the deferral as settled, or edit the spec's AC and traceability explicitly.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `users` · harmful: 0
- features: identity-foundation
- evidence: IDENT-07-AC1 (users)
- last seen: 2026-08-31T10:15:10Z

### L-004 - A per-call test-fixture generator built from limited-entropy randomness (a faker field, a random-digit checksum id) can still collide against a never-truncated test database once enough runs accumulate - prefer a UUID-derived fragment in fixture generators over independent random digits or a library default with bounded entropy.
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `test-fixtures` · harmful: 0
- features: customer-and-vehicle-registry
- evidence: test/support/http.ts:26-28 (registerUser's faker email / document.factory.ts's uniqueValidCpf) - 409 collision observed on the first full gate run, gone on immediate rerun (test-fixtures)
- last seen: 2026-08-31T12:39:57Z

### L-005 - A Promise.all()-raced two-transaction test against a real database is not a reliable discrimination sensor for a dropped row lock by itself, because two independent read-then-write calls do not always interleave - measure a concurrency sensor's mutation kill rate across several repeated runs before trusting a single pass or fail.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `concurrency-tests` · harmful: 0
- features: inventory-and-stock-movements
- evidence: typeorm-inventory-item.repository.ts:68 (pessimistic_write lock removed) against test/integration/inventory-item.repository.spec.ts:199-226's Promise.all()-raced concurrent-replenishment test - failed 3/15 runs (~20%) under the mutation, 0/2 false-positive on the unmutated tree across two full test:integration gate runs (concurrency-tests)
- last seen: 2026-08-31T22:33:43Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
