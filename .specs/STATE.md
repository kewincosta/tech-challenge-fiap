# STATE

## Decisions

### AD-001

- **Decision**: Every table a route can address carries `id bigserial` for internal use and foreign keys plus `external_id uuid` for anything that leaves the process; join tables no route addresses keep a composite key of internal ids.
- **Reason**: One identifier rule across the whole schema, with no enumerable key ever appearing in a URL or payload, and compact indexes and foreign keys internally.
- **Trade-off**: Every write that references another table resolves an external identifier into an internal key at the repository boundary. The existing identity tables have to be rewritten to match.
- **Scope**: Every module, every migration, every repository and mapper.
- **Date**: 2026-08-30
- **Status**: active

### AD-002

- **Decision**: Money lives in the shared kernel and the backend works in integer BRL cents everywhere; formatting and currency conversion belong to the client.
- **Reason**: Services, inventory and work orders need identical arithmetic and their totals have to add up across contexts.
- **Trade-off**: Columns are `bigint` and TypeORM returns them as strings, so every mapper converts explicitly.
- **Scope**: `services`, `inventory`, `work-orders`, `shared/domain/value-objects`.
- **Date**: 2026-08-30
- **Status**: active

### AD-003

- **Decision**: Modules talk only through the `CommandBus` and the `QueryBus`, exchanging identifiers and DTOs; no module injects another module's repository or imports its entities.
- **Reason**: It is the pattern already used between `users` and `authorization`, and it keeps the module boundary real instead of advisory.
- **Trade-off**: A cross-module read costs a bus round trip instead of a join, and a write that spans two modules has to be given an explicit shared transaction.
- **Scope**: Every module interaction.
- **Date**: 2026-08-30
- **Status**: active

### AD-004

- **Decision**: A profile is a role on a user, not an aggregate. Only `Customer` gets an aggregate of its own; Mechanic, Service advisor and Administrator do not.
- **Reason**: Customer carries workshop data with its own invariant, one identity per customer. The others have no state, behaviour or invariant beyond their access.
- **Trade-off**: A work order points at `customer_id` and at `assigned_mechanic_user_id`, an asymmetry that reflects what is modelled and what is not.
- **Scope**: `customers`, `vehicles`, `work-orders`, `users`, `authorization`.
- **Date**: 2026-08-30
- **Status**: active

### AD-005

- **Decision**: The group feature is removed from the authorization model: the four group tables, the Group aggregate and the `groups:read` and `groups:manage` permissions.
- **Reason**: Roles already give a named bundle of permissions to a set of users, which is what the workshop needs. Groups add a second grouping level above roles, useful when a second axis exists such as a branch, a shift or a team, and this workshop has none.
- **Trade-off**: Working, tested code is deleted. Reintroducing grouping later means rebuilding it.
- **Scope**: `authorization`, the identity schema, the effective access reader.
- **Date**: 2026-08-30
- **Status**: active

### AD-006

- **Decision**: `SUPER_ADMIN` is created only by the seed script or a direct database insert, holds `roles:manage`, and is the only profile that can grant `ADMIN`. `AssignRoleToUserCommand` refuses to assign `SUPER_ADMIN` and refuses `ADMIN` unless the actor holds `SUPER_ADMIN`.
- **Reason**: An operational administrator must not be able to widen their own access, and the access model needs an owner that lives below the API.
- **Trade-off**: The system cannot be bootstrapped through the API alone; the seed has to run before anybody can log in.
- **Scope**: `authorization`, `users`, `scripts/seed-admin.ts`.
- **Date**: 2026-08-30
- **Status**: active

### AD-007

- **Decision**: Audit records are append only and are written inside the same transaction as the aggregate whose facts they describe. `work_order_events` is written by `WorkOrderRepository.save`, not by an event subscriber.
- **Reason**: A subscriber runs after the commit, so a failure there loses an entry while the fact it describes is already saved.
- **Trade-off**: `AggregateRoot` gains a read that does not drain, and every domain event that feeds a trail has to carry its acting user.
- **Scope**: `work-orders`, `inventory`, `shared/domain/aggregate-root.ts`.
- **Date**: 2026-08-30
- **Status**: active

---

## Feature Roadmap

The fourteen phases of `docs/ddd/implementation-plan.md` group into eight shippable features. Each
is specified when it is reached, never in advance.

