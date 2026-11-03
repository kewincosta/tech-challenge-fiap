# identity

The whole of the Identity & Access context, as one Nest module: [users](users.md),
[authentication](authentication.md) and [authorization](authorization.md). It lives in
`src/modules/identity`, and each area keeps its own `domain`, `application`, `infrastructure` and
`presentation` folders ([0029](../../../adr/0029-one-identity-module.md)).

This page covers what the three areas share. What each one holds is on its own page.

Conventions this page does not repeat are in [the high level design](../../high-level-design.md).

## Why one module

The three areas need one another in both directions, so a boundary between them would be a cycle.
They call one another's use cases directly, because a port inside one module adds nothing:

| What happens                                                         | Caller                                           | Callee                                                |
| -------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| Registration assigns the `CUSTOMER` role in the same transaction     | `RegisterUserUseCase`                            | `AssignRoleToUserUseCase`                             |
| A password change or a deactivation ends every session of the user   | `ChangePasswordUseCase`, `DeactivateUserUseCase` | `LogoutAllSessionsUseCase`                            |
| A login verifies the credentials and reads the user                  | `AuthenticateUserUseCase`                        | `VerifyCredentialsUseCase`, `GetUserByIdUseCase`      |
| A refresh reads the user                                             | `RefreshSessionUseCase`                          | `GetUserByIdUseCase`                                  |
| Assigning a role checks the user and the actor's access              | `AssignRoleToUserUseCase`                        | `GetUserByIdUseCase`, `GetUserEffectiveAccessUseCase` |
| Revoking the session of another person reads the actor's permissions | `RevokeSessionUseCase`                           | `GetUserEffectiveAccessUseCase`                       |

## Composition root

`identity.module.ts` builds every use case of the three areas with a factory provider and binds each
port to its adapter. `identity.tokens.ts` holds the injection tokens, one per port plus the one of
`AuthSettings`. That object carries the access token, refresh token and session lifetimes, and the
composition root builds it from the environment configuration, so no use case reads the
configuration.

The module also registers the two event subscribers on the in-process dispatcher when it starts:
`AccessCacheInvalidationSubscriber` for `RoleAssignedToUser` and `RoleRevokedFromUser`, and
`RefreshTokenReuseSubscriber` for `RefreshTokenReuseDetected`.

## Public API

Other modules import `identity` only through its `index.ts`:

| Export                                                                               | Used for                                                                          |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `AppPermission`, `SystemRole`                                                        | The permission catalog and the role names                                         |
| `RequirePermissions`, `CurrentUser`, `Principal`                                     | What every other controller uses to declare and read the access of a route        |
| `RegisterUserUseCase`, `RegisterUserCommand`, `RegisteredUserDto`                    | Opening the account of a new customer                                             |
| `GetUserByIdUseCase`, `GetUserByIdQuery`, `UserDto`, `UserNotFoundError`             | Reading one user, which throws `UserNotFoundError` when there is none             |
| `FindUsersUseCase`, `FindUsersQuery`, `UserSummaryDto`                               | The user search that the customer listing is composed from                        |
| `GetUserEffectiveAccessUseCase`, `GetUserEffectiveAccessQuery`, `EffectiveAccessDto` | The roles and permissions of a user                                               |
| `UserKeyResolver`                                                                    | Turning a user UUID into its internal key and back, for the modules that join one |
| `IdentityModule`                                                                     | The Nest module that the others list in their `imports`                           |

`customers` reaches the accounts through its `CustomerAccounts` gateway, and `work-orders` reaches
the access of an actor through its `WorkOrderActors` gateway. Both call these use cases
([0027](../../../adr/0027-ports-between-modules.md)).

## Diagram

[Identity & Access](../../c4-components-identity-and-access.mmd) draws the three areas and the calls
between them.
