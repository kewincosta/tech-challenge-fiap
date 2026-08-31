# Implementation plan

Derived from [event-storming.md](./event-storming.md). No production code, schema or endpoint
was created in this stage.

Revision 10, aligned with the decisions recorded in section 14 of the event storming.

## 1. Current state

The repository is a NestJS modular monolith with a four-layer structure per module
(`domain`, `application`, `infrastructure`, `presentation`), CQRS through `@nestjs/cqrs`,
TypeORM over PostgreSQL, Redis for caching and rate limiting, and Vitest for tests.

Three modules exist and cover the Identity & Access context.

| Module           | Problem it solves                                                                                                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`          | Registers a user, hashes the password with Argon2, exposes the account, verifies credentials. Assigns the `CUSTOMER` role at registration through the `CommandBus`.                                                   |
| `authentication` | Login, session lifecycle, JWT access tokens, refresh token rotation with reuse detection, session listing and revocation. Provides the global `JwtAuthGuard`, `@Public()`, `@CurrentUser()` and the `Principal` type. |
| `authorization`  | Roles, groups, permissions, user assignments, effective access with a Redis cache and invalidation subscriber. Provides the global `PermissionsGuard`, `@RequirePermissions()` and `@Roles()`.                        |

Shared kernel in `src/shared`: `AggregateRoot`, `DomainEvent`, `EntityId` with UUID
validation, the `BaseError` hierarchy with `ErrorKind` mapped to HTTP by
`GlobalExceptionFilter`, the `Clock` and `IdGenerator` ports, `DatabaseModule`, `RedisModule`,
the validation pipe and the error response DTO.

Infrastructure and quality already in place: Docker and Docker Compose with healthchecks, hand
written SQL migrations, Swagger at `/api/docs`, global prefix `api` with URI versioning at
`v1`, Helmet, throttling backed by Redis, pino logging with redaction, ESLint rules that forbid
framework imports inside `domain` and infrastructure imports inside `application`, Prettier,
Husky, lint-staged, and Vitest split into unit, integration and e2e configurations with fakes,
factories and a guard that refuses to run against a database whose name does not end in
`_test`.

Two gaps: there is no `README.md`, and the repository has no commits yet. The second one
matters for phase 1.

## 2. Conventions introduced by the answered questions

**Identifiers.** Every table a route can address gets `id bigserial PRIMARY KEY` for internal
use and foreign keys, plus `external_id uuid NOT NULL UNIQUE` for everything that leaves the
process. Join tables that no route addresses keep a composite primary key of the two internal
keys. Routes, payloads and domain identifiers carry the external one. `EntityId` keeps working
unchanged because the external identifier is a UUID.

`work_orders` additionally gets `number varchar(11) NOT NULL UNIQUE` in the format
`A1B090-2026`. It is the identifier the workshop and the customer say out loud, and the
customer facing routes use it.

**Money.** Integer BRL cents everywhere in the backend. Columns are `bigint`, the domain uses
`Money` from the shared kernel, and API payloads carry cents. TypeORM returns `bigint` as a
string, so every mapper converts explicitly.

**People and profiles.** A person is a `User`, carrying name, email, credentials and a
mandatory CPF or CNPJ. A profile is a `Role` on that user. Only `Customer` gets an aggregate of
its own, in its own module, because only it carries workshop data: the address, the vehicles
and the work orders. Mechanic, Service advisor and Administrator stay as roles.

**Traceability.** Append only, never updated in place beyond a consumption status, never deleted.
`stock_movements` holds every row that moved units, and `stock_movement_transitions` holds the
status changes of a consumption, which move nothing. `work_order_events` holds every domain event
of a work order, written by the repository in the same transaction as the aggregate. Actor columns
on the work order carry the steps that matter commercially.

## 3. Gap analysis

| Requirement                                    | Status                   | Note                                                                                                                                               |
| ---------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| JWT authentication for the administrative APIs | Exists                   | `JwtAuthGuard` is registered globally.                                                                                                             |
| Role based access                              | Exists                   | `ADMIN`, `MECHANIC`, `SERVICE_ADVISOR`, `CUSTOMER` already seeded.                                                                                 |
| Super administrator and the escalation rule    | Missing                  | One new system role and a rule inside the existing assignment handler.                                                                             |
| Groups                                         | Exists and is removed    | Roles already bundle permissions for a set of users. The workshop has no second grouping axis, so the feature goes out with the retrofit. See H33. |
| Shortage visibility                            | Missing                  | A read model over pending withdrawals against the count on hand. The mechanic signals a shortage by failing to withdraw.                           |
| Part return                                    | Missing                  | A withdrawn part that turns out unnecessary goes back to the shelf while the work order is in execution.                                           |
| Staff administration                           | Missing                  | No endpoint creates or edits a user today, and no `users:manage` permission exists.                                                                |
| CPF and CNPJ validation                        | Missing                  | New `PersonDocument` value object in the users module.                                                                                             |
| Customer CRUD                                  | Missing                  | New `customers` module over a user identity.                                                                                                       |
| Forced password change on first access         | Missing                  | Extends `users` and `authentication`.                                                                                                              |
| Vehicle CRUD                                   | Missing                  | New `vehicles` module.                                                                                                                             |
| Plate validation                               | Missing                  | New `LicensePlate` value object.                                                                                                                   |
| Service CRUD                                   | Missing                  | New `services` module.                                                                                                                             |
| Parts and supplies CRUD                        | Missing                  | New `inventory` module, one aggregate with a `kind` label.                                                                                         |
| Stock control and traceability                 | Missing                  | Unit count plus an append only movement ledger and its history.                                                                                    |
| Work order creation                            | Missing                  | New `work-orders` module.                                                                                                                          |
| Automatic budget generation                    | Missing                  | Behaviour of the `WorkOrder` aggregate.                                                                                                            |
| Budget sent for approval                       | Missing                  | Status transition plus a subscriber. No external channel.                                                                                          |
| Six status states with automatic transitions   | Missing                  | Plus CANCELED, seven in total.                                                                                                                     |
| Additional repairs authorised by the customer  | Missing                  | Supplementary budget rounds on the same work order, which the challenge document names as a product capability. See H38.                           |
| Action trail on a work order                   | Missing                  | Append only table written by a subscriber.                                                                                                         |
| Customer tracking their own work order         | Missing                  | Query plus an ownership check.                                                                                                                     |
| Work order listing and detail                  | Missing                  | Query port with a TypeORM adapter.                                                                                                                 |
| Average execution time                         | Missing                  | One query over the work order timestamps.                                                                                                          |
| Swagger                                        | Exists                   | New controllers only need the existing decorators.                                                                                                 |
| Dockerfile and Docker Compose                  | Exists                   | No change needed.                                                                                                                                  |
| Unit and integration tests                     | Exists as infrastructure | Each new phase adds its own.                                                                                                                       |
| 80 percent coverage on the critical domains    | Partially                | Coverage runs, thresholds are not configured.                                                                                                      |
| README with run instructions                   | Missing                  | Last phase.                                                                                                                                        |
| Architecture documentation                     | Missing                  | Overview, HLD, LLD per module, ADRs and C4 diagrams, in markdown and mermaid under `docs/`. See section 10.                                        |
| Database choice justification                  | Missing                  | Required explicitly by the challenge. Becomes ADR 0002, linked from the README.                                                                    |

## 4. Target modules

| Module                    | Context             | Aggregate                                        | Depends on                                                  |
| ------------------------- | ------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| `users` (exists)          | Identity & Access   | User                                             | extended with the document and the administration endpoints |
| `authentication` (exists) | Identity & Access   | Session                                          | extended with the pending flag and a global logout          |
| `authorization` (exists)  | Identity & Access   | Role, Group, Permission                          | extended with SUPER_ADMIN and the escalation rule           |
| `customers`               | Customer Management | Customer                                         | `users`, `authorization`                                    |
| `vehicles`                | Customer Management | Vehicle                                          | `customers`                                                 |
| `services`                | Workshop Catalog    | Service                                          | none                                                        |
| `inventory`               | Inventory           | InventoryItem with StockMovement and its history | none                                                        |
| `work-orders`             | Workshop Operations | WorkOrder with its items, budget and trail       | `customers`, `vehicles`, `services`, `inventory`, `users`   |

Five new modules. No module is created for Mechanic, Service advisor or Administrator, because a profile
with no state is a role, not an aggregate. See H28.

## 5. Implementation order

```text
Phase 0   Access catalog, Money and the identifier convention
Phase 1   Identifier retrofit on the existing schema
Phase 2   Person document, super administrator and user administration
Phase 3   Temporary password, forced change and global logout
Phase 4   Customers
Phase 5   Vehicles
Phase 6   Service catalog
Phase 7   Inventory, movements and history
Phase 8   Work order creation, items and trail
Phase 9   Diagnosis and budget
Phase 10  Approval and execution start
Phase 11  Part withdrawal and stock consumption
Phase 12  Completion, delivery, discount, cancellation and settlement
Phase 13  Customer tracking, metrics, coverage and README
```

Phases 1 to 3 come before any workshop module because all three change Identity & Access, and
every later phase builds on the shape they leave behind. Doing the retrofit after five new
modules exist would multiply the work by five.

Phases 8 to 12 split the Workshop Operations module along the work order lifecycle. They share
one module and one aggregate, and each adds transitions to the same state machine and entries
to the same trail.

---

## Phase 0: Access catalog, Money and the identifier convention

```text
Feature:            New permission codes, role grants, and the shared Money value object.
Business Goal:      Every workshop capability can be granted to the right role before any
                    endpoint exists.
