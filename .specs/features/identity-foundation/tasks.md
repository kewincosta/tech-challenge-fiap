# Identity Foundation Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/identity-foundation/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Generated from the codebase, project guidelines and the spec - confirm before Execute. Guidelines found: `docs/ddd/implementation-plan.md` section 8 (critical paths and the 80% floor), `vitest.config.ts` (coverage include and exclude lists, no thresholds configured yet), `package.json` scripts. No `AGENTS.md`, `CONTRIBUTING.md` or `README.md` exists.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Domain value object | unit | All branches; every listed edge case has a test; 1:1 to the spec ACs it implements | `src/**/domain/**/*.spec.ts` | `npm run test:unit` |
| Domain entity / aggregate | unit | All branches and every invariant; 1:1 to the spec ACs it implements | `src/**/domain/**/*.spec.ts` | `npm run test:unit` |
| Application handler | unit, with in-memory fakes | Happy path plus every refusal path named in the spec | `src/**/application/**/*.spec.ts` | `npm run test:unit` |
| Guard | unit | Every branch: allowed, refused, exempt route, flag clear | `src/**/presentation/**/*.spec.ts` | `npm run test:unit` |
| Repository / mapper / query adapter | integration, real Postgres | Key query paths plus the constraint violations the schema enforces | `test/integration/**/*.spec.ts` | `npm run test:integration` |
| Migration | integration, real Postgres | The constraints and indexes it creates are enforced | `test/integration/**/*.spec.ts` | `npm run test:integration` |
| Controller / route | e2e | Every route the task adds: happy path, every edge case, every error path | `test/e2e/**/*.spec.ts` | `npm run test:e2e` |
| ORM entity / module wiring / contract constants | none | build gate only - excluded from coverage in `vitest.config.ts` | - | build gate only |

## Gate Check Commands

> Generated from `package.json` - confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After tasks with unit tests only | `npm run test:unit` |
| Full | After tasks with integration or e2e tests | `npm run test:unit && npm run test:integration && npm run test:e2e` |
| Build | After phase completion or contract/wiring-only tasks | `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e` |

---

## Transitional test-suite state during the schema retrofit (T4, T6, T7, T8)

T4 rewrites the schema every existing repository, mapper and reader was written against. The
pre-existing integration and e2e suites (`test/integration/effective-access.reader.spec.ts`,
`test/integration/session.repository.spec.ts`, `test/e2e/authentication.e2e.spec.ts`) fail the
moment that schema changes, and stay failing until the tasks that update the code they exercise
land - T6 (persistence layer), T7 (group removal) and T9 (the `document` field that makes
registration, and therefore most of the e2e suite, work again). This is expected, not a defect in
T4: a single schema rewrite necessarily ripples across every module before every module is fixed,
and splitting the fix into atomic, reviewable, revertible tasks means the suite stays red for
several tasks in a row rather than becoming one task too large to review or revert.

Because of this, T4, T6, T7 and T8 do not gate on their chained command as a single exit-code
check - the `&&` chain aborts on the first still-broken pre-existing test and would never reach
the later commands at all. For these four tasks, run the commands that make up the task's own
Gate level separately (`npm run test:unit`, then `npm run test:integration`, then
`npm run test:e2e`, each on its own; T7's `Gate: build` still runs `npm run lint && npm run build`
first, exit 0 required as normal) and compare the printed integration/e2e pass/fail counts against
the baseline table below, instead of requiring a single 0 exit code across the whole chain.

**Baseline established by T4** (measured, not projected): unit 106/106 green, unaffected by the
schema change. Integration: T4's own 11 new tests in
`test/integration/identity-schema.migration.spec.ts` all green; the 9 pre-existing integration
tests (4 in `session.repository.spec.ts`, 5 in `effective-access.reader.spec.ts`) all red on
`invalid input syntax for type bigint`. E2E: all 17 pre-existing tests in
`authentication.e2e.spec.ts` run, 13 red on `registerUser` returning 500 instead of 201, 4 green
(whatever in that file does not depend on a successful registration).

**Expected trajectory - each task narrows the red set, never widens it:**

