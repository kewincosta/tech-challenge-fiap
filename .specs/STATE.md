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

- **Decision**: A repository whose aggregate can take part in a write spanning two modules must honour an ambient transaction: it resolves its `EntityManager` through `currentEntityManager()` first and only opens its own `dataSource.transaction` when there is none. Refined on 2026-10-29 by T62 of `clean-architecture`: a repository opens its own transaction through `runInNewTransaction`, which publishes that manager as the ambient one, so the key resolvers and owner reads it calls join the transaction and hold no second connection. ADR 0032 records the refinement (T66).
- **Reason**: `TransactionRunner` carries one transaction across a `CommandBus` dispatch through `AsyncLocalStorage`, but a repository that calls `dataSource.transaction` unconditionally opens a second transaction on a second connection and silently leaves the two writes independent. Nothing in the calling module's own tests can catch that.
- **Trade-off**: Every such repository carries a small branch on the ambient manager, and a row lock taken inside one is held until the outer transaction commits rather than until its own write finishes.
- **Scope**: `shared/infrastructure/database/typeorm-transaction-runner.ts`, and every repository reachable from a cross-module write - today `users`, `authorization`, `inventory` and `work-orders`.
- **Date**: 2026-09-01
- **Status**: active within one module; superseded by AD-017 for writes across modules (2026-10-31)

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

### AD-017

- **Decision**: No transaction writes the tables of two modules. The five flows that did (withdraw, return, deliver and cancel between `work-orders` and `inventory`; customer registration between `customers` and `identity`) run as steps each module commits on its own. The orchestrating module records each pending step in its own outbox table, in the transaction of the step before it, and a processor applies it, retries it with a growing delay, and marks it failed at the attempt limit. The withdrawal and the registration compensate their first step when a later one fails (return the consumed units, discard the opened account); the return, the delivery and the cancellation retry their inventory step. Every receiving step is idempotent by operation id. A compensation stays visible in the movement history. A withdrawal's consumption counts for a restore, a settlement or a write-off only once its work order confirmed it through a step (decided on 2026-10-31 after the third validation).
- **Reason**: The user's decision of 2026-10-31. A shared transaction couples two modules through the database connection and the transaction context, and the pool starvation T62 fixed came from that coupling. An outbox keeps the guarantee of the shared transaction across a crash, which compensation done in memory would lose.
- **Trade-off**: Two step tables, two processors, idempotent operations in `inventory` and `identity`, and a short delay before a retried step lands. A step that keeps failing needs an operator.
- **Scope**: `work-orders`, `customers`, `inventory`, `identity`; design C16; ADR 0033.
- **Date**: 2026-10-31
- **Status**: active (T68 to T75). Supersedes AD-008 for writes across modules.

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
| 11 | `clean-architecture` | Phase 2 refactor | Complex | Implementing |
| 12 | Phase 2 API changes (named at Specify) | Phase 2 brief | Large | Pending |

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

