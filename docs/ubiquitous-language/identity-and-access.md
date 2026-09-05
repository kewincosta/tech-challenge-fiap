# Ubiquitous language: Identity and Access

> Part of the [ubiquitous language set](README.md). The terms here apply to the Identity & Access
> context, implemented in the `users`, `authentication` and `authorization` modules.

## 1. Context

**Bounded context:** Identity and Access

**Description.** Covers who exists as a person in the system, how that person proves it, and what
they may do. It is the supporting context for every other one: none of them decides a permission
on its own.

**What is out of scope.** The customer's workshop data (address, phone number), which belongs to
Customer Registry. Here a person is a credential and a set of permissions, not someone who brings
a car in.

**Who is involved:**

- Administrator (staff accounts, roles)
- Super administrator (the owner of the access model)
- Everyone who signs in

## 2. Domain concepts

| Term                   | Definition                                                                        | Example                      | Notes                                                       |
| ---------------------- | --------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------- |
| **User account**       | The record of a person who can sign in                                            | `joana@example.com`          | Name, email, document and password. Nothing of the workshop |
| **Session**            | An active sign-in: the permission to use the system, with a start and an end      | Joana's session on her phone | What exists and lasts; the login is the act that creates it |
| **Access token**       | The short-lived credential that accompanies every request                         | A 15-minute JWT              | Not looked up in the database. Valid until it expires       |
| **Refresh token**      | The long-lived credential that trades one token pair for another                  | A 7-day UUID                 | Single use. Each renewal invalidates the previous one       |
| **Rotation**           | The replacement of the refresh token on every use                                 | -                            | The old one dies the instant the new one is born            |
| **Reuse detected**     | A refresh token already spent being presented again, treated as evidence of theft | -                            | Brings down every session of the account                    |
| **Revocation**         | Ending a session before its deadline                                              | Logout, password change      | Checked on every request                                    |
| **Permission**         | One atomic authorisation to do one thing                                          | `work-orders:manage`         | Never granted directly to a person; always through a role   |
| **Role**               | A named set of permissions, assignable to people                                  | `MECHANIC`                   | The business calls it a profile or a job function           |
| **Effective access**   | The set of roles and permissions an account actually has right now                | 6 permissions via `MECHANIC` | Computed and held in cache                                  |
| **Temporary password** | The password the system generates when creating a staff account                   | `aB3dE5fG7h9K`               | Shown once. Locks the account until it is changed           |
| **Pending password**   | The state of an account that must change its password before doing anything       | -                            | Only the password change route answers                      |

### User account

**Definition.** The record of a person who can sign in, with what it takes to identify and
authenticate them.

**Characteristics:**

- Email and document are unique among active accounts
- The password is stored only as a hash, never as text
- Being deactivated drops the sessions and removes it from the listings; the record stays
- An account is not a customer: it can become one, if it receives the customer role

**Relationships:**

- User account holds Sessions
- User account receives Roles
- User account may be a Customer (Customer Registry context)

### Role

**Definition.** A named set of permissions, assignable to accounts.

**Characteristics:**

- Five system roles ship with the schema and cannot be deleted
- A permission is never granted straight to a person; always through a role
- Only the super administrator can grant the administrator role

**The five roles:**

| Role              | Who they are                                           |
| ----------------- | ------------------------------------------------------ |
| `SUPER_ADMIN`     | The owner of the access model, created outside the API |
| `ADMIN`           | Operational administration                             |
| `SERVICE_ADVISOR` | Service advisor, the counter                           |
| `MECHANIC`        | Workshop mechanic                                      |
| `CUSTOMER`        | Workshop customer                                      |

## 3. Actors

| Actor                   | Who they are                         | Responsibility in the domain                                                       |
| ----------------------- | ------------------------------------ | ---------------------------------------------------------------------------------- |
| **Super administrator** | The owner of the access model        | The only one who grants the administrator role                                     |
| **Administrator**       | Answers for the operation            | Creates staff accounts, assigns and revokes roles, deactivates accounts            |
| **Anyone signed in**    | Whoever holds an account             | Signs in and out, changes their own password, lists and revokes their own sessions |
| **System**              | What the application does on its own | Rotates tokens, detects reuse, drops sessions, maintains the cache                 |

## 4. Commands

