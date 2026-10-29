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
- **Status**: superseded by AD-012

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

### AD-011

- **Decision**: Use cases are plain classes with no framework import, decorator or injection token. Controllers call them directly, each module's composition root builds them with factory providers, repository contracts live in `application/ports`, and `@nestjs/cqrs` leaves the project.
- **Reason**: The dependency rule of the Clean Architecture study the project adopted on 2026-10-27: the core knows neither the framework nor the container, and a bus makes a use case resolve its collaborators through a global registry. ADR 0026.
- **Trade-off**: Every use case is wired by hand in its composition root, and the 76 handlers, their specs and the seed are rewritten.
- **Scope**: Every module's `domain` and `application`, every composition root, `scripts/seed.ts`.
- **Date**: 2026-10-28
- **Status**: active

### AD-012

- **Decision**: A module reaches another only through a port it declares in its `application/ports` and implements in its own infrastructure by calling the other module's public API, exported from that module's `index.ts`. No `domain` or `application` file imports another module, and module dependencies have no cycle. Where the owner of some data already depends on the module that needs it, the consumer declares the interface, the owner implements it, and the root module binds the two.
- **Reason**: Avoid coupling between modules and dependency cycles, with every boundary explicit and checked by dependency-cruiser. ADR 0027.
- **Trade-off**: Each cross-module need costs a port, a gateway and a fake. `inventory` reaches work order data through a global binding registered by the root module.
- **Scope**: Every module interaction. Supersedes AD-003.
- **Date**: 2026-10-28
- **Status**: active

### AD-013

- **Decision**: Each module queries only its own tables. Turning a UUID into another module's internal key goes through the key resolver that module offers, and data another module owns comes from its public API, in batch, composed in memory by the consumer. The shared schema and its foreign keys stay.
- **Reason**: Avoid coupling between modules, avoid dependency cycles, and keep each module responsible for its own data. ADR 0028.
- **Trade-off**: A read that crosses modules runs several batch queries where one join used to do, and it no longer comes from one database snapshot.
- **Scope**: Every repository and query adapter, and the table ownership check in `npm run lint`. AD-001's resolution of external ids into internal keys now runs through the owner's resolver.
- **Date**: 2026-10-28
- **Status**: active

### AD-014

- **Decision**: `users`, `authentication` and `authorization` form one module, `identity`, each kept as an area with its own layer folders, under one Nest module.
- **Reason**: The three depend on one another in both directions: registration assigns a role in the same transaction, a password change ends sessions, login verifies credentials, and the permissions guard uses the authentication principal. The architecture documents already treat them as one bounded context. ADR 0029.
- **Trade-off**: `identity` becomes the largest module, and the path of every file in it changes.
- **Scope**: `src/modules/identity` and the documentation that names the three modules.
- **Date**: 2026-10-28
- **Status**: active

### AD-015

- **Decision**: Route-level permission checks stay in the HTTP guard, rules that depend on the data stay in the use cases, and each entry point authenticates and authorizes its own caller.
- **Reason**: A route permission depends on who calls and through which channel: a JWT over HTTP, a trusted process for the seed, a signature for a webhook. The data-dependent rules are business rules every entry point shares. ADR 0030.
- **Trade-off**: A new entry point has to check its caller before calling a use case.
- **Scope**: `PermissionsGuard`, the work order authorizers, every future entry point.
- **Date**: 2026-10-28
- **Status**: active

### AD-016

- **Decision**: Four patterns stay beyond the dependency rule, each with its own justification: the split between command and query use cases, one class per use case, Nest's dependency injection confined to the composition roots, and domain events published through a port to an in-process dispatcher that does not wait for its subscribers.
- **Reason**: The study treats these as choices that need their own justification, never as purity criteria. ADR 0031 gives one per pattern.
- **Trade-off**: Four conventions to keep and to explain.
- **Scope**: Every module.
- **Date**: 2026-10-28
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

- **Feature**: `.specs/features/clean-architecture`
- **Phase / Task**: Execute. Batch 1 done (T1 to T7, `709eb27` to `61984b9`). Batch 2 done (fix `6cdf869`, T8 `f59344b`, T9 `2da307d`, T10 `80c3044`, T11 `87b9fb7`, T61 `837dcea`, T12 `b6375ec`, T13 `ee289a7`). Batch 3 done (T14 `7b1c697`, T15 `0fbedc0`, T16 `a468f19`, T17 `d3b592f`, T18 `5957853`, T19 `4709cc9`). Batch 4 (T20 to T25) dispatched.
- **Completed**: T1 to T19 and T61. Totals after batch 3: unit 997, integration 280, e2e 243 (baseline 955, 239, 203). Baselines: 361 dependency violations, 17 table findings, no module cycle.
- **In-progress** (file:line): none yet
- **Next step**: read batch 4's compact summary, then dispatch batch 5 (T26 to T31).
- **Blockers**: none
- **Uncommitted files**: none
- **Branch**: feat/tech-challenge-2