Rows 11 and 12 come from the FIAP Phase 2 brief, which lives outside the repo. Row 12, agreed with the user on 2026-10-31, starts once `clean-architecture` closes, since that feature forbids API changes (CA-02). It covers the brief's five API changes (opening a work order with services and parts, the status lookup, an endpoint for external budget approval notifications, the listing order and exclusion, status updates by e-mail) together with their documentation and a Postman collection. Its open decisions: parts at reception (`PART_PLANNABLE_STATES` forbids them today), customer and vehicle data or ids at opening, where `CANCELED` goes in the listing, and how the external system authenticates on the approval route.

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
- **Phase / Task**: Execute. Batch 1 done (T1 to T7, `709eb27` to `61984b9`). Batch 2 done (fix `6cdf869`, T8 `f59344b`, T9 `2da307d`, T10 `80c3044`, T11 `87b9fb7`, T61 `837dcea`, T12 `b6375ec`, T13 `ee289a7`). Batch 3 done (T14 `7b1c697`, T15 `0fbedc0`, T16 `a468f19`, T17 `d3b592f`, T18 `5957853`, T19 `4709cc9`). Batch 4 done (T20 `2d02293`, T21 `0c9fa97`, T22 `7b85b02`, T23 `1909490`, T24 `47138b5`, T25 `9eaa3ad`). Batch 5 done (T26 `39bab4a`, T27 `78f69e7`, T28 `f6d5617`, T29 `b8e5339`, T30 `53dbe36`, T31 `41033d9`). Batch 6 done (T32 `671f070`, T33 `897003b`, T34 `8942059`, T35 `f05968d`, T36 `8c700d7`, T37 `44bc81b`, T38 `f866dbe`). Batch 7 done (T62 `9b32389`, T39 `29e63d7`, T40 `4e77a49`, T41 `9d44089`). Batch 8 done (T42 `38c76af`, T43 `799bdf4`, T44 `ae9b89f`, T45 `0bcdacf`, T46 `094d9ca`). Batch 9 done (T47 `581c011`, T48 `0802f21`, T49 `43d04d2`, T50 `b2aba59`). Batch 10 done (T51 `55b1b4e`, T52 `4122a7f`, T53 `2592644`, T54 `f4cda90`, T55 `c8bde6b`). Batch 11 done (T56 `7bd7c20`, T57 `7c5aaab`, T58 `dc86dce`, T59 `1c02df5`, T60 `ccd3861`). Fix round 1 done (T63 to T67). Phase 19 batch A done (T68 `e2c8ac9`, T69 `c9e295b`, T70 `3e7bdff`, T71 `e9f01c1`, test fix `45a0c12`). Batch B done (T72 `07f7832`, T73 `a3278ad`, T74 `0b5b83b`, T75 `ef77248`). The Verifier's round 2 returned FAIL (`23a61db`). Fix round 2 done (T76 `4f87c4a`, T77 `b37d06a`, T78 `395d45e`). The Verifier's round 3, the last of the loop, returned FAIL. The user chose confirmed consumptions and a fourth round: fix round 3 (phase 21, T79 to T83) is dispatched.
- **Completed**: T1 to T78. Totals after fix round 2: unit 1249, integration 483, e2e 246 (after batch B: 1249, 472, 246; after batch A: 1184, 398, 245; after batch 11: 1114, 342, 244; baseline 955, 239, 203). Baselines: no dependency violation, no table finding (both files are `[]`), no module cycle. Diff range of the feature: `51a3a8a..ccd3861`.
- **In-progress** (file:line): none yet
- **Next step**: fix round 1 is done (T63 `482ad0d`, T64 `d2dae75`, T65 `724eb1b`, T66 `98f05b1`, T67 `552a112`; unit 1118, integration 342, e2e 245; M07, M12, W1, W2, W3b and W3c now fail a suite). The user approved phase 19 (steps across modules, T68 to T75, design C16, CA-10) on 2026-10-31, the T68 migration included. Batch A (T68 to T71) is done and its migration ran once on `workshop`. Batch B is done, and `75e5d1d` marks ADRs 0001 and 0027 as amended by 0033. The Verifier's round 2 returned FAIL (`23a61db`): 53 of 56 ACs, 24 of 25 edge cases, 32 of 33 mutants killed, every gate green. The Verifier's round 3 returned FAIL: 56 of 57 ACs, 25 of 26 edge cases, 17 of 17 mutants killed, every gate green. Round 2's three gaps are closed. One new gap remained. The user chose, on 2026-10-31, the confirmed consumptions (phase 21, T79 to T83) and a fourth verification round beyond the loop's bound of three.

**Decisions of 2026-10-31 after the first validation**: ADR 0032 records T62's refinement and ADR 0023 becomes `Amended by 0032`; CA-03 AC7 is amended to allow `runInNewTransaction`; the survivors W1 and W2 get tests only. The five flows that write two modules in one shared transaction (withdraw, return, deliver and cancel between work-orders and inventory; register customer between customers and identity) move to compensation inside this feature, with a durable outbox per module and idempotent receiving steps. A compensation shows in the movement history as what happened (a consumption followed by its return).
- **Blockers**: none
- **Uncommitted files**: none
- **Branch**: feat/tech-challenge-2