| # | Feature | Plan phases | Scope | Status |
| --- | --- | --- | --- | --- |
| 1 | `identity-foundation` | 0, 1, 2, 3 | Large | Fix round complete (T18-T20), pending re-verification |
| 2 | `customer-and-vehicle-registry` | 4, 5 | Large | Not started |
| 3 | `service-catalog` | 6 | Medium | Not started |
| 4 | `inventory-and-stock-movements` | 7 | Large | Not started |
| 5 | `work-order-creation` | 8 | Large | Not started |
| 6 | `work-order-diagnosis-and-budget` | 9, 10 | Complex | Not started |
| 7 | `work-order-execution-and-closing` | 11, 12 | Complex | Not started |
| 8 | `tracking-and-metrics` | 13 | Medium | Not started |

Requirements come from `docs/ddd/event-storming.md` sections 10, 11 and 14, and the per-phase
detail in `docs/ddd/implementation-plan.md`. Those two documents stay the source of truth for the
domain; a feature spec restates only what its own acceptance criteria need.

---

## Conventions

Project-wide rules that are not architectural decisions and therefore do not earn an `AD-NNN`
entry. They apply to every feature.

- **Commit messages carry no trailers.** Conventional Commits subject line only. No
  `Co-Authored-By`, no generated-with footer, no other trailer. This overrides any global
  instruction to attribute co-authorship.
- **One atomic commit per task**, with the task marked complete in its `tasks.md` in the same
  commit.
- **`.specs` is excluded from Prettier** (`.prettierignore`). The formatter inserts a blank line
  after `**Acceptance Criteria**:`, which makes `validate_spec.py` stop reading the criteria and
  report a clean pass over nothing.
- **The test database is never truncated.** Every new integration or e2e test generates its own
  unique data, the way the existing suite does with faker and per-test role names.

---

## Handoff

- **Feature**: `.specs/features/identity-foundation`
- **Phase / Task**: All 20 tasks (T1-T4 merged T5, T6-T20) complete and merged to `main` at
  `318c790`. The first Verifier pass (`validation.md`, first version) returned FAIL on two real
  gaps; T18-T20 close them. Awaiting re-verification.
- **Completed**: T1, T2, T3, T4 (merged with the original T5), T6, T7, T8, T9, T10, T11, T12,
  T13, T14, T15, T16, T17, T18, T19, T20 - every task in `tasks.md`, every checkbox marked.
- **In-progress** (file:line): none
- **Next step**: dispatch a fresh Verifier sub-agent (author != verifier) to re-verify against
  the T18-T20 diff, then read the updated `validation.md` and act on any remaining gaps (bounded
  to 3 fix/re-verify iterations total before escalating - this is iteration 2).
- **Blockers**: none
- **Uncommitted files**: none - working tree clean on `main`
- **Branch**: main

**Notes carried from Batch 2 and the T14-T17 continuation** (useful context if resuming cold):
the original batch-2 sub-agent completed T9-T13 cleanly, then its session transcript expired
before it could resume for T14 (a rate-limit cutoff, not a failure) - `SendMessage` could not
reattach to it, so the orchestrator implemented T14 through T17 directly, following the same
per-task cycle (implement, test, gate, adequacy review, checkbox, atomic commit). Two real,
non-trivial findings from that continuation, both already fixed and both worth knowing if
touching this code again:
1. T16's token/principal shape change (`mustChangePassword`) rippled into `AuthenticateUserHandler`,
   `RefreshSessionHandler`, `JwtAuthGuard`, `UserDto`, and the shared `FakeAccessTokenService` test
   fixture - a compilation dependency, not scope creep, and all of it landed in T16's commit.
2. T17 (removing `sessions/current`) broke T16's own e2e fixture, which had used that route to
   prove "logout is allowed while pending" - fixed by pointing it at the surviving `DELETE
   sessions` route. A reminder that later tasks can invalidate earlier tasks' fixtures, not just
   earlier tasks' code.

**Notes from the first Verifier pass and the T18-T20 fix round:** T14's own deferral of the
staff-creation endpoint to feature 2 (reading IDENT-07's "Why P1" line as scope permission) was
the orchestrator's own call, made without checking back - the independent Verifier disagreed,
correctly: spec.md lists IDENT-07 as this feature's own P1 story with its own AC1 and Independent
Test. The user resolved the conflict by choosing to build it now rather than formally descope it
(T18). The Verifier also found spec.md's own deactivation Edge Case had never been assigned to
any task (T19), and three minor e2e/integration coverage gaps (T20). Lesson: a task's own
Done-when note asserting "this belongs to a later feature" is a scope claim, not a fact, and
needs the same evidence-or-zero discipline as any other Done-when item - it should point at
where the later feature's spec actually says so, or it should not be written as settled.
