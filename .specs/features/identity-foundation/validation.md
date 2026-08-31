# Identity Foundation Validation

## Validation Verdict: PASS

**Date**: 2026-08-31
**Spec**: `.specs/features/identity-foundation/spec.md`
**Diff range**: `bf20dbb..332519e` (8 commits, `main`) - the T18-T20 fix round, on top of the
first pass's `9e22ffc..bf20dbb`
**Verifier**: independent sub-agent (author != verifier) - **re-verification pass 2**

This is the second Verifier pass on this feature. Pass 1 (`git show bf20dbb:.specs/features/
identity-foundation/validation.md`, written at commit `00f02bb`) returned **FAIL**: IDENT-07 AC1
(a staff-created account gets a generated temporary password) had zero production implementation,
and spec.md's own deactivation Edge Case had never been assigned to a task. It also flagged three
minor e2e-coverage gaps and a cosmetic spec-wording defect. The user chose to implement IDENT-07
AC1 now rather than descope it. Three tasks (T18, T19, T20) closed all five findings. This pass
re-derives every finding from pass 1 independently rather than trusting its resolution, re-checks
the two pieces of pre-existing code T18/T19 modified for regressions, and gives the rest of the
feature a lighter spot-check since its own code did not change.

---

## Task Completion

All 20 tasks in `tasks.md` (T1-T4 merged T5, T6-T20) show every Done-when box checked. Verified
against the diff and the running codebase, not trusted at face value.

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T1-T13 | Done | Unchanged since pass 1; re-confirmed by the full gate below, no regression |
| T14  | Done, domain-only as scoped | `Password.generate()` and `User.register`'s `temporary` flag - now wired up by T18 |
| T15-T17 | Done | Unchanged since pass 1; re-confirmed by the full gate below, no regression |
| T18  | Done | `feat(users): add the staff account creation endpoint` (`22704e9`) - closes IDENT-07 AC1 |
| T19  | Done | `fix(users): revoke every session when an account is deactivated` (`7461644`) - closes the deactivation Edge Case |
| T20  | Done | `test(identity-foundation): close the coverage gaps validation.md flagged` (`7a82167`) - closes pass 1's Fix 3-5 |

---

## Spec-Anchored Acceptance Criteria

Evidence-or-zero: every row cites a `file:line` and the exact assertion. Full re-derivation for
IDENT-07 (all 6 ACs) and the deactivation Edge Case; the other 8 stories get a spot-check, with
extra depth on the two call sites T18/T19 actually changed (`RegisterUserHandler`,
`DeactivateUserHandler`) since a fix round can regress code that was already verified.

