# Identity Foundation Specification

## Problem Statement

The repository ships a working identity and access module, but it cannot serve a workshop yet. No permission describes a workshop capability, nobody can be identified by CPF or CNPJ, there is no way to create a mechanic or a seller without writing SQL, any administrator could grant themselves anything, and the schema exposes its primary keys directly in URLs. Every later feature builds on this module, so the shape it leaves behind decides the cost of all seven features after it.

## Goals

- [ ] Every workshop capability exists as a permission granted to the right role, before any endpoint needs it.
- [ ] Every person in the system is identified by a structurally valid CPF or CNPJ, unique among active users.
- [ ] The workshop creates and maintains its own staff accounts through the API, with no database access.
- [ ] No actor can grant a profile at or above their own level.
- [ ] No route exposes an enumerable identifier.
- [ ] Monetary arithmetic has exactly one implementation in the codebase.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| --- | --- |
| Customer, vehicle, service, inventory and work order modules | They are features 2 to 8 of the roadmap and depend on this one. |
| Password reset by the user without knowing the current password | Needs a delivery channel the stack does not have. Staff resets by issuing a new temporary password. |
| Postal address and phone on the user record | Workshop relationship data, which belongs to the `Customer` aggregate in feature 2. |
| Employee records with data of their own | No requirement asks for staff data beyond the account itself. See AD-004. |
| Multi-factor authentication, account lockout, password expiry | No requirement asks for them, and none is implied by the challenge document. |
| Reinstating groups under another name | AD-005 removed the concept. A second grouping axis does not exist in this workshop. |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| The initial migration is rewritten in place rather than altered by a second migration | Rewrite `1787702400000-create-identity-and-access-schema.ts` | The repository has no commits and no deployed database, so nobody has to migrate. Anyone with a local database drops it and runs the migrations again. | y |
| The pending password flag reaches the guard without a database read per request | A claim in the access token, with every session revoked when the password changes | A stale claim cannot outlive the session that carries it, so the claim and the revocation are consistent by construction. | y |
| The temporary password is delivered to the person | Returned once in the creation response, for the staff member to hand over | There is no password reset flow and no delivery channel in the stack. | y |
| The administrator seeded by `scripts/seed-admin.ts` needs a document | Read `ADMIN_DOCUMENT` from the environment, validated like any other | The document became mandatory, and the seed cannot bypass a rule the domain enforces. | y |
| `sessions:revoke-any` keeps its current grant | Unchanged, with `SUPER_ADMIN` added | It already exists and this feature does not change what it means. | y |
| Deactivating a user is a soft delete | Sets `deleted_at`, matching the partial unique indexes already in the schema | The existing schema already filters uniqueness by `deleted_at IS NULL`. | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Workshop capabilities exist as permissions ⭐ MVP

**User Story**: As an administrator, I want every workshop capability to exist as a permission granted to the right role, so that the endpoints built in later features are guarded without inventing permissions ad hoc.

**Why P1**: Every controller from feature 2 onwards references these codes. Without them, no later feature can be guarded.

**Acceptance Criteria**:
1. The system SHALL expose the permission codes defined in `docs/ddd/implementation-plan.md` Phase 0 through the existing permission catalog: nineteen new workshop codes (`customers:read` through `metrics:read`) alongside the eight pre-existing identity codes that survive the group removal (AD-005), twenty-seven codes in total.
2. WHEN the RBAC seed migration runs THEN the system SHALL grant each system role exactly the permission set defined in the design.
3. The system SHALL define a `SUPER_ADMIN` system role holding `roles:manage`, which `ADMIN` does not hold.
4. IF a permission code does not match the existing `PermissionCode` format THEN the system SHALL reject it at creation.

**Independent Test**: Log in as each seeded role and read `GET /api/v1/users/me`; the returned permission list matches the design table for that role.

---

### P1: Money has one implementation ⭐ MVP

**User Story**: As the workshop, I want every monetary value handled as integer BRL cents by one shared value object, so that a budget total always equals the sum of its parts.

**Why P1**: Three later features price things. Three rounding implementations is how totals stop matching.

