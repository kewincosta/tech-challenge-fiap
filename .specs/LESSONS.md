# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 - A task's Done-when note that defers an acceptance criterion to a later feature does not amend the spec - confirm the spec itself still assigns that AC to the current feature before treating the deferral as settled, or edit the spec's AC and traceability explicitly.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `users` · harmful: 0
- features: identity-foundation
- evidence: IDENT-07-AC1 (users)
- last seen: 2026-08-31T10:15:10Z

### L-002 - Every line in a spec's Edge Cases section needs an owning task in tasks.md - an edge case with no task assigned to it typically ships unimplemented and untested.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `planning` · harmful: 0
- features: identity-foundation
- evidence: .specs/features/identity-foundation/spec.md:206 (planning)
- last seen: 2026-08-31T10:15:15Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