### IDENT-07: A staff-created account starts with a temporary password (full re-derivation)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: generate a temp password, flag pending, return it once | working create-with-temp-password flow | `src/modules/users/application/commands/register-user/register-user.handler.ts:42-44` (`command.issuedByStaff ? Password.generate() : Password.create(command.password!)`), `:60` (`temporary: command.issuedByStaff` -> `User.register` sets `mustChangePassword`, `src/modules/users/domain/entities/user.ts:53`), `:71-73` (`{ id, temporaryPassword: password.value }` returned only when staff-issued); route `src/modules/users/presentation/controllers/users.controller.ts:86-106` (`POST /api/v1/users/staff`); unit `src/modules/users/application/commands/register-user/register-user.handler.spec.ts:56-71` - `expect(result.temporaryPassword).toHaveLength(12)`, `expect(saved.mustChangePassword).toBe(true)`; e2e `test/e2e/staff-account.e2e.spec.ts:29-70` - full Independent Test flow (create, login with temp password, refused 403 elsewhere, change password, succeeds) | PASS - killed by discrimination sensor mutation 1 (see below) |
| AC2: pending flag refuses every route but change-password/logout, 403 | exact refusal + exemption | Unchanged since pass 1: `src/modules/authentication/presentation/guards/pending-password.guard.spec.ts:41-46` (exempted route allowed), `:48-53` (refuses), `:55-66` (exact `AUTH_PASSWORD_CHANGE_REQUIRED` code); e2e `test/e2e/staff-account.e2e.spec.ts:40-42` (real staff-created account gets refused 403 with the code) | PASS |
| AC3: changing the password clears the flag | `mustChangePassword` -> false | Unchanged since pass 1: `src/modules/users/domain/entities/user.ts:67-70` (`changePassword` sets `mustChangePassword = false`); e2e `test/e2e/staff-account.e2e.spec.ts:63-70` - real staff account changes password then `GET /users/me` returns `mustChangePassword: false` | PASS |
| AC4: wrong current password -> 401 | `InvalidCredentialsError` -> 401 | Unchanged since pass 1: `test/e2e/change-password.e2e.spec.ts:54-64` - `code: 'AUTH_INVALID_CREDENTIALS'` | PASS |
| AC5: weak new password -> 400 | `WeakPasswordError` -> 400 | Unchanged since pass 1: `test/e2e/change-password.e2e.spec.ts:66-76` - `code: 'USER_WEAK_PASSWORD'` | PASS |
| AC6: temp password never logged | no logger call touches it | Verified independently by inspection: `grep -n "logger\|Logger\|console\." src/modules/users/domain/entities/user.ts src/modules/users/domain/value-objects/password.ts src/modules/users/application/commands/register-user/register-user.handler.ts src/modules/users/presentation/controllers/users.controller.ts` returns nothing; defensive redact path added at `src/app.module.ts:50` (`'res.body.temporaryPassword'`) | PASS - no longer moot: AC1 is implemented, so this AC now has a real response path to protect, and it is protected |

**IDENT-07 status**: 6/6 ACs match the spec-defined outcome. Pass 1's sole gap is closed.

### Edge Cases (full re-derivation)

| Edge Case | Result |
| --- | --- |
| Correct-length, wrong-check-digit document -> 400 | PASS - unchanged, `person-document.spec.ts:30-36` |
| Concurrent same-document registrations -> exactly one succeeds, other 409 | PASS - unchanged, closed by construction (partial unique index) |
| Pending-password user can still log out | PASS - unchanged, `pending-password.e2e.spec.ts:52-62` |
| **Deactivated user's active session refused with 401 on its next request** | **PASS - closed by T19.** `src/modules/users/application/commands/deactivate-user/deactivate-user.handler.ts:28-31` - after saving, dispatches `this.commandBus.execute(new LogoutAllSessionsCommand(user.id.value))` through the `CommandBus` (cross-module, matching AD-003, the same pattern `ChangePasswordHandler` already used); unit `src/modules/users/application/commands/deactivate-user/deactivate-user.handler.spec.ts:54-62` - `expect(commandBus.execute).toHaveBeenCalledWith(new LogoutAllSessionsCommand(user.id.value))`; e2e `test/e2e/users.e2e.spec.ts:91-105` - open a session, deactivate through `DELETE /api/v1/users/{externalId}`, then `GET /api/v1/users/me` with the old token answers 401 `AUTH_UNAUTHORIZED`. Killed by discrimination sensor mutation 2 (see below) |
| Zero monetary amount accepted | PASS - unchanged, `money.spec.ts:20-24`, plus a real-Postgres round-trip added by T20 (`test/integration/money.roundtrip.spec.ts:41-48`) |
| Seed script run twice leaves exactly one super administrator | PASS - unchanged, `seed-admin.script.spec.ts:108-137` |

**Status**: 6/6 Edge Cases handled. Both gaps pass 1 found (IDENT-07 AC1, the deactivation edge case) are closed.

### The other 8 stories (spot-check, extra depth on the two shared-code paths T18/T19 touched)

