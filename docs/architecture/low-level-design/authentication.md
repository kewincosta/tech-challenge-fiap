# authentication

Proving who a person is. Login, the session lifecycle, access and refresh tokens, and revocation.
Part of the Identity & Access context, alongside [users](users.md) and
[authorization](authorization.md).

This module does not own the password. `users` does, and login verifies credentials over the
`QueryBus`.

Conventions this page does not repeat are in [the high level design](../high-level-design.md).

## Aggregate

`Session` (`domain/entities/session.ts`), with `RefreshToken` (`domain/entities/refresh-token.ts`)
as its child entity. One aggregate, two tables.

Invariants it holds:

- A session is `ACTIVE` or `REVOKED`, and revocation carries a reason from `SessionRevocationReason`.
- A session has at most one active refresh token, enforced in the database by `ux_refresh_tokens_active_per_session`.
- Refreshing rotates: the redeemed token moves to `ROTATED` and points at its replacement through `replaced_by_id`.
- Redeeming an already-rotated token is treated as theft. `Session.refresh` revokes the session with reason `TokenReuse`, records `RefreshTokenReuseDetected`, and throws ([0004](../../adr/0004-jwt-with-refresh-token-rotation.md)).
- A session past `absolute_expires_at` cannot be refreshed however recently it was used.

## Value objects

`SessionId`, `RefreshTokenId` (external UUIDs) and `RefreshTokenHash`, which wraps an
already-hashed token so a raw one cannot be stored.

## Commands

| Command                    | Handler               | What it does                                                                                                                                        |
| -------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AuthenticateUserCommand`  | `authenticate-user`   | Verifies credentials over the `QueryBus`, opens a session, issues the pair.                                                                         |
| `RefreshSessionCommand`    | `refresh-session`     | Rotates the refresh token, or detects reuse and revokes.                                                                                            |
| `RevokeSessionCommand`     | `revoke-session`      | Ends one session.                                                                                                                                   |
| `LogoutAllSessionsCommand` | `logout-all-sessions` | Ends every active session of the user ([0022](../../adr/0022-a-logout-ends-every-active-session.md)). Dispatched by the password change in `users`. |

## Queries, ports and subscribers

`ListUserSessionsQuery` lists a user's sessions. Ports in `application/ports`: `AccessTokenPort`
(signs and verifies the JWT), `RefreshTokenHasher`, `RevokedSessionStore` and `SessionQueryPort`.

`SecurityEventsSubscriber` (`application/subscribers`) reacts to the session events for logging.

## Persistence and cache

`TypeOrmSessionRepository` and its mapper in `infrastructure/persistence`.
`RedisRevokedSessionStore` in `infrastructure/cache` holds the revoked session list that
`JwtAuthGuard` consults, which is what makes a revocation take effect before the access token
expires ([0003](../../adr/0003-redis-for-cache-revocation-and-rate-limiting.md)).

### `sessions`

From migration `1787702400000-create-identity-and-access-schema.ts`.

| Column                | Type           | Notes                                          |
| --------------------- | -------------- | ---------------------------------------------- |
| `id`                  | `bigserial`    | Primary key, internal only.                    |
| `external_id`         | `uuid`         | `ux_sessions_external_id` unique.              |
| `user_id`             | `bigint`       | References `users (id)`, `ON DELETE RESTRICT`. |
| `status`              | `varchar(20)`  | `chk_sessions_status`: `ACTIVE` or `REVOKED`.  |
| `ip`                  | `varchar(64)`  | Nullable.                                      |
| `user_agent`          | `varchar(512)` | Nullable.                                      |
| `created_at`          | `timestamptz`  |                                                |
| `last_used_at`        | `timestamptz`  | Moved on every refresh.                        |
| `absolute_expires_at` | `timestamptz`  | The ceiling rotation cannot extend.            |
| `revoked_at`          | `timestamptz`  | Null while active.                             |
| `revocation_reason`   | `varchar(40)`  | Null while active.                             |

Indexed by `ix_sessions_user_id_status`, which is the shape the logout-all and the listing read.

### `refresh_tokens`

| Column           | Type           | Notes                                                                                                                          |
| ---------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `id`             | `bigserial`    | Primary key, internal only.                                                                                                    |
| `external_id`    | `uuid`         | `ux_refresh_tokens_external_id` unique.                                                                                        |
| `session_id`     | `bigint`       | References `sessions (id)`, `ON DELETE CASCADE`.                                                                               |
| `token_hash`     | `varchar(128)` | Unique (`ux_refresh_tokens_token_hash`). The raw token is never stored.                                                        |
| `status`         | `varchar(20)`  | `chk_refresh_tokens_status`: `ACTIVE`, `ROTATED` or `REVOKED`.                                                                 |
| `created_at`     | `timestamptz`  |                                                                                                                                |
| `expires_at`     | `timestamptz`  |                                                                                                                                |
| `rotated_at`     | `timestamptz`  | Null until redeemed.                                                                                                           |
| `replaced_by_id` | `bigint`       | Self-reference, `ON DELETE SET NULL`, deferrable, so a rotation can insert the replacement and point at it in one transaction. |

`ux_refresh_tokens_active_per_session` is the partial unique index that makes "one active token per
session" a database rule rather than a hope.

## Endpoints

`/api/v1/auth`.

| Route                       | Access | Notes                                             |
| --------------------------- | ------ | ------------------------------------------------- |
| `POST /auth/sessions`       | public | Login. Returns the token pair and the session id. |
| `POST /auth/tokens`         | public | Refresh. Rotates, or detects reuse.               |
| `DELETE /auth/sessions`     | token  | Logout. Ends every active session of the caller.  |
| `GET /auth/sessions`        | token  | Lists the caller's sessions.                      |
| `DELETE /auth/sessions/:id` | token  | Revokes one session.                              |

The two public routes carry `@Public()`, which is what lets them past `JwtAuthGuard`.

## Errors

| Error                          | Code                              | Status |
| ------------------------------ | --------------------------------- | ------ |
| `InvalidCredentialsError`      | `AUTH_INVALID_CREDENTIALS`        | 401    |
| `InvalidRefreshTokenError`     | `AUTH_INVALID_REFRESH_TOKEN`      | 401    |
| `RefreshTokenReuseError`       | `AUTH_INVALID_REFRESH_TOKEN`      | 401    |
| `SessionNotActiveError`        | `AUTH_INVALID_REFRESH_TOKEN`      | 401    |
| `PasswordChangeRequiredError`  | `AUTH_PASSWORD_CHANGE_REQUIRED`   | 403    |
| `SessionNotFoundError`         | `SESSION_NOT_FOUND`               | 404    |
| `InvalidRefreshTokenHashError` | `AUTH_INVALID_REFRESH_TOKEN_HASH` | 400    |

Three distinct errors answer with the same code, `AUTH_INVALID_REFRESH_TOKEN`. That is deliberate:
a caller holding a bad token learns that it is bad, and not whether the session was revoked, the
token was already redeemed, or it never existed.