Bounded Context:    Identity & Access (extension), shared kernel.
Aggregate:          none.
Commands:           none.
Events:             none.
Policies:           none.
Queries:            none.
Repositories:       none.
Dependencies:       none.
Database Changes:   One migration inserting the permission codes below, creating the
                    SUPER_ADMIN system role, and granting the role specific subsets.
API Changes:        none. The existing GET /api/v1/permissions starts listing the new codes.
Tests:              Unit, Money: should add two amounts, should multiply by a quantity, should
                    subtract a discount, should reject a negative amount, should reject a
                    fractional cent, should convert to and from the string PostgreSQL returns
                    for bigint.
                    Integration: should resolve the expected permission set for each seeded
                    role through TypeOrmEffectiveAccessReader, should give SUPER_ADMIN the two
                    permissions ADMIN does not have.
Risks:              The ADMIN grant in the existing seed was a CROSS JOIN executed once.
                    Permissions added later are not granted automatically, and forgetting the
                    explicit grant shows up as a 403 much later.
Prerequisites:      none.
```

| Code                              | SUPER_ADMIN | ADMIN | SERVICE_ADVISOR | MECHANIC | CUSTOMER |
| --------------------------------- | ----------- | ----- | --------------- | -------- | -------- |
| `roles:manage`                    | yes         | no    | no              | no       | no       |
| `users:manage`                    | yes         | yes   | no              | no       | no       |
| `user-access:manage`              | yes         | yes   | no              | no       | no       |
| `customers:read`                  | yes         | yes   | yes             | yes      | no       |
| `customers:manage`                | yes         | yes   | yes             | no       | no       |
| `vehicles:read`                   | yes         | yes   | yes             | yes      | no       |
| `vehicles:manage`                 | yes         | yes   | yes             | no       | no       |
| `services:read`                   | yes         | yes   | yes             | yes      | no       |
| `services:manage`                 | yes         | yes   | no              | no       | no       |
| `inventory:read`                  | yes         | yes   | yes             | yes      | no       |
| `inventory:manage`                | yes         | yes   | no              | no       | no       |
| `work-orders:read`                | yes         | yes   | yes             | yes      | no       |
| `work-orders:manage`              | yes         | yes   | yes             | no       | no       |
| `work-orders:execute`             | yes         | yes   | no              | yes      | no       |
| `work-orders:decide`              | yes         | yes   | yes             | no       | no       |
| `work-orders:cancel`              | yes         | yes   | yes             | no       | no       |
| `work-orders:cancel-in-execution` | yes         | yes   | no              | no       | no       |
| `work-orders:discount`            | yes         | yes   | no              | no       | no       |
| `work-orders:read-own`            | no          | no    | no              | no       | yes      |
| `work-orders:decide-own`          | no          | no    | no              | no       | yes      |
| `audit:read`                      | yes         | yes   | no              | no       | no       |
| `metrics:read`                    | yes         | yes   | yes             | no       | no       |

The existing `roles:read`, `permissions:read`, `users:read`, `user-access:read` and
`sessions:revoke-any` keep their current grants, with SUPER_ADMIN added to all of them.
`groups:read` and `groups:manage` are removed together with the group feature, see H33.
`inventory:replenish` does not exist as a separate permission: the mechanic does not replenish,
so replenishment folds into `inventory:manage`, which only the administrator holds. See H31.

`customers:read` and `customers:manage` guard the workshop endpoints over the customer record
and only reach users inside the customer scope. `users:manage` is the administrator
counterpart and reaches staff. `audit:read` covers the work order trail and the stock movement
history, which are audit reads rather than operational ones.

```text
Already exists:            Permission, Role and Group aggregates, the RBAC schema, the seed
                           migration pattern, PermissionsGuard, RequirePermissions, EntityId.
Needs extension:           AppPermission contract, SystemRole enum, the permission rows, the
                           role grants.
Needs new implementation:  src/shared/domain/value-objects/money.ts.
Must reuse:                The raw SQL migration style, ErrorKind, DomainError.
```

---

## Phase 1: Identifier retrofit on the existing schema

```text
Feature:            Every addressable table moves to an internal sequential key plus an
                    external UUID.
Business Goal:      One identifier rule across the whole system, with no enumerable key ever
                    leaving the process.
Bounded Context:    Identity & Access.
Aggregate:          none. The domain does not change, only what the repositories translate.
Commands:           none.
Events:             none.
Policies:           none.
Queries:            none new.
Repositories:       Every existing repository and mapper resolves external into internal.
Dependencies:       none.
Database Changes:   users, roles, permissions, groups, sessions and refresh_tokens: the current
                    uuid primary key becomes external_id uuid unique, and a new id bigserial
                    becomes the primary key. Every foreign key becomes bigint.
                    user_roles and role_permissions keep a composite primary key of the two
                    internal keys.
                    groups, user_groups, group_roles and group_permissions are not recreated.
                    The group feature is removed in this phase, see H33: the Group aggregate,
                    its errors, events, value objects, repository, seven commands, two queries,
                    ORM entities, controller and DTOs, roughly thirty five files, plus the two
                    group branches of TypeOrmEffectiveAccessReader, the two group events in
                    AccessCacheInvalidationSubscriber, and the group rows of the seed.
                    Recommended path: rewrite the initial migration
                    1787702400000-create-identity-and-access-schema.ts in place rather than
                    adding an ALTER migration. The repository has no commits and no deployed
                    database, so nobody has to migrate anything.
API Changes:        None visible. Routes keep carrying UUIDs, which are now the external ids.
                    ParseUUIDPipe keeps working unchanged.
Tests:              Integration: should read a user by its external id, should keep the foreign
                    key between a session and its user, should keep the refresh token self
                    reference, should resolve effective access across the join tables.
                    E2E: the existing authentication suite passes untouched, which is the real
                    proof that nothing external changed.
Risks:              The JWT carries the user external id, so tokens issued before the change
                    still resolve and no session is lost.
                    The refresh_tokens self referencing foreign key with DEFERRABLE INITIALLY
                    DEFERRED has to keep that behaviour after the type change.
                    scripts/seed-admin.ts and the integration tests insert rows with raw SQL
                    and reference uuid columns. Both need updating.
                    test/integration/effective-access.reader.spec.ts inserts groups and asserts
                    on them. Those cases are deleted with the feature, and the role only cases
                    stay as the regression net.
                    This phase changes tested, working code and delivers no visible feature. It
                    is reviewed against the existing e2e suite, not against new tests.
Prerequisites:      Phase 0.
```

```text
Already exists:            The whole identity schema, its migrations, its repositories and
                           mappers, and an e2e suite that covers the flows end to end.
Needs extension:           Every ORM entity, every mapper, every repository, the seed
                           migration, the admin seed script, the integration tests.
Needs new implementation:  nothing conceptual.
Must reuse:                The existing e2e suite as the regression net.
```

---

## Phase 2: Person document, super administrator and user administration

```text
Feature:            A mandatory CPF or CNPJ on every registration, a super administrator
                    created outside the API, and the endpoints that create and maintain staff.
Business Goal:      Everybody in the system is identified by document, and the workshop can
                    create its own service advisors and mechanics without touching the database.
Bounded Context:    Identity & Access.
Aggregate:          User (existing, extended), Role (existing, extended).
Commands:           Register User gains the document. Update User and Deactivate User are new.
                    Assign Role To User gains the escalation rule.
Events:             User Registered gains the document, User Updated, User Deactivated.
Policies:           none.
Queries:            Find User By Document, List Users filtered by role.
Repositories:       UserRepository gains findByDocument and existsByDocument. A new
                    UserQueryPort serves the listings.
Dependencies:       Phase 1.
Database Changes:   Column on users: document varchar(14) not null.
                    Partial unique index on document where deleted_at is null.
                    Migration creating the SUPER_ADMIN role happened in phase 0. This phase
                    adds nothing to the role tables.
API Changes:        POST /api/v1/users gains a mandatory document field. It stays public,
                    stays the self sign up, and keeps assigning only the CUSTOMER role. This
                    is a breaking contract change with no deployed consumer.
                    PATCH /api/v1/users/me, so anybody can fix their own personal data with no
                    workshop permission, scoped to the authenticated principal.
                    GET /api/v1/users with a role filter, behind users:read.
                    POST, PATCH and DELETE /api/v1/users/{externalId} behind users:manage, for
                    the administrator to create and maintain service advisors, mechanics and other
                    administrators. Creation accepts the roles and dispatches the existing
                    AssignRoleToUserCommand.
                    Role assignment stays where it already is:
                    PUT and DELETE /api/v1/users/{userId}/roles/{roleId} behind
                    user-access:manage, now refusing SUPER_ADMIN always and refusing ADMIN
                    unless the actor holds SUPER_ADMIN.