| Story | Spot-check result |
| --- | --- |
| IDENT-01 (permissions) | Unaffected by this diff. `app-permissions.ts` unchanged - still 27 entries, 19 workshop + 8 identity, matching spec.md's corrected AC1 wording (fixed by `318c790`, confirmed by direct read of `spec.md:57` - "nineteen new workshop codes... alongside the eight pre-existing identity codes"). |
| IDENT-02 (Money) | Unaffected. `Money` itself untouched; T20 adds the real-Postgres round-trip pass 1's Fix 5 asked for - `test/integration/money.roundtrip.spec.ts:27-48`, 2 new tests, both green. |
| IDENT-03 (identifiers) | Unaffected. No file in this diff touches the identifier-translation boundary. |
| **IDENT-04 (documents) - self-registration path re-checked** | `POST /api/v1/users` still calls `new RegisterUserCommand(body.email, body.name, body.password, body.document)` unchanged (`users.controller.ts:80-84`, `issuedByStaff` defaults to `false`); handler's non-staff branch (`register-user.handler.ts:44`, `Password.create(command.password!)`) is exercised by unit `register-user.handler.spec.ts:73-80` ("should not return a temporary password for a self-registered account") and by the full pre-existing e2e suite, still green. T20 also added the two e2e cases pass 1's Fix 3 asked for: `test/e2e/authentication.e2e.spec.ts:69-80` (invalid document -> 400 `USER_INVALID_DOCUMENT`) and `:83-96` (duplicate document -> 409 `USER_DOCUMENT_ALREADY_IN_USE`). No regression. |
| **IDENT-05 (staff accounts) - deactivation path re-checked** | AC2/AC3 unaffected in substance; `DeactivateUserHandler`'s existing soft-delete behaviour (`deactivate-user.handler.ts:25-26`) is untouched, only a new line was appended after it (`:28-31`). e2e `test/e2e/users.e2e.spec.ts:77-89` ("should let an admin deactivate an account") still passes unmodified. AC1 now has stronger evidence than pass 1 found: `POST /api/v1/users/staff` (T18) is a real `users:manage`-guarded creation endpoint, where pass 1's evidence was the public, ungated `POST /api/v1/users` composed with a separate role-assignment call. |
| IDENT-06 (escalation) | Unaffected in substance (`AssignRoleToUserHandler` untouched); T20 closes pass 1's Fix 4 with a real-endpoint e2e test for a non-escalation role: `test/e2e/role-escalation.e2e.spec.ts:85-104` ("should let an administrator assign a non-escalation role through the real endpoint" - `PUT /users/:userId/roles/:roleId` for `MECHANIC`, then logs in and confirms the role via `GET /users/me`). |
| IDENT-08 (global logout) | Unaffected. `LogoutAllSessionsHandler`/`auth.controller.ts` untouched by this diff; still green: `test/e2e/authentication.e2e.spec.ts:276-294` (logout all), `:315-329` (revoke-any). T19 reuses this exact handler through the `CommandBus`, the same integration point IDENT-08 already proves works. |
| IDENT-09 (no groups) | Unaffected. No group-related file in this diff; `find src -iname "*group*"` still returns zero files. |

**Status**: 43/43 ACs across all 9 stories match the spec-defined outcome (was 42/43 at pass 1). 0 spec-precision gaps.

---

## Discrimination Sensor

Isolated scratch: `git worktree add <scratch> HEAD` at `332519e`, node_modules symlinked in for
the test runner, never `git stash`. Pre-sensor real-tree `git status --porcelain` was empty
(0 bytes); confirmed byte-identical again after every mutation was reverted and after
`git worktree remove --force`.

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ------------ | ------- |
| 1 | `src/modules/users/application/commands/register-user/register-user.handler.ts:42-44` | Removed the `command.issuedByStaff ? Password.generate() : ...` branch, collapsing it to always `Password.create(command.password!)` | Killed - unit `register-user.handler.spec.ts` "should generate a temporary password for a staff-created account and flag it pending" fails: `WeakPasswordError: Password must have between 8 and 128 characters...` (thrown from `Password.create(undefined!)`, since `command.password` is `undefined` on the staff path) |
| 2 | `src/modules/users/application/commands/deactivate-user/deactivate-user.handler.ts:28-31` | Removed the `await this.commandBus.execute(new LogoutAllSessionsCommand(...))` line entirely | Killed at both layers - unit `deactivate-user.handler.spec.ts` "should revoke every active session of the deactivated user" fails (`commandBus.execute` called 0 times, expected 1), and, more meaningfully, e2e `test/e2e/users.e2e.spec.ts` "should refuse a deactivated account's session on its next request" fails against the real running app (`expected 401 "Unauthorized", got 404 "Not Found"` - the session stayed live) |
| 3 | `src/modules/users/presentation/controllers/users.controller.ts:87` | Removed `@RequirePermissions(AppPermission.UsersManage)` from `POST /users/staff` | Killed - e2e `test/e2e/staff-account.e2e.spec.ts` "should refuse creating a staff account without users:manage" fails (`expected 403 "Forbidden", got 201 "Created"` - an unprivileged actor created a staff account) |