**Facts from batch A that batch B builds on**:

- `claimDue(now, limit, leaseUntil, operationIds?)` turns a claimed armed step into a pending one and pushes its due time to the end of a lease of `OUTBOX_GRACE_SECONDS`. The applier has `applyDue()` and `applyOperations(ids)`; the request's own attempt and the tests use the second. Test support: `drainStockSteps(app, ids)` in `test/support/outbox.ts`.
- T69 changed only `WithdrawPartsUseCase` and `ReturnPartsUseCase`: settle and write-off carry no operation id.
- T70: `UserRepository.delete` relies on the `user_roles` ON DELETE CASCADE and maps SQLSTATE 23503 to `AccountInUseError` (`ACCOUNT_IN_USE`, 409); a sessions pre-check uses `SessionRepository.existsByUserId`.
- `last_error` is `text`. The T68 migration spec deletes the rows it inserts (`45a0c12`), and the suites leave no row in the two step tables.

**Plan changes after batch A**:

- The five inventory stock use cases need an open transaction: `findAllByIdsForUpdate` throws TypeORM's `PessimisticLockTransactionRequiredError` without one, and settle and write-off run several statements. Each opens its own through `TransactionRunner`, in the task that moves its caller out of the shared transaction: T72 for consume and undo, T73 for restore, settle and write-off. The worker proposed a `withinTransaction` on the repository port that joins any open transaction; it was not taken, because joining an open transaction is the mechanism CA-10 removes across modules, and the `TransactionRunner` port is how the other use cases own a transaction.
- A claim makes an armed step pending, so `complete` cannot tell a request whether the processor took its step. `PendingStockSteps` gains `disarm` (T72), and the account steps mirror it (T74): the last step disarms, then saves, in one transaction, and a step the processor already claimed answers 409 `CONCURRENT_MODIFICATION`. The request applies its own compensation through the ledger or the accounts port without claiming; this also returns the units of a consumption that committed after the processor's undo found nothing. spec.md has a new edge case for it, and the edge case table a new row.
- The write-off updates only the consumptions still pending (T73), so two runs at once record each transition once (CA-10 AC6).
- `TypeOrmTransactionRunner.run` always takes a new connection (TypeORM 0.3.31 `EntityManager.transaction` creates a query runner for the default manager). Today's registration therefore commits the identity account in its own transaction before the customer save, and `CustomerAccountsGateway`'s comment saying it joins the registration's transaction is wrong. Design C16, T74 and T75 say so. T74 makes `run` refuse to open inside another open transaction.
- `cross-module-transaction.spec.ts` has no withdrawal case (its cases join two repositories in one transaction), so T72 leaves it and T73 reshapes it.
- T75 also brings the README up to date: 20 domain tables, ten migrations, and the three `OUTBOX_` settings in the environment table.

**Decision of 2026-10-31 during batch B**: with the stock consumed before the work order saves, the e2e case of a cancellation racing a withdrawal (`test/e2e/work-order-concurrency.e2e.spec.ts`, about line 269) failed 3 of 6 isolated runs. When the cancellation wins, the losing withdrawal's consumption has committed. Either the undo returns it and the consumption stays `PENDING` beside its return (rule 22), or the write-off closes it first and the undo, which read pending consumptions only, returned nothing (a 409 with one unit lost). The user chose the worker's remedy: the undo returns the net remaining units of every consumption the operation tagged, whatever its status, and that e2e assertion becomes "no consumption keeps units outstanding, and the stock is back at 20". CA-02 AC2 and the Assumptions row now name this one exception, and design C16 Idempotency says so. The T69 case on a settled consumption flips with it. Left to an operator, and recorded in ADR 0033: a request that stalls past the grace period between arming and consuming, and whose own undo then fails, leaves no step to retry.