**Acceptance Criteria**:
1. The system SHALL represent every monetary amount as an integer number of BRL cents.
2. IF an amount is negative THEN the system SHALL reject its creation.
3. IF an amount is fractional THEN the system SHALL reject its creation.
4. WHEN two amounts are added or an amount is multiplied by a quantity THEN the system SHALL return an exact integer result with no floating point drift.
5. WHEN a `bigint` column is read back from PostgreSQL as a string THEN the system SHALL convert it to the same amount that was written.

**Independent Test**: Unit tests over the value object, plus an integration test that writes an amount, reads it back and compares.

---

### P1: No route exposes an enumerable identifier ⭐ MVP

**User Story**: As the workshop, I want every identifier that leaves the process to be a UUID while the database keys stay sequential, so that nobody can walk the records by incrementing a number.

**Why P1**: Retrofitting six tables after seven more features exist multiplies the work. It has to happen before anything is built on top.

**Acceptance Criteria**:
1. The system SHALL give every table a route can address an internal `bigserial` primary key and a unique `external_id` of type uuid.
2. The system SHALL keep a composite primary key of internal keys on join tables that no route addresses.
3. WHEN a request carries an identifier THEN the system SHALL accept only the external identifier.
4. WHEN a repository persists a reference to another table THEN the system SHALL resolve the external identifier into the internal key at its own boundary.
5. WHILE an access token issued before the change is still valid the system SHALL keep resolving it, because the token carries the external identifier.

**Independent Test**: The existing authentication e2e suite passes unchanged, and a session opened before the migration still authenticates.

---

### P1: Everybody is identified by CPF or CNPJ ⭐ MVP

**User Story**: As a service advisor, I want every person registered with a valid CPF or CNPJ, so that I can find someone at the counter by the document they hand me.

**Why P1**: The challenge requires customer identification by document, and it is the entry point of the whole operational flow.

**Acceptance Criteria**:
1. WHEN an account is registered THEN the system SHALL require a CPF or a CNPJ.
2. IF the document fails its check digit validation THEN the system SHALL reject the registration with HTTP 400.
3. IF the document is a repeated digit sequence THEN the system SHALL reject the registration with HTTP 400.
4. WHEN a document is supplied with punctuation THEN the system SHALL store it normalised as digits only.
5. IF the document already belongs to an active user THEN the system SHALL reject the registration with HTTP 409.
6. WHEN a service advisor searches by document THEN the system SHALL return the matching user or an empty result.

**Independent Test**: Register with a known valid CPF, find it by document, then attempt a duplicate and receive 409.

---

### P1: The workshop creates its own staff accounts ⭐ MVP

**User Story**: As an administrator, I want to create and maintain seller and mechanic accounts through the API, so that the workshop runs without database access.

**Why P1**: Without it, every mechanic and seller has to be inserted by hand, and the system cannot be operated.

**Acceptance Criteria**:
1. WHEN an administrator creates a staff account THEN the system SHALL create the user and assign the roles supplied in the request.
2. WHEN an administrator updates or deactivates an account THEN the system SHALL apply the change and keep the record recoverable through its soft delete.
3. IF the actor lacks `users:manage` THEN the system SHALL refuse the request with HTTP 403.
4. WHILE a user is authenticated the system SHALL let that user update their own personal data with no workshop permission.
5. IF a user attempts to update another user's data without `users:manage` THEN the system SHALL refuse the request with HTTP 403.

**Independent Test**: Create a mechanic as an administrator, log in as that mechanic, and confirm the MECHANIC role is present.

---

### P1: Nobody widens their own access ⭐ MVP

**User Story**: As the workshop owner, I want the administrator profile to be grantable only by a super administrator created outside the API, so that an administrator cannot promote themselves.

**Why P1**: Without it, `user-access:manage` is a path from ADMIN to unlimited access.

**Acceptance Criteria**:
1. IF any actor attempts to assign `SUPER_ADMIN` through the API THEN the system SHALL refuse the request with HTTP 403.
2. IF an actor without `SUPER_ADMIN` attempts to assign `ADMIN` THEN the system SHALL refuse the request with HTTP 403.
3. WHEN an actor holding `SUPER_ADMIN` assigns `ADMIN` THEN the system SHALL perform the assignment.
4. WHEN an administrator assigns `SERVICE_ADVISOR`, `MECHANIC` or `CUSTOMER` THEN the system SHALL perform the assignment.
5. The system SHALL create the first `SUPER_ADMIN` only through the seed script.

**Independent Test**: As an administrator, attempt to grant ADMIN and receive 403; as the seeded super administrator, grant it and succeed.

