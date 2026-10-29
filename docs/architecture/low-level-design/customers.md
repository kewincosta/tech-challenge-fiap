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
of `identity`. The use case runs under the `TransactionRunner`, so the account and the customer
commit together, which is why the repository honours an ambient manager
([0023](../../adr/0023-repositories-honour-an-ambient-transaction.md)).

Its input is either an existing `userId` or a full person to create, never both. Supplying both is
`CUSTOMER_AMBIGUOUS_REGISTRATION` (400), because the use case cannot tell which one the caller meant.

## Queries and ports

| Query                      | Answers                                                                                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GetCustomerQuery`         | One customer by external id, whatever its status. Throws `CustomerNotFoundError` when there is none, so a deactivated customer stays apart from a missing one.                                       |
| `GetCustomerByUserIdQuery` | The customer behind a token. Throws `CustomerNotFoundError` for a user with no customer record. `work-orders` and `vehicles` call it through their `CustomerDirectory` and `VehicleOwners` gateways. |
| `ListCustomersQuery`       | The administrative listing, newest first. It filters by name or by document.                                                                                                                         |

Ports, all in `application/ports`: `CustomerRepository`, `CustomerQueryPort` and `CustomerAccounts`.
The last one is what registration needs of the accounts `identity` owns: find a user, check that it
holds `CUSTOMER`, and open an account.

The listing takes the name, email and document of each customer from `identity`. The query adapter
asks `FindUsersUseCase` for the users that match the filter, turns their ids into internal keys with
`UserKeyResolver`, and reads `customers` filtered by those keys. Without a filter it reads
`customers` first and asks `identity` for the users behind them. The document is passed on as typed,
and `identity` normalizes it and finds nobody for a malformed one
([0028](../../adr/0028-each-module-queries-only-its-own-tables.md)).

## Persistence

`TypeOrmCustomerRepository`, `TypeOrmCustomerQueryAdapter`, `CustomerMapper` and
`CustomerKeyResolver` in `infrastructure/persistence`. `CustomerAccountsGateway` is in
`infrastructure/gateways`.

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