**Facts from batch B**:

- The request's compensation is a private method of `WithdrawPartsUseCase` and of `RegisterCustomerUseCase`; it never claims. When the undo or the discard fails, the request calls `release`, which touches only an armed step, so a claim the processor holds keeps its lease. `StockStepApplier.applyAfterCommit(operationId)` is the attempt after the commit that never throws. `PendingAccountSteps` has no `enqueue`, since no registration enqueues. Each module has its own outbox settings type, read from the same three `OUTBOX_` variables.
- Test support: `FakeTransactionRunner.watch(name, fake)` records the calls and those made inside `run`; `FakeStockLedger.refuseWith(error, ...calls)`; `drainStockSteps(app, ids, now?)`. `test/support/factories/work-order-number.factory.ts` draws a random year, because the six-character number space collided once at about 30k work orders. `test/support/global-setup.ts` returns a teardown that deletes the `DONE` steps created since the run started, so the step tables are empty after a full run; it never deletes an armed or pending step.
- Existing assertions changed, each reported by the worker: the user-approved e2e case and the T69 settled case (`07f7832`); the "inside the transaction" flags of the withdrawal, return, delivery, cancellation and registration specs, now outside (CA-10 AC1); the three unit cases where an inventory error reached the request, which now succeed with the step left pending (CA-10 AC5); `cross-module-transaction.spec.ts`, now `work-order-step-transaction.spec.ts`, whose shared-transaction cases became a work order save and a stock step committed and rolled back together.
- T74's scratch check confirmed that, before T74, a failed customer save after `accounts.open` left the user behind. No production code nests `run`.
- Fix outside the task list: ADRs 0001 and 0027 stated that a write across two modules commits in one shared transaction, and both are in force. `75e5d1d` sets their Status to `Amended by 0033` (0001 keeps 0026 as well), following the README rule for an amended record.

**Follow-up candidates, outside this feature**: an index on `(status, due_at)` for both step tables (the claim scans them, and `DONE` rows accumulate with no retention rule); the inventory stock use cases publish item events inside their transaction, before the commit, as before (nothing subscribes); two e2e flakes from random data, a CPF collision in `role-escalation` and a plate collision in `work-order-closing`; `docs/roteiro-video.md:95-100` and `:361` and `security/scripts/deliverable.ts:255` still name CQRS and the buses; `FindUserByDocumentUseCase` is unused; local spec variables are still named `handler`.

**Findings of the second validation and how they are handled**:

1. A restore that failed could never apply after a later write-off or settlement of the same work order: the restore draws from pending consumptions only, and the claim ordered steps by due time alone. The orchestrator chose the general fix: the steps of a work order apply in the order they were recorded, and a failed step holds the later ones until an operator sets it back to pending (CA-10 AC10, design C16 Processor, T76). The Verifier's other option, closing steps that first apply older pending restores, covers only that pair of kinds.
2. Surviving mutant S22: no test settled a work order twice through the repository (T77).
3. Spec text behind the approved scope, fixed in `spec.md` directly: CA-03 AC7 names the T68 migration, the two Out of Scope rows on the domain and the schema name CA-10's exceptions, the coverage count is 10, and the probe's scenario joins the edge cases.

Observations kept as they are: ADR 0001:29 names "Distributed services" as an alternative nobody recorded as considered; the sentence predates this feature and the body of an ADR stays as decided, and the user decided on 2026-10-31 that it stays. The registration's case left to an operator joins ADR 0033 in T78. The teardown would also delete the `DONE` steps a second process writes during a run; they are inert. Lessons L-023 to L-025 record the findings.

**Facts from fix round 2**:

