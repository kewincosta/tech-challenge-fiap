# Ubiquitous language: Service Catalog

> Part of the [ubiquitous language set](README.md). The terms here apply to the Workshop Catalog
> context, implemented in the `services` module.

## 1. Context

**Bounded context:** Service Catalog (Workshop Catalog)

**Description.** Covers what the workshop sells as labour: which services exist, at which list
price and in how much estimated time. It is the smallest context in the system, and the most
stable.

**What is out of scope.** The service performed on a work order, which is another concept and
belongs to Work Order. Here sits the price list entry; there sits the line of one concrete visit.
Also out of scope is the real execution time, which the work order metrics measure rather than
this context promising.

**Who is involved:**

- Administrator (defines the catalog and the prices)
- Service advisor (looks it up while building the order)
- Mechanic (looks it up)

## 2. Domain concepts

| Term                   | Definition                                                            | Example               | Notes                                                       |
| ---------------------- | --------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------- |
| **Catalog service**    | A job the workshop sells, with a list price and an estimated duration | Oil change, R$ 150.99 | It is the price list, not the work of one order             |
| **List price**         | What the workshop charges for that service today                      | R$ 150.99             | Can change; the change does not touch orders already quoted |
| **Estimated duration** | How long the workshop expects the service to take                     | 60 minutes            | A planning forecast, never a measurement                    |
| **Inactive service**   | A service taken out of the catalog, whose record remains              | -                     | Disappears from the listing; does not go onto a new order   |

### Catalog service

**Definition.** A job the workshop sells, with a name, a list price and an estimated duration.

**Characteristics:**

- The name is unique among active services
- The price is always in integer cents
- The estimated duration is in minutes and serves planning, not billing
- Changing the price affects the next budgets, never the ones already generated
- Being deactivated blocks it from a new order; the old orders stay valid

**Relationships:**

- Catalog service is copied by Requested service (Work Order context)

**Example:**

> "Put the oil change on the list at one fifty, an hour of work."

## 3. Actors

| Actor             | Who they are                    | Responsibility in the domain                           |
| ----------------- | ------------------------------- | ------------------------------------------------------ |
| **Administrator** | Defines what the workshop sells | Registers, updates the price and duration, deactivates |
| **Advisor**       | Builds the work order           | Looks the catalog up to add services to an order       |
| **Mechanic**      | Does the work                   | Looks the catalog up                                   |

## 4. Commands

| Command                | Actor         | What it means                                     | Expected outcome                              |
| ---------------------- | ------------- | ------------------------------------------------- | --------------------------------------------- |
| **Register service**   | Administrator | Put a job on the price list                       | Active service, with a price and a duration   |
| **Update service**     | Administrator | Correct the name, description, price or duration  | Fields changed; orders already quoted do not  |
| **Deactivate service** | Administrator | Take the service off the list, keeping the record | Inactive service; the name becomes free again |

### Update service

**Intent.** The administrator wants to correct the price or the estimate of a service.

**Actor.** Administrator.

**Preconditions:**

- The service exists
- The new name, if any, does not collide with another active service

**Outcome:**

- The supplied fields change; the omitted ones stay
- Event: Service updated

**Note.** The change is not retroactive. A service already added to an order carries the copy of
the price made at the moment it was added, and that copy never changes.

## 5. Domain events

| Event                   | What it means                                | When it happens           |
| ----------------------- | -------------------------------------------- | ------------------------- |
| **Service registered**  | A job entered the price list                 | On registering a service  |
| **Service updated**     | Name, description, price or duration changed | On updating a service     |
| **Service deactivated** | A job left the price list                    | On deactivating a service |

## 6. Policies and business rules

| Rule                               | Description                                                              |
| ---------------------------------- | ------------------------------------------------------------------------ |
| The name is unique among active    | Two active services do not share a name; a deactivated one frees its own |
| The price is in integer cents      | There is never a fractional cent nor a rounding step                     |
| The duration is positive           | The estimate is at least one minute                                      |
| The change is not retroactive      | Changing the price alters no work order already quoted                   |
| An inactive service opens no order | A service off the list is not added to a new order                       |

