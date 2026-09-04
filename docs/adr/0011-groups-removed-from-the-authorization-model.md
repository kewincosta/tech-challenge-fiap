# 0011. Groups removed from the authorization model

**Status**: Accepted
**Source**: AD-005 in `.specs/STATE.md`
**Recorded**: 2026-09-02, from H33 of the event storming

## Context

The `authorization` module arrived with two grouping levels: roles, which bundle permissions, and
groups, which bundle roles and permissions for a set of users. Four tables backed the second one
(`groups`, `user_groups`, `group_roles`, `group_permissions`), along with a `Group` aggregate, its
commands, queries and controller, and the `groups:read` and `groups:manage` permissions.

H33 in the event storming asks whether groups are kept.

## Decision

Removed. Roles already give a named bundle of permissions to a set of users, which is what this
workshop needs. A second grouping level above roles earns its keep when a second axis exists, such
as a branch, a shift or a team, and this workshop has none.

## Alternatives

Keeping the group tables unused was rejected implicitly by the same reasoning: a grouping level
with no axis to group by is structure without a question to answer, and it would still have to be
maintained, migrated and reasoned about on every access change.

## Consequences

Working, tested code was deleted. Reintroducing grouping later means rebuilding it rather than
switching it back on.

The removal cost less than it looks. It rode along with the identifier retrofit (ADR 0006), which
rewrote the initial migration anyway, so the database side was not creating four tables rather
than dropping them.

Effective access resolves through one level: a user holds roles, a role holds permissions. The
reader in `TypeOrmEffectiveAccessReader` is one query over `user_roles` and `role_permissions`,
with no second hop to fold in.
