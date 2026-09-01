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
| 1 | `identity-foundation` | 0, 1, 2, 3 | Large | Verified |
| 2 | `customer-and-vehicle-registry` | 4, 5 | Large | Verified |
| 3 | `service-catalog` | 6 | Medium | Verified |
| 4 | `inventory-and-stock-movements` | 7 | Large | Verified |
| 5 | `work-order-creation` | 8 | Large | Verified |
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

- **Feature**: `.specs/features/work-order-creation` - **done**
- **Phase / Task**: Verified, PASS on re-verification pass 2 (iteration 2 of the bounded
  3-iteration fix→re-verify loop). Pass 1 (`04861a1..ca0261a`, T1-T19) returned FAIL with two
  coverage-only gaps - WO-05 AC6 (403 for an actor lacking `work-orders:read` on list/detail) and
  the "trail for a nonexistent number → 404" Edge Case - both behaviourally correct by code
  inspection but with zero test evidence. T20 (`8b1a96b`) closed both with two new e2e tests and no
  production code change. 20 tasks total (T1-T20) committed to `main`. Verifier report at
  `.specs/features/work-order-creation/validation.md`.
- **Completed**: every task in `tasks.md`; all 5 stories (WO-01 through WO-05, 45 ACs/edge cases)
  independently re-derived and confirmed by the Verifier, evidence-or-zero. Discrimination sensor:
  3/3 injected mutations killed - the non-draining `domainEvents` read after `save()`, the
  RECEIVED-state part-planning guard, and the active-vehicle unique-index-to-`409` mapping (the
  last one killed deterministically in both a real concurrent-write race and a sequential e2e form,
  unlike `inventory-and-stock-movements`' probabilistic pessimistic-lock mutation, `L-005` - a
  different mechanism, no update to `L-005` warranted). Sensor not re-run in pass 2 since T20
  touched zero production files (`git diff --stat ca0261a..HEAD -- src/` empty); pass 1's result
  carries forward. Final gate: lint clean, build clean, unit 369/369, integration 155/155 (run
  twice consecutively), e2e 113/113 (run twice consecutively) - 637 total, up from the 522
  baseline, zero regressions.
- **In-progress** (file:line): none
- **Next step**: none required. No blocking gaps. The next unit of work is specifying feature 6,
  `work-order-diagnosis-and-budget`, when the user asks for it - not before, per this file's own
  Feature Roadmap policy.
- **Blockers**: none
- **Uncommitted files**: none - working tree clean on `main`
- **Branch**: main

**Notes from this feature's own implementation** (useful context for feature 6 or a re-read of this one):
1. AD-007's third application: the trail row and the aggregate's own row are written inside the
   same transaction by `TypeOrmWorkOrderRepository.save` (`typeorm-work-order.repository.ts`,
   `appendTrail`), never by a post-commit subscriber. A forced real unique-violation mid-transaction
   proves a failed write leaves neither the work order row nor the trail row behind.
2. The shared `AggregateRoot` gained a non-draining `domainEvents` getter alongside the existing
   draining `pullDomainEvents()`, so a repository can read recorded events for the publisher after
   `save()` without clearing them first. The discrimination sensor confirmed this distinction is
   load-bearing: swapping one call for the other inside `save()` fails a dedicated test.
3. The DB-enforced "one non-terminal work order per vehicle" rule uses a partial unique index
   written as the complement of the terminal states (`WHERE status NOT IN ('DELIVERED',
   'CANCELED')`), not an enumeration of the non-terminal ones - so a state a future phase adds is
   covered by default rather than by remembering to update the index.
4. Feature 6 (`work-order-diagnosis-and-budget`) and feature 7
   (`work-order-execution-and-closing`) inherit a `work_orders` schema already shaped for them: the
   `CHECK` on `status` lists all seven states even though only `RECEIVED` is reachable through this
   feature's routes, and `work_order_parts.withdrawn_quantity` exists today, written by nothing
   until phase 11.
5. This is the second feature (after `identity-foundation`) to go through a fix→re-verify pass with
   a FAIL-to-PASS transition rather than a same-session PASS-with-non-blocking-gaps. Both times the
   gaps were coverage-only (implementation already correct, missing the direct test proof) and the
   fix round touched no production code - a pattern worth watching for a future lesson if it
   recurs a third time.