- The claim locks with `FOR UPDATE OF candidate SKIP LOCKED` and takes a step only when no older step of its work order is `ARMED`, `PENDING` or `FAILED`, so one claim takes at most one step per work order. Six mutants of that condition die. The in-memory `FakePendingStockSteps` still claims by due time alone: the order rule lives in the SQL, integration cases prove it, and the fakes stay free of it, as with W1 and W2.
- `drainStockStepsOfWorkOrder(app, workOrderId, now?)` in `test/support/outbox.ts` drains every step of one work order until nothing of it is claimable. The race file `work-order-concurrency.e2e.spec.ts` drains its work orders in `afterAll`, since the cancellation's write-off can wait behind the losing withdrawal's undo step; its assertions are unchanged.
- `workshop_test.work_order_stock_steps` holds six inert `DONE` `WRITE_OFF` rows (ids 2659, 2672, 2685, 2698, 2711 and 2724) from the worker's diagnostic runs before that drain existed. The worker's targeted delete was refused by the permission check. The user decided on 2026-10-31 that they stay; the suites add no row.
- Follow-up candidate: an index on `work_order_stock_steps (work_order_id, id)` for the claim's order check.

**Finding of the third validation, escalated to the user**: a return's restore can draw its units from the consumption of a withdrawal that has not reached the work order, because the restore draws from the newest pending consumptions and a withdrawal consumes before it saves. When that withdrawal is undone, the undo returns only what the restore left, and the return's units are lost with every step `DONE` and nothing logged. The Verifier reached it in four orders (B2 to B5 in `validation.md`): a race with no failure, and a restore that failed followed by a withdrawal that stalls. T76's order rule cannot prevent it, since a consumption is no outbox step. It breaks CA-02 AC5 and the edge case of a restore that failed before a cancellation or a delivery. Lessons L-026 to L-029 are candidates.

The user's decision on it (2026-10-31): inventory counts a withdrawal's consumption only once its work order confirmed it, through a `CONFIRM_CONSUMPTION` step enqueued with the save; restores, settlements and write-offs read confirmed consumptions only, and an undo neither waits for nor holds the other steps (CA-10 AC10 amended, AC11 added, design C16, phase 21). The other two options were a hold rule (restores, settlements and write-offs wait behind an armed undo), which leaves a window between a claim and its read, and closing the feature with the gap recorded. The choice included a second migration, run once on `workshop` after its spec passes, as T68's was.

**Batch plan** (whole phases, run in sequence; the Verifier runs after batch 11): 1 = T1-T7, 2 = T8-T13 plus T61, 3 = T14-T19, 4 = T20-T25, 5 = T26-T31, 6 = T32-T38, 7 = T62 and T39-T41, 8 = T42-T46, 9 = T47-T50, 10 = T51-T55, 11 = T56-T60. Batches 7 to 10 are smaller than the ~7-task budget because each of their tasks migrates several use cases.

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

**Facts from batch 4 that later tasks build on**:

- T22 wrote the pilot's findings into `design.md`: a module's `index.ts` also exports its Nest class and each use case's not-found error (C2); a gateway is an `@Injectable()` class wired with `useClass` under a consumer token, taking the provider's use case classes, and its spec stands in for them with an object that has `execute` alone (C3); the baseline shrinks with `--baseline --baseline-mode shrink-only` (C12); the in-memory `WorkOrderRepository` refuses what the unique indexes refuse (C15).
- `SELECT_OPEN_WORK_ORDERS_USING_ITEM` became an `EXISTS` query in T23, so the ordering case fails without `ORDER BY`. The strict shortage comparison (`outstanding > quantity_on_hand`) lives in the inventory adapter.
- Nothing defines the row order of `GET /inventory-items/shortages`. It was unordered before T24 and stays unordered.
- `InventoryModule` imports `IdentityModule` for `UserKeyResolver`, and `identity/index.ts` exports `IdentityModule`.

**Facts from batch 5 that later tasks build on**:

