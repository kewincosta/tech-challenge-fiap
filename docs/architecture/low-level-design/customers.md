# customers

The workshop's relationship with a person: the customer record, its address and its phone. Part of
the Customer Management context, alongside [vehicles](vehicles.md).

A customer is not a user. `identity` owns the account, the name, the email and the document; this
module owns what the workshop records about the relationship
([0009](../../adr/0009-customer-as-its-own-aggregate.md)).

Conventions this page does not repeat are in [the high level design](../high-level-design.md).

## Aggregate

`Customer` (`domain/entities/customer.ts`).

Invariants it holds:

- Exactly one identity per customer, and at most one customer per identity. The database enforces the second half with `ux_customers_user_id`.
- The address is all or nothing. An absent address is valid; a partially filled one is not.
- Deactivation is a soft delete: `status` moves to `INACTIVE`, `deleted_at` is stamped, and the user slot is **not** freed.
- Records `CustomerRegistered`, `CustomerUpdated` and `CustomerDeactivated`.

## Value objects

| Value object  | Rule                                                                                                                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Address`     | All fields but `complement` are required once any address is given. The state must be one of the 27 real UF codes; the zip code is reduced to 8 digits. `CUSTOMER_INVALID_ADDRESS` (400). |
| `PhoneNumber` | 10 or 11 digits, area code included, separators stripped. `CUSTOMER_INVALID_PHONE_NUMBER` (400).                                                                                          |
| `CustomerId`  | External UUID.                                                                                                                                                                            |

## Commands

| Command                     | Use case                    | What it does                                                                                          |
| --------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------- |
| `RegisterCustomerCommand`   | `RegisterCustomerUseCase`   | Creates the record over an existing user identity, or registers the person and the customer together. |
| `UpdateCustomerCommand`     | `UpdateCustomerUseCase`     | Changes address or phone.                                                                             |
| `DeactivateCustomerCommand` | `DeactivateCustomerUseCase` | Soft-deletes the record.                                                                              |

`RegisterCustomerUseCase` is a cross-module write. When the input names a new person, it opens the
account through the `CustomerAccounts` port, and `CustomerAccountsGateway` calls `RegisterUserUseCase`
of `identity`, which commits the user and its role in a transaction of its own. The two modules do
not share a transaction, so the use case runs as steps
([0033](../../adr/0033-writes-across-modules-run-as-steps.md)):

1. It chooses the ids, the account's included, and arms a `DISCARD_ACCOUNT` step in the customers
   outbox, due after `OUTBOX_GRACE_SECONDS`.
2. `identity` opens the account under the chosen id.
3. One customers transaction disarms the step and saves the customer.

When the opening or the last transaction fails, the request discards the account at once through
`CustomerAccounts.discard`, completes the step and answers the first error. A discard that fails
leaves the step to the processor, which discards the account after the grace period, the same
recovery as a process that stops between the steps. A step the processor claimed before the last
transaction answers 409 `CONCURRENT_MODIFICATION`: the customer stays unsaved and the account is
discarded. A registration over an existing user writes nothing in `identity` and arms no step.

Its input is either an existing `userId` or a full person to create, never both. Supplying both is
`CUSTOMER_AMBIGUOUS_REGISTRATION` (400), because the use case cannot tell which one the caller meant.

## Queries and ports

| Query                      | Answers                                                                                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GetCustomerQuery`         | One customer by external id, whatever its status. Throws `CustomerNotFoundError` when there is none, so a deactivated customer stays apart from a missing one.                                       |
| `GetCustomerByUserIdQuery` | The customer behind a token. Throws `CustomerNotFoundError` for a user with no customer record. `work-orders` and `vehicles` call it through their `CustomerDirectory` and `VehicleOwners` gateways. |
| `ListCustomersQuery`       | The administrative listing, newest first. It filters by name or by document.                                                                                                                         |

Ports, all in `application/ports`: `CustomerRepository`, `CustomerQueryPort`, `CustomerAccounts`,
`PendingAccountSteps` and `AccountStepLog`. `CustomerAccounts` is what registration needs of the
accounts `identity` owns: find a user, check that it holds `CUSTOMER`, open an account under a chosen
id, and discard it again. `PendingAccountSteps` is the outbox, and `AccountStepLog` logs a step that
reached its attempt limit.

The listing takes the name, email and document of each customer from `identity`. The query adapter
asks `FindUsersUseCase` for the users that match the filter, turns their ids into internal keys with
`UserKeyResolver`, and reads `customers` filtered by those keys. Without a filter it reads
`customers` first and asks `identity` for the users behind them. The document is passed on as typed,
and `identity` normalizes it and finds nobody for a malformed one
([0028](../../adr/0028-each-module-queries-only-its-own-tables.md)).

## Persistence

`TypeOrmCustomerRepository`, `TypeOrmCustomerQueryAdapter`, `TypeOrmPendingAccountSteps`,
`CustomerMapper` and `CustomerKeyResolver` in `infrastructure/persistence`. `CustomerAccountsGateway`
is in `infrastructure/gateways`, and `AccountStepProcessor` in `infrastructure/outbox`.

