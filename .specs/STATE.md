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

### AD-008

- **Decision**: A repository whose aggregate can take part in a write spanning two modules must honour an ambient transaction: it resolves its `EntityManager` through `currentEntityManager()` first and only opens its own `dataSource.transaction` when there is none.
- **Reason**: `TransactionRunner` carries one transaction across a `CommandBus` dispatch through `AsyncLocalStorage`, but a repository that calls `dataSource.transaction` unconditionally opens a second transaction on a second connection and silently leaves the two writes independent. Nothing in the calling module's own tests can catch that.
- **Trade-off**: Every such repository carries a small branch on the ambient manager, and a row lock taken inside one is held until the outer transaction commits rather than until its own write finishes.
- **Scope**: `shared/infrastructure/database/typeorm-transaction-runner.ts`, and every repository reachable from a cross-module write - today `users`, `authorization`, `inventory` and `work-orders`.
- **Date**: 2026-09-01
- **Status**: active

### AD-009

- **Decision**: An aggregate whose commands can run concurrently carries a `version` column, and its repository's `save` writes `... WHERE id = :id AND version = :loadedVersion`, bumping the version and throwing `ConcurrentModificationError` (kind `Conflict`, HTTP 409) when no row matches. Handlers carry no concurrency handling of their own.
- **Reason**: Every work-order handler loaded its aggregate outside the write's transaction with no version and no row lock, so two concurrent commands both read the same state and the second `save` overwrote the first. Proven against the running app: two concurrent withdrawals of 3 units on one work order both answered 200, 6 units left the shelf, and the work order recorded 3 withdrawn, which the charged total then bills. Enforcing the guard in the repository fixes every existing handler without editing one and cannot be forgotten by a handler written later, which a load-time row lock would depend on.
- **Trade-off**: A concurrent write now fails with 409 instead of waiting, so the caller decides whether to repeat it. Nothing retries automatically. The version has to be carried through the aggregate, its mapper and its `restore`, and it is deliberately not exposed on any response.
- **Scope**: `work-orders` today. Any module that later finds the same exposure adopts the same guard rather than inventing another.
- **Date**: 2026-09-01
- **Status**: active

---

## Feature Roadmap

The fourteen phases of `docs/ddd/implementation-plan.md` group into ten shippable features. Each
is specified when it is reached, never in advance.

| # | Feature | Plan phases | Scope | Status |
| --- | --- | --- | --- | --- |
| 1 | `identity-foundation` | 0, 1, 2, 3 | Large | Verified |
| 2 | `customer-and-vehicle-registry` | 4, 5 | Large | Verified |
| 3 | `service-catalog` | 6 | Medium | Verified |
| 4 | `inventory-and-stock-movements` | 7 | Large | Verified |
| 5 | `work-order-creation` | 8 | Large | Verified |
| 6 | `work-order-diagnosis-and-budget` | 9, 10 | Complex | Verified |
| 7 | `work-order-part-withdrawal` | 11 | Large | Verified |
| 8 | `work-order-closing` | 12 | Large | Verified |
| 9 | `tracking-and-metrics` | 13 | Medium | Verified |
| 10 | `architecture-documentation` | §10, 13's docs tail | Large | Not started |

Rows 7 and 8 were one feature, `work-order-execution-and-closing`, until 2026-09-01. Phases 11 and
12 together came to an estimated 28-36 tasks, against the 20 that feature 6 took. Phase 11 also
carries the first write that spans two *aggregates* in two modules inside one transaction, and
splitting puts that in front of its own Verifier and discrimination sensor before phase 12 builds
on top of it. The transaction mechanism itself is not new: `TransactionRunner` and
`currentEntityManager()` have carried a shared transaction across a `CommandBus` dispatch since
`identity-foundation` (`RegisterUserHandler` plus `TypeOrmAssignmentRepository`). What phase 11
adds is making two repositories that today always open their own `dataSource.transaction` join an
ambient one instead.

Row 10 was carved out of feature 9 on 2026-09-01, at the user's decision during that feature's
Specify. Plan phase 13 bundles three read models, a coverage floor and a README together with the
whole `docs/architecture` and `docs/adr` set. The code half carries executable acceptance criteria
and a discrimination sensor that can bite; the documentation half is roughly 40 files no test can
assert. Splitting keeps feature 9's Verifier meaningful and gives the documentation its own feature
rather than letting it ride along unverifiable. Plan section 10 also intended this set to be
written along the phases, one low-level-design page and one C4 component diagram per module phase,
so row 10 carries the accumulated debt of all nine features before it, not only phase 13's own
documentation tail.

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