| Command                  | Actor                 | What it means                               | Expected outcome                                        |
| ------------------------ | --------------------- | ------------------------------------------- | ------------------------------------------------------- |
| **Create account**       | Anyone                | Register in the system                      | Active account with the customer role                   |
| **Create staff account** | Administrator         | Open access for someone on the shop floor   | Account with a temporary password, locked until changed |
| **Sign in**              | Any account           | Prove identity and obtain access            | Session created, token pair issued                      |
| **Renew**                | Any account           | Trade the token pair before it expires      | New pair; the previous refresh token dies               |
| **Sign out**             | Any account           | End the access                              | Every session of the account revoked                    |
| **Revoke session**       | Owner / Administrator | Drop one specific session                   | Session revoked; its access token stops working         |
| **Change password**      | Any account           | Set a new password                          | Password changed, every session revoked                 |
| **Update account**       | Owner / Administrator | Correct the name, email or document         | Fields changed                                          |
| **Deactivate account**   | Administrator         | End someone's access                        | Inactive account, sessions dropped                      |
| **Create role**          | Administrator         | Define a set of permissions                 | Role available for assignment                           |
| **Set role permissions** | Administrator         | Replace the set of permissions of a role    | Role with the new set; the cache is invalidated         |
| **Assign role**          | Administrator         | Give someone the access of a role           | Role assigned; the cache is invalidated                 |
| **Revoke role**          | Administrator         | Take the access of a role away from someone | Role revoked; the cache is invalidated                  |

### Change password

**Intent.** The person wants to set a new password, whether by choice or because the temporary one
has served its purpose.

**Actor.** The owner of the account.

**Preconditions:**

- The current password matches
- The new password meets the minimum length

**Outcome:**

- The hash is replaced
- The pending password flag is cleared, if it was set
- **Every** session of the account is revoked, including the one that made the change
- Event: All user sessions revoked

**Note.** Dropping the current session too is deliberate: if the password is being changed because
it leaked, leaving one session standing would preserve exactly the access that should not exist.

## 5. Domain events

| Event                            | What it means                               | When it happens                                       |
| -------------------------------- | ------------------------------------------- | ----------------------------------------------------- |
| **Account registered**           | A person came into existence in the system  | On creating an account                                |
| **Session created**              | Someone signed in                           | On signing in                                         |
| **Refresh token rotated**        | One token pair was traded for another       | On renewing                                           |
| **Refresh token reuse detected** | A refresh token already spent was presented | On renewing with a dead token                         |
| **Session revoked**              | A session was ended before its deadline     | On signing out, revoking or changing password         |
| **All user sessions revoked**    | Every access of an account was ended        | On signing out, changing password, or detecting reuse |
| **Role assigned to user**        | An account gained the access of a role      | On assigning a role                                   |
| **Role revoked from user**       | An account lost the access of a role        | On revoking a role                                    |

### Refresh token reuse detected

**Definition.** A refresh token that was already traded for another was presented again.

**When it happens.** On renewal, when the token handed over is already recorded as spent.

**Relevant data:**

- The account involved
- The session the token belonged to
- The moment of detection

**Why it matters.** A refresh token is single use. If it shows up twice, either the attacker used
it after the owner or the owner used it after the attacker. In both cases a copy is circulating,
and the answer is to bring down the whole session rather than guess which of the two calls was
legitimate.

## 6. Policies and business rules

| Rule                                              | Description                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| Email and document are unique                     | Among active accounts; a deactivated one frees its own                          |
| A password is never stored as text                | Only the Argon2id hash                                                          |
| A permission always comes through a role          | No permission is assigned straight to an account                                |
| Only the super administrator grants administrator | An administrator cannot widen their own access nor create another like them     |
| A system role cannot be deleted                   | The five roles that ship with the schema stay                                   |
| A refresh token is single use                     | Each renewal invalidates the previous one                                       |
| Reuse brings down the whole session               | There is no attempt to tell which caller was legitimate                         |
| A password change drops every session             | Including the one that made the change                                          |
| A pending password blocks everything              | An account in that state reaches only the password change route                 |
| The guard requires every permission of a route    | When the rule is "one or the other", it lives in the use case, not in the guard |

### Only the super administrator grants administrator

**When:** someone tries to assign the administrator role to an account.

**Then:** the operation is refused, unless the one assigning is the super administrator. The super
administrator role is not assignable through any route.

**Example:**

> "The administrator cannot promote anyone to administrator, not even themselves. That belongs to
> the super, which only exists through the seed."

## 7. Statuses

### Account statuses

| Status       | What it means                                  | Entered by   | Left by      |
| ------------ | ---------------------------------------------- | ------------ | ------------ |
| **Active**   | The account can sign in and use the system     | Creation     | Deactivation |
| **Inactive** | The account does not sign in; the record stays | Deactivation | Terminal     |

### Session statuses

| Status      | What it means                            | Entered by                                                  | Left by              |
| ----------- | ---------------------------------------- | ----------------------------------------------------------- | -------------------- |
| **Active**  | The access is valid                      | Signing in                                                  | Revocation or expiry |
| **Revoked** | The access was ended before its deadline | Sign out, password change, reuse, administrative revocation | Terminal             |
| **Expired** | The absolute deadline passed             | The passage of time                                         | Terminal             |

```text
Sign in
   │
   ▼
 Active ──────────────────► Expired  (terminal, by the absolute deadline)
   │
   │ sign out, change password, reuse detected, administrative revocation
   ▼
Revoked  (terminal)
```

