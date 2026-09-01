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

The fourteen phases of `docs/ddd/implementation-plan.md` group into nine shippable features. Each
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
| 9 | `tracking-and-metrics` | 13 | Medium | Not started |

Rows 7 and 8 were one feature, `work-order-execution-and-closing`, until 2026-09-01. Phases 11 and
12 together came to an estimated 28-36 tasks, against the 20 that feature 6 took. Phase 11 also
carries the first write that spans two *aggregates* in two modules inside one transaction, and
splitting puts that in front of its own Verifier and discrimination sensor before phase 12 builds
on top of it. The transaction mechanism itself is not new: `TransactionRunner` and
`currentEntityManager()` have carried a shared transaction across a `CommandBus` dispatch since
`identity-foundation` (`RegisterUserHandler` plus `TypeOrmAssignmentRepository`). What phase 11
adds is making two repositories that today always open their own `dataSource.transaction` join an
ambient one instead.

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

- **Feature**: `.specs/features/work-order-closing` - **done**
- **Phase / Task**: Verified in a single clean pass - no fix→re-verify round needed. 23 tasks
  (T1-T23) committed on `main`, including one hard interruption mid-Execute (a terminal crash after
  T19's code was written but before it was gated or committed) that the resuming session reconciled
  and continued from cleanly, with no half-done state surviving into the final tree. Commit range
  `d6614c7..2214940` (24 commits: T1-T23 plus the docs commit marking `design.md` Approved).
  Verifier report at `.specs/features/work-order-closing/validation.md`.
- **Completed**: every task in `tasks.md`; all 5 requirements (WOC-01 through WOC-05, all 27
  numbered ACs, all 8 listed edge cases) independently re-derived and confirmed by the Verifier,
  evidence-or-zero. 3/3 discrimination-sensor mutations killed on the first attempt (the AD-009
  version-guard comparison, `CancellationAuthorizer`'s outstanding-withdrawal key, and the T20
  inventory-module-wiring fix) - no surviving mutant, no fix task generated. Final gate: lint clean,
  build clean, unit 619/619, integration 216/216 (run twice consecutively, identical both times),
  e2e 179/179 clean on 2 of 4 runs, with the other 2 runs each showing exactly one isolated
  `registerUser` collision (the known L-004 flake, unrelated to this feature's own logic) confirmed
  transient by a clean re-run - 1014 total, up from the 884 baseline this feature started from
  (+130 new tests), zero regressions.
- **In-progress** (file:line): none
- **Next step**: none required. No blocking gaps. The next unit of work is specifying feature 9,
  `tracking-and-metrics`, when the user asks for it - not before, per this file's own Feature Roadmap
  policy. Feature 9 will read `completed_at` and `delivered_at`, both added by this feature, for the
  average execution time metric spec.md explicitly deferred.
- **Blockers**: none
- **Uncommitted files**: none - working tree clean on `main`
- **Branch**: main

**Notes from this feature's own implementation** (useful context for feature 9 or a re-read of this one):
1. **No fix→re-verify round was needed.** This is the first feature since `identity-foundation` and
   `work-order-creation` (both of which needed a fix→re-verify round whose fix touched zero
   production code, per this file's own prior Handoff entries) to close clean on the first Verifier
   pass. That coverage-only-gap pattern is not "resolved" as a project-wide trend from one clean
   pass - `work-order-part-withdrawal` needed 5 rounds immediately before this - but it did not
   recur here. Worth continuing to watch on the next feature rather than treating either outcome
   (clean or multi-round) as the new default.
2. **The module-wiring gap (T20) did not recur elsewhere in this feature and was not recorded as a
   lessons.py entry.** `SettleStockMovementsHandler` and `WriteOffStockMovementsHandler`, both
   committed under T12/T13, were never registered in `inventory.module.ts`'s providers array - a gap
   `npm run build`, `npm run lint` and every unit test pass through cleanly, since a
   `@CommandHandler`-decorated class compiles and unit-tests fine in complete isolation from Nest's
   DI container. Only T20's first e2e request against `/delivery` surfaced it, as a 500 ("No handler
   found for the command"), and it was fixed within the same task's own gate cycle - before the
   Verifier ever ran. Checked and confirmed not a second time anywhere else in this feature: all four
   new work-order handlers and both new authorizers are correctly registered in
   `work-orders.module.ts`. The discrimination sensor independently reproduced the exact failure mode
   by commenting the registration back out, confirming the fix is load-bearing, not accidentally
   redundant. Not run through `lessons.py`: the script grounds a lesson in one of five signals read
   from a Verifier's own `validation.md` (`ac_gap`, `gate_fail`, `spec_deviation`,
   `spec_precision_gap`, `surviving_mutant`), and this gap was an author-side self-correction inside
   T20's own per-task gate cycle - exactly like T4's `ClosingProps` split and T10's version-guard fix
   - not something that survived to reach the Verifier. None of those three generated a lesson
   either, for the same reason. Flagging in prose here, as `tasks.md`'s own T20 closure note already
   did, for whoever next touches module wiring for a new command handler: unit coverage of a handler
   proves nothing about whether Nest's DI container can find it, and only a real request through the
   bootstrapped app catches the gap.
3. **AD-009's version guard shipped clean and stayed load-bearing.** The repository-level fix
   (`TypeOrmWorkOrderRepository.save`'s `WHERE id = :id AND version = :loadedVersion`) protects all
   ~17 work-order write handlers, not just this feature's own four, and the whole pre-existing suite
   (884 tests before T1) stayed green under it with zero adjustment - confirming design.md's own
   stated regression net held. The one bug T10 hit during its own build (comparing a freshly re-read
   database version against itself, a no-op guard) was caught by T10's own integration test before
   ever reaching a commit, and the discrimination sensor's mutation 1 independently reproduced the
   identical bug shape and confirmed the same test still catches it.
4. **Known, deferred, out of scope for this feature**: L-004 (`registerUser`'s
   `faker.internet.email()` colliding against a never-truncated database, first flagged during
   `work-order-part-withdrawal`) recurred twice during this feature's own gate reruns - once in a
   sibling file (`work-order-withdrawals.e2e.spec.ts`) and once inside this feature's own
   `work-order-closing.e2e.spec.ts` fixture setup, never inside an assertion this feature owns. The
   test database has now run across three features' worth of e2e suites without a reset. Still
   nobody's fix in particular - flagging again for whichever future feature or maintenance pass next
   touches test infrastructure. A per-test-run database reset, or switching `registerUser` to a
   collision-proof id generator, would close it for good.