- No cross-module call goes through the bus any more. Each consumer calls a port it declares, and the gateway calls the provider's handler classes through the provider's `index.ts`. When a provider handler becomes a use case (phases 10 to 15), its gateways follow, and a gateway maps the provider's not-found error to `null`.
- `identity/index.ts` exports `AppPermission`, `SystemRole`, the effective-access and get-user-by-id handlers and queries, their DTO types, `RegisterUserCommand`, `RegisteredUserDto` and `RegisterUserHandler`; `IdentityModule` exports the three handlers.
- `CustomerAccounts.open` returns `OpenedAccount` (`userId` and an optional `temporaryPassword`); design C3 now says so.
- `customers.tokens.ts` holds only `CUSTOMER_ACCOUNTS` and `vehicles.tokens.ts` only `VEHICLE_OWNERS`. T47 and T49 move the other tokens in.
- The 19 `through-public-api` entries left are controllers importing identity or module internals (customers, inventory, vehicles and work-orders 4 each, services 2) and the list-customers handler. Each module's migration task clears its own.
- `FakeTransactionRunner` has a read-only `active` flag, so a spec can prove a call ran inside the transaction.
- T27 re-wrapped two pre-existing comments that use a spaced hyphen as a dash, in `cancel-work-order.handler.ts` and `return-parts.handler.ts`. T51 to T53 reword them when they rewrite those files.
- `npm run seed` dispatches its commands through the bus until T56. Once T37 turns the services handlers into use cases, the seed fails at runtime with no handler for its first command, and it stays broken until T56. No test runs it before T56, so each task only keeps it compiling.

**Facts from batch 11**:

- `scripts/seed.ts` exports `runSeed()` and calls the five use cases; `test/integration/seed.script.spec.ts` runs it twice. `workshop_test` now holds the seed's demo rows for good: `admin@workshop.local` as SUPER_ADMIN, the four `@oficina.local` accounts, 4 services, 5 items with inbound movements, 1 customer and 2 vehicles. No integration or e2e case uses those values.
- Mutating the seed needs a scratch database, because a mutated seed writes bad rows into the never-truncated `workshop_test`: a detached worktree with `node_modules` symlinked, its `.env.test` set to `DATABASE_NAME=workshop_mut_test` and `REDIS_DB=13`, the database created (the global setup migrates it) and dropped per mutant.
- T57 added three unit tests: the purity list covers every module folder on disk, and the two baseline files are empty. `npm uninstall @nestjs/cqrs` changed only its root dependency line and its lock entry.
- The five C4 component diagrams used `Component_Boundary`, which Mermaid does not parse; T60 switched them to `Boundary(`, and all seven `.mmd` files and the README's three Mermaid blocks parse with Mermaid 11.17.2.
- Bus or CQRS mentions outside the CA-09 grep scope, left as they are: `docs/roteiro-video.md:95-100` and `:361`, `security/scripts/deliverable.ts:255`. Follow-up candidates.

**Facts from batch 10 that later tasks build on**:

- Every module is migrated and listed in `migrated-modules.json`. No module file imports `@nestjs/cqrs`; what is left for T56 and T57 is `app.module.ts`, the comment at `in-memory-domain-event-dispatcher.ts:12`, `scripts/seed.ts` and `test/support/fakes/bus.stubs.ts`, which no spec imports any more.
- The work order trail and the inventory movement history decide their not-found in the use case, like get and get own; design C10 now lists them.
- The `@ApiOperation` descriptions at `work-orders.controller.ts:434` and `:458` say "the handler enforces it". They are part of the pinned OpenAPI document, so they stay (CA-02).
- Left on purpose: comments that mean Nest route handlers (`inventory-items.controller.ts:118`, `authentication.e2e.spec.ts:267`), two comments in `vitest.config.ts` (lines 57 and 74 to 75), and the local names `makeHandler` and `handler` in 25 spec files. CA-08 covers class and file names only.
- Hand mutants no test kills, on logic the feature did not change: `RemoveWorkOrderItemUseCase` without `save` survives every layer (DELETE answers 204 and no e2e reads the work order afterwards); the quantity check before the catalog read in `PlanPartUseCase` is asserted nowhere. Candidates for fix tasks if the Verifier flags them.
- `FakeStockLedger` and `InMemoryWorkOrderRepository` take an optional "inside the transaction" probe, and the withdraw, return, deliver and cancel specs assert that the save and the ledger entries ran inside the transaction.

