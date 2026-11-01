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
- signal: `ac_gap` · recurrence: 4 feature(s) · scope: `application-handlers` · harmful: 0
- features: customer-and-vehicle-registry, service-catalog, inventory-and-stock-movements, work-order-part-withdrawal
- evidence: CVR-01-AC7 (register-customer.handler.spec.ts has no malformed-address/phone case) (application-handlers) (+4 more)
- last seen: 2026-09-01T14:04:35Z

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-017 - A test that needs an empty slice of a never-truncated database must draw from a range its own runs cannot fill and bound its redraws, or the suite turns into timeouts as the database grows.
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `integration-tests` · harmful: 0
- features: clean-architecture
- evidence: test/integration/work-order-metrics-query.adapter.spec.ts:142 (integration-tests)
- last seen: 2026-10-29T23:29:55Z

### L-018 - Run the spec of an idempotent script against a database the spec creates and drops, because on a shared database every run after the first skips the work and asserts rows an older version wrote.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `integration-tests` · harmful: 0
- features: clean-architecture
- evidence: M12, W3b, W3c on a populated database; test/integration/seed.script.spec.ts:79 (integration-tests)
- last seen: 2026-10-29T23:29:55Z

### L-019 - Give each architecture rule a refusing fixture for every kind of path it must reject, so a looser pattern fails its own test.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `architecture-checks` · harmful: 0
- features: clean-architecture
- evidence: M07 .dependency-cruiser.cjs:71 (architecture-checks)
- last seen: 2026-10-29T23:29:55Z

### L-020 - In-memory repository fakes must store and return copies of the aggregate, so a use case spec can tell a missing save from a saved change.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `test-support` · harmful: 0
- features: clean-architecture
- evidence: W1 src/modules/work-orders/application/commands/remove-work-order-item/remove-work-order-item.use-case.ts:31 (test-support)
- last seen: 2026-10-29T23:29:55Z

### L-021 - When a use case checks its input before a port read on purpose, pin that order with a case that fails both checks and asserts which error wins.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `application-use-cases` · harmful: 0
- features: clean-architecture
- evidence: W2 src/modules/work-orders/application/commands/plan-part/plan-part.use-case.ts:33 (application-use-cases)
- last seen: 2026-10-29T23:29:55Z

### L-022 - When a task refines an existing AD-NNN entry, record the refinement in an ADR in the same task, so the entry and its ADR state the same decision.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `decisions` · harmful: 0
- features: clean-architecture
- evidence: CA-07 AC1 .specs/STATE.md:70 (decisions)
- last seen: 2026-10-29T23:29:55Z

### L-023 - When an outbox retries a failed step, make it still apply after a later step of the same aggregate has landed, or apply each aggregate's steps in the order they were recorded, and test a retry that follows a later step.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `outbox` · harmful: 0
- features: clean-architecture
- evidence: CA-02 AC5 and spec.md:279 edge case, round 2 probe on src/modules/inventory/infrastructure/persistence/typeorm-inventory-item.repository.ts:117 (outbox)
- last seen: 2026-10-31T19:53:15Z

### L-024 - Apply every idempotent operation twice through the real adapter in a test, so a dropped status guard on the repeat fails a suite.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `integration-tests` · harmful: 0
- features: clean-architecture
- evidence: S22 src/modules/inventory/infrastructure/persistence/typeorm-inventory-item.repository.ts:198 (integration-tests)
- last seen: 2026-10-31T19:53:15Z

### L-025 - When a spec moves writes into retried steps, state the order in which the steps of one aggregate apply after a failure.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `planning` · harmful: 0
- features: clean-architecture
- evidence: spec.md:71 Concurrency / ordering row, round 2 spec-precision gap 1 (planning)
- last seen: 2026-10-31T19:53:15Z

### L-026 - Keep a step from drawing on the movements of an operation that is still in flight, or the compensation that returns that operation's net remaining gives back less than it took.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `outbox` · harmful: 0
- features: clean-architecture
- evidence: CA-02 AC5 and spec.md:283, probes B2, B3 and B5 in validation.md round 3 (outbox)
- last seen: 2026-11-01T00:36:15Z

### L-027 - When a spec lets an operation's first step commit before its last, state what the other steps of the same aggregate may read from that operation until it is confirmed or compensated.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `planning` · harmful: 0
- features: clean-architecture
- evidence: validation.md round 3, spec-precision gap 1 (CA-10) (planning)
- last seen: 2026-11-01T00:36:15Z

### L-028 - State in the ordering rule of retried steps whether a compensation step may apply before the older steps of its aggregate that read what it undoes.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `planning` · harmful: 0
- features: clean-architecture
- evidence: validation.md round 3, spec-precision gap 2 (CA-10 AC10, probe B4) (planning)
- last seen: 2026-11-01T00:36:15Z

### L-029 - When a spec adds a rule that holds a step behind another, state how it combines with each criterion that promises the step applies after a set delay.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `planning` · harmful: 0
- features: clean-architecture
- evidence: validation.md round 3, spec-precision gap 3 (CA-10 AC8 and AC10) (planning)
- last seen: 2026-11-01T00:36:15Z

### L-030 - Give every step kind that an ordering rule names its own case that holds a later step behind it, so a kind that drops out of the order fails a suite.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `outbox` · harmful: 0
- features: clean-architecture
- evidence: O1 (typeorm-pending-stock-steps.ts:49), validation.md round 4 (outbox)
- last seen: 2026-11-01T12:41:12Z

### L-031 - When an acceptance criterion lists several kinds, give each listed kind its own Done-when case in the task that implements the criterion.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `planning` · harmful: 0
- features: clean-architecture
- evidence: CA-10 AC10 (spec.md:224), validation.md round 4 (planning)
- last seen: 2026-11-01T12:41:12Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
