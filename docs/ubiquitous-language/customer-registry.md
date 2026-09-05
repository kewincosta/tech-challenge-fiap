# Ubiquitous language: Customer Registry

> Part of the [ubiquitous language set](README.md). The terms here apply to the Customer
> Management context, implemented in the `customers` and `vehicles` modules.

## 1. Context

**Bounded context:** Customer Registry (Customer Management)

**Description.** Covers who the workshop serves, what it records about that relationship, and
which vehicles belong to whom. It is the context reception uses before any work order exists.

**What is out of scope.** The login account and the password, which belong to Identity and Access.
Here the customer is the person the workshop serves, not the credential they sign in with.

**Who is involved:**

- Service advisor (reception and counter)
- Administrator (record corrections, deactivation)
- Customer (reading and updating their own record)

## 2. Domain concepts

| Term                  | Definition                                                                         | Example                 | Notes                                                                    |
| --------------------- | ---------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------ |
| **Customer**          | The person or company the workshop serves, with the contact details of the service | Joana Pereira           | An account becomes a customer; not every account is one                  |
| **Document**          | The CPF or CNPJ that identifies the customer at the counter                        | `111.444.777-35`        | Validated by check digit. Stored as digits only                          |
| **Address**           | The customer's address, all or nothing                                             | Av. Paulista, 1578, SP  | Either it comes complete, or not at all. Only the complement is optional |
| **Phone number**      | The customer's contact, landline or mobile                                         | `(11) 98765-4321`       | Stored as digits only, with the area code                                |
| **Vehicle**           | The car the customer brings, identified by its plate                               | Corolla 2020, `RDX8B47` | Exists in the system only as something a customer brings                 |
| **Plate**             | The vehicle's official identification                                              | `ABC1234` or `ABC1D23`  | Accepts the old and the Mercosul formats, with or without separators     |
| **Transfer**          | The change of owner of a vehicle, from one customer to another                     | Joana sold the car      | Same vehicle; the record starts pointing at another customer             |
| **Inactive customer** | A deactivated customer: opens no new order, but the history remains                | -                       | Disappears from the listing, still readable by identifier                |

### Customer

**Definition.** The person or company the workshop serves, with the details the service needs to
keep about that relationship.

**Characteristics:**

- Always built on top of a user account, which supplies the name, email and document
- Adds what belongs to the workshop: address and phone number
- A user account has at most one customer record
- Being deactivated blocks a new order; the old ones stay valid and readable

**Relationships:**

- Customer is a User account with workshop data (Identity and Access context)
- Customer holds Vehicles
- Customer is referenced by Work orders (Work Order context)

**Example:**

> "Is Joana already a customer? Look her up by CPF."

### Vehicle

**Definition.** The car a customer brings to the workshop, identified by its plate.

**Characteristics:**

- Always belongs to a customer; there is no ownerless vehicle in the system
- The plate is unique among active vehicles
- Make, model and year can be corrected; the plate cannot
- Can be transferred to another customer
- Being removed is a deactivation: the record stays for the orders that reference it

**Relationships:**

- Vehicle belongs to a Customer
- Vehicle is referenced by Work orders (Work Order context)

**Example:**

> "Register her Corolla, plate RDX8B47, 2020."

## 3. Actors

| Actor             | Who they are              | Responsibility in the domain                                  |
| ----------------- | ------------------------- | ------------------------------------------------------------- |
| **Advisor**       | Works the counter         | Registers customers and vehicles, looks people up by document |
| **Administrator** | Answers for the operation | Corrects records, transfers vehicles, deactivates             |
| **Customer**      | The person being served   | Reads and updates their own address and phone number          |

## 4. Commands

