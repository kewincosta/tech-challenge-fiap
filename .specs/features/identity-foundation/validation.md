# Identity Foundation Validation

## Validation Verdict: FAIL

**Date**: 2026-08-31
**Spec**: `.specs/features/identity-foundation/spec.md`
**Diff range**: `9e22ffc..bf20dbb` (24 commits, `main`)
**Verifier**: independent sub-agent (author != verifier)

---

## Task Completion

All 16 tasks in `tasks.md` (T1-T4, T6-T17; the original T5 merged into T4) show every Done-when
box checked. Spot-checked against the diff and the running codebase rather than trusted at face
value - each task's stated file locations, test counts and commit messages match `git log` and the
current tree.

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T1   | Done    | `src/shared/domain/value-objects/money.ts` |
| T2   | Done    | `src/modules/users/domain/value-objects/person-document.ts` |
| T3   | Done    | 27 permission codes, `SystemRole.SuperAdmin` added |
| T4   | Done    | Schema + RBAC seed rewritten, no `CROSS JOIN` |
| T6   | Done    | External id resolved at repository/mapper boundary |
| T7   | Done    | Group feature fully removed, zero group files remain in `src/` |
| T8   | Done    | `scripts/seed-admin.ts` seeds `SUPER_ADMIN` with a validated document |
| T9   | Done    | Document on `User`; register+assign wrapped in one transaction |
| T10  | Done    | Update/deactivate commands, soft delete |
| T11  | Done    | Find-by-document query |
| T12  | Done    | User administration endpoints |
| T13  | Done    | Role escalation rule |
| T14  | Done, but leaves AC1 of IDENT-07 unimplemented - see Spec-Anchored section | Domain-only per T14's own scope note |
| T15  | Done    | Change-password command + endpoint |
| T16  | Done    | Pending-password claim + guard, correct guard order |
| T17  | Done    | Logout revokes every session |

---

## Spec-Anchored Acceptance Criteria

Evidence-or-zero: every row cites a `file:line` and the exact assertion, or is marked GAP. 43 ACs
across 9 stories. 42 match the spec-defined outcome; 1 (IDENT-07 AC1) has no production-code
evidence at all.

### IDENT-01: Workshop capabilities exist as permissions

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: permission catalog exposes the workshop codes plus survivors of group removal | 27 codes total | `src/modules/authorization/application/contracts/app-permissions.ts:1-29` - 27 entries in `AppPermission` | PASS (27 confirmed; see note below) |
| AC2: RBAC seed grants each role its exact design set | explicit grant list per role, no wildcard | `src/shared/infrastructure/database/migrations/1787702400001-seed-rbac-catalog.ts:41-117` (`ROLE_GRANTS`, no `CROSS JOIN`) + `test/integration/identity-schema.migration.spec.ts:261,268,275,281,287` - `expect(granted).toEqual(SUPER_ADMIN_PERMISSIONS)` etc. | PASS |
| AC3: `SUPER_ADMIN` holds `roles:manage`, `ADMIN` does not | exact membership | `test/integration/identity-schema.migration.spec.ts:258-269` - `expect(granted).toContain('roles:manage')` / `expect(granted).not.toContain('roles:manage')` | PASS |
| AC4: malformed code rejected at creation | throws | `src/modules/authorization/domain/value-objects/permission-code.spec.ts:15` - `expect(() => PermissionCode.create('users')).toThrow(InvalidPermissionCodeError)` | PASS |