**Sensor depth**: lightweight (3 targeted mutations, standard tier), all three drawn from this fix
round's new code specifically, per the task brief.
**Result**: 3/3 mutations killed, 0 survived.

---

## Interactive UAT Results

Not performed. Backend-only feature, no user-facing UI, per the Verifier's operating instructions.

---

## Code Quality

Spot-checked T18/T19/T20's new code against `references/coding-principles.md`.

| Principle | Status |
| --- | --- |
| Minimum code | Yes - T18 adds one command field, one boolean flag, one route, two DTOs; T19 adds one line plus a constructor parameter; T20 adds tests only |
| Surgical changes | Yes - `RegisterUserHandler` and `DeactivateUserHandler` are the only production files this round touches beyond the new route/DTOs; nothing adjacent was rewritten |
| No scope creep | Yes - `POST /users/staff` does exactly what IDENT-07 AC1 asks (generated password, pending flag, one-time return) and nothing about role selection, which stays IDENT-05/06's separate `PUT .../roles/:roleId` endpoint, correctly not touched |
| Matches existing patterns | Yes - `DeactivateUserHandler` dispatching `LogoutAllSessionsCommand` through the injected `CommandBus` is the identical cross-module pattern `ChangePasswordHandler` already used (AD-003 compliant); `Password.generate()` funnels through `Password.create()` so the generated password can never drift from the strength rule |
| Spec-anchored outcome check (asserted values match spec) | 43/43 - see Spec-Anchored section |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | Yes - `POST /users/staff` now has unit (2), e2e happy path, e2e 403-without-permission, and e2e 409-duplicate-document coverage; `DeactivateUserHandler` has unit + e2e for the new session-revocation behaviour |
| Every test maps to a spec requirement - no unclaimed tests | Yes, on the tests spot-checked (staff-account e2e, deactivate-user unit/e2e, role-escalation e2e, money round-trip, document e2e cases) |
| Documented guidelines followed | `docs/ddd/implementation-plan.md` section 8, `vitest.config.ts` coverage include/exclude - unchanged, still matches |

**On `RegisterUserCommand`'s extended shape** (`password: string | undefined`, `issuedByStaff: boolean = false`): this reads as a clean extension, not two commands forced into one. The two production call sites (`users.controller.ts:82` for self-registration, `:103` for staff creation) never mix the two modes, and reusing `RegisterUserHandler`'s existence checks, transaction wrap, and role-assignment dispatch avoids real duplication - rebuilding those three pieces in a second handler would have been more code, not less, for a path that is otherwise identical up to where the password comes from. The one soft spot: the correlation between `issuedByStaff` and `password` is not encoded in the type system - `command.password!` is a non-null assertion that trusts the caller rather than a discriminated union that would make an inconsistent pair (`issuedByStaff: true` with a defined `password`, or `false` with `undefined`) unrepresentable. With exactly two call sites, both correct today, this is a minor note, not a defect - flagged below as a low-priority fix, not a blocker.

---

## Gate Check