| Command                 | Actor                   | What it means                                           | Expected outcome                               |
| ----------------------- | ----------------------- | ------------------------------------------------------- | ---------------------------------------------- |
| **Register customer**   | Advisor / Administrator | Turn an account into a customer, or create both at once | Active customer, linked to a user account      |
| **Update customer**     | Advisor / Customer      | Correct the address or the phone number                 | Fields changed                                 |
| **Deactivate customer** | Administrator           | End the relationship, keeping the history               | Inactive customer; opens no new order          |
| **Register vehicle**    | Advisor                 | Register the car of an active customer                  | Active vehicle, linked to the customer         |
| **Update vehicle**      | Advisor / Administrator | Correct the make, model or year, or transfer the owner  | Fields changed                                 |
| **Remove vehicle**      | Advisor / Administrator | Take the vehicle off the customer's record              | Inactive vehicle; the plate becomes free again |

### Register customer

**Intent.** The advisor needs a workshop record for whoever walked up to the counter.

**Actor.** Advisor or administrator.

**Preconditions:**

- Either an existing account is supplied, or the data to create one; never both
- When the account already exists, it has to carry the customer role
- The account does not already have a customer record
- The address, if supplied, is complete

**Outcome:**

- Active customer, linked to the account
- When the account is created here, a temporary password is returned once
- Event: Customer registered

**Note.** Both halves happen in the same transaction: if the customer record fails, the account
created alongside it is not left orphaned.

## 5. Domain events

| Event                    | What it means                               | When it happens            |
| ------------------------ | ------------------------------------------- | -------------------------- |
| **Customer registered**  | A person became someone the workshop serves | On registering a customer  |
| **Customer updated**     | The address or phone number changed         | On updating a customer     |
| **Customer deactivated** | The relationship ended                      | On deactivating a customer |
| **Vehicle registered**   | A car entered a customer's record           | On registering a vehicle   |
| **Vehicle updated**      | The car's details or its owner changed      | On updating a vehicle      |
| **Vehicle removed**      | A car left the record                       | On removing a vehicle      |

## 6. Policies and business rules

| Rule                                       | Description                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| The document is really validated           | CPF and CNPJ go through the check digit calculation, not just a length test  |
| One account, one customer                  | A user account has at most one active customer record                        |
| The account needs the customer role        | Registering over an existing account requires it to already carry `CUSTOMER` |
| The address is all or nothing              | Either every field comes, or none. Only the complement is optional           |
| The state is checked against the real list | The state has to be one of the 27 Brazilian codes, not any two letters       |
| The plate is unique among active vehicles  | Two active vehicles do not share a plate; a removed one frees its own        |
| The plate does not change                  | Correcting a plate means removing the vehicle and registering another        |
| A vehicle needs an active customer         | No vehicle is registered for a deactivated customer                          |
| An inactive customer opens no order        | The restriction applies to new orders; the old ones stay valid               |

### The document is really validated

**When:** a document is supplied, in any operation.

**Then:** the separators are stripped, the length decides whether it is a CPF or a CNPJ, and the
check digits are recomputed and compared. A document whose digits are all the same is refused.

**Example:**

> "`111.444.777-35` is accepted. `111.444.777-00` has the same shape and is refused: the check
> digit does not add up."

### The address is all or nothing

**When:** an address is supplied, at registration or on an update.

**Then:** street, number, district, city, state and postcode are all required. Only the complement
may be missing. No partial address is stored.

**Example:**

> "She only knows the street and the number right now. Then leave it without an address and
> complete it later; half an address does not go in."

## 7. Statuses

| Status       | What it means                                                  | Entered by   | Left by      |
| ------------ | -------------------------------------------------------------- | ------------ | ------------ |
| **Active**   | Customer or vehicle in normal use                              | Registration | Deactivation |
| **Inactive** | Deactivated: disappears from listings, record and history stay | Deactivation | Terminal     |

```text
Registered
    │
    │ deactivate
    ▼
  Inactive   (terminal: there is no reactivation through the API)
```

## 8. Aggregates

### Aggregate: Customer

**Responsibility.** Hold the workshop's relationship with whoever it serves, and guarantee one
account does not become two customers.

**Root.** Customer.

**Behaviours:** register, update the address and phone number, deactivate.

**Invariants:**

- A user account has at most one active customer
- The address, when it exists, is complete and carries a valid state code
- The phone number, when it exists, has an area code and the length of a landline or a mobile

### Aggregate: Vehicle

