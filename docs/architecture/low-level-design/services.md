# services

What the workshop sells as labour, at which price and estimated duration. The whole of the
Workshop Catalog context.

This module is read by `work-orders` when a service is added to a work order, and its price is
frozen into the budget round at that moment rather than read again later
([0019](../../adr/0019-withdrawal-charged-at-the-budgeted-price.md)).

Conventions this page does not repeat are in [the high level design](../high-level-design.md).

## Aggregate

`Service` (`domain/entities/service.ts`).

Invariants it holds:

- The name is unique among active services, case-insensitively, enforced by `ux_services_active_name` on `lower(name)`.
- The price is a `Money` in integer BRL cents and cannot be negative ([0007](../../adr/0007-money-in-integer-brl-cents.md)).
- The estimated duration is a positive whole number of minutes.
- Deactivation is a status change, not a delete. There is no `deleted_at` on this table: a service that priced past work orders has to stay readable.
- Records `ServiceCreated`, `ServiceUpdated` and `ServiceDeactivated`.

## Value objects

| Value object      | Rule                                                                    |
| ----------------- | ----------------------------------------------------------------------- |
| `ServiceName`     | Trimmed, non-empty, length-bounded. `SERVICE_INVALID_NAME` (400).       |
| `ServiceDuration` | A positive integer number of minutes. `SERVICE_INVALID_DURATION` (400). |
| `ServiceId`       | External UUID.                                                          |

`Money` comes from the shared kernel rather than being redefined here.

## Commands

| Command                    | Handler              | What it does                                                       |
| -------------------------- | -------------------- | ------------------------------------------------------------------ |
| `CreateServiceCommand`     | `create-service`     | Adds a service to the catalog.                                     |
| `UpdateServiceCommand`     | `update-service`     | Changes name, description, price or duration.                      |
| `DeactivateServiceCommand` | `deactivate-service` | Moves it to `INACTIVE`, freeing the name for a new active service. |

A price change applies to budget rounds generated after it, and to nothing already frozen.

## Queries and ports

`GetServiceQuery` and `ListServicesQuery`. Ports: `ServiceRepository` (`domain/repositories`),
`ServiceQueryPort` (`application/ports`).

## Persistence

`TypeOrmServiceRepository`, `TypeOrmServiceQueryAdapter` and `ServiceMapper` in
`infrastructure/persistence`.

### `services`

From migration `1787702400004-create-services-table.ts`.

| Column                       | Type           | Notes                                                                                      |
| ---------------------------- | -------------- | ------------------------------------------------------------------------------------------ |
| `id`                         | `bigserial`    | Primary key, internal only.                                                                |
| `external_id`                | `uuid`         | `ux_services_external_id` unique.                                                          |
| `name`                       | `varchar(120)` | Unique among active rows, case-insensitively (`ux_services_active_name` on `lower(name)`). |
| `description`                | `varchar(255)` | Nullable.                                                                                  |
| `price_cents`                | `bigint`       | Integer BRL cents. `chk_services_price_cents`: `>= 0`.                                     |
| `estimated_duration_minutes` | `integer`      | `chk_services_duration`: `> 0`.                                                            |
| `status`                     | `varchar(20)`  | `chk_services_status`: `ACTIVE` or `INACTIVE`.                                             |
| `created_at`                 | `timestamptz`  |                                                                                            |
| `updated_at`                 | `timestamptz`  |                                                                                            |

Two things distinguish this table from the others in the system. There is no `deleted_at`, because
deactivation is the only removal a catalog entry gets and history has to keep referring to it. And
its uniqueness index is filtered by `status = 'ACTIVE'` rather than by a soft-delete column, and
keyed on `lower(name)`, so "Troca de óleo" and "troca de óleo" cannot both be active.

## Endpoints

`/api/v1/services`.

| Route                          | Permission        |
| ------------------------------ | ----------------- |
| `POST /services`               | `services:manage` |
| `GET /services`                | `services:read`   |
| `GET /services/:externalId`    | `services:read`   |
| `PATCH /services/:externalId`  | `services:manage` |
| `DELETE /services/:externalId` | `services:manage` |

`DELETE` deactivates. Nothing here removes a row.

## Errors

| Error                          | Code                          | Status |
| ------------------------------ | ----------------------------- | ------ |
| `InvalidServiceNameError`      | `SERVICE_INVALID_NAME`        | 400    |
| `InvalidServiceDurationError`  | `SERVICE_INVALID_DURATION`    | 400    |
| `ServiceNotFoundError`         | `SERVICE_NOT_FOUND`           | 404    |
| `ServiceNameAlreadyInUseError` | `SERVICE_NAME_ALREADY_IN_USE` | 409    |