Tests:              Unit, PersonDocument: should accept a valid CPF, should accept a valid
                    CNPJ, should reject wrong check digits, should reject a repeated digit
                    sequence, should normalise a formatted document, should reject a document
                    of the wrong length.
                    Unit, handler: should register a user with a document, should not register
                    a user without a document, should not register a user with a document
                    already in use, should update one's own personal data, should not update
                    somebody else's data without a permission, should create a staff user with
                    the given roles, should deactivate a user.
                    Unit, escalation: should never assign SUPER_ADMIN, should assign ADMIN when
                    the actor holds SUPER_ADMIN, should refuse to assign ADMIN when the actor
                    is only ADMIN, should assign SERVICE_ADVISOR and MECHANIC as ADMIN.
                    Integration: should reject a duplicated document at the database level,
                    should find a user by document, should list users filtered by role.
                    E2E: should create a mechanic as an administrator, should return 403 when
                    an administrator tries to grant ADMIN, should let a user edit their own
                    data with no workshop permission, should return 409 for a duplicated
                    document.
Risks:              CPF and CNPJ validation gets copied from the internet with subtle bugs. The
                    check digit algorithm needs its own tests with known documents.
                    scripts/seed-admin.ts creates the first account with raw SQL and now needs
                    a valid document and the SUPER_ADMIN role. The README documents how.
                    The existing e2e suite posts to /api/v1/users without a document and will
                    fail until it is updated. That failure is the signal that the contract
                    changed, not a regression.
                    The escalation rule is the security rule of this phase. Without it, any
                    administrator promotes themselves to super administrator.
Prerequisites:      Phase 1.
```

```text
Already exists:            The User aggregate, Email, RegisterUserCommand with the CUSTOMER
                           role assignment, AssignRoleToUserCommand, UserRepository, the
                           guards, the error filter, the SystemRole enum.
Needs extension:           The users module (document, update, deactivate, listings), the
                           authorization module (the escalation rule in the assignment
                           handler).
Needs new implementation:  PersonDocument, UserQueryPort and its adapter, the migration.
Must reuse:                RegisterUserCommand and AssignRoleToUserCommand rather than second
                           paths. There is no Mechanic, Service advisor or Administrator aggregate: a
                           profile is a role on a user and the machinery is already built.
```

---

## Phase 3: Temporary password, forced change and global logout

```text
Feature:            An account created by staff carries a temporary password and can do
                    nothing until it is replaced. A logout ends every session.
Business Goal:      The counter creates an account without inventing a shared password, and
                    signing out means signing out everywhere.
Bounded Context:    Identity & Access.
Aggregate:          User (existing), Session (existing).
Commands:           Change Password. Register User gains the temporary password option.
                    Logout changes meaning.
Events:             Password Changed.
Policies:           WHEN a password is changed THEN revoke every session of that user.
Queries:            none new.
Repositories:       UserRepository and SessionRepository, unchanged in shape.
Dependencies:       Phase 2.
Database Changes:   Column on users: must_change_password boolean not null default false.
API Changes:        POST /api/v1/users/me/password, taking the current and the new password.
                    DELETE /api/v1/auth/sessions revokes every active session and becomes the
                    single logout. DELETE /api/v1/auth/sessions/current is dropped.
                    DELETE /api/v1/auth/sessions/{externalId} stays for staff holding
                    sessions:revoke-any.
                    Every other authenticated route answers 403 with a dedicated code while the
                    pending flag is set.
Tests:              Unit: should change the password and clear the flag, should reject a wrong
                    current password, should reject a weak new password, should revoke every
                    session after the change.
                    Unit, guard: should let the password change through while the flag is set,
                    should let the logout through, should refuse every other route, should let
                    everything through once the flag is clear.
                    E2E: should refuse a customer listing for an account with a pending
                    password, should allow it after the change, should invalidate the old token
                    after the change, should end a session opened on another device when the
                    user logs out.
Risks:              The flag has to reach the guard without a database read per request. The
                    recommended path is a claim in the access token, which is consistent with
                    revoking the sessions on change so the stale claim cannot outlive it.
                    The guard is global and runs on every route, so the exemption decorator has
                    to be right or the system locks itself out.
                    Making logout global changes an endpoint that already has e2e coverage. The
                    existing test for logging out one device is rewritten.
                    The temporary password is returned once in the creation response. It must
                    be added to the pino redaction paths and must never reach a log.
Prerequisites:      Phase 2.
```

```text
Already exists:            User.changePassword on the aggregate, Password and PasswordHash,
                           Argon2PasswordHasher, LogoutAllSessionsCommand, JwtAuthGuard, the
                           Public decorator pattern, the Redis revocation store.
Needs extension:           The users module, the authentication module, app.module.ts.
Needs new implementation:  ChangePasswordCommand and its handler, the pending password guard
                           and its exemption decorator.
Must reuse:                LogoutAllSessionsCommand rather than a second revocation path.
```

---

## Phase 4: Customers

```text
Feature:            The customer record, over a user identity, carrying the workshop data.
Business Goal:      The workshop keeps what it knows about the people it serves without
                    inflating the identity module.
Bounded Context:    Customer Management.
Aggregate:          Customer.
Commands:           Register Customer, Update Customer, Deactivate Customer.
Events:             Customer Registered, Customer Updated, Customer Deactivated.
Policies:           none.
Queries:            Find Customer By Document, List Customers, Get Customer.
Repositories:       CustomerRepository (write), CustomerQueryPort (read).
Dependencies:       users, through RegisterUserCommand and FindUserByDocumentQuery.
                    authorization, to check the CUSTOMER role.
Database Changes:   Table customers: id bigserial pk, external_id uuid unique,
                    user_id bigint not null unique references users(id),
                    address_street varchar(160) null, address_number varchar(20) null,
                    address_complement varchar(60) null, address_district varchar(80) null,
                    address_city varchar(80) null, address_state char(2) null,
                    address_zip_code varchar(8) null, phone varchar(20) null,
                    status varchar(20) CHECK (ACTIVE, INACTIVE),
                    created_at, updated_at, deleted_at.
API Changes:        POST /api/v1/customers, which accepts an existing userId or the data to
                    create the account in the same transaction.
                    GET /api/v1/customers, GET /api/v1/customers?document=,
                    GET /api/v1/customers/{externalId},
                    PATCH /api/v1/customers/{externalId},
                    DELETE /api/v1/customers/{externalId}.
                    All behind customers:read or customers:manage, except that a customer can
                    read and update their own record with no workshop permission.
Tests:              Unit, Address: should accept a complete address, should accept an empty
                    address, should reject an invalid state code, should reject a malformed zip
                    code, should normalise the zip code to digits.
                    Unit, PhoneNumber: should accept a mobile number with nine digits, should
                    accept a landline with eight, should reject a number without an area code,
                    should normalise a formatted number to digits.
                    Unit, handler: should register a customer over an existing user, should
                    register a customer and create the account at the counter, should not
                    register a customer for a user that already has one, should not register a
                    customer for a user without the CUSTOMER role, should update the address,
                    should deactivate a customer, should let a customer update their own
                    record.
                    Integration: should reject a second customer for the same user at the
                    database level, should find a customer by the document held on the user
                    record.
                    E2E: should register a customer as a service advisor, should find them by document,
                    should return 403 without customers:manage, should return 409 when the user
                    already has a customer record.
Risks:              Finding a customer by document crosses a module boundary, because the
                    document lives on the user record. Use a QueryBus call to
                    FindUserByDocumentQuery and then load the customer by userId, rather than
                    joining the two tables from the customers module.
                    Creating the user and the customer in one act spans two modules and has to
                    share one transaction, otherwise a failed customer insert leaves an orphan
                    account.
Prerequisites:      Phase 3.
```

```text
Already exists:            RegisterUserCommand, the guards, the error filter, the validation
                           pipe, EntityId, AggregateRoot, the cross module CommandBus pattern.
Needs extension:           nothing in users beyond what phase 2 delivered.
Needs new implementation:  The customers module, the Customer aggregate, Address, the
                           repository and query port, the migration.
Must reuse:                RegisterUserCommand rather than a second user creation path.
```

---

## Phase 5: Vehicles

```text
Feature:            Vehicle registry attached to a customer.
Business Goal:      The workshop knows which vehicle it is working on and who owns it.
Bounded Context:    Customer Management.
Aggregate:          Vehicle.
Commands:           Register Vehicle, Update Vehicle, Remove Vehicle.
Events:             Vehicle Registered, Vehicle Updated, Vehicle Removed.
Policies:           none.
Queries:            List Vehicles, Get Vehicle.
Repositories:       VehicleRepository (write), VehicleQueryPort (read).
Dependencies:       customers, through GetCustomerQuery on the QueryBus.
Database Changes:   Table vehicles: id bigserial pk, external_id uuid unique,
                    customer_id bigint references customers(id), plate varchar(7),
                    brand varchar(60), model varchar(60), year smallint,
                    created_at, updated_at, deleted_at.
                    Partial unique index on plate where deleted_at is null.
                    Index on customer_id.