---

### P1: A staff-created account starts with a temporary password ⭐ MVP

**User Story**: As a service advisor, I want to register somebody without inventing a password for them, so that the counter never creates a shared credential.

**Why P1**: Feature 2 registers customers at the counter and depends on this behaviour existing.

**Acceptance Criteria**:
1. WHEN an account is created by staff THEN the system SHALL generate a temporary password, flag the account as pending replacement and return the password once in the response.
2. WHILE an account is flagged as pending replacement the system SHALL refuse every authenticated request other than the password change and the logout, with HTTP 403.
3. WHEN the password is changed THEN the system SHALL clear the pending flag.
4. IF the supplied current password does not match THEN the system SHALL refuse the change with HTTP 401.
5. IF the new password fails the existing password rules THEN the system SHALL refuse the change with HTTP 400.
6. The system SHALL keep the temporary password out of every log.

**Independent Test**: Create a customer as a service advisor, log in with the returned password, be refused on any other route, change the password, and then succeed.

---

### P1: Signing out signs out everywhere ⭐ MVP

**User Story**: As a user, I want logging out to end every session I have open, so that a session forgotten on another device does not stay alive.

**Why P1**: A password change has to be able to close every device, and the two behaviours share one mechanism.

**Acceptance Criteria**:
1. WHEN a user logs out THEN the system SHALL revoke every active session of that user.
2. WHEN a password is changed THEN the system SHALL revoke every active session of that user.
3. WHILE a session is revoked the system SHALL refuse its access token with HTTP 401.
4. WHERE the actor holds `sessions:revoke-any` the system SHALL allow revoking one named session of another user.

**Independent Test**: Open two sessions, log out from one, and confirm the other is refused.

---

### P2: One grouping concept in the access model

**User Story**: As an administrator, I want permissions to reach a user through exactly one path, so that nobody has to check two places to understand why someone can do something.

**Why P2**: The system works with groups present and unused. Removing them is cleanup that pays off in every later feature's mental load and in the effective access query.

**Acceptance Criteria**:
1. The system SHALL resolve effective access from user roles and their permissions only.
2. The system SHALL expose no endpoint that creates, reads, updates or deletes a group.
3. WHEN the identity schema is created THEN the system SHALL create no group table.

**Independent Test**: The effective access integration test passes with only role-based cases, and no group route answers.

---

## Edge Cases

- IF a document is supplied with the correct length but invalid check digits THEN the system SHALL reject it with HTTP 400.
- IF two registrations with the same document arrive concurrently THEN the system SHALL let exactly one succeed and answer the other with HTTP 409.
- IF a user with a pending password calls the logout THEN the system SHALL allow it.
- IF an account is deactivated while it has an active session THEN the system SHALL refuse that session's next request with HTTP 401.
- WHEN a monetary amount is zero THEN the system SHALL accept it.
- IF the seed script runs twice THEN the system SHALL leave exactly one super administrator.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| IDENT-01 | P1: Workshop capabilities exist as permissions | Tasks | Verified |
| IDENT-02 | P1: Money has one implementation | Tasks | Verified |
| IDENT-03 | P1: No route exposes an enumerable identifier | Tasks | Verified |
| IDENT-04 | P1: Everybody is identified by CPF or CNPJ | Tasks | Verified |
| IDENT-05 | P1: The workshop creates its own staff accounts | Tasks | Verified |
| IDENT-06 | P1: Nobody widens their own access | Tasks | Verified |
| IDENT-07 | P1: A staff-created account starts with a temporary password | Tasks | Verified |
| IDENT-08 | P1: Signing out signs out everywhere | Tasks | Verified |
| IDENT-09 | P2: One grouping concept in the access model | Tasks | Verified |

**ID format:** `IDENT-NN`

**Status values:** Pending, In Design, In Tasks, Implementing, Verified

**Coverage:** 9 total, 9 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] The existing authentication e2e suite passes after the identifier retrofit, with only the document field added to its registration payloads.
- [ ] Each seeded role resolves exactly the permission set in the design, proven by an integration test over the effective access reader.
- [ ] A mechanic account can be created, logged into and used, without any SQL.
- [ ] An administrator cannot grant `ADMIN` or `SUPER_ADMIN`.
- [ ] No group table exists and no group route answers.
