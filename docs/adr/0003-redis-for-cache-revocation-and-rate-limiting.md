# 0003. Redis for the effective access cache, the revoked session list and rate limiting

**Status**: Accepted
**Recorded**: 2026-09-02, from the state the domain model described at the outset

## Context

Three needs in this system share a shape: they are read on nearly every request, they tolerate
being rebuilt from PostgreSQL, and none of them is the system of record.

The effective access of a user, the roles and permissions the `PermissionsGuard` checks, is
resolved on every guarded request and changes only when an assignment changes. The revoked session
list is checked on every authenticated request and must answer faster than a database round trip.
Rate limiting counts requests per window, which is state nobody needs to survive a restart.

## Decision

Redis holds all three:

- The effective access cache, in `RedisAccessCache`, keyed `authz:access:${userId}` with a 60 second TTL, invalidated by a subscriber on role assignment and revocation.
- The revoked session list, in `RedisRevokedSessionStore`, which `JwtAuthGuard` consults so a revoked token stops working before it expires.
- The throttler's storage, through `ThrottlerStorageRedisService`, wired in `app.module.ts`.

PostgreSQL stays the system of record for all three. Redis holds only what can be recomputed.

## Alternatives

No alternative is recorded in this repository. The plan's section 1 states Redis as part of the
state the build inherited, not as a choice deliberated at the time.

## Consequences

Redis is required for the application to run, and `docker-compose.yml` starts it with a
healthcheck the application waits on.

An access change is visible either when the subscriber invalidates the key or when the 60 second
TTL expires, whichever comes first. The TTL bounds the staleness even if an invalidation is
missed.

Losing Redis loses no durable data. It costs a rebuild of the cache from PostgreSQL, and rate
limit counters restart at zero.