API Changes:        POST /api/v1/vehicles, GET /api/v1/vehicles,
                    GET /api/v1/vehicles/{externalId}, PATCH, DELETE,
                    GET /api/v1/customers/{externalId}/vehicles,
                    GET /api/v1/vehicles/me for the customer to list their own vehicles,
                    declared before the {externalId} route and scoped to the authenticated
                    principal with no workshop permission.
Tests:              Unit, LicensePlate: should accept the old format AAA0000, should accept the
                    Mercosul format AAA0A00, should normalise lower case and separators, should
                    reject an invalid plate.
                    Unit, handler: should register a vehicle, should not register a vehicle for
                    an unknown customer, should not register a vehicle for a deactivated
                    customer, should not register a duplicated license plate, should not
                    register a vehicle with an implausible year.
                    Integration: should persist and reload a vehicle, should reject a
                    duplicated plate at the database level.
                    E2E: should register a vehicle and list it under its customer, should
                    return 409 for a duplicated plate, should let a customer list only their own
                    vehicles, should return an empty list for a customer with none.
Risks:              Plate normalisation has to happen before the uniqueness check.
                    The foreign key carries the internal customer id while the request carries
                    the external one, so the repository resolves it on every write.
Prerequisites:      Phase 4.
```

```text
Already exists:            The module scaffolding pattern, the cross module QueryBus pattern.
Needs extension:           nothing.
Needs new implementation:  The vehicles module, the Vehicle aggregate, LicensePlate,
                           VehicleYear, the migration.
Must reuse:                GetCustomerQuery instead of injecting the customer repository.
```

---

## Phase 6: Service catalog

```text
Feature:            Catalog of the services the workshop offers.
Business Goal:      Work orders are priced from a maintained catalog instead of typed prices.
Bounded Context:    Workshop Catalog.
Aggregate:          Service.
Commands:           Create Service, Update Service, Deactivate Service.
Events:             Service Created, Service Updated, Service Deactivated.
Policies:           none.
Queries:            List Services, Get Service.
Repositories:       ServiceRepository (write), ServiceQueryPort (read).
Dependencies:       Money from the shared kernel.
Database Changes:   Table services: id bigserial pk, external_id uuid unique,
                    name varchar(120), description varchar(255) null,
                    price_cents bigint CHECK (>= 0), estimated_duration_minutes integer
                    CHECK (> 0), status varchar(20) CHECK (ACTIVE, INACTIVE),
                    created_at, updated_at.
                    Partial unique index on name where status = 'ACTIVE'.
API Changes:        POST /api/v1/services, GET /api/v1/services,
                    GET /api/v1/services/{externalId}, PATCH, DELETE.
Tests:              Unit: should create a service, should not create a service with a negative
                    price, should not create a service with a zero duration, should not create
                    a service with a name already in use, should deactivate a service.
                    Integration: should persist a price in cents and reload the same value.
                    E2E: should create a service as an administrator, should return 403 for a
                    service advisor trying to create a service.
Risks:              TypeORM returns bigint as a string. The mapper converts explicitly.
Prerequisites:      Phase 0.
```

```text
Already exists:            The module scaffolding pattern, the guards, the error mapping.
Needs extension:           nothing.
Needs new implementation:  The services module, the Service aggregate, ServiceDuration, the
                           migration.
Must reuse:                Money from the shared kernel.
```

---

## Phase 7: Inventory, movements and history

```text
Feature:            Parts and supplies as one stock, with an append only movement ledger and a
                    traceable history of what happened to each movement.
Business Goal:      The workshop knows what it has, and every unit that leaves says which work
                    order took it, who took it, and whether that is settled.
Bounded Context:    Inventory.
Aggregate:          InventoryItem, owning StockMovement and StockMovementEvent as append only
                    children.
Commands:           Create Inventory Item, Update Inventory Item, Replenish Stock, Adjust Stock.
Events:             Inventory Item Created, Inventory Item Updated, Stock Replenished,
                    Stock Adjusted.
Policies:           none in this phase. Consumption, settlement, transfer and write off are
                    wired in phases 11 and 12.
Queries:            List Inventory Items (filterable by kind), Get Inventory Item,
                    Get Item Movement History, List Stock Shortages.
Repositories:       InventoryItemRepository (write), InventoryQueryPort (read).
Dependencies:       Money from the shared kernel.
Database Changes:   Table inventory_items: id bigserial pk, external_id uuid unique,
                    sku varchar(40), name varchar(120), description varchar(255) null,
                    kind varchar(10) CHECK (PART, SUPPLY),
                    unit_price_cents bigint CHECK (>= 0),
                    quantity_on_hand integer CHECK (>= 0),
                    status varchar(20) CHECK (ACTIVE, INACTIVE), created_at, updated_at.
                    Partial unique index on sku where status = 'ACTIVE'.
                    Table stock_movements: id bigserial pk, external_id uuid unique,
                    inventory_item_id bigint references inventory_items(id),
                    kind varchar(20) CHECK (INBOUND, CONSUMPTION, RETURN, ADJUSTMENT),
                    undoes_movement_id bigint null references stock_movements(id),
                    quantity integer CHECK (> 0), unit_price_cents bigint,
                    work_order_id bigint null,
                    status varchar(20) CHECK (PENDING, SETTLED, WRITTEN_OFF) null, set on a
                    consumption only,
                    occurred_at timestamptz, actor_user_id bigint, note varchar(255) null.
                    Table stock_movement_transitions: id bigserial pk, external_id uuid unique,
                    stock_movement_id bigint references stock_movements(id),
                    from_status varchar(20) null, to_status varchar(20),
                    from_work_order_id bigint null, to_work_order_id bigint null,
                    actor_user_id bigint null, occurred_at timestamptz, note varchar(255) null.
                    Indexes on stock_movements (inventory_item_id, occurred_at) and
                    (work_order_id, status), and on stock_movement_transitions (stock_movement_id).
API Changes:        POST /api/v1/inventory-items, GET /api/v1/inventory-items,
                    GET /api/v1/inventory-items/{externalId}, PATCH,
                    POST /api/v1/inventory-items/{externalId}/replenishments,
                    POST /api/v1/inventory-items/{externalId}/adjustments,
                    GET /api/v1/inventory-items/shortages behind inventory:read, declared
                    before the {externalId} route so it is not parsed as an id,
                    GET /api/v1/inventory-items/{externalId}/movements behind audit:read.
Tests:              Unit: should create a part, should create a supply, should replenish the
                    stock and record an inbound movement, should adjust the stock down with a
                    mandatory note, should not let the unit count go negative, should reject a
                    zero or negative movement quantity, should append a history entry on every
                    status change, should never delete a movement.
                    Integration: should persist a movement together with the new unit count in
                    one transaction, should refuse a negative count at the database level,
                    should return the full history of one item in order.
                    Unit, shortages: should list an item whose pending withdrawals exceed the
                    count on hand, should ignore demand from work orders that are not in
                    execution, should ignore an item with enough stock, should name the work
                    orders waiting on it.
                    E2E: should replenish stock as an administrator, should return 403 for a
                    mechanic trying to replenish, should list the movement history of an item,
                    should list the shortages after a refused withdrawal.
Risks:              Two concurrent movements on the same item can both read the same count. The
                    write runs inside a transaction with a row lock, and the CHECK constraint
                    is the backstop.
                    The movement carries work_order_id, and work_orders does not exist until
                    phase 8. Leave the column unconstrained here and add the foreign key in the
                    phase 8 migration.
                    An aggregate that owns an unbounded append only collection cannot load it
                    all on every write. The repository loads the item with its pending
                    movements only, and the full history is a read model.
Prerequisites:      Phase 0.
```

```text
Already exists:            The module and repository patterns, RuleViolation error mapping, the
                           Session aggregate with child entities as the shape to copy.
Needs extension:           nothing.
Needs new implementation:  The inventory module, the InventoryItem aggregate, StockMovement,
                           StockMovementEvent, StockQuantity, Sku, the migration.
Must reuse:                Money, and ErrorKind.RuleViolation for insufficient stock.
```

---

## Phase 8: Work order creation, items and trail

```text
Feature:            Opening a work order, recording the requested services and planned parts,
                    and the append only trail that every later phase feeds.
Business Goal:      Everything about one visit lives in one record with a number the workshop
                    can say out loud, and the administration can answer who did each step.
Bounded Context:    Workshop Operations.
Aggregate:          WorkOrder, with WorkOrderServiceItem, WorkOrderPartItem and WorkOrderEvent
                    as children.
Commands:           Create Work Order, Add Requested Service, Plan Part,
                    Remove Work Order Item, Assign Mechanic.
Events:             Work Order Created, Service Added To Work Order,
                    Part Planned For Work Order, Item Removed From Work Order,
                    Mechanic Assigned.
Policies:           none. The trail is not a policy: WorkOrderRepository.save writes one
                    work_order_events row per recorded domain event, inside the same transaction
                    that persists the aggregate, and the handler keeps publishing those events on
                    the bus afterwards for whoever else listens.
