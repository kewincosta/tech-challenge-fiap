# High level design

How the pieces fit together. What the system is and who uses it is
[the overview](architecture-overview.md); what any one module holds is
[its low level design page](low-level-design/README.md); why anything was decided is
[a decision record](../adr/README.md); what the domain does is
[the event storming](../ddd/event-storming.md).

This page carries no per-class or per-column detail. Where it names a class, it names it as a
landmark, and the page that owns it is one level down.

## The code units

Eight modules under `src/modules`, plus a shared kernel at `src/shared`. Five bounded contexts map
onto them, three of them one to one.

| Context             | Module           | What it owns                                                                                                |
| ------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------- |
| Identity & Access   | `users`          | Who a person is: registration, the document, the password, the account lifecycle.                           |
| Identity & Access   | `authentication` | Proving it: login, sessions, access and refresh tokens, revocation.                                         |
| Identity & Access   | `authorization`  | What they may do: roles, permissions, assignments, effective access.                                        |
| Customer Management | `customers`      | The workshop's relationship with a person: the customer record and its address.                             |
| Customer Management | `vehicles`       | The vehicles a customer brings in.                                                                          |
| Workshop Catalog    | `services`       | What the workshop sells as labour, with its price and estimated duration.                                   |
| Inventory           | `inventory`      | Stock, and the append-only ledger of every unit that moved.                                                 |
| Workshop Operations | `work-orders`    | The work order lifecycle, its items, its budget rounds, and its trail.                                      |
| -                   | `shared`         | What belongs to no context: `Money`, `AggregateRoot`, the error hierarchy, the ports, the exception filter. |

## The four layers

Every module carries the same four directories, and the dependency direction is enforced rather
than agreed:

```
presentation  ->  application  ->  domain
        \             |
         \            v
          ------>  infrastructure (implements the ports application declares)
```

`eslint.config.mjs` makes two of those arrows real. Files under `src/**/domain/**` may not import
`@nestjs/*`, `typeorm`, `ioredis`, `argon2`, `pg`, `class-validator`, `class-transformer`, `zod`,
`express`, `node:*` or `rxjs`. Files under `src/**/application/**` may not import `typeorm`,
`@nestjs/typeorm`, `ioredis`, `argon2`, `pg`, `@nestjs/jwt` or `express`. A violation fails
`npm run lint`, so the layering cannot erode quietly.

## How a request travels

A controller receives it, builds a command or a query, and dispatches it on a bus. It never calls
a handler directly and never touches a repository.

```
HTTP  ->  controller  ->  CommandBus / QueryBus  ->  handler  ->  repository / query port  ->  PostgreSQL
```

Writes go through an aggregate: the handler loads it, calls a method on it, and saves it. Reads do
not. A query handler goes to a query port that runs SQL and returns a DTO, because loading an
aggregate to read from it buys nothing and costs a hydration.

Handlers are registered in their module's `providers` array. A `@CommandHandler`-decorated class
that is not registered compiles, unit-tests and lints clean, and fails at runtime with "No handler
found for the command" on the first real request. Only a request through the bootstrapped
application catches it.

## How modules talk

Only over the buses, exchanging identifiers and DTOs
([0008](../adr/0008-cross-context-calls-through-the-buses.md)). No module injects another module's
repository, and no module imports another's entities. Finding a customer by document is a
`QueryBus` round trip from `customers` to `users`, not a join.

The rule is visible in an import list, which is what makes it reviewable.

## The guard chain

Four guards run on every request, globally registered in `src/app.module.ts` as `APP_GUARD`
providers. Nest runs them in declaration order, which is the order below:

| Order | Guard                  | What it decides                                                                                        |
| ----- | ---------------------- | ------------------------------------------------------------------------------------------------------ |
| 1     | `ThrottlerGuard`       | Whether this caller has made too many requests. Counters live in Redis.                                |
| 2     | `JwtAuthGuard`         | Whether the token is valid and its session is not revoked. Consults the revoked session list in Redis. |
| 3     | `PendingPasswordGuard` | Whether an account that must change its password is trying to do anything else.                        |
| 4     | `PermissionsGuard`     | Whether the effective access carries every permission the route requires.                              |

`PermissionsGuard` reads `@RequirePermissions()` metadata and requires **all** of the permissions
it finds. It cannot express "either of two", which is why a rule of that shape lives in the handler
instead, as the budget decision and cancellation authorizers do.