**Facts from batch 9 that later tasks build on**:

- `customers` and `vehicles` are migrated end to end. Get customer still returns deactivated customers. The `null` branches of `CustomerDirectory`, `VehicleDirectory` and `VehicleOwners` are unreachable with the real providers, and their specs still pin them, as with the catalogs.
- Hand mutations left survivors on logic no task touched and no AC anchors: the address and phone given to customer registration are asserted nowhere; a registered vehicle's year is asserted nowhere; dropping `save` from update, deactivate or remove survives the unit specs because the in-memory repositories hold the same instance (the e2e cases kill each one). Candidates for fix tasks if the Verifier flags them.
- `RegisterCustomerUseCase` records `CustomerRegistered` and never publishes it, as before; nothing subscribes.
- T57 must reword the comment at `src/shared/infrastructure/events/in-memory-domain-event-dispatcher.ts:12`, which names `@nestjs/cqrs`, so the acceptance grep finds nothing. `customer-accounts.gateway.spec.ts:36` and `:38` still call identity's use cases "handlers"; T55 rewords comments like these.
- Docs that still name the old classes: `docs/architecture/c4-components-customer-management.mmd`, `docs/architecture/low-level-design/customers.md` (T59, T60).

**Facts from batch 8 that later tasks build on**:

- `identity` is migrated end to end and listed in `migrated-modules.json`. `IdentityModule` implements `OnModuleInit` and subscribes the access cache and refresh-token-reuse subscribers on the dispatcher; nothing subscribes through `@nestjs/cqrs` any more. `@nestjs/cqrs` is still imported by customers (7 files), vehicles (7), work-orders (22) and `app.module.ts`.
- Get-user-by-id throws `UserNotFoundError` (C10). Inside identity the callers keep their old answers by catching it: login answers `InvalidCredentialsError`, assign role and user access answer `AssignedUserNotFoundError`, refresh lets it through. `AssignedUserNotFoundError` now duplicates `UserNotFoundError` (same code, kind and message); removing it would change two assertions, so it stays. `identity/index.ts` exports `UserNotFoundError` for the gateways.
- `FindUserByDocumentUseCase` is still wired in `identity.module.ts`, and no route, gateway or script calls it since T33. It stays: removing it would delete its pre-existing specs, no AC asks for it, and T57 counts every test. It is a follow-up candidate.
- `customer.repository.spec.ts` ("should link a customer to a user saved earlier in the same open transaction") failed once on the untouched tree at `84af554`, with no detail recorded, and passed 25 isolated runs and every full run after. Cause unknown; investigate if it fails again.
- The TTL e2e case pins `REFRESH_TOKEN_TTL_SECONDS` and `SESSION_ABSOLUTE_TTL_SECONDS` in one dedicated app and restores both in `finally`.
- Docs that still name the old identity classes: `docs/architecture/c4-components-identity-and-access.mmd`, `low-level-design/authorization.md`, `low-level-design/users.md` (T59, T60). `security/reports/raw/semgrep.json` is a generated scan and stays untouched.

**Facts from batch 7 that later tasks build on**:

- `runInNewTransaction(dataSource, work)` in `typeorm-transaction-runner.ts` opens a transaction and publishes its manager as the ambient one; `TypeOrmTransactionRunner.run` and both repositories use it. Any adapter that opens its own transaction and calls a resolver or another module inside it must use it. The session and role repositories still call `dataSource.transaction` and call no resolver inside; T44 and T43 keep it that way or switch to the helper.
- `inventory` is migrated end to end and listed in `migrated-modules.json`. `identity/index.ts` also exports `CurrentUser` and `Principal`.
- T39 and T40 changed existing assertions where design C10 and CA-05 ask for it: the malformed-id get in `test/integration/inventory-read-queries.spec.ts:89` throws `InventoryItemNotFoundError` (the e2e cases at `inventory-items.e2e.spec.ts:217` and `:226` are unchanged), and the deactivate, settle and write-off specs assert state on the in-memory repository and the recording publisher in place of call counts.
- `list-stock-shortages.use-case.spec.ts:51` keeps call assertions on a `vi.fn` query port. Query-port stubs moving to fakes is a deferred idea in `context.md`.
- `docs/architecture/c4-components-inventory.mmd` still names the old handler classes (T60).

