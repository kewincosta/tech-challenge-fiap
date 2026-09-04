# 0012. Super administrator created outside the API, with the escalation rule

**Status**: Accepted
**Source**: AD-006 in `.specs/STATE.md`
**Recorded**: 2026-09-02, from the decisions taken during the build

## Context

An operational administrator manages the catalog, the inventory, the customers and the staff
accounts. If that same administrator can also grant roles without limit, they can widen their own
access, and the permission model has no floor: every boundary is one self-assignment away from
being lifted.

H30 in the event storming states the need directly: the permission model itself needs an owner
that an operational administrator cannot become on their own.

## Decision

`SUPER_ADMIN` exists, holds `roles:manage`, and is the only profile that can grant `ADMIN`. It is
created only by the seed script (`scripts/seed-admin.ts`) or by a direct database insert, never
through the API.

`AssignRoleToUserCommand` enforces both halves of the rule: it refuses to assign `SUPER_ADMIN`
under any circumstance, and it refuses `ADMIN` unless the acting user already holds `SUPER_ADMIN`.
A missing actor, which is what a system-initiated call looks like, is refused rather than trusted.

## Alternatives

One `ADMIN` role holding everything, which is what existed before, was rejected: any administrator
could grant themselves anything, and there would be no floor under the access model.

## Consequences

The system cannot be bootstrapped through the API alone. `npm run seed:admin` has to run before
anybody can log in with administrative access, which is a real operational step rather than an
optional one.

Test fixtures that need a privileged actor use the same direct insert the rule prescribes, because
going through the command would trip the rule the fixture exists to work around.

The cost is small and bounded: one role, one rule in the assignment handler, and one seed script.
