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
| 2 | `customer-and-vehicle-registry` | 4, 5 | Large | Implemented, pending Verifier |
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

- **Feature**: `.specs/features/customer-and-vehicle-registry`
- **Phase / Task**: All 20 tasks (T1-T20, two modules - `customers` and `vehicles`) complete and
  committed to `main` at `e2857f2`. Diff range for the Verifier: `c878d74..HEAD` (28 commits,
  spec through the last task). Not yet Verified - dispatching the mandatory Verifier next.
- **Completed**: every task in `tasks.md`, every checkbox marked. Gate at close: lint clean,
  build clean, unit 216/216, integration 71/71 (run twice consecutively for durability), e2e
  67/67 - 354 total, up from the 229 `identity-foundation` baseline, zero regressions.
- **In-progress** (file:line): none
- **Next step**: dispatch the Verifier sub-agent (author != verifier), then read `validation.md`
  and act on any gaps (bounded to 3 fix/re-verify iterations before escalating).
- **Blockers**: none
- **Uncommitted files**: none - working tree clean on `main`
- **Branch**: main

**Notes from this feature's own implementation** (useful context if resuming cold or verifying):
1. Two design.md corrections made mid-implementation, both fixed as their own small commits:
   `Vehicle.customerId`/`Customer.userId` are plain `string` external ids, not an imported VO
   instance (the original design claimed a precedent - `AssignRoleToUserCommand` crossing a
   `UserId` instance - that turned out not to be true on inspection: every cross-module reference
   in this codebase already carries a plain string). Cross-module "not found" errors are
   module-local classes (`TargetUserNotFoundError` in `customers`, `ReferencedCustomerNotFoundError`
   in `vehicles`), never an imported `DomainError` from the other module - mirrors the
   `AssignedUserNotFoundError` pattern already established in `authorization`.
2. Real bug found by T20's own e2e gate, not a pre-existing gap: `TypeOrmCustomerQueryAdapter
   .getById` (T6) filtered `deleted_at IS NULL`, so `RegisterVehicleHandler`'s deactivated-customer
   check was unreachable - a deactivated customer's id resolved to `null` before the status check
   ran, answering 404 instead of the correct 422. Fixed by dropping that filter from `getById`
   only (the staff/cross-module lookup) while keeping it on `getByUserId`/`listActive` (the
   self-service and search paths, where hiding a deactivated customer is the intended behaviour).
3. Hardcoded literal test fixtures (license plates) passed in isolation but collided with leftover
   rows from a prior run once the project's own "test database is never truncated" convention
   applied across two consecutive `test:integration` runs - fixed with a `uniqueLicensePlate()`
   factory, matching `uniqueValidCpf()`'s existing shape. A reminder to default to unique
   generated test data always, never a fixed literal, even for a "just this once" fixture.
4. No RBAC seed migration change was needed: `customers:read/manage` and `vehicles:read/manage`
   already existed and were already granted to the right roles from `identity-foundation`'s own
   seed - confirmed before starting, not assumed.
