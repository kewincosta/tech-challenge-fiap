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

- **Feature**: `.specs/features/inventory-and-stock-movements` - **done**
- **Phase / Task**: Verified, PASS on the first pass, with four non-blocking coverage-completeness
  gaps logged (Fix 1-4) - none required before closing. 11 tasks total (T1-T11) committed to `main`
  at `ede787d`. Verifier report at
  `.specs/features/inventory-and-stock-movements/validation.md`.
- **Completed**: every task in `tasks.md`; all 4 stories (INV-01 through INV-04, 25 ACs) and every
  listed Edge Case independently re-derived and confirmed by the Verifier, evidence-or-zero.
  Discrimination sensor: 3/3 injected mutations killed - the dropped pessimistic-write lock
  (probabilistic kill rate, 3/15 runs - see L-005), the removed adjustment-note guard (deterministic
  at all three layers), and the untyped `Money.fromDatabase` bypass (deterministic, 7 cascading
  failures). Final gate: lint clean, build clean, unit 300/300, integration 124/124 (run twice
  consecutively for durability), e2e 94/94 (run twice consecutively) - 518 total, up from the 426
  baseline, zero regressions.
- **In-progress** (file:line): none
- **Next step**: none required. No blocking gaps. The next unit of work is specifying feature 5,
  `work-order-creation`, when the user asks for it - not before, per this file's own Feature Roadmap
  policy.
- **Blockers**: none
- **Uncommitted files**: none - working tree clean on `main`
- **Branch**: main

**Notes from this feature's own implementation** (useful context for feature 5 or a re-read of this one):
1. AD-007 became running code for the first time here: the movement row and the item's new count
   are written inside the same transaction by `TypeOrmInventoryItemRepository.save`, never by a
   post-commit subscriber. A forced real unique-index violation mid-transaction proves a failed
   write leaves neither the count nor the movement row behind.
2. The project's first pessimistic row lock (`SELECT ... FOR UPDATE`, TypeORM's
   `lock: { mode: 'pessimistic_write' }`). The naive alternative - writing the aggregate's own
   precomputed `quantityOnHand` - would lose concurrent updates silently, because the
   `CHECK (quantity_on_hand >= 0)` constraint cannot see two writers each landing on a value that
   individually satisfies it. The concurrency test genuinely races two overlapping transactions
   (`Promise.all`), but the Verifier's sensor found its kill rate for a dropped lock is
   probabilistic (3/15 runs) rather than deterministic on a fast local Postgres - recorded as new
   candidate lesson `L-005`. A future feature with a similar concurrency guarantee should consider
   a deliberate synchronization point to force true overlap rather than relying on `Promise.all`
   timing alone.
3. `inventory-and-stock-movements` is the second module with a `Money`-backed column (after
   `service-catalog`'s `services.price_cents`), now on two tables (`inventory_items`,
   `stock_movements`) - the same explicit `Money.fromDatabase` pair-assertion pattern held on both.
4. `L-003` (a sibling handler/route's test does not substitute for this one's own) recurred a third
   time in this feature: the `/replenishments` mechanic-403 e2e case does not cover
   `POST`/`PATCH`/`.../adjustments`, and the DTO-level `@IsIn`/`@IsPositive` validation proven
   generically elsewhere in the codebase has no dedicated test for `kind`/`quantity` on these
   specific routes. Both logged as non-blocking (Fix 2, Fix 3 in the Verifier report), merged as
   further evidence into `L-003` rather than filed separately.
5. Feature 7 (`work-order-execution-and-closing`) inherits a schema already shaped for it: the
   `CONSUMPTION`/`RETURN` movement kinds, the `PENDING`/`SETTLED`/`WRITTEN_OFF` statuses,
   `undoes_movement_id`, and the whole `stock_movement_transitions` table exist today, written by
   nothing. Feature 8 (`tracking-and-metrics`) will need the `List Stock Shortages` read model this
   feature deliberately deferred (spec.md's Out of Scope).
