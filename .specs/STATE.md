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

### AD-010

- **Decision**: A decision taken from here on is recorded twice and cross-referenced once: an `AD-NNN` entry in this file, and a numbered record in `docs/adr/`, each naming the other. Neither stands alone, and the ADR carries the reasoning while this file carries the working-memory summary.
- **Reason**: `docs/ddd/implementation-plan.md` section 10 has always said "whenever a decision is taken, one ADR, numbered next", but the rule was never operative because `docs/adr/` did not exist. Nine features' worth of decisions accumulated in three different shapes across this file, the plan's section 7 and the event storming's section 14, and one of them drifted into describing an approach the code never took. Two homes with an explicit link between them is what stops the third shape from appearing.
- **Trade-off**: Recording a decision costs two files instead of one, and a decision recorded in only one of them is now a visible gap rather than a complete record. The Decisions log stays the file read on resume, so an ADR alone does not reach a future session's context.
- **Scope**: Every feature after `architecture-documentation`. The nine existing entries are reconciled by that feature rather than rewritten here.
- **Date**: 2026-09-02
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
| 10 | `architecture-documentation` | §10, 13's docs tail | Large | Verified |

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

- **Feature**: `.specs/features/architecture-documentation` - **done**
- **Phase / Task**: Verified on the second Verifier pass. 32 tasks (T1-T32) plus three fix tasks (F1-F3) committed on `main`, commit range `4834607..HEAD`. Verifier report at `.specs/features/architecture-documentation/validation.md`, carrying both rounds.
- **Completed**: all 5 requirements (ARCH-01 through ARCH-05, 38 numbered ACs, all 6 listed edge cases). The set is 44 new files: 25 decision records and their index, an architecture overview, a high level design, 7 mermaid C4 diagrams, 9 low-level-design pages and their index. Three documents were edited: the plan's section 7 became an index, the event storming's section 15 became a pointer, and its H2 answer was annotated as reversed. `README.md` gained the four entry points and is now Prettier-clean. 15 permission-gated routes gained the `@ApiForbiddenResponse` they were missing, and the two budget decision routes gained a description of the owner-or-permission rule their handler applies.
- **In-progress** (file:line): none
- **Next step**: none. Every plan phase (0 through 13) and its documentation tail are shipped and Verified. The roadmap has no further row.
- **Blockers**: none
- **Uncommitted files**: none - working tree clean on `main`
- **Branch**: main

**Notes from this feature's own implementation:**

1. **The first Verifier pass failed, and it failed on the one thing this feature could not check mechanically.** Round 1 returned three gaps, all in the ORM column tables: five columns migration `…007` adds to `work_orders` were missing, a `budget_round integer` column was documented on two tables where the real column is `budget_id bigint` referencing `work_order_budgets`, and `quantity` was missing from `stock_movement_transitions`. The cause was uniform: columns were gathered from the migration that created a table plus at best one that altered it, rather than from every migration touching it. The user had chosen full column fidelity over a pointer at design time, knowing nothing would detect drift; that choice was sound, and the first attempt at executing it was not careful enough.
2. **The fix produced the check that should have existed from the start.** A parser derives the full column set for all 18 tables from all 9 migrations and greps each page for every name. Round 2 corroborated it with an independent implementation and widened it: all 18 documented table headings correspond to real tables, and all 53 index and constraint identifiers cited across `docs/architecture/` exist in the migrations.
3. **Both Verifier rounds wrote a broken checker before writing a working one, and both caught it.** Round 1's link checker reported 100+ false failures from its own parsing; round 2's column parser reported 0/18 clean with 100+ bogus type mismatches from a greedy pattern reading `bigint NOT NULL` as a type. Neither conclusion was acted on. Worth remembering: on a documentation feature the checker is the instrument, and an instrument that reports failure is safer than one that reports success.
4. **Two lessons recorded, both candidates**: `L-015`, derive a column list from every migration touching the table rather than only the one that created it; `L-016`, take a column's name and type from the migration or the ORM entity, never from a query adapter's SQL alias. Round 2 recorded nothing new.
5. **One disclosed scope exception, judged justified by the Verifier.** T30 annotated H2 in the event storming, which sits outside the "sections 7 and 15 only" limit the spec's Out of Scope sets. The spec shipped two acceptance criteria in direct tension: ARCH-04 #4 unconditionally requires correcting a document the code contradicts, and ARCH-04 #5 confines DDD edits. H2 was both. The Verifier called the edit justified and the defect a spec-precision gap, in the spec rather than in the work.
6. **`npm run format:check` still fails on ~148 pre-existing files** across `src`, `test` and `.claude`. This feature brought `README.md` and all of `docs/` to Prettier-clean and deliberately left the rest alone. A future maintenance pass could close it; running `npm run format` casually would produce a 148-file diff.