**Recorded revocation reasons:** sign out (`LOGOUT`), sign out of every session (`LOGOUT_ALL`),
token reuse (`TOKEN_REUSE`) and administrative revocation (`ADMIN_REVOCATION`).

## 8. Aggregates

### Aggregate: User account

**Responsibility.** Hold who exists and what authenticates that person.

**Root.** User account.

**Invariants:** email and document valid and unique among active accounts; password stored only as
a hash; name within the permitted length.

### Aggregate: Session

**Responsibility.** Hold one active access and the chain of refresh tokens that sustains it.

**Root.** Session. **Internal entity:** Refresh token.

**Invariants:** a refresh token is worth one use; the session honours the absolute deadline; every
revocation records its reason.

### Aggregate: Role

**Responsibility.** Hold a named set of permissions.

**Root.** Role.

**Invariants:** the name is unique; a system role cannot be deleted; every permission in the set
exists in the catalog.

**Why a permission is not an aggregate.** The permission catalog is a fixed list, created by
migration alongside the schema. It is read, never written through the API.

## 9. How the concepts relate

```text
User account
    │
    ├── holds ──> Session ──> holds ──> Refresh token
    │
    ├── receives ──> Role ──> groups ──> Permission
    │
    ├── resolves into ──> Effective access   (roles plus permissions, cached)
    │
    └── may be ──> Customer                  (Customer Registry context)
```

| From         | Relation | To            | Description                                                   |
| ------------ | -------- | ------------- | ------------------------------------------------------------- |
| User account | holds    | Session       | Zero or more sessions active at the same time                 |
| Session      | holds    | Refresh token | A chain; each renewal kills the previous and creates the next |
| User account | receives | Role          | Zero or more roles                                            |
| Role         | groups   | Permission    | The only path between a person and a permission               |

## 10. Domain vocabulary and technical vocabulary

| Domain (business)             | Technical (code)                   | Note                                                    |
| ----------------------------- | ---------------------------------- | ------------------------------------------------------- |
| User account                  | `User`, `/users`                   | -                                                       |
| Session                       | `Session`, `/auth/sessions`        | Creating a session is the login; deleting is the logout |
| Access token                  | `accessToken`                      | A JWT                                                   |
| Refresh token                 | `RefreshToken`, `refreshToken`     | -                                                       |
| Sign in / login               | `POST /auth/sessions`              | The business says sign in; the route creates a session  |
| Sign out / logout             | `DELETE /auth/sessions`            | Drops every session, not only the current one           |
| Renew                         | `POST /auth/tokens`                | Answers 201, because it creates a new pair              |
| Role / profile / job function | `Role`, `/roles`                   | One term in the code: role                              |
| Permission                    | `Permission`, `/permissions`       | In the form `resource:action`                           |
| Effective access              | `EffectiveAccess`, `GET /users/me` | Roles plus permissions, already resolved                |
| Temporary password            | `temporaryPassword`                | Returned once, never written to a log                   |
| Pending password              | `mustChangePassword`               | -                                                       |
| Deactivate an account         | `DeactivateUserCommand`, `DELETE`  | The HTTP verb is `DELETE`; nothing is erased            |

## 11. Terms rejected in this context

| Rejected term       | Use instead                    | Why                                                                                                         |
| ------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| User group          | Role                           | Groups were removed from the model ([ADR 0011](../adr/0011-groups-removed-from-the-authorization-model.md)) |
| Login (as a noun)   | Session                        | What lasts is the session; the login is the act                                                             |
| Profile             | Role                           | "Profile" also means record data; role is not ambiguous                                                     |
| Token (unqualified) | Access token, or Refresh token | Two things with different lifetimes and uses                                                                |
| Block a user        | Deactivate an account          | There is no temporary block; deactivation is what exists                                                    |
| A user's permission | Effective access               | A permission is never the user's directly; it always comes through a role                                   |

## 12. Phrases from the domain

> "Create his account as a mechanic. He changes the password on first access."

> "She changed the password, so she was dropped from every device. That is by design."

> "That refresh token has already been used. Bring down the whole session."

> "Only the super can promote someone to administrator."

> "He has six permissions, all of them from the mechanic role."

## 13. Example flow

### Flow: opening access for someone on the team

```text
AT: Administrator | CMD: Create staff account | EV: Account registered   | POL: temporary password, shown once
AT: Administrator | CMD: Assign role          | EV: Role assigned        | POL: only the super grants administrator
                                              | Access cache invalidated
AT: Person        | CMD: Sign in              | EV: Session created      | POL: a pending password blocks everything
AT: Person        | CMD: Change password      | EV: All sessions revoked
AT: Person        | CMD: Sign in              | EV: Session created      | Now with full access
```

**Rules of the flow:**

1. The temporary password appears once, in the creation response, and never in a log
2. While the password is pending, the only route that answers is the change one
3. The change drops everything, including the session that made it, and requires signing in again
4. Every role change invalidates the access cache immediately
