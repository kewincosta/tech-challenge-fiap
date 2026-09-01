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
| 7 | `work-order-part-withdrawal` | 11 | Large | Specified |
| 8 | `work-order-closing` | 12 | Large | Not started |
| 9 | `tracking-and-metrics` | 13 | Medium | Not started |

Rows 7 and 8 were one feature, `work-order-execution-and-closing`, until 2026-09-01. Phases 11 and
12 together came to an estimated 28-36 tasks, against the 20 that feature 6 took, and phase 11
carries the only piece of machinery this codebase has never built: a write that spans two modules
and two aggregates inside one transaction. Splitting puts that mechanism in front of its own
Verifier and its own discrimination sensor before phase 12 builds on top of it.

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

- **Feature**: `.specs/features/work-order-diagnosis-and-budget` - **done**
- **Phase / Task**: Verified, PASS on the first verification pass - no fix→re-verify loop needed.
  20 tasks total (T1-T20) committed to `main` (`a79ab48..f97ea9d`, preceded by the spec/design/tasks
  approval commits `3a0f1dd`, `5a7949d`, `f7b6235`). Verifier report at
  `.specs/features/work-order-diagnosis-and-budget/validation.md`.
- **Completed**: every task in `tasks.md`; all 5 stories (WOB-01 through WOB-05, 27 ACs plus 8
  listed edge cases) independently re-derived and confirmed by the Verifier, evidence-or-zero.
  Discrimination sensor: 3/3 injected mutations killed - dropping `generateRound`'s
  `|| item.budgetRound === round` clause (breaks round-one regeneration), writing item rows before
  budget rows in `TypeOrmWorkOrderRepository.save` (breaks the round-to-internal-id FK linkage,
  caught against a real Postgres integration run), and flipping
  `BudgetDecisionAuthorizer`'s `customer.id === workOrder.customerId` comparison (breaks both the
  authorizer's own unit test and the approve/reject handlers' authorization tests). Final gate:
  lint clean, build clean, unit 471/471, integration 172/172 (run twice consecutively), e2e 128/128
  (run twice consecutively) - 771 total, up from the 637 baseline, zero regressions. Real counts
  matched tasks.md's own closure-note estimate exactly.
- **In-progress** (file:line): none
- **Next step**: none required. No blocking gaps. The next unit of work is specifying feature 7,
  `work-order-execution-and-closing`, when the user asks for it - not before, per this file's own
  Feature Roadmap policy.
- **Blockers**: none
- **Uncommitted files**: none - working tree clean on `main`
- **Branch**: main

**Notes from this feature's own implementation** (useful context for feature 7 or a re-read of this one):
1. Rule 29 ("no caller ever supplies a price or total") is held by construction, not validation:
   every command and every aggregate method that generates or regenerates a round
   (`CompleteDiagnosisCommand`, `SubmitSupplementaryBudgetCommand`,
   `WorkOrder.completeDiagnosis`/`submitSupplementaryBudget`) carries no price/total field in its
   signature at all, confirmed by reading the actual TypeScript interfaces rather than trusting a
   comment.
2. A rejected round one is regenerated in place (`Budget.regenerate`, called from
   `WorkOrder.completeDiagnosis`) rather than opening a new round - `ux_work_order_budgets_round`
   stays satisfiable and rounds above one stay reserved for work found during execution (H38). The
   private `generateRound(round)` helper's `item.isDraft || item.budgetRound === round` condition is
   what makes this regeneration path pick up the already-attached round-one items alongside any new
   drafts; the discrimination sensor confirmed dropping the second clause is caught by a dedicated
   unit test.
3. `TypeOrmWorkOrderRepository.save` writes the work order row, then budget rows, then item rows,
   in that order inside one transaction, because an item's `budget_id` is a foreign key to a budget
   row whose internal id does not exist until it is inserted. `replaceBudgets` returns a
   `Map<round, internalId>` that `replaceServiceItems`/`replacePartItems` read to fill `budget_id`.
   The discrimination sensor confirmed this ordering is load-bearing against a real Postgres
   integration run.
4. `BudgetDecisionAuthorizer` is the one place that answers "the owning customer or a holder of
   `work-orders:decide`" - both `approve-budget` and `reject-budget` handlers call it between the
   load and the aggregate call, and it throws `WorkOrderNotFoundError` (never a forbidden error) for
   anyone else, so the API never confirms a work order number exists to a stranger. The two decision
   routes carry no `@RequirePermissions` decorator by design, since `PermissionsGuard.every()` cannot
   express "either of two" - a comment on both routes names the authorizer as the reason.
5. `work_order_events.occurred_at` ties happen for real in this feature: several transitions record
   2-3 trail events sharing the exact same `now`, and `listTrail`'s `ORDER BY occurred_at ASC` has no
   secondary tie-breaker. Verified directly against the real Postgres instance (forced seq scan and
   forced index scan) that ties resolve to insertion order consistently - stable in practice, not a
   documented SQL guarantee. Not treated as a gap; worth remembering if a future feature adds
   concurrent writers to the same trail.
6. The "coverage-only gap, fix touches zero production code" pattern flagged as worth watching after
   `work-order-creation` (and `identity-foundation` before it) did **not** recur here - this feature
   passed verification on the first attempt, no fix→re-verify loop at all. No lesson promotion
   triggered by this feature.