Queries:            List Work Orders, Get Work Order, Get Work Order Trail.
Repositories:       WorkOrderRepository (write), WorkOrderQueryPort (read).
Dependencies:       customers, vehicles, services, inventory and users through the QueryBus.
Database Changes:   Table work_orders: id bigserial pk, external_id uuid unique,
                    number varchar(11) unique, customer_id bigint references customers(id),
                    vehicle_id bigint references vehicles(id),
                    assigned_mechanic_user_id bigint null references users(id),
                    created_by_user_id bigint references users(id),
                    status varchar(20) CHECK over the seven states,
                    customer_name varchar(120), vehicle_plate varchar(7),
                    vehicle_brand varchar(60), vehicle_model varchar(60),
                    vehicle_year smallint,
                    created_at, updated_at, plus the lifecycle columns of later phases.
                    Table work_order_services and table work_order_parts as before, each with
                    id bigserial, external_id uuid, the snapshot columns, and
                    withdrawn_quantity integer not null default 0 on the parts.
                    Table work_order_events: id bigserial pk, external_id uuid unique,
                    work_order_id bigint references work_orders(id),
                    event_type varchar(40), from_status varchar(20) null,
                    to_status varchar(20) null, actor_user_id bigint null,
                    occurred_at timestamptz, note varchar(255) null.
                    Partial unique index on vehicle_id where the status is not terminal.
                    Index on work_order_events (work_order_id, occurred_at).
                    Foreign key from stock_movements.work_order_id to work_orders(id).
API Changes:        POST /api/v1/work-orders, GET /api/v1/work-orders,
                    GET /api/v1/work-orders/{number},
                    GET /api/v1/work-orders/{number}/trail behind audit:read,
                    POST /api/v1/work-orders/{number}/services,
                    POST /api/v1/work-orders/{number}/parts,
                    DELETE /api/v1/work-orders/{number}/items/{itemExternalId},
                    PUT /api/v1/work-orders/{number}/mechanic.
Tests:              Unit: should create a work order with a number in the A1B090-2026 format,
                    should record who created it, should not create a work order for a
                    deactivated customer, should not create a work order for a vehicle that
                    belongs to somebody else, should not create a second active work order for
                    the same vehicle, should add a requested service, should not add a
                    deactivated service, should plan a part without touching the stock, should
                    not plan a zero quantity, should remove an item, should assign a mechanic,
                    should not assign a user without the MECHANIC role.
                    Unit, trail: should append an entry for every event with its actor, should
                    never update an existing entry, should leave the recorded events available to
                    the publisher after the repository read them.
                    Integration, trail: should write the aggregate and its trail rows in one
                    transaction, should leave no trail row behind when the transaction rolls
                    back.
                    Integration: should persist a work order with its items and reload the same
                    totals, should reject a second active work order for the same vehicle at
                    the database level, should retry the number generation on a collision,
                    should return the trail in chronological order.
                    E2E: should create a work order as a service advisor, should return 403 without
                    work-orders:manage, should return 409 when the vehicle already has an
                    active work order, should return the trail to an administrator and 403 to
                    a service advisor.
Risks:              The partial unique index on vehicle_id has to list exactly the non terminal
                    states.
                    The number generator needs a retry loop around the unique violation.
                    Writing the trail inside save means AggregateRoot needs a read that does
                    not drain. Today `pullDomainEvents` empties the list, and the publisher still
                    needs it to. Add a `domainEvents` getter next to it and leave the existing
                    method alone, so nothing that already calls it changes.
                    Every work order domain event has to carry the acting user, because the trail
                    row needs it. That touches every event class of the module, and it would be
                    needed the same way if the trail were a subscriber.
                    The trail is written from the event class name. A rename of an event class
                    silently changes what lands in `event_type`, so the mapping deserves an
                    explicit constant rather than `constructor.name` if the team renames often.
Prerequisites:      Phases 4, 5, 6 and 7.
```

```text
Already exists:            The CQRS wiring, the event bus, the subscriber pattern, the guards,
                           the aggregate base class with child entities.
Needs extension:           nothing.
Needs new implementation:  The work-orders module, the WorkOrder aggregate, WorkOrderStatus,
                           WorkOrderNumber, the item entities, the trail written by the
                           repository, the migration.
Must reuse:                QueryBus for cross context reads, Money for the item prices, and the
                           events the aggregate already records rather than a second write path
                           built by hand in each handler.
```

---

## Phase 9: Diagnosis and budget

```text
Feature:            Diagnosis and automatic budget generation, in numbered rounds.
Business Goal:      The customer receives a price built from what the vehicle actually needs,
                    frozen at the moment it was quoted.
Bounded Context:    Workshop Operations.
Aggregate:          WorkOrder, with Budget as a child entity.
Commands:           Start Diagnosis, Complete Diagnosis.
Events:             Diagnosis Started, Diagnosis Completed, Budget Generated, Budget Sent.
Policies:           WHEN Budget Sent THEN record that the budget went out. Plus the trail.
Queries:            Get Work Order returns the budget once it exists.
Repositories:       The ones from phase 8.
Dependencies:       Phase 8.
Database Changes:   Columns on work_orders: diagnosis_started_at, diagnosis_completed_at.
                    Table work_order_budgets: id bigserial pk, external_id uuid unique,
                    work_order_id bigint references work_orders(id), round integer,
                    total_cents bigint,
                    status varchar(20) CHECK (PENDING, APPROVED, REJECTED),
                    generated_at timestamptz, decided_at timestamptz null,
                    decided_by_user_id bigint null.
                    Unique index on (work_order_id, round).
                    Columns on the item tables: budget_id bigint references
                    work_order_budgets(id) null while the round is a draft, and
                    budgeted_unit_price_cents bigint null, set when the round is generated. It
                    is the only price ever charged for that item.
API Changes:        POST /api/v1/work-orders/{number}/diagnosis,
                    POST /api/v1/work-orders/{number}/diagnosis/completion.
Tests:              Unit: should start the diagnosis and move to IN_DIAGNOSIS, should assign
                    the acting mechanic when there is none, should not start the diagnosis
                    twice, should complete the diagnosis and generate a budget, should not
                    complete the diagnosis without items, should compute the budget total as
                    the sum of the service and part items, should freeze the catalog price at
                    generation, should keep the budget total unchanged after a later catalog
                    price change in either direction, should move to AWAITING_APPROVAL, should
                    not add items after the diagnosis is completed, should replace the budget
                    when the diagnosis is completed again after a rejection.
                    Integration: should persist the budget total in cents.
                    E2E: should walk a work order from RECEIVED to AWAITING_APPROVAL, should
                    return 422 when completing an empty diagnosis.
Risks:              The total has to be computed by the aggregate. Accepting a total from the
                    request body makes every later assertion meaningless.
Prerequisites:      Phase 8.
```

```text
Already exists:            The domain event and subscriber mechanism, the trail from phase 8.
Needs extension:           The WorkOrder aggregate and its migration.
Needs new implementation:  The Budget entity, the transition rules, the budget subscriber.
Must reuse:                AggregateRoot.record and pullDomainEvents.
```

---

## Phase 10: Approval and execution start

```text
Feature:            The customer decision on the budget, and the automatic move into execution.
Business Goal:      Work only starts on what the customer agreed to pay for.
Bounded Context:    Workshop Operations.
Aggregate:          WorkOrder.
Commands:           Approve Budget, Reject Budget, Start Execution.
Events:             Budget Approved, Budget Rejected, Execution Started.
Policies:           WHEN Budget Approved THEN Start Execution. Plus the trail.
Queries:            none new.
Repositories:       The ones from phase 8.
Dependencies:       Phase 9.
Database Changes:   Columns on work_orders: budget_decided_at timestamptz null,
                    budget_decided_by_user_id bigint null, execution_started_at timestamptz
                    null.
API Changes:        POST /api/v1/work-orders/{number}/budget/approval,
                    POST /api/v1/work-orders/{number}/budget/rejection.
Tests:              Unit: should approve a budget and start the execution, should record who
                    decided, should let a service advisor decide on the customer's behalf, should not
                    let a customer approve another customer's work order, should not approve
                    outside AWAITING_APPROVAL, should reject a budget and send the work order
                    back to IN_DIAGNOSIS, should allow a new budget after a rejection, should
                    not start execution without approval.
                    Unit, supplementary: should add an item to the draft round during
                    execution, should not touch an item of a decided round, should submit a
                    supplementary budget and return the work order to AWAITING_APPROVAL, should
                    not submit an empty draft, should widen the scope when the customer approves
                    the round, should return to execution with the previous scope when the
                    customer refuses it, should never charge an item of a refused round, should
                    not withdraw a part whose round is still pending.
                    Integration: should persist the decision and the execution timestamp, should
                    persist one row per round with its own decision, should reject a duplicated
                    round number for the same work order.
                    E2E: should let the owning customer approve and see IN_EXECUTION, should
                    return 404 when a customer approves a work order that is not theirs, should
                    let a service advisor approve with work-orders:decide, should walk a full
                    supplementary cycle from execution back to execution, should show every round
                    decision in the trail.
Risks:              The ownership check has to answer 404 rather than 403, otherwise the API
                    confirms that a work order number exists.
                    Resolving the customer from the principal now goes through the customers
                    module, since the work order points at a customer rather than at a user.
