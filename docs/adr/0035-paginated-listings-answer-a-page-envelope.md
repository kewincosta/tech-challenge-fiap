# 0035. Paginated listings answer a page envelope

**Status**: Accepted
**Source**: AD-019 in `.specs/STATE.md`
**Recorded**: 2026-11-01, from AD-019, taken during the `work-order-phase-2-api` feature

## Context

`GET /work-orders` answered every work order, newest first, with the completed, delivered and
canceled ones among the work in progress. The answer grew with every order ever opened, and no
listing of the API had pagination. The Phase 2 brief asks for a board that lists the work in
progress first and oldest first, with the finished orders left out by a filter.

## Decision

A paginated listing requires two query parameters, `page` (an integer from 1) and `pageSize` (an
integer from 1 to 100), and answers one object:

```json
{ "items": [], "page": 1, "pageSize": 20, "totalItems": 135, "totalPages": 7 }
```

`totalPages` is `totalItems` divided by `pageSize`, rounded up, and 0 when nothing matches. A page
past the last answers 200 with `items` empty and the same totals. A call without the parameters, or
with one out of range, answers 400 `VALIDATION_ERROR`, and so does a query parameter the listing
does not know.

`GET /work-orders` is the first listing to follow this shape, and a later paginated listing copies
it. It also takes `status`, one or more of the seven statuses separated by commas, and a status
that does not exist answers 400. Without `status` the board lists `IN_EXECUTION`,
`AWAITING_APPROVAL`, `IN_DIAGNOSIS` and `RECEIVED`. With it, the board lists exactly the statuses
named, `COMPLETED`, `DELIVERED` and `CANCELED` included. The order is the one above followed by
`COMPLETED`, `DELIVERED` and `CANCELED`, and the oldest work order comes first within a status.

`ListWorkOrdersUseCase` holds the default and the order, and builds the envelope. It hands the
query port the statuses to list, already in order. The adapter reads the work orders in those
statuses ordered by the position of the status and then by creation time, one page of them, and
counts every match.

`GET /work-orders/me` and the other listings stay as they are.

## Alternatives

`limit` and `offset` with an array body and an `X-Total-Count` header were rejected, and so was a
cursor. The user chose `page` and `pageSize` with the totals in the body, beside the items they
describe.

Optional parameters with defaults were rejected. The user asked for them to be required, so a client
always states how much it wants back.

## Consequences

A client of `GET /work-orders` gets 400 until it sends `page` and `pageSize`, and reads the work
orders from `items`. An unknown status answers 400. The README, the low level design and the Postman
collection show the call.

The adapter reads a page and counts the matches in two queries with no shared snapshot. A work
order opened between the two can leave `totalItems` one off from the rows of the page.

The sort runs over the matching work orders on every page, and the table has no index for it. With
tens of thousands of work orders a page takes about 20 milliseconds to read. A schema change that
adds an index on status and creation time is worth planning if the table grows far beyond that.