Note on AC1: spec.md's own parenthetical ("twenty new workshop codes... alongside the seven
pre-existing identity codes") miscounts the split - the delivered catalog is 19 workshop-labelled
codes plus 8 identity-labelled codes, not 20+7. The operative `SHALL` clause ("twenty-seven codes
in total") is met exactly and matches `design.md`'s Phase 0 table row for row. This is a spec-text
defect, not an implementation defect - see Fix Plans.

### IDENT-02: Money has one implementation

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: integer BRL cents | `.cents` returns the integer | `src/shared/domain/value-objects/money.spec.ts:6-9` - `expect(money.cents).toBe(15099)` | PASS |
| AC2: negative rejected | throws `InvalidMoneyAmountError` | `money.spec.ts:12-14` | PASS |
| AC3: fractional rejected | throws | `money.spec.ts:16-18` | PASS |
| AC4: add/multiply exact, no fp drift | exact integer sum/product | `money.spec.ts:32-36` (add), `money.spec.ts:50-54` (multiply) | PASS |
| AC5: bigint string round-trips to the same amount | `fromDatabase(raw)` matches written value | `money.spec.ts:26-30` - `expect(Money.fromDatabase('123456').cents).toBe(123456)` | PASS (unit-level only - see coverage note) |

Coverage note on AC5: `Money` is not wired into any persisted column in this feature's own schema
(it is shared kernel for features 3-8 per `design.md`'s dotted dependency line), so there is no
integration test that writes an amount to a real Postgres `bigint` column and reads it back, even
though spec.md's own Independent Test for this story explicitly asks for one ("plus an integration
test that writes an amount, reads it back and compares"). `grep -rn "Money" test/integration/
test/e2e/` returns zero hits. Low risk (`fromDatabase` is `Number(raw)`, correct within
`Number.MAX_SAFE_INTEGER`), but the spec's own test plan for this AC is unmet. See Fix Plans.

### IDENT-03: No route exposes an enumerable identifier

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: every addressable table has `bigserial id` + unique `external_id uuid` | schema shape | `test/integration/identity-schema.migration.spec.ts:136-166` - asserts `data_type = 'bigint'`, `column_default` contains `nextval(`, `external_id` `udt_name = 'uuid'`, unique constraint present | PASS |
| AC2: join tables keep a composite internal-key PK | `user_roles`/`role_permissions` PK is the two bigint FKs | `identity-schema.migration.spec.ts:170-194` | PASS |
| AC3: requests accept only the external identifier | non-UUID path param rejected | `src/modules/users/presentation/controllers/users.controller.ts:153,166,183` - `ParseUUIDPipe` on every `:externalId` param | PASS (proven by construction; no dedicated negative-path test asserting a non-UUID id returns 400) |
| AC4: repository resolves external id to internal key at its boundary | domain never sees `id` | `src/modules/users/infrastructure/persistence/user.mapper.ts:10-23` (builds domain from `row.externalId`), `typeorm-user.repository.ts:24-27,51-60` (looks up internal `id` only to attach it to the ORM row before `save`) | PASS |
| AC5: a token issued before the change keeps resolving (token carries the external id) | JWT `sub` = external id | `src/modules/authentication/infrastructure/security/jwt-access-token.service.ts:32` - `{ subject: payload.userId }` where `payload.userId` is the external UUID; `session.mapper.ts:23-27` restores `Session.id` from `sessionRow.externalId` | PASS |

### IDENT-04: Everybody is identified by CPF or CNPJ

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: document required to register | `RegisterUserHandler` requires it | `src/modules/users/application/commands/register-user/register-user.handler.ts:41` - `PersonDocument.create(command.document)` (throws if missing/invalid) | PASS |
| AC2: bad check digits -> HTTP 400 | `InvalidPersonDocumentError`, `ErrorKind.Validation` -> 400 | `src/modules/users/domain/value-objects/person-document.spec.ts:30-36`; `register-user.handler.spec.ts:78-88` (handler throws `InvalidPersonDocumentError`); `invalid-person-document.error.ts:5-6` (`ErrorKind.Validation`) -> `global-exception.filter.ts:8` (`Validation` -> `BAD_REQUEST`) | PASS (chain proven at unit level; no e2e test posts an invalid document to `POST /api/v1/users` and asserts 400, unlike the sibling weak-password case at `test/e2e/authentication.e2e.spec.ts:55-66`) |
| AC3: repeated-digit sequence rejected | throws | `person-document.spec.ts:38-44` | PASS |
| AC4: punctuation stripped, stored digits-only | `.value` is digits only | `person-document.spec.ts:6-16` | PASS |
| AC5: duplicate active document -> HTTP 409 | `DocumentAlreadyInUseError`, `ErrorKind.Conflict` -> 409 | `register-user.handler.spec.ts:90-101`; `test/integration/user.repository.spec.ts:54-61` (real Postgres unique-constraint violation mapped to the same error); `document-already-in-use.error.ts:5-6` (`Conflict`) | PASS (proven at unit/integration level; no e2e test posts a duplicate document to `POST /api/v1/users`, unlike the sibling duplicate-email case at `authentication.e2e.spec.ts:39-52`) |
| AC6: search by document returns match or empty | active match or `null` | `test/integration/find-user-by-document.spec.ts:39-43` (match), `:46-49` (no match -> null), `:52-61` (deactivated -> null), `:64-67` (malformed -> null, does not throw) | PASS |

### IDENT-05: The workshop creates its own staff accounts

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: admin creates the user and assigns the roles supplied | account created + role granted | Composed of `POST /api/v1/users` (public register) + `PUT /api/v1/users/:userId/roles/:roleId` behind `user-access:manage` - `src/modules/authorization/presentation/controllers/user-access.controller.ts:55-69`; non-escalation-role path unit-tested at `assign-role-to-user.handler.spec.ts:171-184` | PASS (capability exists and is exercised at unit level; no e2e test drives the real `PUT .../roles/:roleId` endpoint for a non-escalation role, so spec's own Independent Test - "create a mechanic as an administrator, log in as that mechanic" - is not proven end-to-end through the real API; the closest e2e coverage, `test/e2e/users.e2e.spec.ts:121-131`, seeds the role through a SQL test helper, not the endpoint) |
| AC2: update/deactivate applies the change, record recoverable via soft delete | `deleted_at` set, row survives | `test/e2e/users.e2e.spec.ts:77-89` (deactivate -> subsequent `GET` returns 404, record not physically deleted); `deactivate-user.handler.ts:23` (`user.deactivate`, sets `deletedAt`) | PASS |
| AC3: no `users:manage` -> 403 | refused | `test/e2e/users.e2e.spec.ts:91-101` | PASS |
| AC4: self-update needs no workshop permission | `/me` route unguarded by `@RequirePermissions` | `test/e2e/users.e2e.spec.ts:103-114` | PASS |
| AC5: editing another user without `users:manage` -> 403 | refused | `test/e2e/users.e2e.spec.ts:51-59` | PASS |

### IDENT-06: Nobody widens their own access

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: assigning `SUPER_ADMIN` always refused | `RoleNotAssignableError` -> 403 | `assign-role-to-user.handler.ts:43-45`; unit `assign-role-to-user.handler.spec.ts:123-134`; e2e `test/e2e/role-escalation.e2e.spec.ts:31-44` - `.expect(403)` + `code: 'AUTHZ_ROLE_NOT_ASSIGNABLE'` | PASS - killed by discrimination sensor mutation 1 (see below) |
| AC2: assigning `ADMIN` without `SUPER_ADMIN` refused | `RoleEscalationForbiddenError` -> 403 | `handler.ts:46-60`; unit `handler.spec.ts:136-156`; e2e `role-escalation.e2e.spec.ts:46-59` - `code: 'AUTHZ_ROLE_ESCALATION_FORBIDDEN'` | PASS |
| AC3: a `SUPER_ADMIN` actor can assign `ADMIN` | succeeds | unit `handler.spec.ts:158-169`; e2e `role-escalation.e2e.spec.ts:61-83` (`.expect(204)`, role row confirmed in DB) | PASS |
| AC4: `ADMIN` can assign `SERVICE_ADVISOR`/`MECHANIC`/`CUSTOMER` | succeeds, no `SUPER_ADMIN` needed | unit `handler.spec.ts:171-184` | PASS (unit-level only; same real-endpoint e2e gap as IDENT-05 AC1) |
| AC5: first `SUPER_ADMIN` only via the seed script | no other creation path | `test/integration/seed-admin.script.spec.ts:54-85` (script creates `SUPER_ADMIN`), `:108-137` (run twice -> exactly one); confirmed by exhaustive grep that `AssignRoleToUserHandler` refuses `SUPER_ADMIN` unconditionally (AC1) and no other command assigns roles | PASS |

### IDENT-07: A staff-created account starts with a temporary password

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: staff-created account gets a generated temp password, pending flag set, password returned once | a working create-with-temp-password flow | **No production code path exists.** `src/modules/users/domain/entities/user.ts:32,55` accepts an optional `temporary` flag and `src/modules/users/domain/value-objects/password.ts`'s `generate()` exist and are unit-tested (`password.spec.ts:25-37`), but `grep -rn "User.register(" src --include=*.ts` shows exactly one call site, `register-user.handler.ts:49`, which never passes `temporary`; `grep -rn "Password.generate" src` outside spec files returns zero hits. No command, DTO or controller wires either together. | **GAP - not implemented** |
| AC2: pending flag refuses every route but change-password/logout, 403 | exact refusal + exemption | `pending-password.guard.spec.ts:48-53` (refuses), `:55-66` (exact `AUTH_PASSWORD_CHANGE_REQUIRED` code), `:41-46` (exempted route allowed); e2e `test/e2e/pending-password.e2e.spec.ts:20-31` | PASS - killed by discrimination sensor mutation 2 (see below) |
| AC3: changing the password clears the flag | `mustChangePassword` -> false | `src/modules/users/domain/entities/user.ts:70` (`changePassword` sets it false); e2e `pending-password.e2e.spec.ts:33-50` | PASS |
| AC4: wrong current password -> 401 | `InvalidCredentialsError` -> 401 | `test/e2e/change-password.e2e.spec.ts:54-64` - `code: 'AUTH_INVALID_CREDENTIALS'` | PASS |
| AC5: weak new password -> 400 | `WeakPasswordError` -> 400 | `change-password.e2e.spec.ts:66-76` - `code: 'USER_WEAK_PASSWORD'` | PASS |
| AC6: temp password never logged | no logger call touches it | Verified independently by inspection: `grep -n "logger\|Logger\|console\." src/modules/users/domain/entities/user.ts src/modules/users/domain/value-objects/password.ts src/modules/users/application/commands/register-user/register-user.handler.ts` returns nothing | PASS (moot until AC1 is implemented - there is no response path yet to leak the value through) |

### IDENT-08: Signing out signs out everywhere

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: logout revokes every active session | all sessions revoked | `src/modules/authentication/presentation/controllers/auth.controller.ts:93-101` (`LogoutAllSessionsCommand`); e2e `test/e2e/authentication.e2e.spec.ts:246-266` - `expect(response.body).toEqual({ revokedSessions: 2 })`, both sessions then 401 | PASS |
| AC2: password change revokes every active session | all sessions revoked | `test/e2e/change-password.e2e.spec.ts:37-52` - second, untouched session refused 401 after the first session changes the password | PASS |
| AC3: a revoked session's access token -> 401 | refused | `authentication.e2e.spec.ts:215-231`, `:190-212` (reused-refresh-token path also revokes and refuses) | PASS |
| AC4: `sessions:revoke-any` allows revoking one named session of another user | succeeds for the holder, refused otherwise | `authentication.e2e.spec.ts:285-299` (`.expect(204)`, then 401); `:302-311` (without the permission, refused) | PASS |

### IDENT-09: One grouping concept in the access model

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: effective access resolves from roles/permissions only | no group branch | `src/modules/authorization/infrastructure/persistence/typeorm-effective-access.reader.ts:6-23` - exactly two `UNION` branches (`role`, `permission`); `test/integration/effective-access.reader.spec.ts` (3 tests, role-only) | PASS |
| AC2: no group endpoint | no group controller anywhere | `find src -iname "*group*"` returns zero files | PASS |
| AC3: schema creates no group table | migration creates none | `test/integration/identity-schema.migration.spec.ts:198-205` - `expect(groupTables).toHaveLength(0)` | PASS |

**Status**: ❌ 1 gap present (IDENT-07 AC1) - all other 42 ACs match the spec-defined outcome.

---

## Discrimination Sensor

Isolated scratch: `git worktree add` at `HEAD` (`bf20dbb`), never `git stash`. Pre-sensor real-tree
`git status --porcelain` was empty; confirmed empty again after each mutation was reverted and
after `git worktree remove --force`.

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ------------ | ------- |
| 1 | `src/modules/authorization/application/commands/assign-role-to-user/assign-role-to-user.handler.ts:43-45` | Removed the `roleName === SystemRole.SuperAdmin -> throw RoleNotAssignableError` block entirely | Killed - `assign-role-to-user.handler.spec.ts` "should refuse assigning SUPER_ADMIN..." fails: promise resolved instead of rejecting |
| 2 | `src/modules/authentication/presentation/guards/pending-password.guard.ts:26` | Flipped `if (allowsPendingPassword)` to `if (!allowsPendingPassword)`, inverting the exemption | Killed - 4 of 6 tests in `pending-password.guard.spec.ts` fail (exempted route now throws, non-exempted route now passes) |
| 3 | `src/modules/users/application/commands/register-user/register-user.handler.ts:60-67` | Removed the `this.transactionRunner.run(...)` wrapper, leaving the user-save and role-assignment as two sequential, unwrapped calls | Killed at both layers - unit `register-user.handler.spec.ts` "should propagate the role assignment failure through the transaction boundary" (`transactionRunner.runCalls` 0 vs expected 1) and, more meaningfully, integration `test/integration/user.repository.spec.ts` "should roll back the user insert when the role assignment fails" against real Postgres (`existsByEmail` returned `true` instead of `false` - the user row survived an uncommitted-transaction failure) |

**Sensor depth**: lightweight (3 targeted mutations, standard tier)
**Result**: 3/3 mutations killed, 0 survived.

Mutation 3 is the direct empirical check of the design.md risk this feature was chartered to close
("`RegisterUserHandler` saves the user and then dispatches the role assignment as two separate
awaits with no shared transaction"). The real-Postgres integration test catches its removal
cleanly, confirming the risk is genuinely closed, not just superficially wrapped.

---

## Interactive UAT Results

Not performed. Backend-only feature, no user-facing UI, per the Verifier's operating instructions.

---

## Code Quality

Spot-checked the highest-risk new code (value objects, migration/seed, transaction runner,
role-escalation handler, pending-password guard, logout, identifier-translation boundary, group
removal) against `references/coding-principles.md`, given the feature's size (150 files changed,
~3,760 insertions / ~1,690 deletions across the diff).

| Principle | Status |
| --- | --- |
| Minimum code | Yes - `TypeOrmTransactionRunner`'s `AsyncLocalStorage` approach is the smallest mechanism that lets two CQRS-bus-separated modules share one Postgres transaction without passing an `EntityManager` through a command payload |
| Surgical changes | Yes - group removal (T7) deletes only group-owned files; no adjacent code rewritten cosmetically |
| No scope creep | Mostly - see IDENT-07 AC1 finding: domain-level plumbing (`temporary` flag, `Password.generate()`) was added but never wired to any caller, which is scope started and left unfinished rather than scope creep in the other direction |
| Matches existing patterns | Yes - value objects follow `Email`'s private-constructor/static-factory shape; repositories/mappers follow the existing translation-at-boundary pattern |
| Spec-anchored outcome check (asserted values match spec) | 42/43 - see Spec-Anchored section |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | Mostly - domain layer is 1:1; several routes (`POST /users` for invalid/duplicate document, `PUT .../roles/:roleId` for a non-escalation role) are proven only at unit/integration level, not e2e, despite the matrix requiring e2e for controllers |
| Every test maps to a spec requirement - no unclaimed tests | Yes, on the tests spot-checked (role-escalation, pending-password, change-password, transaction-rollback) |
| Documented guidelines followed | `docs/ddd/implementation-plan.md` section 8, `vitest.config.ts` coverage include/exclude (confirmed matches the Test Coverage Matrix's own claim: `src/**/*.module.ts`, `*.orm-entity.ts`, migrations excluded) |

---

## Edge Cases

- [x] Correct-length, wrong-check-digit document -> 400: `person-document.spec.ts:30-36`
- [x] Concurrent same-document registrations -> exactly one succeeds, other 409: handled by construction - partial unique index on `document` (`identity-schema.migration.spec.ts:234-244`) plus `typeorm-user.repository.ts:47-49,63-68` mapping the unique-violation to `DocumentAlreadyInUseError`; no dedicated two-simultaneous-request test exists, but the enforcement point is the DB constraint, not the application-level check, so the race is closed regardless
- [x] Pending-password user can still log out: `pending-password.e2e.spec.ts:52-62`
- [ ] **Deactivated user's active session refused with 401 on its next request: NOT handled, NOT tested.** `DeactivateUserHandler` (`src/modules/users/application/commands/deactivate-user/deactivate-user.handler.ts:17-27`) never revokes a session; `User.deactivate()` (`user.ts:94-101`) publishes no domain event (no `UserDeactivated` event class exists in the diff); no subscriber listens for deactivation; `JwtAuthGuard` (`jwt-auth.guard.ts:31-53`) checks only JWT signature validity and Redis-based `revokedSessions.isRevoked(sessionId)` - never the user's `status`/`deletedAt`. A deactivated user's already-issued access token keeps working, on any route, until it naturally expires (`ACCESS_TOKEN_TTL_SECONDS=900`, up to 15 minutes). `deactivate-user.handler.spec.ts` has no test for this. No task in `tasks.md`'s 16-task breakdown was ever assigned this behaviour.
- [x] Zero monetary amount accepted: `money.spec.ts:20-24`
- [x] Seed script run twice leaves exactly one super administrator: `seed-admin.script.spec.ts:108-137`

---

## Gate Check

- **Gate command**: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e` (Build-level, from tasks.md's Gate Check Commands table), run directly on `main` at `bf20dbb`
- **Result**: 217 passed, 0 failed, 0 skipped (unit 150, integration 28, e2e 39); lint and build both exit 0
- **Test count before feature** (baseline commit `9e22ffc`): not independently re-measured (checking out the pre-feature commit and running its own gate was out of scope for this pass) - the *in-feature* trajectory is documented and cross-checked task by task in tasks.md's transitional-gate table (T4 baseline: unit 106/106, which this Verifier takes as the pre-feature-complete count)
- **Test count after feature**: unit 150, integration 28, e2e 39 - independently run and counted in this session, matching the implementer's own stated final numbers exactly (not merely trusted)
- **Delta**: +44 unit (106 -> 150), +28 integration (0 -> 28, all integration tests are new to this feature), +39 e2e less the pre-existing baseline (tasks.md states 17 pre-existing e2e tests before this feature; net new/rewritten is smaller since several were rewritten in place per T17's own notes, not deleted)
- **Skipped tests**: none
- **Failures**: none

---

## Fix Plans

### Fix 1: IDENT-07 AC1 has no production implementation

- **Root cause**: T14 built only the domain-level plumbing (`User.register`'s `temporary` flag,
  `Password.generate()`) and its own Done-when note explicitly deferred "the actual endpoint" to
  feature 2, reading spec.md's "Why P1" narrative ("Feature 2 registers customers at the counter
  and depends on this behaviour existing") as scope permission. But spec.md lists IDENT-07 as one
  of *this* feature's 9 P1/P2 stories, with its own AC1 and its own Independent Test ("Create a
  customer as a service advisor, log in with the returned password...") describing a complete,
  working flow this feature is supposed to deliver - the "Why P1" text explains why the behaviour
  is prioritised here (because feature 2 needs it to already exist), not that its construction
  belongs to feature 2.
- **Fix task**: add a command (e.g. `CreateStaffAccountCommand`) and endpoint, guarded by an
  appropriate permission, that calls `User.register({ ..., temporary: true })` with a
  `Password.generate()` candidate and returns the raw password once in the response DTO, with a
  pino redact path added for that response field in the same commit (per T14's own Done-when
  item 4, which anticipated this exact need).
- **Verify**: an e2e test matching spec.md's own Independent Test for this story - service advisor
  creates a customer, receives the temp password, logs in, is refused with 403 on any other route,
  changes the password, then succeeds.
- **Alternative resolution**: if the team's actual intent is that this endpoint ships in feature 2,
  spec.md's IDENT-07 AC1 and Requirement Traceability should say so explicitly (move the AC, or add
  an AD entry recording the descope) rather than leaving a mismatch between what spec.md promises
  and what `tasks.md`/`STATE.md` quietly decided.
- **Priority**: Blocker.

### Fix 2: Deactivating a user does not revoke its sessions

- **Root cause**: no task in the 16-task breakdown was ever assigned this behaviour, so it was
  never built. `DeactivateUserHandler` saves the soft-deleted user and stops; nothing revokes the
  session or publishes an event a subscriber could act on; `JwtAuthGuard` never re-checks user
  status per request (a deliberate no-DB-read-per-request design choice for the pending-password
  claim, which has the side effect of also skipping a status check here).
- **Fix task**: have `DeactivateUserHandler` dispatch `LogoutAllSessionsCommand` for the
  deactivated user's id after saving, mirroring the pattern `ChangePasswordHandler` already uses.
- **Verify**: an e2e test - open a session, deactivate that user through the admin endpoint, then
  confirm the session's next request answers 401.
- **Priority**: Major (explicit spec.md Edge Case; security-relevant; zero implementation, zero
  test).

### Fix 3: No e2e test proves document validation/duplication at the real registration endpoint

- **Root cause**: `POST /api/v1/users` has sibling e2e coverage for weak password (400) and
  duplicate email (409) in `authentication.e2e.spec.ts:39-66`, but the equivalent cases for an
  invalid or duplicate document - added by this very feature - were never mirrored at the e2e
  layer, only at unit (`register-user.handler.spec.ts`) and integration
  (`user.repository.spec.ts`) layers.
- **Fix task**: add two e2e cases to `authentication.e2e.spec.ts` alongside the existing
  weak-password/duplicate-email tests: an invalid document -> 400 `USER_INVALID_DOCUMENT`, and a
  duplicate document -> 409 `USER_DOCUMENT_ALREADY_IN_USE`.
- **Priority**: Minor.

### Fix 4: No e2e test drives the real role-assignment endpoint for a non-escalation role

- **Root cause**: `role-escalation.e2e.spec.ts` only exercises `PUT /users/:userId/roles/:roleId`
  for the `SUPER_ADMIN`/`ADMIN` cases; the `MECHANIC`/`SERVICE_ADVISOR`/`CUSTOMER` happy path is
  proven only in-memory (`assign-role-to-user.handler.spec.ts:171-184`), and the one e2e test that
  needs a `MECHANIC` (`users.e2e.spec.ts:121-131`) seeds it through a SQL test helper instead of
  the endpoint. Spec.md's own Independent Test for IDENT-05 ("Create a mechanic as an
  administrator, log in as that mechanic...") is therefore unproven end-to-end.
- **Fix task**: add one e2e test that registers an account, assigns `MECHANIC` through the real
  `PUT` endpoint as an administrator, logs in as that account, and confirms the role via
  `GET /api/v1/users/me`.
- **Priority**: Minor.

### Fix 5: `Money.fromDatabase` has no real-Postgres round-trip test

- **Root cause**: `Money` is shared kernel with no consumer column in this feature's own schema
  yet, so there was no natural integration point.
- **Fix task**: low urgency - either add a throwaway-column integration test now, or accept the
  gap until the first later feature that persists a `Money` value adds its own integration test
  against a real column.
- **Priority**: Minor.

### Fix 6: spec.md AC1's permission-count breakdown is wrong

- **Root cause**: spec.md's IDENT-01 AC1 says "twenty new workshop codes... alongside the seven
  pre-existing identity codes"; the delivered, correct catalog is 19 workshop-labelled codes and 8
  identity-labelled codes (27 total, which matches `design.md`'s Phase 0 table and is what was
  actually built).
- **Fix task**: correct the AC1 wording in spec.md to "nineteen new workshop codes... alongside the
  eight pre-existing identity codes."
- **Priority**: Cosmetic.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| IDENT-01 | Implementing | Verified |
| IDENT-02 | Implementing | Verified |
| IDENT-03 | Implementing | Verified |
| IDENT-04 | Implementing | Verified |
| IDENT-05 | Implementing | Verified |
| IDENT-06 | Implementing | Verified |
| IDENT-07 | Implementing | Needs Fix (AC1 unimplemented) |
| IDENT-08 | Implementing | Verified |
| IDENT-09 | Implementing | Verified |

---

## Summary

**Overall**: Not Ready

**Spec-anchored check**: 42/43 ACs matched spec outcome, 1 gap (IDENT-07 AC1)
**Sensor**: 3/3 mutations killed
**Gate**: 217 passed, 0 failed (lint clean, build clean)

**What works**: the RBAC catalog and seed (no `CROSS JOIN` wildcard, exact per-role grants), the
identifier retrofit (bigserial internal / uuid external, translated at the repository boundary),
CPF/CNPJ validation and uniqueness, the role-escalation rule (SUPER_ADMIN never assignable, ADMIN
gated on the actor holding SUPER_ADMIN), the pending-password guard and its exact exemption list,
global logout on both explicit logout and password change, and the register/assign-role shared
transaction (the design.md risk this feature was chartered to close - confirmed closed by a
real-Postgres discrimination-sensor mutation).

**Issues found**:
1. IDENT-07 AC1 (staff-created account with a generated temp password) has zero production
   implementation - domain scaffolding exists, nothing calls it. See Fix 1.
2. spec.md's Edge Case "deactivated user's active session refused next request with 401" is
   unimplemented and untested. See Fix 2.
3. Three minor e2e-layer coverage gaps (document validation/duplication at the real registration
   route, role assignment at the real endpoint for non-escalation roles, a real-Postgres round-trip
   for `Money`). See Fix 3-5.
4. spec.md's own AC1 wording miscounts the permission-catalog split (total is correct). See Fix 6.

**Next steps**: route Fix 1 and Fix 2 back to an implementer as the two blocking/major gaps, then
re-verify. Fixes 3-6 can ride along in the same pass or be scheduled separately at the team's
discretion; none of them block re-verification of Fix 1/2.
