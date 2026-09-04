# 0004. JWT access tokens with refresh token rotation and reuse detection

**Status**: Accepted
**Recorded**: 2026-09-02, from the state the domain model described at the outset

## Context

The API is stateless per request and guarded globally. A caller presents a credential on every
request, and the guard has to decide from it alone, without a session lookup on the hot path.

Two facts complicate the plain stateless answer. A password change ends every session of that user
on every device, per ADR 0022, and an administrator can revoke a session. Both mean a token that
is still inside its validity window can need to stop working.

## Decision

A short-lived JWT access token carries the request, and a long-lived refresh token buys a new one.
The refresh token rotates on every use: redeeming one issues a replacement and retires the
redeemed value.

Reuse of an already-redeemed refresh token is treated as theft. `Session.refresh` raises
`RefreshTokenReuseError`, records `RefreshTokenReuseDetected`, and revokes the session with reason
`TokenReuse`, so the legitimate holder and the attacker both lose it and the real owner has to log
in again.

The revoked session list in Redis (ADR 0003) is what lets a revoked access token stop working
before it expires, which is the gap a pure JWT leaves.

## Alternatives

No alternative is recorded in this repository. The plan's section 1 states this scheme as the
state the build inherited, not as a choice deliberated at the time. Server-side sessions with an
opaque cookie is the obvious alternative and was not written down as considered.

## Consequences

A revoked or logged-out token stops working within one Redis lookup rather than at expiry, at the
cost of that lookup on every authenticated request.

Rotation means a client that loses the response to a refresh has lost that token, and its next
attempt with the old value is indistinguishable from theft. It ends the session. That is the
deliberate trade: a false positive costs one login, a missed detection costs the account.

The three lifetimes are configuration, not code: `ACCESS_TOKEN_TTL_SECONDS`,
`REFRESH_TOKEN_TTL_SECONDS` and `SESSION_ABSOLUTE_TTL_SECONDS` in `.env`.
