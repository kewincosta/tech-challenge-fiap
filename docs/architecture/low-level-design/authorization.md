# authorization

What a person may do. Roles, permissions, assignments, and the effective access every guarded
request is checked against. Part of the Identity & Access context, alongside [users](users.md) and
[authentication](authentication.md).

This module provides `PermissionsGuard` and the `@RequirePermissions()` decorator that the rest of
the system routes through. Where that guard sits in the chain is in
[the high level design](../high-level-design.md).

## Aggregates

Two, both small: `Role` (`domain/entities/role.ts`) and `Permission`
(`domain/entities/permission.ts`).

Invariants they hold:

- A role name is unique, and a system role (`is_system`) cannot be renamed or deleted. `ROLE_SYSTEM_IMMUTABLE` (422).
- A permission code is unique and shape-validated.
- Assignment is not an aggregate. It is a row in `user_roles`, written through `AssignmentRepository`, because a link with no behaviour of its own does not earn one ([0010](../../adr/0010-no-aggregate-for-the-staff-profiles.md) records the same reasoning for profiles).

Groups used to be a third level here and were removed
([0011](../../adr/0011-groups-removed-from-the-authorization-model.md)). Effective access resolves
in one hop: a user holds roles, a role holds permissions.

## Value objects

`RoleId`, `PermissionId` (external UUIDs), `RoleName` and `PermissionCode`, which validate shape so
an invalid name or code cannot reach the database.

## The escalation rule

`AssignRoleToUserHandler.ensureAssignable` is where
[0012](../../adr/0012-super-administrator-created-outside-the-api.md) becomes code:

- Assigning `SUPER_ADMIN` is refused outright. `AUTHZ_ROLE_NOT_ASSIGNABLE` (403).
- Assigning `ADMIN` requires the acting user to hold `SUPER_ADMIN`. `AUTHZ_ROLE_ESCALATION_FORBIDDEN` (403).
- A missing actor, which is what a system-initiated call looks like, is refused rather than trusted.

## Commands and queries

| Command                                                       | What it does                                                                                       |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `CreateRoleCommand`, `UpdateRoleCommand`, `DeleteRoleCommand` | Role lifecycle, refusing system roles.                                                             |
| `SetRolePermissionsCommand`                                   | Replaces a role's permission set.                                                                  |
| `AssignRoleToUserCommand`, `RevokeRoleFromUserCommand`        | Assignment, subject to the escalation rule. Record `RoleAssignedToUser` and `RoleRevokedFromUser`. |

Queries: `GetRoleQuery`, `ListRolesQuery`, `ListPermissionsQuery`, `GetUserAccessQuery`,
`GetUserEffectiveAccessQuery`. The last one is what other modules call over the `QueryBus`,
including the escalation rule itself.

## Services, ports and subscribers

`EffectiveAccessService` (`application/services`) resolves a user's roles and permissions, checking
`AccessCache` before falling back to `EffectiveAccessReader`. `PermissionCatalogService` owns the
`AppPermission` catalog.

`AccessCacheInvalidationSubscriber` (`application/subscribers`) listens for `RoleAssignedToUser`
and `RoleRevokedFromUser` and drops the cached entry, so an access change does not wait out the
TTL.

Ports in `application/ports`: `AccessCache`, `AssignmentRepository`, `EffectiveAccessReader`,
`RbacQueryPort`. Repositories in `domain/repositories`: `RoleRepository`, `PermissionRepository`.

## Persistence and cache

`TypeOrmRoleRepository`, `TypeOrmPermissionRepository`, `TypeOrmAssignmentRepository`,
`TypeOrmEffectiveAccessReader` and `TypeOrmRbacQueryAdapter` in `infrastructure/persistence`.
`RedisAccessCache` in `infrastructure/cache`, keyed `authz:access:${userId}` with a 60 second TTL
([0003](../../adr/0003-redis-for-cache-revocation-and-rate-limiting.md)).

`TypeOrmAssignmentRepository` honours an ambient transaction
([0023](../../adr/0023-repositories-honour-an-ambient-transaction.md)), which is what lets user
registration commit the account and its role together.

`TypeOrmEffectiveAccessReader` resolves both roles and permissions in one query, a `UNION` over
`user_roles` and `role_permissions` keyed by the user's `external_id`.

### `roles`

From migration `1787702400000-create-identity-and-access-schema.ts`. Seeded by
`1787702400001-seed-rbac-catalog.ts`.