- **Feature**: `.specs/features/tracking-and-metrics` - **done**
- **Phase / Task**: Verified in a single clean pass - no fix→re-verify round needed. 10 tasks
  (T1-T10) committed on `main`, commit range `a88d005..fc5be0b` (15 commits: spec, design,
  tasks-approved docs commits, T1-T10, plus two mid-feature fix commits for a test-durability bug
  caught while gating T6 and T10). Verifier report at
  `.specs/features/tracking-and-metrics/validation.md`.
- **Completed**: every task in `tasks.md`; all 4 requirements (TAM-01 through TAM-04, all 19
  numbered ACs, all 6 listed edge cases) independently re-derived and confirmed by the Verifier,
  evidence-or-zero. 3/3 discrimination-sensor mutations killed on the first attempt (the customer
  work-order ownership comparison, the metrics adapter's `DELIVERED`-inclusion filter, and the
  average-execution-time route's permission gate) - no surviving mutant, no fix task generated.
  Final gate: lint clean, build clean, unit 640/640, integration 228/228, e2e 194/194 (run twice
  consecutively, identical both times), `test:coverage` exit 0 with all 7 critical-path thresholds
  cleared - 1062 total, up from the 1014 baseline this feature started from (+48 new tests), zero
  regressions.
- **In-progress** (file:line): none
- **Next step**: none required on the code. Every plan phase (0 through 13) is shipped and Verified.
  The only work left in the roadmap is row 10, `architecture-documentation` - the set this feature's
  own Specify phase split out: 22 ADRs, 2 architecture documents, 10 C4 diagrams, 8 module
  low-level-design pages, plan phase 13's consistency pass over all of them, the PostgreSQL
  justification the challenge asks for (ADR 0002), the Swagger review, and the README's Architecture
  section, which links only `docs/ddd/` today because the rest did not exist when T10 wrote it.
- **Blockers**: none
- **Uncommitted files**: none - working tree clean on `main`
- **Branch**: main

**Notes from this feature's own implementation** (useful context for feature 10 or a re-read of this one):
1. **No fix→re-verify round was needed**, continuing the pattern `work-order-closing` closed on. Two
   features in a row now clean on the first Verifier pass.
2. **A system-wide, date-range-scoped query has no isolation a per-test random date can reliably
   provide, no matter how the random range is chosen.** `work-order-metrics-query.adapter.spec.ts`'s
   boundary test flaked three separate times this feature, under three different fixes in sequence:
   first a fixed calendar date (accumulates rows across runs), then a random date capped away from
   the present (still collides with another test's window by chance the more times a never-truncated
   suite runs - the birthday paradox does not go away just because the range is wide, and a
   per-test-slot partition scheme tried in between still wasn't enough), and finally a `pickClearDay`
   helper that probes the exact query window through a real request before trusting it is empty,
   redrawing otherwise (commit `c6fe0e0`). This last shape is the one that held: 8 consecutive
   isolated runs plus the Verifier's own independent 8-run check, all clean. Any future test built on
   a query that is not scoped to fixture-owned data (customer id, a fresh random UUID, etc.) should
   use this probe-then-trust pattern from the start rather than rediscovering the same three failure
   modes.
3. **Every registered account - staff included - carries `work-orders:read-own` through the
   `CUSTOMER` role `RegisterUserHandler` assigns to every new user, by design.** A test written to
   prove a 403 for "an actor lacking `work-orders:read-own`" cannot use any ordinarily-provisioned
   staff account (`serviceAdvisor`, `mechanic`, `admin`) as the negative case, since all of them still
   carry `CUSTOMER` underneath their staff role and therefore still hold that permission. Proving the
   403 needs an actor with `CUSTOMER` explicitly revoked after registration (`revokeRole`, symmetric
   to the existing `grantRole` test helper). Cost about an hour of dead-end investigation into
   `PermissionsGuard`, `EffectiveAccessService` and `TypeOrmEffectiveAccessReader` (all three
   correct) before the actual cause - the test's own fixture, not the code - was found.
4. **`.specs/STATE.md`'s own "no commit trailers" convention was violated for seven commits mid-way
   through this feature's Execute** (a `Co-Authored-By` trailer, from a global default that this
   file's Conventions section explicitly says to override) and caught only at Verify time. Fixed by
   rewriting those seven commits' messages in place (cherry-pick each onto the pre-mistake base,
   amend the message, fast-forward `main`) after explicit user approval, confirmed byte-identical
   trees before and after via `git diff` against a backup branch, which was then deleted. Repo has no
   remote configured, so this was local-only. Worth a standing reminder for any session: re-read this
   file's Conventions before the first commit of a resumed session, not just at Design/Resume time.
