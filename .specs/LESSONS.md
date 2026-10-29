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

_none_

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