Prerequisites:      Phase 9.
```

```text
Already exists:            The ownership check pattern (RevokeSessionHandler), CurrentUser,
                           Principal.
Needs extension:           The WorkOrder aggregate.
Needs new implementation:  The approval, rejection and execution transitions, the budget round
                           entity, the supplementary submission, and the rule that a part is only
                           withdrawable once its own round was approved.
Must reuse:                ErrorKind.RuleViolation for illegal transitions.
```

---

## Phase 11: Part withdrawal and stock consumption

```text
Feature:            The mechanic takes the parts out of stock as they are installed.
Business Goal:      The stock reflects reality at the moment the part is used, and every unit
                    that leaves says which work order and which mechanic took it.
Bounded Context:    Workshop Operations, with a write into Inventory.
Aggregate:          WorkOrder, and InventoryItem on the other side of the command.
Commands:           Withdraw Part, Return Part, Consume Stock and Restore Stock (Inventory).
Events:             Part Withdrawn, Part Returned, Stock Consumed, Stock Restored,
                    Insufficient Stock Detected.
Policies:           WHEN Part Withdrawn THEN Consume Stock, as a cross context command that can
                    fail the caller. Plus the trail.
Queries:            Get Work Order shows planned against withdrawn quantities.
Repositories:       The ones from phases 7 and 8.
Dependencies:       Phases 7 and 10.
Database Changes:   None beyond the columns created in phases 7 and 8.
API Changes:        POST /api/v1/work-orders/{number}/withdrawals, taking a list of parts and
                    quantities so several parts are registered in one call. The batch is about
                    the number of calls, not about postponing to the end: the mechanic registers
                    when the parts leave the shelf, because that is when a shortage can still be
                    solved.
                    POST /api/v1/work-orders/{number}/returns, same shape, for parts that turned
                    out unnecessary.
Tests:              Unit: should withdraw a planned part and decrease the stock, should record
                    a pending movement carrying the work order and the acting mechanic, should
                    charge the budgeted price when the catalog price rose, should charge the
                    budgeted price when the catalog price fell, should not withdraw more than
                    the planned quantity, should not withdraw a part that was never planned,
                    should not withdraw outside IN_EXECUTION, should refuse the withdrawal and
                    leave the stock untouched when the count is short, should allow a partial
                    withdrawal across several calls up to the planned quantity, should register
                    several parts in one call, should fail the whole batch when one part is
                    short.
                    Unit, return: should return a withdrawn part and put the units back, should
                    append a RETURN movement pointing at the consumption it undoes, should never
                    edit the original consumption, should not return more than was withdrawn,
                    should not return outside IN_EXECUTION, should drop the returned part from
                    the charged total.
                    Integration: should decrease the count, insert the movement and update the
                    work order item in one transaction, should leave all three untouched when
                    the withdrawal fails.
                    E2E: should withdraw a part as the assigned mechanic, should return 422 on
                    insufficient stock, should let the mechanic replenish and then withdraw,
                    should show the withdrawal in both the trail and the movement history.
Risks:              This is the write that spans two modules and two aggregates. Both have to
                    share a transaction.
                    The catalog price at withdrawal time is read for the movement record only.
                    It never changes what the work order charges.
Prerequisites:      Phases 7 and 10.
```

```text
Already exists:            The cross module CommandBus call (RegisterUserHandler dispatching
                           AssignRoleToUserCommand).
Needs extension:           The WorkOrder and InventoryItem aggregates.
Needs new implementation:  The withdrawal transition and the consumption command.
Must reuse:                ErrorKind.RuleViolation for insufficient stock.
```

---

## Phase 12: Completion, delivery, discount, cancellation and settlement

```text
Feature:            Closing the work order, in the two ways it can end, and what happens to the
                    parts in each.
Business Goal:      The workshop records the handover, the extra work discovered mid job has a
                    defined path, and a loss is visible as a loss.
Bounded Context:    Workshop Operations, with writes into Inventory.
Aggregate:          WorkOrder, and InventoryItem for the movement status.
Commands:           Apply Discount, Complete Work Order, Deliver Vehicle, Cancel Work Order,
                    which checks work-orders:cancel-in-execution inside the handler once the
                    state is known, the same way RevokeSessionHandler checks
                    sessions:revoke-any,
                    Settle Stock Movements, Write Off Stock Movements.
Events:             Discount Applied, Work Order Completed, Vehicle Delivered,
                    Work Order Canceled, Stock Movements Settled,
                    Stock Movements Written Off.
Policies:           WHEN Vehicle Delivered THEN Settle Stock Movements.
                    WHEN Work Order Canceled THEN Write Off Stock Movements. There is no
                    successor case: extra work is authorised in place since revision 8.
                    Plus the trail.
Queries:            List Work Orders gains the cancelled ones.
Repositories:       The ones from phases 7 and 8.
Dependencies:       Phase 11.
Database Changes:   Columns on work_orders: charged_total_cents bigint null,
                    discount_cents bigint not null default 0, discount_note varchar(255) null,
                    discount_applied_by_user_id bigint null, discount_applied_at timestamptz
                    null, completed_at timestamptz null, delivered_at timestamptz null,
                    delivered_by_user_id bigint null, canceled_at timestamptz null,
                    canceled_by_user_id bigint null, cancellation_reason varchar(255) null.
API Changes:        POST /api/v1/work-orders/{number}/discount,
                    POST /api/v1/work-orders/{number}/completion,
                    POST /api/v1/work-orders/{number}/delivery,
                    POST /api/v1/work-orders/{number}/cancellation, with a mandatory reason.
Tests:              Unit: should complete a work order in execution, should compute the charged
                    total from the withdrawn parts only, should not charge a planned part that
                    was never withdrawn, should apply a discount with a mandatory reason,
                    should reject a discount without a reason, should reject a discount larger
                    than the charged total, should reject a discount from a user without
                    work-orders:discount, should reject a discount before execution starts,
                    should reject a discount after delivery, should record who applied it,
                    should deliver a completed work order, should settle the pending movements
                    on delivery, should not deliver a work order that is not completed, should
                    cancel from RECEIVED, IN_DIAGNOSIS and AWAITING_APPROVAL as a service
                    advisor, should not let a service advisor cancel a work order in execution
                    and should fail with WORK_ORDER_CANCEL_IN_EXECUTION_FORBIDDEN, should let an
                    administrator cancel a work order in execution,
                    should not cancel a completed or delivered work order, should write off the
                    pending movements on cancellation, should not return units to stock on a
                    write off,
                    should refuse every command on a cancelled work order.
                    Integration: should keep the unit count unchanged on a write off, should
                    append a history entry for every status change.
                    E2E: should walk the full flow from creation to delivery, should cancel a
                    work order in execution as an administrator and see the parts written off,
                    should show the written off movements in the item history, should show
                    every actor in the trail.
Risks:              The write off is the only place where stock leaves without anyone paying for
                    it. Getting it wrong hides a loss.
                    The elevated cancellation check cannot live in the guard, because the guard
                    runs before the work order is loaded and the rule depends on its state. It
                    belongs in the handler, and the refusal has to carry
                    WORK_ORDER_CANCEL_IN_EXECUTION_FORBIDDEN with a message naming the loss, so
                    the counter knows to call an administrator instead of assuming a bug.
                    The charged total is computed at completion and must not drift from the sum
                    of the lines.
Prerequisites:      Phase 11.
```

```text
Already exists:            The cross module command pattern, the domain event mechanism.
Needs extension:           The WorkOrder and InventoryItem aggregates.
Needs new implementation:  The completion, delivery, discount and cancellation transitions, the
                           movement settlement, transfer and write off.
Must reuse:                The transaction handling from phase 11.
```

---

## Phase 13: Customer tracking, metrics, coverage and README

```text
Feature:            The customer follows their own work orders, the administration reads the
                    average execution time, and the project is runnable by anyone.
Business Goal:      The customer stops calling to ask where the car is, and the workshop can
                    see how long its work actually takes.
Bounded Context:    Workshop Operations.
Aggregate:          none. These are read models.
Commands:           none.
Events:             none.
Policies:           none.
Queries:            Get My Work Orders, Get My Work Order, Get Average Execution Time.
Repositories:       WorkOrderQueryPort extended with the customer scoped reads, and a metrics
                    query port running the aggregation in SQL.
Dependencies:       Phase 12.
Database Changes:   None. An index on work_orders (status, completed_at) if the metric gets
                    slow, which is unlikely at this size.
API Changes:        GET /api/v1/work-orders/me,
                    GET /api/v1/work-orders/me/{number},
                    GET /api/v1/work-orders/metrics/average-execution-time, with optional
                    service and date range filters.
Tests:              Unit: should return zero when no work order has been completed, should
                    average only completed and delivered work orders, should ignore work orders
                    still in execution, should ignore cancelled work orders.
                    Integration: should compute the average over seeded work orders with known
                    timestamps.
                    E2E: should let a customer list only their own work orders, should return
                    404 when a customer reads a work order belonging to somebody else, should
                    return 401 without a token, should return an empty list for a user with no
                    customer record, should return the metric for an administrator, should
                    return 403 without metrics:read.