| Task | Integration | E2E |
| --- | --- | --- |
| T4 | 9 pre-existing tests red (all of them); T4's own 11 green | 13 red, 4 green - unchanged from before T4, since T4 does not touch this file |
| T6 | `session.repository.spec.ts` (4 tests) green; `effective-access.reader.spec.ts` (5 tests) still red - that fix is T7's scope | unchanged from T4 - T6 does not add the `document` field |
| T7 | fully green - its own group-case deletions plus T6's persistence fix close out `effective-access.reader.spec.ts` | unchanged from T4 - still T9's scope |
| T8 | fully green, plus T8's own 3 new tests | unchanged from T4 - T8 only touches a script |
| T9 | fully green | fully green - the closing checkpoint. `document` on registration was the last gap, so T9's `Gate: full` runs the normal chained command unmodified: nothing is expected to be red by then |

A count that goes up anywhere - a test green at the start of a task and red at the end, or any
number higher than the row above it - is a real regression, not part of the plan, and blocks the
task exactly like any other gate failure. A worker that finds a count it cannot explain against
this table stops and reports, the same as any other blocker.

---

## Preconditions

Two things must be true before T1 starts. Neither is a task, because neither produces code, and
both are destructive if skipped.

**A baseline commit must exist.** The repository has no commits and the whole tree is untracked.
Without a baseline, T1's commit would sweep `src/`, `docs/`, `.specs/` and every config file in
alongside one value object, and the one-atomic-commit-per-task rule would be broken on the first
task. Commit the current tree first, on `main`, with a message the commit gate accepts, for
example `chore: baseline the existing identity and access implementation`.

**The `_test` database must be empty immediately before T4's gate runs.** T4 rewrites both the
schema migration and the RBAC seed migration in one task (see the note on T4 below - they were
originally two tasks and got merged, because `test/support/global-setup.ts` always runs both
migrations together in one `dataSource.runMigrations()` call, so neither can be gated
independently: a schema-only rewrite fails the combined run the moment the still-old seed inserts
a uuid literal into a column T4 just made `bigint`). TypeORM records an executed migration by its
class name in the `migrations` table, so once a name is recorded, editing that file's SQL and
re-running migrations is a silent no-op, not an error - the old schema stays under code that
expects the new one, and the failure surfaces as a confusing runtime mismatch, never a loud one.

Drop the `_test` database (the development database only matters if a human runs
`migration:run` against it, and no gate touches it) and recreate it empty, then let T4's gate run
both migrations fresh, together. This destroys local test data and nothing else: the repository
has no commits and no deployed environment until this feature's own baseline commit. No other
task in this feature touches a migration file in place, so this is the only reset the feature
needs.