Effective access is resolved per user and cached in Redis, invalidated by a subscriber on
assignment changes ([0003](../adr/0003-redis-for-cache-revocation-and-rate-limiting.md)). The cache
key and its TTL are on [the authorization page](low-level-design/authorization.md).

One consequence catches people: registration assigns `CUSTOMER` to every account, so every staff
account also carries the permissions of `CUSTOMER`. A permission that `CUSTOMER` holds is held by
everyone.

## Transactions across modules

Most writes touch one aggregate and get their transaction from their own repository. A write that
spans two modules cannot, because the second handler is reached over a bus and a command payload
cannot carry a live `EntityManager`.

`TransactionRunner` opens the transaction and puts the manager in an `AsyncLocalStorage`. Any
repository reachable from such a write resolves its manager through `currentEntityManager()`
first, and opens its own only when there is none
([0023](../adr/0023-repositories-honour-an-ambient-transaction.md)).

Six handlers open a transaction this way today. Two of them are in Identity & Access and Customer
Management: registering a user, which assigns the `CUSTOMER` role in `authorization`, and
registering a customer, which spans `customers` and `users`. The other four are the work order
commands that move stock in `inventory` while updating the work order: withdrawing parts,
returning them, delivering the vehicle, which settles the consumptions, and cancelling, which
writes them off.

The work order aggregate additionally carries a `version` column, and its repository refuses a
write whose loaded version no longer matches, answering 409
([0024](../adr/0024-optimistic-version-guard-on-the-work-order.md)).

## Conventions that apply everywhere

**Identifiers.** Every addressable table carries `id bigserial` internally and `external_id uuid`
externally. The domain carries external identifiers, foreign keys carry internal ones, and
repositories resolve one into the other at their boundary. Join tables no route addresses keep a
composite key of internal ids ([0006](../adr/0006-internal-key-plus-external-uuid.md)).

**Money.** Integer BRL cents everywhere, `bigint` columns, cents in API payloads. TypeORM returns
`bigint` as a string, so mappers convert explicitly
([0007](../adr/0007-money-in-integer-brl-cents.md)).

**Aggregates.** Private constructor, a static creation method that records a domain event, a static
`restore` for the mapper, a props interface, read-only getters, and `record()` /
`pullDomainEvents()` from `AggregateRoot`. `AggregateRoot` also exposes a non-draining read, which
is what lets a repository write a trail from the same events the handler will publish afterwards.

**Append-only history.** `stock_movements`, `stock_movement_transitions` and `work_order_events`
are never deleted and never rewritten beyond a movement's status
([0015](../adr/0015-stock-movements-append-only.md),
[0021](../adr/0021-the-trail-written-inside-the-aggregate-transaction.md)).

**Persistence.** Hand-written SQL migrations under
`src/shared/infrastructure/database/migrations`, nine of them. `CHECK` constraints for status
columns, partial unique indexes filtered by `deleted_at IS NULL` for the soft-delete rules.

**Errors.** Each rule gets a `DomainError` subclass with a module-prefixed `code` and an
`ErrorKind`. `GlobalExceptionFilter` maps the kind to a status, and that mapping is the whole
contract:

| `ErrorKind`     | Status |
| --------------- | ------ |
| `Validation`    | 400    |
| `Unauthorized`  | 401    |
| `Forbidden`     | 403    |
| `NotFound`      | 404    |
| `Conflict`      | 409    |
| `RuleViolation` | 422    |

**Domain events.** Recorded by the aggregate, published by the handler with
`eventBus.publishAll(aggregate.pullDomainEvents())`. Subscribers live in
`application/subscribers`. A subscriber runs after the commit, which is why anything that must not
be lost is written inside the transaction instead
([0021](../adr/0021-the-trail-written-inside-the-aggregate-transaction.md)).

**Cross-context work that must be able to fail the caller** is a synchronous command over the
`CommandBus`, not a subscriber. Stock consumption, settlement and write-off are commands for
exactly that reason.

## The HTTP surface

Global prefix `api`, URI versioning at `v1`, so every route is `/api/v1/...`. Swagger is served at
`/api/docs`. Helmet, throttling and pino logging with redaction are applied globally.

Routes and their shapes belong to the module pages, not here.
