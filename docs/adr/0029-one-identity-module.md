# 0029. Users, authentication and authorization form one identity module

**Status**: Accepted
**Source**: AD-014 in `.specs/STATE.md`
**Recorded**: 2026-10-28, from AD-014, taken during the `clean-architecture` feature

## Context

`users`, `authentication` and `authorization` depend on one another in both directions. Registration
assigns the `CUSTOMER` role inside the same transaction that creates the user. A password change and
a deactivation end sessions. Login verifies credentials held by `users`. Session revocation reads
permissions. The permissions guard uses the authentication `Principal`.

The C4 component diagram already draws the three as one context, Identity & Access. As three modules
they form a dependency cycle, which ADR 0027 forbids.

## Decision

The three become areas of one module, `src/modules/identity/`. Each area keeps its own four layer
folders, `domain`, `application`, `infrastructure` and `presentation`, under `identity/users/`,
`identity/authentication/` and `identity/authorization/`. One Nest module, `identity.module.ts`, one
`identity.tokens.ts` and one `index.ts` sit at the module root.

Inside the module, a use case may call another area's use case directly: deactivation and password
change end sessions, registration assigns the `CUSTOMER` role, login and refresh read the user, role
assignment checks the user, and session revocation reads permissions. A port inside one module would
add nothing.

`identity` depends on no other module. The other modules use its public API: the use cases they
call, the key resolver for users, the `Principal`, the decorators, and the `AppPermission` and
`SystemRole` enums.

The move changes paths and nothing else, and it happens before any use case is rewritten.

## Alternatives

Keeping three modules was rejected. Their calls run in both directions and share a transaction, so
ports between them would keep the cycle and separate parts that change together.

## Consequences

`identity` is the largest module, and the path of every file in it changes. Imports in the other
modules and in the test support follow the move, and the coverage globs in `vitest.config.ts` follow
it with the same percentages.

The documents that name the three modules, `README.md` and `docs/architecture/`, are updated at the
end of the feature.

Routes, payloads and error codes stay as they are, and the OpenAPI document stays identical to its
baseline.
