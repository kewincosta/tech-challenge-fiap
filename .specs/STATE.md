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
| 8 | `work-order-closing` | 12 | Large | Not started |
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

- **Feature**: `.specs/features/work-order-part-withdrawal` - **done**
- **Phase / Task**: Verified, but only after the longest verification history any feature in this
  project has needed. 18 tasks (T1-T18) committed first, then a fix→re-verify loop that ran the
  full 3 automatic iterations the skill bounds it to, hit FAIL a fourth time at that bound, was
  reported to the user per protocol rather than continued automatically, and was extended once with
  the user's explicit go-ahead for a final round. 5 independent Verifier passes total; the 5th is
  the first clean PASS. Commit range `867e445..78ca0b0` (28 commits) on `main`. Verifier report
  (all 5 rounds' history preserved) at `.specs/features/work-order-part-withdrawal/validation.md`.
- **Completed**: every task in `tasks.md`; all 5 requirements (WOP-01 through WOP-05, all 37 ACs,
  all 6 listed edge cases) independently re-derived and confirmed by the round-5 Verifier,
  evidence-or-zero. 26 distinct mutations injected across the 5 passes, every one eventually killed;
  the production code has been unchanged since commit `ac810aa` (the last task commit) - every one
  of the 4 fix rounds added or extended test cases only, never touched `src/`. Final gate: lint
  clean, build clean, unit 534/534, integration 198/198 (run twice consecutively), e2e 152/152 (run
  twice consecutively) - 884 total, up from the 771 baseline this feature started from, zero
  regressions.
- **In-progress** (file:line): none
- **Next step**: none required. No blocking gaps. The next unit of work is specifying feature 8,
  `work-order-closing`, when the user asks for it - not before, per this file's own Feature Roadmap
  policy.
- **Blockers**: none
- **Uncommitted files**: none - working tree clean on `main`
- **Branch**: main

**Notes from this feature's own implementation** (useful context for feature 8 or a re-read of this one):
1. AD-008 (the ambient-transaction rule, defined this feature) got its first real exercise beyond
   `RegisterUserHandler`: `TypeOrmInventoryItemRepository` and `TypeOrmWorkOrderRepository` both gained the same
   `inTransaction` helper (ambient `EntityManager` via `currentEntityManager()`, falling back to
   `dataSource.transaction` when there is none), and `WithdrawPartsHandler`/`ReturnPartsHandler` are
   the second and third handlers (after `RegisterUserHandler`) to open one `transactionRunner.run`
   spanning a save on their own aggregate and a `CommandBus.execute` dispatch into the other module.
2. **The T12 correction** (mid-Execute design fix, fully written up in `tasks.md`'s dedicated
   section): the original design had work-orders remember the movement ids `ConsumeStockBatchHandler`
   mints and pass them back on a later return call. That cannot survive a reload - `WorkOrder.restore`
   rebuilds every part item from `work_order_parts` columns alone, with no column for a movement id,
   and work-orders genuinely has no durable memory of one past the request that minted it. The
   shipped shape has `RestoreStockBatchHandler` resolve the target itself, via a new
   `findPendingConsumptions` repository method that reads `stock_movements`' own ledger newest first,
   netting out prior returns per consumption. General lesson for a future feature: if a value is
   needed across two separate HTTP requests and it is not a column on some row, it does not exist by
   the second request - trace the actual data lifecycle before designing a handoff between two calls.
3. **The fix→re-verify loop ran its full course, then one round further.** Every finding across all
   4 fix rounds was a test-discrimination gap, not a functional defect: a guard duplicated between
   an aggregate and its child entity with no test that could tell them apart (M3, its return-side
   twin N1); a threshold or a formula with no fixture sitting on its exact boundary (M7, N3); a
   formula written twice in one SQL query with only one copy under test (P1); a value asserted by
   count but not by which record it pointed at (P2); an aggregate function (`SUM`, `array_agg`) never
   exercised with more than one contributing row (round 5's own fix). Six new project lessons came
   out of this (L-008 through L-014, `.specs/LESSONS.md`) - all variations on "the test suite proved
   less than it looked like it proved," none about wrong behavior. Worth remembering for Design and
   Tasks on a future feature with a shared threshold/formula/aggregation or a guard duplicated across
   two layers: budget a boundary fixture and a multi-row fixture up front, rather than finding the
   gap through 4 rounds of mutation testing.
4. **A real bug in the skill's own tooling surfaced and got fixed along the way.**
   `validate_state.py`'s `_verdict()` scanned the whole `validation.md` file for any line matching a
   `**Result**:` label, so a multi-round report that preserves a prior round's FAIL as history (this
   skill's own stated convention) could never read as PASS again, no matter what the current round
   said. Fixed in `fix(spec-tooling): read a report's current verdict, not its history` - the script
   now recognizes a verdict only as the immediate value of a `## Validation` heading or a
   `**Verdict**`/`**Result**` label, scanning top to bottom for the first (i.e. current) declaration.
   Verified against all 7 `validation.md` files under `.specs/features/` before and after, no
   regression. This will matter again the next time a feature needs more than one verification pass.
5. **Known, deferred, out of scope for this feature**: test-infrastructure flakiness is compounding
   as this session's test database grows across a very long run. L-004 (`registerUser`'s
   `faker.internet.email()` colliding against a never-truncated database) hit multiple sibling e2e
   spec files' `beforeAll`/fixture setup during this feature's own gate reruns, never inside this
   feature's own assertions. Separately, round 3's Verifier observed `work-orders.e2e.spec.ts`'s
   unpaginated board-listing route (`GET /work-orders`) nearing its 30s timeout against a database
   that had accumulated roughly 4,750 work order rows by that point in the session. Neither is this
   feature's to fix - flagging both for whichever future feature or maintenance pass next touches
   test infrastructure or the work order board route. A per-test-run database reset, or switching
   `registerUser` to a collision-proof id, would address the first; pagination or an index-only count
   would address the second.
