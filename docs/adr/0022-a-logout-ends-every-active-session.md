# 0022. A logout ends every active session of the user

**Status**: Accepted
**Recorded**: 2026-09-02, from the decisions taken during the build

## Context

The system already had a per-device logout: signing out on one device left sessions on the others
untouched. Separately, a password change has to be able to close every device, which is the point
of changing a password you think somebody else knows.

The product owner stated the requirement directly.

## Decision

A logout ends every active session of that user, on every device. The existing endpoint keeps its
address and changes its meaning; there is no second logout-all endpoint beside it.

A password change revokes every session by the same mechanism, so the token issued before the
change stops working everywhere.

## Alternatives

Keeping the per-device logout next to a logout-all was rejected: two endpoints where the workshop
wants one behaviour. A user who signs out and is still signed in somewhere has not got what they
asked for, and making them pick the right endpoint moves that problem onto them.

## Consequences

An existing endpoint changed meaning, and its e2e test was rewritten to assert the new behaviour
rather than the old one. That was the stated cost and it was paid once.

Signing out on a shared machine is sufficient. There is no case where a user believes they are out
and a session survives.

Revocation is only as fast as the revoked session list in Redis (ADR 0003), which `JwtAuthGuard`
consults on every authenticated request. Without that list, an access token would keep working
until it expired.