**Batch plan** (whole phases, run in sequence; the Verifier runs after batch 11): 1 = T1-T7, 2 = T8-T13 plus T61, 3 = T14-T19, 4 = T20-T25, 5 = T26-T31, 6 = T32-T38, 7 = T39-T41, 8 = T42-T46, 9 = T47-T50, 10 = T51-T55, 11 = T56-T60. Batches 7 to 10 are smaller than the ~7-task budget because each of their tasks migrates several use cases.

**Fix outside the task list**: `listTrail` (`typeorm-work-order-query.adapter.ts:160`) orders by `we.occurred_at` alone. Events written with the same timestamp come back in either order, so the chronological trail case in `test/e2e/work-order-budgets.e2e.spec.ts` flakes, also on a clean checkout of `51a3a8a`. Commit `6cdf869` adds `we.id` (a `bigserial`) as the tie-breaker, with a regression case in `test/integration/work-order-query.adapter.spec.ts`. T36 and T54 keep the tie-breaker. The Verifier treats that commit as part of the diff range.

**Plan changes after batch 2 stopped at T11**:

- T11's baseline bullet expected the same number of dependency violations. The count went from 426 to 361, because the 65 imports among users, authentication and authorization became imports inside `identity`; no entry was added. The bullet now says so.
- T61 (module cycle check) joins phase 2. `no-circular` sees only cycles that close file by file, and CA-04 AC2 asks lint to fail on any cycle between modules. The module graph has no cycle today, so the check has no known list.
- T44 owns the one file cycle left in the baseline, between `session.orm-entity.ts` and `refresh-token.orm-entity.ts`.
- T24 adds `sm.id` as the tie-breaker of the movement history (`typeorm-inventory-query.adapter.ts:125`), the same defect as the trail.
- T9 maps 19 relations: the 18 tables the migrations create and TypeORM's `migrations` table, owned by `shared`.
- Installing dependency-cruiser in T8 moved two transitive dev packages in `package-lock.json`: acorn 8.18.0 to 8.19.0, enhanced-resolve 5.24.5 to 5.26.0.
- The `EventBus` of `@nestjs/cqrs` 11.0.3 logs `"InstanceWrapper" has thrown an unhandled exception.`, because it reads the name from Nest's provider wrapper. The T12 dispatcher keeps the wording, the call shape and the `EventBus` context and prints the subscriber's class name, as CA-02 AC6 asks. The spec's Assumptions row and design C8 now say so.
- T43 binds `DOMAIN_EVENT_PUBLISHER` to an `InMemoryDomainEventDispatcher` class provider with `useExisting`, so the identity root can inject the class and call `subscribe`. Today `SharedModule` provides the token with `useClass` only.
- The Full gate skips lint, so a worker also runs `npm run lint` before committing a Full-gate task that adds or moves imports.

**Plan changes after batch 3**:

- Only T20 (work-orders), T37 (services) and T39 (inventory) moved a module's tokens and repository contract out of the domain. T43, T44 and T45 (identity, one area each), T47 (customers) and T49 (vehicles) now carry that bullet too, and T37 and T39 got the same bullet. The strict core rules ban `Symbol()` once a module joins `migrated-modules.json`, so those tasks would have failed lint without it.
- Identity joins `migrated-modules.json` in T45, not T46.

**Facts from batch 3 that later tasks build on**:

- The resolvers' batch forms return a `Map` without the unknown keys, one entry per repeated key. Every resolver resolves rows of any status, as today's lookups do, and each has a case for it.
- `FindUsersUseCase` takes `FindUsersQuery(ids?, nameContains?, document?)` and returns users of any status, unordered. An empty `ids` list returns no user, the filters combine with AND, the name filter keeps `ILIKE` wildcards, and a masked CPF finds the same user. `IdentityModule` and `index.ts` export it, with `FindUsersQuery` and `UserSummaryDto`. T33 builds on it.

**Notes for later batches** (from batch 1):

- T19 and T33: `GET /customers?document=` also accepts a masked CPF (`test/e2e/customers.e2e.spec.ts:315`) because `PersonDocument` strips non-digits. Identity's user search normalizes the document the same way.
- T42 to T46: `DELETE /users/:userId/roles/:roleId` with an unknown user or role answers 404 with the generic code `RESOURCE_NOT_FOUND` (`test/e2e/user-access.e2e.spec.ts:195` and `:206`). A Nest `NotFoundException` in `TypeOrmAssignmentRepository` produces it today. The migration keeps that answer.
- T58 to T60: `README.md:588`, `README.md:661` and `docs/architecture/c4-components-customer-management.mmd:3` still describe the buses as current.
- T58 to T60: ADR 0001 names `@nestjs/cqrs` in its title and decision, and ADR 0026 replaces that part while the modular monolith and the layers stay in force. Proposed to the user: an `Amended by 0026` status on 0001, added to the status table of `docs/adr/README.md`, with the body of 0001 untouched. Waiting for the answer.

**Environment**: Postgres and Redis run through `docker compose up -d postgres redis` on host ports 15432 and 16379.