- **Gate command**: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e` (Build-level, from tasks.md's Gate Check Commands table), run directly on `main` at `332519e`
- **Result**: 229 passed, 0 failed, 0 skipped (unit 153, integration 30, e2e 46); lint and build both exit 0. Independently run in this session (not copied from tasks.md or from the prior report) - matches tasks.md's own T20 tally exactly.
- **Test count at pass 1** (`bf20dbb`): 217 (unit 150, integration 28, e2e 39)
- **Test count now** (`332519e`): 229 (unit 153, integration 30, e2e 46)
- **Delta**: +3 unit (T18 x2, T19 x1), +2 integration (T20's new `money.roundtrip.spec.ts`), +7 e2e (T18 x3, T19 x1, T20 x3) - matches the diff exactly, no unexplained gap
- **Skipped tests**: none
- **Failures**: none

---

## Fix Plans

### Fix 1 (low priority, carried forward as a quality note, not a gap): `RegisterUserCommand`'s staff/self-registration correlation is enforced by a non-null assertion, not the type system

- **Root cause**: `password: string | undefined` plus `issuedByStaff: boolean` lets a caller construct an inconsistent command (`issuedByStaff: true` with a password set, or `false` with `password: undefined`); the handler's `command.password!` trusts the caller rather than the compiler.
- **Fix task**: optional cleanup - replace the two fields with a discriminated union (e.g. `{ issuedByStaff: false; password: string } | { issuedByStaff: true }`) if a third call site is ever added; not worth the churn for the current two call sites.
- **Verify**: n/a until a third call site exists.
- **Priority**: Minor, non-blocking.

No other findings. Pass 1's Fix 1 (IDENT-07 AC1) and Fix 2 (deactivation Edge Case) are closed by
T18/T19 with real production code and passing tests, independently confirmed above. Pass 1's Fix
3-5 (e2e coverage gaps) are closed by T20. Pass 1's Fix 6 (spec.md AC1 wording) is closed by
`318c790`.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| IDENT-01 | Verified | Verified (unchanged) |
| IDENT-02 | Verified | Verified (unchanged) |
| IDENT-03 | Verified | Verified (unchanged) |
| IDENT-04 | Verified | Verified (unchanged) |
| IDENT-05 | Verified | Verified (unchanged; deactivation Edge Case under this story's territory now closed) |
| IDENT-06 | Verified | Verified (unchanged) |
| IDENT-07 | Implementing - AC1 closed by T18, pending re-verification | **Verified** |
| IDENT-08 | Verified | Verified (unchanged) |
| IDENT-09 | Verified | Verified (unchanged) |

---

## Summary

**Overall**: Ready

**Spec-anchored check**: 43/43 ACs matched spec outcome (was 42/43 at pass 1), 0 spec-precision gaps
**Sensor**: 3/3 mutations killed
**Gate**: 229 passed, 0 failed (lint clean, build clean)

**What works**: everything pass 1 already confirmed, plus the two gaps it found. IDENT-07 AC1 now
has a real, guarded, tested endpoint (`POST /api/v1/users/staff`) generating and returning a
one-time temporary password through `Password.generate()`, flagged pending through `User.register`'s
`temporary` input, gated by the pre-existing pending-password guard. The deactivation Edge Case is
closed by `DeactivateUserHandler` dispatching `LogoutAllSessionsCommand` after saving, proven against
a real running app in `users.e2e.spec.ts`. Both fixes reuse existing mechanisms
(`RegisterUserHandler`'s transaction/role-assignment, `LogoutAllSessionsCommand`'s cross-module
dispatch) rather than inventing new ones. Neither of the two pre-existing paths this round touched
(self-registration, deactivation-without-a-session) regressed - re-checked directly, not assumed.
The three minor e2e-coverage gaps and the spec-wording defect from pass 1 are also closed.

**Issues found**: one non-blocking code-quality note (`RegisterUserCommand`'s field correlation
relies on a non-null assertion rather than a discriminated union) - see Fix 1. Not a defect at
today's two call sites.

**Next steps**: none required to close this feature. `identity-foundation` is verified against
spec.md in full - all 9 stories, all 43 ACs, all 6 Edge Cases.
