# users

Who a person is. Registration, the document that identifies them, the password, and the account
lifecycle. One of the three areas of [identity](README.md), alongside
[authentication](authentication.md) and [authorization](authorization.md).

Conventions this page does not repeat are in [the high level design](../../high-level-design.md).
Decisions are in [the records](../../../adr/README.md).

## Aggregate

`User` (`domain/entities/user.ts`), the only aggregate here.

Invariants it holds:

- Email, name, document and password hash are value objects, so an invalid one cannot be inside a `User`.
- A staff-created account is registered `temporary`, which sets `mustChangePassword`. The account authenticates but is refused every route except the password change and the logout, enforced by `PendingPasswordGuard`.
- Deactivation is a soft delete: `status` moves to `INACTIVE` and `deleted_at` is stamped. Nothing is removed.
- `User.register` records `UserRegistered`.

## Value objects

| Value object     | Rule                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Email`          | Trimmed, lowercased, shape-validated. `USER_INVALID_EMAIL` (400).                                                                                 |
| `PersonDocument` | CPF or CNPJ, digits only, checksum-validated. `USER_INVALID_DOCUMENT` (400).                                                                      |
| `Password`       | Minimum strength on registration. `Password.generate()` builds one for a staff account, which the person never chose. `USER_WEAK_PASSWORD` (400). |
| `PasswordHash`   | Wraps an already-hashed value so a plaintext cannot be stored by accident. `USER_INVALID_PASSWORD_HASH` (400).                                    |
| `UserId`         | External UUID.                                                                                                                                    |

## Commands

| Command                 | Use case                | What it does                                                                                                                                                    |
| ----------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RegisterUserCommand`   | `RegisterUserUseCase`   | Registers an account. Also assigns the `CUSTOMER` role by calling `AssignRoleToUserUseCase`, inside one transaction, so an account never exists without a role. |
| `UpdateUserCommand`     | `UpdateUserUseCase`     | Changes name, email or document.                                                                                                                                |
| `ChangePasswordCommand` | `ChangePasswordUseCase` | Replaces the hash, clears `mustChangePassword`, and ends every session of that user through `LogoutAllSessionsUseCase`.                                         |
| `DeactivateUserCommand` | `DeactivateUserUseCase` | Soft-deletes the account and ends every session of that user.                                                                                                   |

`RegisterUserUseCase` is the one write of this area that spans another: it saves the user and the
role assignment in a single transaction. It is why every account in the system carries `CUSTOMER`,
which is a fact with consequences well outside this module. `customers` opens the account of a new
customer through the same use case, from its `CustomerAccounts` gateway.

## Queries and ports

| Query                     | Answers                                                                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GetUserByIdQuery`        | One user by external id. Throws `UserNotFoundError` when there is none. Called inside `identity`, and by `customers` and `work-orders` through their gateways. |
| `FindUsersQuery`          | Users by a list of ids, a fragment of the name or a document, in any combination and of any status. The customer listing is composed from it.                  |
| `FindUserByDocumentQuery` | A lookup by CPF or CNPJ. No route or other module calls it today.                                                                                              |
| `ListUsersQuery`          | The administrative listing.                                                                                                                                    |
| `VerifyCredentialsQuery`  | Used by `authentication` at login. This module owns the password, so it owns the verification.                                                                 |

`FindUsersQuery` normalizes the document the way `PersonDocument` does, so a masked CPF finds the
same user, and a malformed document finds nobody.

Ports, all in `application/ports`: `UserRepository`, `UserQueryPort` and `PasswordHasher`. The
hasher is implemented by `Argon2PasswordHasher`
([0005](../../../adr/0005-argon2id-for-password-hashing.md)).

## Persistence

`TypeOrmUserRepository`, `TypeOrmUserQueryAdapter`, `UserMapper` and `UserKeyResolver` in
`infrastructure/persistence`. The repository honours an ambient transaction
([0023](../../../adr/0023-repositories-honour-an-ambient-transaction.md)), which is what lets
registration commit with the role assignment.

`UserKeyResolver` turns a user UUID into its internal key and back, one at a time and in batch, for
the modules that reference a user: `customers`, `inventory` and `work-orders` each join a user
without reading `users` themselves ([0028](../../../adr/0028-each-module-queries-only-its-own-tables.md)).
It resolves a row written earlier in the caller's transaction, and answers `null` for an unknown
key. `index.ts` exports it.

### `users`

From migration `1787702400000-create-identity-and-access-schema.ts`.

| Column                 | Type           | Notes                                                                                         |
| ---------------------- | -------------- | --------------------------------------------------------------------------------------------- |
| `id`                   | `bigserial`    | Primary key, internal only.                                                                   |
| `external_id`          | `uuid`         | What leaves the process. `ux_users_external_id` unique.                                       |
| `email`                | `varchar(320)` | Unique among rows where `deleted_at IS NULL` (`ux_users_email`).                              |
| `password_hash`        | `text`         | Argon2id.                                                                                     |
| `name`                 | `varchar(120)` |                                                                                               |
| `document`             | `varchar(14)`  | CPF or CNPJ, digits only. Unique among rows where `deleted_at IS NULL` (`ux_users_document`). |
| `must_change_password` | `boolean`      | Default `false`. Set for staff-created accounts.                                              |
| `status`               | `varchar(20)`  | `chk_users_status`: `ACTIVE` or `INACTIVE`.                                                   |
| `created_at`           | `timestamptz`  |                                                                                               |
| `updated_at`           | `timestamptz`  |                                                                                               |
| `deleted_at`           | `timestamptz`  | Null while active. The soft-delete marker the partial indexes filter on.                      |

## Endpoints

`/api/v1/users`. `POST /` is public; the rest need a token.

| Route                       | Permission          | Notes                                                                  |
| --------------------------- | ------------------- | ---------------------------------------------------------------------- |
| `POST /users`               | none                | Self-registration. Assigns `CUSTOMER`.                                 |
| `POST /users/staff`         | `users:manage`      | Creates an account with a generated temporary password, returned once. |
| `GET /users/me`             | none beyond a token | The authenticated account.                                             |
| `PATCH /users/me`           | none beyond a token |                                                                        |
| `POST /users/me/password`   | none beyond a token | Allowed while `mustChangePassword` is set.                             |
| `GET /users`                | `users:read`        |                                                                        |
| `GET /users/:externalId`    | `users:read`        |                                                                        |
| `PATCH /users/:externalId`  | `users:manage`      |                                                                        |
| `DELETE /users/:externalId` | `users:manage`      | Soft delete.                                                           |

`me` is declared before `:externalId`, or the literal would be read as an id.

## Errors

| Error                        | Code                           | Status |
| ---------------------------- | ------------------------------ | ------ |
| `InvalidEmailError`          | `USER_INVALID_EMAIL`           | 400    |
| `InvalidPersonDocumentError` | `USER_INVALID_DOCUMENT`        | 400    |
| `InvalidUserNameError`       | `USER_INVALID_NAME`            | 400    |
| `WeakPasswordError`          | `USER_WEAK_PASSWORD`           | 400    |
| `InvalidPasswordHashError`   | `USER_INVALID_PASSWORD_HASH`   | 400    |
| `UserNotFoundError`          | `USER_NOT_FOUND`               | 404    |
| `EmailAlreadyInUseError`     | `USER_EMAIL_ALREADY_IN_USE`    | 409    |
| `DocumentAlreadyInUseError`  | `USER_DOCUMENT_ALREADY_IN_USE` | 409    |