| Column        | Type           | Notes                                                                           |
| ------------- | -------------- | ------------------------------------------------------------------------------- |
| `id`          | `bigserial`    | Primary key, internal only.                                                     |
| `external_id` | `uuid`         | `ux_roles_external_id` unique.                                                  |
| `name`        | `varchar(50)`  | `ux_roles_name` unique.                                                         |
| `description` | `varchar(255)` | Nullable.                                                                       |
| `is_system`   | `boolean`      | Default `false`. True for the seeded roles, which cannot be renamed or deleted. |
| `created_at`  | `timestamptz`  |                                                                                 |
| `updated_at`  | `timestamptz`  |                                                                                 |

### `permissions`

| Column        | Type           | Notes                                                                   |
| ------------- | -------------- | ----------------------------------------------------------------------- |
| `id`          | `bigserial`    | Primary key, internal only.                                             |
| `external_id` | `uuid`         | `ux_permissions_external_id` unique.                                    |
| `code`        | `varchar(100)` | `ux_permissions_code` unique. The string `@RequirePermissions()` names. |
| `description` | `varchar(255)` | Nullable.                                                               |
| `created_at`  | `timestamptz`  |                                                                         |

### `user_roles`

A join table no route addresses, so it carries no `external_id`
([0006](../../adr/0006-internal-key-plus-external-uuid.md)).

| Column       | Type          | Notes                                                                  |
| ------------ | ------------- | ---------------------------------------------------------------------- |
| `user_id`    | `bigint`      | References `users (id)`, `ON DELETE CASCADE`. Half of the primary key. |
| `role_id`    | `bigint`      | References `roles (id)`, `ON DELETE CASCADE`. The other half.          |
| `created_at` | `timestamptz` |                                                                        |

Indexed by `ix_user_roles_role_id` for the reverse lookup.

### `role_permissions`

| Column          | Type     | Notes                                                                  |
| --------------- | -------- | ---------------------------------------------------------------------- |
| `role_id`       | `bigint` | References `roles (id)`, `ON DELETE CASCADE`. Half of the primary key. |
| `permission_id` | `bigint` | References `permissions (id)`, `ON DELETE CASCADE`. The other half.    |

Indexed by `ix_role_permissions_permission_id`.

## Endpoints

Three controllers under `/api/v1`.

| Controller              | Route                                                  | Permission                                     |
| ----------------------- | ------------------------------------------------------ | ---------------------------------------------- |
| `PermissionsController` | `GET /permissions`                                     | `permissions:read`                             |
| `RolesController`       | `GET /roles`, `GET /roles/:id`                         | `roles:read`                                   |
| `RolesController`       | `POST /roles`, `PATCH /roles/:id`, `DELETE /roles/:id` | `roles:manage`                                 |
| `RolesController`       | `PUT /roles/:id/permissions`                           | `roles:manage`                                 |
| `UserAccessController`  | `GET /users/:userId/access`                            | `user-access:read`                             |
| `UserAccessController`  | `PUT /users/:userId/roles/:roleId`                     | `user-access:manage`, plus the escalation rule |
| `UserAccessController`  | `DELETE /users/:userId/roles/:roleId`                  | `user-access:manage`                           |

Assignment and revocation are addressed by both ids in the path, so assigning is a `PUT` on the
link rather than a `POST` to a collection. `user-access:*` is a separate permission pair from
`roles:*`: managing what a role is and managing who holds it are different jobs.

## Errors

| Error                          | Code                              | Status |
| ------------------------------ | --------------------------------- | ------ |
| `InvalidRoleNameError`         | `ROLE_INVALID_NAME`               | 400    |
| `InvalidPermissionCodeError`   | `PERMISSION_INVALID_CODE`         | 400    |
| `PermissionNotFoundError`      | `PERMISSION_NOT_FOUND`            | 400    |
| `RoleEscalationForbiddenError` | `AUTHZ_ROLE_ESCALATION_FORBIDDEN` | 403    |
| `RoleNotAssignableError`       | `AUTHZ_ROLE_NOT_ASSIGNABLE`       | 403    |
| `RoleNotFoundError`            | `ROLE_NOT_FOUND`                  | 404    |
| `AssignedUserNotFoundError`    | `USER_NOT_FOUND`                  | 404    |
| `RoleNameAlreadyInUseError`    | `ROLE_NAME_ALREADY_IN_USE`        | 409    |
| `SystemRoleImmutableError`     | `ROLE_SYSTEM_IMMUTABLE`           | 422    |

`PermissionNotFoundError` is a 400 rather than a 404 because it is raised for a permission code
supplied in a request body, which makes it bad input rather than a missing resource.

## One consequence to know

Registration assigns `CUSTOMER` to every account (`users`, `RegisterUserHandler`). Every staff
account therefore also carries whatever `CUSTOMER` carries, so a permission held by `CUSTOMER` is
held by everyone with an account. Any rule meant to exclude staff cannot be expressed as a
permission `CUSTOMER` holds.
