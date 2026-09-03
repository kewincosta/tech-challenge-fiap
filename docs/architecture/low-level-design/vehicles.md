# vehicles

The vehicles a customer brings in. Part of the Customer Management context, alongside
[customers](customers.md).

A vehicle exists in this system only as something a customer owns, which is why it lives here
rather than in a context of its own.

Conventions this page does not repeat are in [the high level design](../high-level-design.md).

## Aggregate

`Vehicle` (`domain/entities/vehicle.ts`).

Invariants it holds:

- A vehicle always belongs to a customer. The owner is resolved before the vehicle is created, and an inactive owner is refused: `VEHICLE_OWNING_CUSTOMER_INACTIVE` (422).
- The plate is unique among vehicles that are not removed, enforced by `ux_vehicles_plate`.
- Removal is a soft delete, which frees the plate for a future registration.
- Records `VehicleRegistered`, `VehicleUpdated` and `VehicleRemoved`.

## Value objects

| Value object   | Rule                                                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LicensePlate` | Old format `AAA0000` or Mercosul `AAA0A00`. Separators stripped, lowercase normalised. `VEHICLE_INVALID_LICENSE_PLATE` (400).                                                                                       |
| `VehicleYear`  | An integer from 1950 to next year. The current year is passed in from the caller's `Clock` port rather than read from the system clock, so the rule is testable without a fake clock. `VEHICLE_INVALID_YEAR` (400). |
| `VehicleId`    | External UUID.                                                                                                                                                                                                      |

Brand and model are validated together as vehicle details: `VEHICLE_INVALID_DETAILS` (400).

## Commands

| Command                  | Handler            | What it does                                                      |
| ------------------------ | ------------------ | ----------------------------------------------------------------- |
| `RegisterVehicleCommand` | `register-vehicle` | Registers a vehicle under a customer, refusing an inactive owner. |
| `UpdateVehicleCommand`   | `update-vehicle`   | Changes brand, model or year.                                     |
| `RemoveVehicleCommand`   | `remove-vehicle`   | Soft-deletes the vehicle.                                         |

## Queries and ports

| Query                         | Answers                                                                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GetVehicleQuery`             | One vehicle by external id.                                                                                                                          |
| `ListVehiclesByCustomerQuery` | Every vehicle of one customer.                                                                                                                       |
| `GetMyVehiclesQuery`          | The caller's own vehicles, resolving the customer from the token over the `QueryBus`. Answers an empty list when the account has no customer record. |

Ports: `VehicleRepository` (`domain/repositories`), `VehicleQueryPort` (`application/ports`).

## Persistence

`TypeOrmVehicleRepository`, `TypeOrmVehicleQueryAdapter` and `VehicleMapper` in
`infrastructure/persistence`.

### `vehicles`

From migration `1787702400003-create-vehicles-table.ts`.

| Column        | Type          | Notes                                                                                          |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------- |
| `id`          | `bigserial`   | Primary key, internal only.                                                                    |
| `external_id` | `uuid`        | `ux_vehicles_external_id` unique.                                                              |
| `customer_id` | `bigint`      | References `customers (id)`, `ON DELETE RESTRICT`.                                             |
| `plate`       | `varchar(7)`  | Normalised, no separators. Unique among rows where `deleted_at IS NULL` (`ux_vehicles_plate`). |
| `brand`       | `varchar(60)` |                                                                                                |
| `model`       | `varchar(60)` |                                                                                                |
| `year`        | `smallint`    |                                                                                                |
| `created_at`  | `timestamptz` |                                                                                                |
| `updated_at`  | `timestamptz` |                                                                                                |
| `deleted_at`  | `timestamptz` | Null while registered.                                                                         |

Indexed by `ix_vehicles_customer_id`, which is the shape the per-customer listing reads.

## Endpoints

`/api/v1/vehicles`.

| Route                          | Permission          |
| ------------------------------ | ------------------- |
| `POST /vehicles`               | `vehicles:manage`   |
| `GET /vehicles/me`             | none beyond a token |
| `GET /vehicles`                | `vehicles:read`     |
| `GET /vehicles/:externalId`    | `vehicles:read`     |
| `PATCH /vehicles/:externalId`  | `vehicles:manage`   |
| `DELETE /vehicles/:externalId` | `vehicles:manage`   |

`GET /vehicles/me` carries no `@RequirePermissions` decorator: any authenticated caller may ask for
their own vehicles, and the scoping is done by resolving the customer from the token rather than by
a permission. The equivalent route in `work-orders` does carry one, `work-orders:read-own`. The
asymmetry is real, and it predates that permission being seeded.

`me` is declared before `:externalId`.

## Errors

| Error                             | Code                                    | Status |
| --------------------------------- | --------------------------------------- | ------ |
| `InvalidLicensePlateError`        | `VEHICLE_INVALID_LICENSE_PLATE`         | 400    |
| `InvalidVehicleYearError`         | `VEHICLE_INVALID_YEAR`                  | 400    |
| `InvalidVehicleDetailsError`      | `VEHICLE_INVALID_DETAILS`               | 400    |
| `VehicleNotFoundError`            | `VEHICLE_NOT_FOUND`                     | 404    |
| `ReferencedCustomerNotFoundError` | `VEHICLE_REFERENCED_CUSTOMER_NOT_FOUND` | 404    |
| `LicensePlateAlreadyInUseError`   | `VEHICLE_LICENSE_PLATE_ALREADY_IN_USE`  | 409    |
| `OwningCustomerInactiveError`     | `VEHICLE_OWNING_CUSTOMER_INACTIVE`      | 422    |