**Responsibility.** Hold the car and whom it belongs to.

**Root.** Vehicle.

**Behaviours:** register, update details, transfer owner, remove.

**Invariants:**

- The plate is valid in one of the two Brazilian formats
- The plate is unique among active vehicles
- The year falls within a plausible range
- Every vehicle has an owner

**Why two aggregates.** A customer and a vehicle change for different reasons at different times:
someone's address changes without the car changing, and the car is sold without the person
changing. A single aggregate would force loading the whole vehicle list to correct a phone number.

## 9. How the concepts relate

```text
User account   (Identity and Access context)
    │
    └── is ──> Customer
                │
                ├── holds ──> Vehicle
                │                 │
                │                 └── is referenced by ──> Work order
                │
                └── is referenced by ──> Work order
```

| From         | Relation  | To                | Description                                                       |
| ------------ | --------- | ----------------- | ----------------------------------------------------------------- |
| User account | is        | Customer          | One to at most one; the account supplies name, email and document |
| Customer     | holds     | Vehicle           | A customer has zero or more vehicles                              |
| Work order   | refers to | Customer, Vehicle | The order keeps a frozen copy of the details as of the opening    |

## 10. Domain vocabulary and technical vocabulary

| Domain (business)     | Technical (code)                        | Note                                                       |
| --------------------- | --------------------------------------- | ---------------------------------------------------------- |
| Customer              | `Customer`, `/customers`                | -                                                          |
| Document (CPF/CNPJ)   | `PersonDocument`, `document`            | Stored as digits only                                      |
| Address               | `Address`, `address`                    | -                                                          |
| State                 | `state`                                 | Two letters, checked against the list of 27                |
| Postcode              | `zipCode`                               | Stored as the eight digits only                            |
| Phone number          | `PhoneNumber`, `phoneNumber`            | Stored as digits only                                      |
| Vehicle               | `Vehicle`, `/vehicles`                  | -                                                          |
| Plate                 | `LicensePlate`, `plate`                 | Normalised to uppercase, without separators                |
| Transfer a vehicle    | `PATCH /vehicles/:id` with `customerId` | No route of its own; it is the owner update                |
| Deactivate a customer | `DeactivateCustomerCommand`, `DELETE`   | The HTTP verb is `DELETE`; nothing is erased               |
| Remove a vehicle      | `RemoveVehicleCommand`, `DELETE`        | "Remove" in the business, logical deletion in the database |
| My record             | `GET /customers/me`                     | The customer reading their own record                      |

## 11. Terms rejected in this context

| Rejected term         | Use instead           | Why                                                                |
| --------------------- | --------------------- | ------------------------------------------------------------------ |
| User (for a customer) | Customer              | A user is the login account; a customer is who the workshop serves |
| Owner                 | Customer              | One term for whoever brings the car and whoever pays the bill      |
| Car                   | Vehicle               | The registry accepts any vehicle, not only cars                    |
| Delete a customer     | Deactivate a customer | Nothing is erased; the old orders keep pointing at them            |
| Document (a file)     | Document (CPF/CNPJ)   | In this context, "document" always means a CPF or a CNPJ           |

## 12. Phrases from the domain

> "Look her up by CPF, she came here last year."

> "New customer. Register the account and the car."

> "He sold the Golf to his brother. Transfer the vehicle."

> "Half an address does not go in: either complete, or none."

> "The customer is inactive, we cannot open an order. The history is still there."

## 13. Example flow

### Flow: first visit

```text
AT: Customer  | CMD: Create account      | EV: Account registered
AT: Advisor   | CMD: Register customer   | EV: Customer registered  | POL: one account, one customer
AT: Advisor   | CMD: Register vehicle    | EV: Vehicle registered   | POL: plate unique among active
AT: Advisor   | CMD: Open work order     | EV: Work order opened    | POL: an inactive customer opens no order
```

**Rules of the flow:**

1. The customer exists before the vehicle, and both before the work order
2. The account has to carry the customer role before it can become a record
3. The order copies the customer's and the vehicle's details, and never asks for them again