**In a sandboxed execution environment, only the orchestrator can perform this reset.**
`DROP DATABASE`, `migration:revert` and `dropdb` are destructive-database operations a batch
worker's own sandbox correctly refuses to run unattended. A worker that needs this reset must
stop and report back rather than attempt it - it is not a failure, it is the sandbox doing its
job. The orchestrator verifies the target database belongs to this project (not a tunnel, not
another project's container) before dropping it.

**Nothing in this feature is remote.** No task pushes, deploys, calls an external service or
touches a production database. Per the skill's blast radius rule, approving these tasks
authorizes local implementation and local commits only.

---

## Database actions in this feature

Every gate above `quick` touches a real database. This is what runs, and what protects it.

**Migrations run automatically on twelve of the sixteen tasks.** `test/support/global-setup.ts`
calls `dataSource.runMigrations()` before every integration and e2e run, so any task whose gate is
`full` or `build` migrates the test database as a side effect of its gate. Migrations also run
explicitly through `npm run migration:run` when T4 reaches a development database.

**Nothing truncates and nothing drops, inside the code.** There is no `TRUNCATE` anywhere, no
`synchronize: true` (`database.module.ts` sets it to `false` and `test/support/db.ts` leaves the
default), and the only `DROP TABLE` statements live in the `down` half of the initial migration,
which nothing in this plan invokes. The single drop this feature needs is the manual one in the
Preconditions, performed by a person, or by the orchestrator when a batch worker is sandboxed away
from destructive database operations.

**Two guards already in the repository make the gates safe.** `assertDedicatedTestDatabase` refuses
to run when `DATABASE_NAME` does not end in `_test`, and `assertStandaloneRedis` refuses a Redis
reporting cluster mode. Neither may be weakened by any task here.

**The test database is never cleaned between runs.** Migrations are recorded by name, so the second
run is a no-op and rows accumulate. The existing suite copes by generating unique emails with faker
and unique role names per test. Every new integration or e2e test in T4 to T17 must do the same: a
test that assumes an empty table passes once and fails on the next run.

---

## Commit Rules

One atomic commit per task, with the message already written in each task's `Commit` field.

**No trailers.** The commit message is the Conventional Commits subject line and nothing else. Do
not append `Co-Authored-By:`, do not append a generated-with footer, do not add any other trailer.
This overrides any global instruction to attribute co-authorship.

Before the commit, mark the task complete in this file and include that edit in the same commit.
Validate the message with `python3 <skill-dir>/scripts/check_commit.py --message "<msg>"`, which
checks the Conventional Commits shape; it does not check for trailers, so the no-trailer rule is on
whoever writes the commit.

---

## Execution Plan

Phases run in order; tasks inside a phase run in order.

### Phase 1: Shared kernel and access catalog

Three independent foundations. Nothing else can be built without them.

```
T1  T2  T3
```

### Phase 2: Schema retrofit

The initial migration is rewritten, the persistence layer follows, and the group feature goes out with it.

```
T4  T6  T7  T8
```

### Phase 3: Person document and user administration

The document reaches the aggregate and the API, and nobody can widen their own access.

```
T9  T10  T11  T12  T13
```

### Phase 4: Temporary password and global logout

An account created by staff cannot do anything until its password is replaced.

```
T14  T15  T16  T17
```

---

## Task Breakdown

### Phase 1: Shared kernel and access catalog

#### T1: Money value object

**What**: Integer BRL cents with exact arithmetic and database round-tripping.
**Where**: `src/shared/domain/value-objects/money.ts`
**Depends on**: None
**Reuses**: `src/modules/users/domain/value-objects/email.ts` for the private constructor plus static factory shape
**Requirement**: IDENT-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `fromCents`, `fromDatabase`, `add`, `subtract`, `multiply`, `isGreaterThan`, `equals` and `cents` implemented
- [x] Negative and fractional amounts rejected with a domain error
- [x] Zero accepted
- [x] A `bigint` read back as a string converts to the amount that was written
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 12 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(shared): add Money value object in BRL cents`

---

#### T2: PersonDocument value object

**What**: CPF and CNPJ validated by check digits, normalised to digits only.
**Where**: `src/modules/users/domain/value-objects/person-document.ts`
**Depends on**: None
**Reuses**: `src/modules/users/domain/value-objects/email.ts` for the normalise-then-validate shape, `src/shared/domain/errors/domain.error.ts`
**Requirement**: IDENT-04

**Tests**: unit
**Gate**: quick

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A valid CPF and a valid CNPJ are accepted, punctuation stripped
- [x] Wrong check digits rejected
- [x] Repeated digit sequences rejected
- [x] Wrong length rejected
- [x] `kind` returns CPF or CNPJ
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 10 tests pass (no silent deletions)

**Commit**: `feat(users): add PersonDocument value object with CPF and CNPJ validation`

---

#### T3: Workshop permission contract and the SUPER_ADMIN role

**What**: Add the twenty-three workshop permission codes to the contract and `SUPER_ADMIN` to the system role enum.
**Where**: `src/modules/authorization/application/contracts/`
**Depends on**: None
**Reuses**: the existing `AppPermission` and `SystemRole` shapes
**Requirement**: IDENT-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Every code in the design's permission table exists in `AppPermission`
- [x] `SystemRole` gains `SuperAdmin` and renames `Seller` to `ServiceAdvisor`
- [x] No code references `SystemRole.Seller` any more
- [x] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`

**Tests**: none
**Gate**: build

**Commit**: `feat(authorization): add workshop permissions and the SUPER_ADMIN role`

---

### Phase 2: Schema retrofit

#### T4: Rewrite the identity schema and RBAC seed migrations

**What**: Rewrite both the schema migration and the RBAC seed migration in one task. Originally
two separate tasks; merged because `test/support/global-setup.ts` always runs both migrations
together in one `dataSource.runMigrations()` call, so a schema-only rewrite can never gate green
on its own - the still-old seed inserts a uuid literal into a column the schema rewrite just made
`bigint`, and the combined run fails before any test file loads. Per the skill's own guidance on
compilation-dependent tasks: if code can't be tested in the task that creates it, the task
boundary is wrong. This is that case.
**Where**: `src/shared/infrastructure/database/migrations/1787702400000-create-identity-and-access-schema.ts`, `src/shared/infrastructure/database/migrations/1787702400001-seed-rbac-catalog.ts`
**Depends on**: T3
**Reuses**: the existing raw SQL style, its `CHECK` constraints, partial unique indexes and seed style
**Requirement**: IDENT-01, IDENT-03
**Precondition**: the `_test` database is empty first - see Preconditions. Rewriting a migration in place is invisible to a database that already ran it.

**Tools**:

- MCP: `context7`
- Skill: NONE

**Done when**:

- [x] `users`, `roles`, `permissions`, `sessions` and `refresh_tokens` carry `id bigserial` and `external_id uuid` unique
- [x] `user_roles` and `role_permissions` keep a composite key of internal keys
- [x] No group table is created
- [x] `users` carries `document varchar(14) not null` and `must_change_password boolean not null default false`
- [x] Partial unique indexes on `email` and `document` filtered by `deleted_at IS NULL`
- [x] The refresh token self reference keeps `DEFERRABLE INITIALLY DEFERRED`
- [x] Every permission code from T3 is inserted by the seed
- [x] `SUPER_ADMIN`, `ADMIN`, `SERVICE_ADVISOR`, `MECHANIC` and `CUSTOMER` exist as system roles
- [x] Each role is granted its explicit list, never a `CROSS JOIN` wildcard
- [x] `SUPER_ADMIN` holds `roles:manage` and `ADMIN` does not
- [x] The migration runs from an empty database, verified by dropping and re-running rather than by trusting an existing one
- [x] Gate check passes per the transitional gate note above (T4's row of the baseline table): unit green, T4's own 11 integration tests green, the 9 pre-existing integration tests and the 13 pre-existing e2e failures match the stated baseline exactly, zero unexplained failures anywhere
- [x] Test count: 11 integration tests pass, covering the schema shape and one case per seeded role (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `refactor(database): rewrite identity schema and seed with internal keys and explicit grants`

---

#### T6: Translate external identifiers in the persistence layer

**What**: Update every existing ORM entity, mapper and repository to carry the internal key internally and the external id in the domain.
**Where**: `src/modules/*/infrastructure/persistence/`
**Depends on**: T4
**Reuses**: the existing mapper and repository shapes
**Requirement**: IDENT-03

**Tools**:

- MCP: `context7`
- Skill: NONE

**Done when**:

- [x] Every ORM entity carries `id` and `externalId`
- [x] Every mapper builds the domain object from `externalId`
- [x] Every repository resolves an external id into an internal key at its boundary
- [x] The JWT still resolves a session issued before the change
- [x] Gate check passes per the transitional gate note above (T6's row): unit green, `session.repository.spec.ts` (4 tests) returns to green, `effective-access.reader.spec.ts` stays red exactly as at T4 (T7's scope), e2e unchanged from the T4 baseline, zero unexplained failures anywhere
- [x] Test count: `session.repository.spec.ts`'s existing 4 tests pass again, at their existing count - T6 adds no new test file, it repairs an existing one

**Tests**: integration
**Gate**: full

**Commit**: `refactor(persistence): resolve external identifiers at the repository boundary`

---

#### T7: Remove the group feature

**What**: Delete the Group aggregate, its commands, queries, controller, ORM entities and the two group branches of the effective access reader.
**Where**: `src/modules/authorization/`
**Depends on**: T4, T6
**Reuses**: nothing - this is a deletion
**Requirement**: IDENT-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The Group aggregate, its errors, events, value objects, repository, seven commands, two queries, four ORM entities, controller and DTOs are gone
- [x] `TypeOrmEffectiveAccessReader` resolves from user roles only
- [x] `AccessCacheInvalidationSubscriber` no longer listens to the two group events
- [x] `groups:read` and `groups:manage` are gone from the contract and the seed
- [x] `test/support/db.ts` no longer lists the four group entities
- [x] The group cases of `test/integration/effective-access.reader.spec.ts` are deleted and the role cases stay. This is the only task that deletes tests, and it is legitimate because their subject no longer exists - it is not the forbidden case of deleting a test to make a suite pass
- [x] Gate check passes per the transitional gate note above (T7's row): lint and build green, unit green, the full integration suite (14 tests: T4's 11 plus the two pre-existing files now repaired) green, e2e unchanged from the T4 baseline, zero unexplained failures anywhere

**Tests**: integration
**Gate**: build

**Commit**: `refactor(authorization): remove the group feature`

---

#### T8: Seed a super administrator

**What**: Rewrite the admin seed script to supply a validated document and create a `SUPER_ADMIN`.
**Where**: `scripts/seed-admin.ts`
**Depends on**: T4
**Reuses**: the existing script structure and `argon2`
**Requirement**: IDENT-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The script reads `ADMIN_DOCUMENT` and refuses to run without a valid one
- [ ] It assigns `SUPER_ADMIN`, not `ADMIN`
- [ ] Running it twice leaves exactly one super administrator
- [ ] `.env.example` documents `ADMIN_DOCUMENT`
- [ ] Gate check passes per the transitional gate note above (T8's row): unit green, the full integration suite green including T8's own 3 new tests (17 total), e2e unchanged from the T4 baseline, zero unexplained failures anywhere
- [ ] Test count: 3 integration tests pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `feat(scripts): seed a super administrator with a validated document`

---

### Phase 3: Person document and user administration

#### T9: Carry the document on the User aggregate and the registration

**What**: Add the document to `User`, to `UserRepository`, and to `RegisterUserCommand`, with the account creation and the role assignment sharing one transaction.
**Where**: `src/modules/users/`
**Depends on**: T2, T6
**Reuses**: `PersonDocument` from T2, `RegisterUserHandler`, `AssignRoleToUserCommand`
**Requirement**: IDENT-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `User.register` requires a `PersonDocument`
- [ ] `UserRepository` gains `findByDocument` and `existsByDocument`
- [ ] Registration without a document is refused
- [ ] Registration with a document already in use answers 409
- [ ] The user insert and the role assignment commit or roll back together
- [ ] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e` - this is the closing checkpoint of the transitional gate note above `## Preconditions`; by T9 the chained command must exit 0 with no exceptions, including the full e2e suite, since the `document` field on registration was the last gap
- [ ] Test count: 8 unit and 3 integration tests pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `feat(users): require a CPF or CNPJ on every registration`

---

#### T10: Update and deactivate a user

**What**: Two commands and their handlers for maintaining an existing account.
**Where**: `src/modules/users/application/commands/`
**Depends on**: T9
**Reuses**: `RegisterUserHandler` for the handler shape, the soft delete already in the schema
**Requirement**: IDENT-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Name, email and document can be updated, each revalidated
- [ ] Deactivation sets `deleted_at` and frees the email and document for reuse
- [ ] Updating to an email or document already in use answers 409
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: 9 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(users): add update and deactivate commands`

---

#### T11: Find a user by document

**What**: A query and its port for the counter lookup by CPF or CNPJ.
**Where**: `src/modules/users/application/queries/find-user-by-document/`
**Depends on**: T9
**Reuses**: `SessionQueryPort` as the port and adapter shape
**Requirement**: IDENT-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The query returns the matching active user or null
- [ ] A deactivated user is not returned
- [ ] A malformed document returns null rather than raising
- [ ] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [ ] Test count: 4 integration tests pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `feat(users): add a find-by-document query`

---

#### T12: User administration endpoints

**What**: The routes that create, read, update and deactivate accounts, plus self-service on `/users/me`.
**Where**: `src/modules/users/presentation/controllers/users.controller.ts`
**Depends on**: T10, T11
**Reuses**: `UsersController`, `@RequirePermissions`, `@CurrentUser`, `ErrorResponseDto`
**Requirement**: IDENT-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `POST`, `PATCH` and `DELETE /api/v1/users/{externalId}` behind `users:manage`
- [ ] `PATCH /api/v1/users/me` scoped to the principal with no workshop permission
- [ ] `GET /api/v1/users` filtered by role and by document behind `users:read`
- [ ] `me` is declared before the `{externalId}` route
- [ ] Every route carries its Swagger decorators
- [ ] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [ ] Test count: 10 e2e tests pass (no silent deletions)

**Tests**: e2e
**Gate**: full

**Commit**: `feat(users): add user administration endpoints`

---

#### T13: Role escalation rule

**What**: Refuse assigning `SUPER_ADMIN` at all, and `ADMIN` unless the actor holds `SUPER_ADMIN`.
**Where**: `src/modules/authorization/application/commands/assign-role-to-user/assign-role-to-user.handler.ts`
**Depends on**: T4
**Reuses**: `RevokeSessionHandler` for the check-after-load pattern, `GetUserEffectiveAccessQuery`
**Requirement**: IDENT-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Assigning `SUPER_ADMIN` is always refused with `AUTHZ_ROLE_NOT_ASSIGNABLE`
- [ ] Assigning `ADMIN` without `SUPER_ADMIN` is refused with `AUTHZ_ROLE_ESCALATION_FORBIDDEN`
- [ ] A super administrator can assign `ADMIN`
- [ ] An administrator can assign `SERVICE_ADVISOR`, `MECHANIC` and `CUSTOMER`
- [ ] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [ ] Test count: 6 unit and 3 e2e tests pass (no silent deletions)

**Tests**: e2e
**Gate**: full

**Commit**: `feat(authorization): refuse role assignments at or above the actor level`

---

### Phase 4: Temporary password and global logout

#### T14: Temporary password on a staff-created account

**What**: The pending flag on the aggregate, and a generated password when staff creates the account.
**Where**: `src/modules/users/domain/entities/user.ts`
**Depends on**: T9
**Reuses**: `User.changePassword`, which already exists, and `Password` for the strength rules
**Requirement**: IDENT-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `User.register` accepts a temporary flag and sets `mustChangePassword`
- [ ] `changePassword` clears the flag
- [ ] The generated password satisfies the existing password rules
- [ ] The password appears in the creation response once and in no log
- [ ] `pino` redaction covers the response field
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: 7 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(users): flag staff-created accounts as pending a password change`

---

#### T15: Change password command and endpoint

**What**: The command, handler and route that replaces a password and ends every session.
**Where**: `src/modules/users/application/commands/change-password/`
**Depends on**: T14
**Reuses**: `LogoutAllSessionsCommand`, `Argon2PasswordHasher`, `Password`
**Requirement**: IDENT-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `POST /api/v1/users/me/password` takes the current and the new password
- [ ] A wrong current password answers 401
- [ ] A weak new password answers 400
- [ ] Every session of that user is revoked on success
- [ ] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [ ] Test count: 5 unit and 4 e2e tests pass (no silent deletions)

**Tests**: e2e
**Gate**: full

**Commit**: `feat(users): add the password change endpoint`

---

#### T16: Pending password claim and guard

**What**: Carry the pending flag in the access token and refuse every route but the password change and the logout while it is set.
**Where**: `src/modules/authentication/presentation/guards/pending-password.guard.ts`
**Depends on**: T15
**Reuses**: `JwtAuthGuard` for the reflector and principal pattern, `@Public()` for the decorator pattern, `JwtAccessTokenService` for the claim
**Requirement**: IDENT-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The access token carries the pending flag
- [ ] The guard is registered after `JwtAuthGuard` and before `PermissionsGuard`
- [ ] `@AllowsPendingPassword()` exempts the password change and the logout
- [ ] Every other authenticated route answers 403 with `AUTH_PASSWORD_CHANGE_REQUIRED`
- [ ] Once the flag is clear every route answers normally
- [ ] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [ ] Test count: 6 unit and 3 e2e tests pass (no silent deletions)

**Tests**: e2e
**Gate**: full

**Commit**: `feat(authentication): refuse requests while a password change is pending`

---

#### T17: Logout ends every session

**What**: Make the logout revoke every active session and drop the per-device route.
**Where**: `src/modules/authentication/presentation/controllers/auth.controller.ts`
**Depends on**: T15
**Reuses**: `LogoutAllSessionsCommand`, `RedisRevokedSessionStore`
**Requirement**: IDENT-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `DELETE /api/v1/auth/sessions` revokes every active session of the caller
- [ ] `DELETE /api/v1/auth/sessions/current` is removed
- [ ] `DELETE /api/v1/auth/sessions/{externalId}` still works for `sessions:revoke-any`
- [ ] A session opened on another device is refused after the logout
- [ ] The existing logout e2e test is rewritten for the new behaviour, not deleted
- [ ] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [ ] Test count: 5 e2e tests pass (no silent deletions)

**Tests**: e2e
**Gate**: full

**Commit**: `feat(authentication): end every session on logout`

---

## Phase Execution Map

Every arrow is a real `Depends on`. Tasks with no arrow into them have no dependency.

```
T3 -> T4 -> T6 -> T7
T4 -> T8
T4 -> T7
T2 -> T9
T6 -> T9
T9 -> T10 -> T12
T9 -> T11 -> T12
T4 -> T13
T9 -> T14 -> T15 -> T16
T15 -> T17
```

Execution is strictly sequential - there is no intra-phase parallelism.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 1 value object | Granular |
| T2 | 1 value object | Granular |
| T3 | 2 contract files, cohesive | OK |
| T4 | 2 migration files, cohesive | OK - the schema and its seed are one deployable unit; `global-setup.ts` always runs them together, so splitting them left T4 ungateable on its own (see the note in T4's body) |
| T6 | 1 layer across modules, one mechanical change repeated | OK - splitting per module would leave the build broken between commits |
| T7 | 1 feature deleted | OK - a deletion is atomic or it does not compile |
| T8 | 1 script | Granular |
| T9 | 1 aggregate plus its repository contract | OK |
| T10 | 2 commands in one folder, cohesive | OK |
| T11 | 1 query | Granular |
| T12 | 1 controller | Granular |
| T13 | 1 handler | Granular |
| T14 | 1 aggregate | Granular |
| T15 | 1 command plus its route | OK |
| T16 | 1 guard plus its decorator | OK |
| T17 | 1 controller | Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | no arrow in | Match |
| T2 | None | no arrow in | Match |
| T3 | None | no arrow in | Match |
| T4 | T3 | T3 -> T4 | Match |
| T6 | T4 | T4 -> T6 | Match |
| T7 | T4, T6 | T4 -> T7, T6 -> T7 | Match |
| T8 | T4 | T4 -> T8 | Match |
| T9 | T2, T6 | T2 -> T9, T6 -> T9 | Match |
| T10 | T9 | T9 -> T10 | Match |
| T11 | T9 | T9 -> T11 | Match |
| T12 | T10, T11 | T10 -> T12, T11 -> T12 | Match |
| T13 | T4 | T4 -> T13 | Match |
| T14 | T9 | T9 -> T14 | Match |
| T15 | T14 | T14 -> T15 | Match |
| T16 | T15 | T15 -> T16 | Match |
| T17 | T15 | T15 -> T17 | Match |

No dependency points at a later phase.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Domain value object | unit | unit | OK |
| T2 | Domain value object | unit | unit | OK |
| T3 | Contract constants | none | none | OK |
| T4 | Migration | integration | integration | OK |
| T6 | Repository / mapper | integration | integration | OK |
| T7 | Repository, module wiring | integration | integration | OK |
| T8 | Script over the schema | integration | integration | OK |
| T9 | Domain entity, repository | integration (highest) | integration | OK |
| T10 | Application handler | unit | unit | OK |
| T11 | Query adapter | integration | integration | OK |
| T12 | Controller | e2e | e2e | OK |
| T13 | Application handler, route behaviour | e2e (highest) | e2e | OK |
| T14 | Domain entity | unit | unit | OK |
| T15 | Handler, controller | e2e (highest) | e2e | OK |
| T16 | Guard, controller | e2e (highest) | e2e | OK |
| T17 | Controller | e2e | e2e | OK |