Risks:              Route order. GET /work-orders/me has to be declared before
                    GET /work-orders/{number}, the same way UsersController declares me before
                    the id route.
                    Attributing one elapsed time to several services is an approximation and
                    the response should say so.
Prerequisites:      Phase 12.
```

Also in this phase, outside the domain:

- Coverage thresholds in `vitest.config.ts` for the critical paths listed in section 8.
- A `README.md` with prerequisites, environment setup, `docker compose up`, migrations, the
  super administrator seed, how to run each test suite, the Swagger URL, and links to the
  architecture documentation set described in section 10.
- A consistency pass over `docs/architecture` and `docs/adr`: every module has its low level
  design page and its C4 component diagram, every decision taken during the build has an ADR, and
  no statement lives in two documents.
- A written justification for choosing PostgreSQL, which the challenge asks for explicitly. The
  short version is relational integrity across work orders, items and stock movements, the
  transactional guarantee the withdrawal needs across two aggregates, partial unique indexes for
  the soft delete rules, and `numeric` and `bigint` arithmetic for money in cents.
- A Swagger review of every new controller.

```text
Already exists:            CurrentUser, Principal, the ownership pattern, the me route
                           precedent in UsersController, Swagger, the coverage runner.
Needs extension:           vitest.config.ts thresholds.
Needs new implementation:  The customer scoped queries, the metrics query and adapter,
                           README.md.
Must reuse:                The read side never goes through the aggregate.
```

---

## 6. What must not be rebuilt

| Capability                                              | Decision                                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Authentication                                          | Already exists. Reuse `JwtAuthGuard`, it is global.                                              |
| Sessions and refresh tokens                             | Already exist. The logout changes meaning, the mechanism does not.                               |
| Authorization and RBAC                                  | Already exists. Extend the catalog, add one role and one escalation rule.                        |
| User and user registration                              | Already exists. `RegisterUserCommand` is the only path that creates an account.                  |
| Role assignment                                         | Already exists. `AssignRoleToUserCommand` is the only path that grants a profile.                |
| Mechanic, Service advisor, Administrator                | Not aggregates. A profile is a role on a user.                                                   |
| Password rules and hashing                              | Already exist. The password change reuses `Password`, `PasswordHash` and `Argon2PasswordHasher`. |
| Personal data                                           | Already exists on the user record, which now also carries the document.                          |
| Guards and decorators                                   | Already exist. One new guard, for the pending password.                                          |
| Error handling and HTTP mapping                         | Already exists.                                                                                  |
| Request validation                                      | Already exists.                                                                                  |
| Repository and query port patterns                      | Already exist. Follow them.                                                                      |
| Id generation, clock                                    | Already exist as global ports.                                                                   |
| UUID value object                                       | Already exists (`EntityId`). The external identifier is a UUID.                                  |
| Redis caching                                           | Already exists. Not needed by the new modules in the MVP.                                        |
| Rate limiting, logging, Helmet, versioning, Swagger     | Already exist and apply automatically.                                                           |
| Docker, Docker Compose, migrations runner, test harness | Already exist.                                                                                   |
| Customer, Vehicle, Service, InventoryItem, WorkOrder    | New implementation.                                                                              |
| Money, PersonDocument, Address                          | New. Money in the shared kernel, the other two in their modules.                                 |

## 7. Justified architectural decisions

These move to `docs/adr/` as one file each, in the shape they already have. Section 10 lists the
numbering and explains why they move rather than being copied.

```text
Decision:                   Customer is an aggregate of its own, over a user identity.
Why:                        The workshop records data about the relationship, and putting it on
                            the user record would grow the identity module with other domains.
                            The invariant is its own: exactly one identity per customer, and at
                            most one customer per identity.
Business Need:              Stated directly in the answer to H25.
Alternative:                A customer as a user holding the CUSTOMER role, with no table.
Why alternative rejected:   It has no home for the address, and every later piece of customer
                            data would land on the users table.
```

```text
Decision:                   Mechanic, Service advisor and Administrator get no aggregate.
Why:                        In this system they have no state, no behaviour and no invariant
                            beyond their access. Linking a work order to a mechanic needs a
                            user reference and a role check.
Business Need:              Stated directly in the answer to H28.
Alternative:                One aggregate per profile.
Why alternative rejected:   Three tables holding a foreign key and a copy of the user status.
Trigger to revisit:         A specialty, an hourly cost or a shift for the mechanic. A sale as
                            a concept for the service advisor, which needs a cash register the MVP does
                            not have. Staff records with data of their own.
```

```text
Decision:                   Actions are traced with append only trails, not with an aggregate
                            per actor.
Why:                        The fact belongs to the work order and to the stock movement, not
                            to the person who did it.
Business Need:              Stated directly in the answer to H29.
Alternative:                An Administrator aggregate holding what it did.
Why alternative rejected:   It puts the history of a work order somewhere other than the work
                            order, and it would not cover actions by service advisors and mechanics.
Cost:                       One extra table and one subscriber, plus the caveat that a
                            subscriber failure loses an entry without failing the operation.
```

```text
Decision:                   A super administrator exists, is created outside the API, and is
                            the only profile that can grant ADMIN.
Why:                        The permission model itself needs an owner that an operational
                            administrator cannot become on their own.
Business Need:              Stated directly in the answer to H30.
Alternative:                One ADMIN role holding everything, as today.
Why alternative rejected:   Any administrator could grant themselves anything, and there would
                            be no floor under the access model.
Cost:                       One role, one rule in the assignment handler, and a seed script
                            that has to run before anybody can log in.
```

```text
Decision:                   Budget is an entity inside the WorkOrder aggregate.
Why:                        Approving it changes the work order status in the same act.
Business Need:              A budget without its work order has no meaning here.
Alternative:                Budget as its own aggregate.
Why alternative rejected:   It splits one transaction into two for a decision taken in one step.
```

```text
Decision:                   The work order carries two totals, the approved budget and the
                            charged amount.
Why:                        A planned part never withdrawn should not be charged, and the
                            approved value still has to be visible as history.
Business Need:              Follows from the answers to H12 and H21.
Alternative:                One total, adjusted in place.
Why alternative rejected:   It would erase what the customer approved.
```

```text
Decision:                   A withdrawal is always charged at the budgeted price.
Why:                        The customer pays what was approved. A price drop is answered by a
                            person applying a discount, with a reason recorded.
Business Need:              Stated directly in the answers to H12 and H22.
Alternative:                Charge the lower of the budgeted and current price.
Why alternative rejected:   It moves a commercial decision into an automatic rule and leaves no
                            reason behind for why the bill changed.
```

```text
Decision:                   One InventoryItem aggregate covering parts and supplies.
Why:                        They share every invariant and differ only by a label.
Business Need:              Stated directly in the answer to H11.
Alternative:                Separate Part and Supply aggregates.
Why alternative rejected:   Two identical rule sets for one adjective.
```

```text
Decision:                   Stock movements are append only, carry a work order, an actor and a
                            status, and every status change appends a history entry.
Why:                        A part taken for a work order is not money entering the till, and
                            the workshop needs to trace where each unit went.
Business Need:              Stated directly in the answers to H5 and H18.
Alternative:                Only a quantity column on the item.
Why alternative rejected:   It cannot express a consumption waiting on a delivery, a transfer
                            between work orders, or a loss.
```

```text
Decision:                   A cancelled work order writes its movements off instead of
                            returning the units to stock.
Why:                        The parts are installed in a car the workshop will not charge for.
Business Need:              Stated directly in the answer to H18.
Alternative:                Reverse the movement and return the units.
Why alternative rejected:   It would invent stock that does not physically exist and hide a
                            real loss.
```

```text
Decision:                   Any deviation from an approved budget cancels the work order and
                            opens a new one.
Why:                        One rule covers extra work, part swaps and abandonment.
Business Need:              Stated directly in the answers to H2, H4 and H9.
Alternative:                Budget versioning with a re-approval transition.
Why alternative rejected:   It is the complexity the MVP is told to avoid.
```

```text
Decision:                   A logout ends every active session of the user.
Why:                        Signing out means signing out, and a password change has to be able
                            to close every device.
Business Need:              Stated directly by the product owner.
Alternative:                Keep the per-device logout next to a logout-all.
Why alternative rejected:   Two endpoints where the workshop wants one behaviour.
Cost:                       An existing endpoint changes meaning and its e2e test is rewritten.
```

```text
Decision:                   Internal sequential key plus external UUID on every addressable
                            table, including the ones that already exist.
Why:                        One identifier rule across the system, and no enumerable key in a
                            route.
Business Need:              Stated directly in the answers to H17, H20 and H23.
Alternative:                Applying it only to new tables.
Why alternative rejected:   Two rules in one schema is worse than one migration.
Cost:                       Phase 1 rewrites six tables, their foreign keys, their mappers and
                            the seed, and delivers no visible feature.
```

```text
Decision:                   Money lives in the shared kernel and the backend works in integer
                            BRL cents.
Why:                        Several contexts need identical arithmetic and totals have to add
                            up across them.