`AccountStepApplier` (`application/services`) applies a claimed step through `CustomerAccounts`,
completes it, or records the failure with the next due time (1 s, 5 s, 30 s, 2 min, 10 min, then 1 h)
and marks the step failed at `OUTBOX_MAX_ATTEMPTS`. `AccountStepProcessor` runs it at application
bootstrap and every `OUTBOX_POLL_INTERVAL_MS`, and an interval of 0 turns it off. The module reads
the three settings itself, so it imports nothing from `work-orders`.

`CustomerKeyResolver` turns a customer UUID into its internal key and back, one at a time and in
batch, for the modules that reference a customer: `vehicles` and `work-orders`. `index.ts` exports it
together with `GetCustomerUseCase`, `GetCustomerByUserIdUseCase` and `CustomerNotFoundError`.

### `customers`

From migration `1787702400002-create-customers-table.ts`. The address is stored flattened, one
column per field, rather than as a nested type.

| Column               | Type           | Notes                                                                         |
| -------------------- | -------------- | ----------------------------------------------------------------------------- |
| `id`                 | `bigserial`    | Primary key, internal only.                                                   |
| `external_id`        | `uuid`         | `ux_customers_external_id` unique.                                            |
| `user_id`            | `bigint`       | References `users (id)`, `ON DELETE RESTRICT`. `ux_customers_user_id` unique. |
| `address_street`     | `varchar(160)` | Nullable.                                                                     |
| `address_number`     | `varchar(20)`  | Nullable.                                                                     |
| `address_complement` | `varchar(60)`  | Nullable. The one address field that stays optional when an address is given. |
| `address_district`   | `varchar(80)`  | Nullable.                                                                     |
| `address_city`       | `varchar(80)`  | Nullable.                                                                     |
| `address_state`      | `char(2)`      | Nullable. A UF code.                                                          |
| `address_zip_code`   | `varchar(8)`   | Nullable. Digits only.                                                        |
| `phone`              | `varchar(11)`  | Nullable. Digits only.                                                        |
| `status`             | `varchar(20)`  | `chk_customers_status`: `ACTIVE` or `INACTIVE`.                               |
| `created_at`         | `timestamptz`  |                                                                               |
| `updated_at`         | `timestamptz`  |                                                                               |
| `deleted_at`         | `timestamptz`  | Null while active.                                                            |

`ux_customers_user_id` is deliberately **not** filtered by `deleted_at IS NULL`, unlike the unique
indexes on `users`. A user identity backs at most one customer for its whole life, so deactivating
a customer never opens a slot for a second one over the same user. The migration carries that
reasoning as a comment, and it is the one place in the schema where the soft-delete pattern is
deliberately not applied.

### `customer_account_steps`

The outbox of the registration. From migration `1787702400009-add-cross-module-steps.ts`.

| Column         | Type          | Notes                                                                                         |
| -------------- | ------------- | --------------------------------------------------------------------------------------------- |
| `id`           | `bigserial`   | Primary key, internal only.                                                                   |
| `operation_id` | `uuid`        | `ux_customer_account_steps_operation_id` unique.                                              |
| `kind`         | `varchar(30)` | `DISCARD_ACCOUNT`.                                                                            |
| `user_id`      | `uuid`        | The id the registration chose for the account. No foreign key: `users` belongs to `identity`. |
| `payload`      | `jsonb`       | Defaults to `{}`.                                                                             |
| `status`       | `varchar(20)` | `ARMED`, `PENDING`, `DONE` or `FAILED`, checked by `chk_customer_account_steps_status`.       |
| `attempts`     | `integer`     | Claims so far. Defaults to 0.                                                                 |
| `due_at`       | `timestamptz` | When the step is next due. A claim pushes it to the end of its lease.                         |
| `last_error`   | `text`        | Nullable. The error of the last failed attempt.                                               |
| `created_at`   | `timestamptz` |                                                                                               |
| `completed_at` | `timestamptz` | Nullable. Set when the step is done.                                                          |

## Endpoints

`/api/v1/customers`.

| Route                           | Permission          |
| ------------------------------- | ------------------- |
| `POST /customers`               | `customers:manage`  |
| `GET /customers/me`             | none beyond a token |
| `PATCH /customers/me`           | none beyond a token |
| `GET /customers`                | `customers:read`    |
| `GET /customers/:externalId`    | `customers:read`    |
| `PATCH /customers/:externalId`  | `customers:manage`  |
| `DELETE /customers/:externalId` | `customers:manage`  |

`me` is declared before `:externalId`.

## Errors

| Error                                | Code                                  | Status |
| ------------------------------------ | ------------------------------------- | ------ |
| `InvalidAddressError`                | `CUSTOMER_INVALID_ADDRESS`            | 400    |
| `InvalidPhoneNumberError`            | `CUSTOMER_INVALID_PHONE_NUMBER`       | 400    |
| `AmbiguousCustomerRegistrationError` | `CUSTOMER_AMBIGUOUS_REGISTRATION`     | 400    |
| `CustomerNotFoundError`              | `CUSTOMER_NOT_FOUND`                  | 404    |
| `TargetUserNotFoundError`            | `CUSTOMER_TARGET_USER_NOT_FOUND`      | 404    |
| `CustomerAlreadyExistsForUserError`  | `CUSTOMER_ALREADY_EXISTS_FOR_USER`    | 409    |
| `UserMissingCustomerRoleError`       | `CUSTOMER_USER_MISSING_CUSTOMER_ROLE` | 422    |