**Plan change after batch 6**: T62 joins phase 7. `TypeOrmInventoryItemRepository` opens its own transaction when no ambient one exists and then calls `UserKeyResolver` and `WorkOrderReads`, which take a second pool connection. Batch 6 proved it with a pool of two: one of two concurrent saves timed out. The application's pool of ten has no connection timeout, so ten concurrent saves would wait forever. T62 makes a repository's own transaction the ambient one, in the inventory and the work order repository, with a regression case on a two-connection pool. Design C4 now says so.

**Facts from batch 6 that later tasks build on**:

- No module queries another module's table: `known-table-findings.json` is `[]` and no `application` file imports another module.
- T35 resolves every foreign key in one batch per owner before the work order repository opens its transaction. T36 reads the items and budgets of all listed work orders with `ANY` and orders items by `id`.
- A composed read leaves out a row whose referenced key is missing, as the inner joins did; the foreign keys make that unreachable. The metrics adapter answers `{ averageSeconds: 0, workOrderCount: 0 }` for an unknown service filter.
- T33 moved the document parsing out of the list handler. Its spec now asserts that the handler passes the document as typed, and the normalization and the malformed answer are asserted in `find-users.use-case.spec.ts`, the adapter's integration cases and the T6 e2e.
- `GET /customers?name=` with an empty string reads every user before the customers. The answer is the same as before, at a higher cost, and no test covers that input. T47 can treat an empty name as no filter.
- T37 changed the get-service unit cases and two cases of `test/integration/service-read-queries.spec.ts` from `null` to `ServiceNotFoundError`, as design C10 moves the not-found into the use case. `ServiceCatalogGateway`'s `null` branch is unreachable with the real provider, and its T26 spec case still pins it.
- `identity/index.ts` also exports `RequirePermissions`. `test/support/work-order-adapters.ts` builds the work order repository and query adapter with the real resolvers.

**Plan change after batch 4**: 78 `core-stays-in-module` entries are left, and phase 8 removes all of them except `list-customers.handler.ts` importing identity's `PersonDocument`, which T33 removes. T31's bullet now names that exception, and T33 checks that no `application` file imports another module.

**Notes for later batches** (from batch 1):

- T19 and T33: `GET /customers?document=` also accepts a masked CPF (`test/e2e/customers.e2e.spec.ts:315`) because `PersonDocument` strips non-digits. Identity's user search normalizes the document the same way.
- T42 to T46: `DELETE /users/:userId/roles/:roleId` with an unknown user or role answers 404 with the generic code `RESOURCE_NOT_FOUND` (`test/e2e/user-access.e2e.spec.ts:195` and `:206`). A Nest `NotFoundException` in `TypeOrmAssignmentRepository` produces it today. The migration keeps that answer.
- T58 to T60: `README.md:588`, `README.md:661` and `docs/architecture/c4-components-customer-management.mmd:3` still describe the buses as current.
- T58 to T60: ADR 0001 names `@nestjs/cqrs` in its title and decision, and ADR 0026 replaces that part while the modular monolith and the layers stay in force. The user decided on 2026-10-29: 0001 gets the status `Amended by 0026`, `docs/adr/README.md` defines `Amended by NNNN` in its status table, and the body of 0001 stays untouched. T60 carries it. ADR 0023 stays as it is.

**Environment**: Postgres and Redis run through `docker compose up -d postgres redis` on host ports 15432 and 16379.