Business Need:              Stated directly in the answer to H14.
Alternative:                Decimal columns and one Money per module.
Why alternative rejected:   Three rounding implementations is how totals stop matching.
```

```text
Decision:                   Cross context calls go through the CommandBus and QueryBus.
Why:                        It is the pattern already used between users and authorization.
Business Need:              None directly. It is what keeps the monolith modular.
Alternative:                Exporting repositories from each module.
Why alternative rejected:   It turns the module boundary into a suggestion.
```

## 8. Testing strategy

| Area                                                                           | Unit                      | Integration        | E2E |
| ------------------------------------------------------------------------------ | ------------------------- | ------------------ | --- |
| PersonDocument, Address, LicensePlate, Money, WorkOrderNumber, WorkOrderStatus | yes, heavy                | no                 | no  |
| Aggregates (User, Customer, Vehicle, Service, InventoryItem, WorkOrder)        | yes, heavy                | no                 | no  |
| Command handlers                                                               | yes, with in memory fakes | no                 | no  |
| The role escalation rule                                                       | yes                       | no                 | yes |
| Repositories and mappers, including the identifier translation                 | no                        | yes, real Postgres | no  |
| Query ports and the trails                                                     | no                        | yes                | no  |
| Transactions spanning two modules                                              | yes                       | yes                | yes |
| Pending password guard and global logout                                       | yes                       | no                 | yes |
| Authorization on the new endpoints                                             | no                        | no                 | yes |
| Work order lifecycle end to end                                                | no                        | no                 | yes |
| Stock consumption, settlement, transfer and write off                          | yes                       | yes                | yes |

Critical paths that need the 80 percent coverage floor:

- `work-orders/domain`: the state machine, the budget computation, the charged total, the withdrawal rules, the ownership rule;
- `inventory/domain`: the unit count invariants and the movement statuses;
- `users/domain/value-objects`: CPF and CNPJ;
- `customers/domain`: the identity link invariant and the address;
- `vehicles/domain/value-objects`: the plate;
- `authorization/application`: the role escalation rule;
- `shared/domain/value-objects/money.ts`.

Test naming follows the existing suites: `should register a customer`,
`should not register a customer with an invalid document`, `should register a vehicle`,
`should not register a duplicated license plate`, `should create a work order`,
`should not start execution without approval`, `should not withdraw a part that was never
planned`, `should not return units to stock on a write off`, `should not assign ADMIN without
the super administrator role`.

New fakes under `test/support/fakes`: in memory repositories for each new aggregate, mirroring
`InMemoryUserRepository`. New factories under `test/support/factories`: `customer.factory.ts`,
`vehicle.factory.ts`, `service.factory.ts`, `inventory-item.factory.ts`,
`work-order.factory.ts`, and `user.factory.ts` gains the document. `test/support/db.ts` needs
the new ORM entities added to its entity list, and `test/support/global-setup.ts` needs the new
migrations added to its migration list. Both are manual lists.

## 9. Notes carried into implementation

Nothing is blocking. Two consequences are worth watching when the code reaches them.

**N1. Finding a customer by document crosses a module boundary.** The document lives on the
user record and the customer record points at it. The lookup goes through the QueryBus rather
than through a join written inside the customers module.

**N2. The trail and the movement history overlap on a withdrawal.** One entry lands in
`work_order_events` and another in `stock_movement_transitions`, from two aggregates in one
transaction. They answer different questions. If they ever disagree, the movement history is
the authority on stock and the trail is the authority on the work order.

## 10. Architecture documentation

Five documents join the repository under `docs/`, versioned with the code, in markdown and mermaid
so they use the same toolchain and the same validation as the DDD documents already here.

```text
docs/
  ddd/
    event-storming.md
    event-storming.mmd
    implementation-plan.md
  architecture/
    architecture-overview.md
    high-level-design.md
    c4-system-context.mmd
    c4-containers.mmd
    c4-components-<module>.mmd
    low-level-design/
      README.md
      <module>.md
  adr/
    README.md
    NNNN-<kebab-case-title>.md
```

### What each one owns

The risk here is writing the same thing five times. Each document owns a level and points at the
others rather than repeating them.

| Document                       | Owns                                                                                                                                                                                                                     | Does not repeat                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `architecture-overview.md`     | The system in one page: what it is, the four business actors, the five bounded contexts, the three runtime pieces, and the constraints that shaped it. Absorbs section 15 of the event storming, which then points here. | Module internals, schema, endpoints.                                                          |
| `high-level-design.md`         | The modules, what each owns, how they talk, the CQRS wiring, the guard chain, the transaction boundaries that span two modules, and the identifier and money conventions.                                                | Per-class and per-column detail, and the domain narrative, which stays in the event storming. |
| `low-level-design/<module>.md` | One page per module: aggregates and their invariants, value objects, commands and handlers, queries and ports, repository and mapper, ORM entities and columns, endpoints, errors and their HTTP mapping.                | Anything another module owns, and any decision, which belongs in an ADR.                      |
| `c4-*.mmd`                     | The same structure as a picture, at the level each diagram is for.                                                                                                                                                       | Prose. A C4 diagram carries names and relations, not explanations.                            |
| `adr/NNNN-*.md`                | One technical decision each, with its context, the decision, the alternatives and the consequences.                                                                                                                      | How the system works, which is what the other four are for.                                   |

### The ADRs already exist as prose

Section 7 of this plan is a list of decisions in the exact shape an ADR takes: decision, why,
business need, alternative, why the alternative was rejected, and in several cases the cost. Those
move to `docs/adr/`, one file each, and section 7 becomes an index pointing at them. Copying them
instead of moving them would create two versions of the same decision that drift apart, which is
the failure mode this whole set is supposed to prevent.

The first batch, numbered in the order the decisions were taken rather than by importance:

| ADR  | Subject                                                                          |
| ---- | -------------------------------------------------------------------------------- |
| 0001 | Modular monolith in layers, with CQRS through `@nestjs/cqrs`                     |
| 0002 | PostgreSQL as the relational database, which the challenge asks to justify       |
| 0003 | Redis for the effective access cache, the revoked session list and rate limiting |
| 0004 | JWT access tokens with refresh token rotation and reuse detection                |
| 0005 | Argon2id for password hashing                                                    |
| 0006 | Internal sequential key plus external UUID on every addressable table            |
| 0007 | Money in the shared kernel, integer BRL cents across the backend                 |
| 0008 | Cross context communication through the CommandBus and the QueryBus              |
| 0009 | Customer as its own aggregate over a user identity                               |
| 0010 | No aggregate for Mechanic, Service advisor and Administrator                     |
| 0011 | Groups removed from the authorization model                                      |
| 0012 | Super administrator created outside the API, with the escalation rule            |
| 0013 | One InventoryItem aggregate for parts and supplies                               |
| 0014 | Stock consumed at withdrawal, with no reservation phase                          |
| 0015 | Stock movements append only, with transitions for the consumption status         |
| 0016 | Cancellation writes movements off instead of returning units to stock            |
| 0017 | Budget as an entity inside the WorkOrder aggregate                               |
| 0018 | Numbered budget rounds, so additional repairs are authorised in place            |
| 0019 | A withdrawal is charged at the price its budget round froze                      |
| 0020 | Budget total and charged total kept as two separate values                       |
| 0021 | The work order trail written by the repository in the same transaction           |
| 0022 | A logout ends every active session of the user                                   |

Each file carries a status of `Accepted`, `Superseded by NNNN` or `Deprecated`. A superseded ADR is
never edited or deleted, the same rule the stock movements and the work order trail follow, so the
reasoning behind a reversal stays readable. H2 and H25 in the event storming are both reversals and
both make good examples of why that matters.

### C4, and where it is worth drawing

Mermaid renders `C4Context`, `C4Container` and `C4Component` natively, so these diagrams validate
with the same script as the event storming.

Level 1, system context, holds the four business actors and one system, with no external system at
all, because there is no payment provider, no notification channel and no supplier integration.
Level 2, containers, holds the NestJS application, PostgreSQL and Redis. Both are small, and that
is an honest picture of a monolith rather than a gap.

Level 3, components, is where the value is: one diagram per bounded context showing controllers,
handlers, aggregates, repositories and ports, and the calls that cross into another module. Level
4, code, is skipped, because the aggregate map in the event storming and the low level design pages
carry that detail in a form that survives refactoring better than a class diagram.

### When each one is written

The low level design cannot be written before the code exists without becoming fiction, and the C4
component diagrams have nothing to draw until a module has components. So the set is produced along
the phases rather than in one documentation phase at the end.

| Moment                           | Produced                                                                                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before phase 0                   | `architecture-overview.md`, `high-level-design.md`, `c4-system-context.mmd`, `c4-containers.mmd`, and ADRs 0001 to 0008, which are decisions already taken |
| At the end of every module phase | The `low-level-design/<module>.md` page and the `c4-components-<module>.mmd` diagram for what that phase delivered                                         |
| Whenever a decision is taken     | One ADR, numbered next, referenced from the phase that applied it                                                                                          |
| Phase 13                         | A consistency pass over all of them, and the README linking to the set                                                                                     |

A phase is not finished while its low level design page is missing, the same way it is not finished
while its tests are missing.