### The change is not retroactive

**When:** the list price of a service changes.

**Then:** the new price applies to the next additions to an order. Every earlier addition kept the
copy of the price that applied at that moment.

**Example:**

> "The oil change went up to R$ 180 today. Joana's order, quoted yesterday, stays at R$ 150.99."

**Why it works that way.** An approved budget is an agreement. If the list price could move the
agreed figure, the customer would approve one number and pay another.

## 7. Statuses

| Status       | What it means                                   | Entered by   | Left by      |
| ------------ | ----------------------------------------------- | ------------ | ------------ |
| **Active**   | On the list and available to go onto an order   | Registration | Deactivation |
| **Inactive** | Off the list; the record and the history remain | Deactivation | Terminal     |

```text
Registered
    │
    │ deactivate
    ▼
  Inactive   (terminal: the name is free for a new service)
```

## 8. Aggregate

### Aggregate: Catalog service

**Responsibility.** Hold what the workshop sells and at what price.

**Root.** Catalog service.

**Behaviours:** register, update, deactivate.

**Invariants:**

- The name is not empty and is unique among active services
- The price is a non-negative value in integer cents
- The estimated duration is at least one minute

**A note on its size.** It is the simplest aggregate in the system, and that is appropriate: a
price list entry has no lifecycle beyond existing, changing price and going out of production. The
complexity of the domain is in what happens to it inside a work order, and that complexity belongs
there.

## 9. How the concepts relate

```text
Catalog service
    │
    └── is copied by ──> Requested service   (Work Order context)
                              │
                              └── belongs to ──> Work order
```

| From              | Relation | To              | Description                                                        |
| ----------------- | -------- | --------------- | ------------------------------------------------------------------ |
| Requested service | copy of  | Catalog service | Copies the name and price at the moment of addition; never changes |
| Work order        | reads    | Catalog service | Only to read the name, price and status; never to write            |

## 10. Domain vocabulary and technical vocabulary

| Domain (business)  | Technical (code)                              | Note                                         |
| ------------------ | --------------------------------------------- | -------------------------------------------- |
| Catalog service    | `Service`, `/services`                        | -                                            |
| List price         | `Money`, `priceCents`                         | Integer cents                                |
| Estimated duration | `ServiceDuration`, `estimatedDurationMinutes` | In minutes                                   |
| Service name       | `ServiceName`, `name`                         | Unique among active services                 |
| Deactivate service | `DeactivateServiceCommand`, `DELETE`          | The HTTP verb is `DELETE`; nothing is erased |

## 11. Terms rejected in this context

| Rejected term         | Use instead                           | Why                                                               |
| --------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| Product               | Catalog service                       | Product suggests something physical; what is here is labour       |
| Service (unqualified) | Catalog service, or Requested service | Two concepts living in distinct contexts                          |
| Execution time        | Estimated duration                    | The real time is measured by the order metrics, not promised here |
| Delete a service      | Deactivate a service                  | Nothing is erased; the old orders keep pointing at it             |

## 12. Phrases from the domain

> "Put the wheel alignment on the list at a hundred and twenty."

> "The oil change price went up. The orders already quoted stay at the old figure."

> "We do not do that service any more. Deactivate it, but do not lose the history."

> "The duration is an estimate, so I can build the schedule. The real time is what the report measures."

## 13. Example flow

### Flow: from registration to use on an order

```text
AT: Administrator | CMD: Register service       | EV: Service registered  | POL: name unique among active
AT: Advisor       | CMD: Add service to order   | EV: Service added to order
                    (Work Order context)        | The price is copied now | POL: the copy never changes
AT: Administrator | CMD: Update service         | EV: Service updated     | POL: the change is not retroactive
AT: Administrator | CMD: Deactivate service     | EV: Service deactivated | POL: does not go onto a new order
```

**Rules of the flow:**

1. The catalog is read by the work order, never written by it
2. The price becomes a copy at the instant of the addition, and the copy is what holds from then on
3. Deactivating affects no existing work order
