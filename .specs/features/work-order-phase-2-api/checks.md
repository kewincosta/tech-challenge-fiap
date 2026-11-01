# Work order Phase 2 API checks

Build: `npm run build`; `npm run lint`
Run unit: `npx vitest run --config vitest.config.ts --reporter=verbose src/modules/work-orders src/config`
Run integration: `npx vitest run --config vitest.integration.config.ts --reporter=verbose work-order-phase-2`
Run e2e: `npx vitest run --config vitest.e2e.config.ts --reporter=verbose work-order-phase-2`
Plan: `.specs/features/work-order-phase-2-api/plan.md`

The integration and e2e runs select their files by name, so every spec this feature adds under `test/integration/` or `test/e2e/` starts with `work-order-phase-2-`. The board's order, exclusion and paging run in an integration spec against a database the spec creates and drops, the way `test/integration/seed.script.spec.ts` does, because the shared test database is never truncated and keeps growing.

49 checks in 6 slices · 6 one-way doors · 0 open, of which 0 block

## Checks

### S1 - Open a work order with the customer's services and parts

**C1** - An opening with two services and a part of quantity 2 answers 201 with the id and the number, and the work order is `RECEIVED` with three draft items, each with `budgetRound` null, the part's `plannedQuantity` 2 (AC 1)
Proof: run e2e | ✓ Opening a work order with items > opens a work order with two services and one part as draft items

**C2** - An opening with no services and no parts answers 201 and the work order has no items (AC 1)
Proof: run e2e | ✓ Opening a work order with items > opens a work order with no services and no parts

**C3** - An opening whose third service is unknown answers 404 `WORK_ORDER_REFERENCED_SERVICE_NOT_FOUND`, and the vehicle can still be opened afterwards, so nothing was opened (AC 2)
Proof: run e2e | ✓ Opening a work order with items > refuses an unknown service with 404 and opens nothing

**C4** - An opening with an unknown inventory item answers 404 `WORK_ORDER_REFERENCED_INVENTORY_ITEM_NOT_FOUND` and opens nothing (AC 2)
Proof: run e2e | ✓ Opening a work order with items > refuses an unknown inventory item with 404 and opens nothing

**C5** - An opening with an inactive service answers 422 `WORK_ORDER_SERVICE_INACTIVE` and opens nothing (AC 2)
Proof: run e2e | ✓ Opening a work order with items > refuses an inactive service with 422 and opens nothing

**C6** - An opening with an inactive inventory item answers 422 `WORK_ORDER_INVENTORY_ITEM_INACTIVE` and opens nothing (AC 2)
Proof: run e2e | ✓ Opening a work order with items > refuses an inactive inventory item with 422 and opens nothing

**C7** - An opening with a part of quantity 0, or with an item that lacks its id, answers 400 `VALIDATION_ERROR` and opens nothing, and a part of quantity 1 is accepted (AC 3)
Proof: run e2e | ✓ Opening a work order with items > refuses quantity 0 and an item without its id with 400, and accepts quantity 1

**C8** - `POST /work-orders/:number/parts` plans a part as a draft item on a `RECEIVED` work order and answers 422 `WORK_ORDER_INVALID_STATE` on a `COMPLETED` one (AC 4)
Proof: run e2e | ✓ Opening a work order with items > plans a part on a RECEIVED work order and refuses it on a COMPLETED one

**C9** - `WorkOrder` plans a part while `RECEIVED` (AC 4)
Proof: run unit | ✓ WorkOrder parts at reception > plans a part while RECEIVED

**C10** - Opened with services A and B and part P, then B removed and service C added during the diagnosis, the completed diagnosis's round 1 holds A, C and P and not B (AC 5)
Proof: run e2e | ✓ Opening a work order with items > builds round 1 from the items left after the diagnosis

**C11** - An opening with items for a vehicle that already has an active work order answers 409 `WORK_ORDER_VEHICLE_ALREADY_HAS_ACTIVE_WORK_ORDER` (Surface)
Proof: run e2e | ✓ Opening a work order with items > refuses a vehicle that already has an active work order with 409

**C12** - An opening with items answers 401 without a token and 403 without `work-orders:manage` (Surface)
Proof: run e2e | ✓ Opening a work order with items > answers 401 without a token and 403 without work-orders:manage

### S2 - The staff board, by status and one page at a time

**C13** - With one work order per status and no `status`, the board lists only the four open ones, `IN_EXECUTION` first, then `AWAITING_APPROVAL`, `IN_DIAGNOSIS` and `RECEIVED`, with `totalItems` 4 (AC 6)
Proof: run integration | ✓ Board listing on its own database > lists only the open statuses in the brief's order by default

**C14** - Two `RECEIVED` work orders created a minute apart come out older first (AC 6)
Proof: run integration | ✓ Board listing on its own database > lists the older work order first within a status

**C15** - `status=CANCELED,DELIVERED` lists the delivered ones before the canceled ones and nothing else (AC 7)
Proof: run integration | ✓ Board listing on its own database > lists delivered before canceled for status=CANCELED,DELIVERED

**C16** - `status=COMPLETED` lists completed work orders only (AC 7)
Proof: run integration | ✓ Board listing on its own database > lists only completed work orders for status=COMPLETED

**C17** - A `status` naming all seven statuses lists them in the order `IN_EXECUTION`, `AWAITING_APPROVAL`, `IN_DIAGNOSIS`, `RECEIVED`, `COMPLETED`, `DELIVERED`, `CANCELED` (AC 7)
Proof: run integration | ✓ Board listing on its own database > orders all seven statuses when the filter names them all

**C18** - With 5 matches and `pageSize` 2, pages 1 and 2 hold 2 items and page 3 holds 1, `totalPages` is 3, and page 4 answers empty `items` with `totalItems` 5 and `totalPages` 3 (AC 8)
Proof: run integration | ✓ Board listing on its own database > splits five matches into pages of two and answers an empty page past the last

**C19** - A filter that matches nothing answers `totalItems` 0 and `totalPages` 0 (AC 8)
Proof: run integration | ✓ Board listing on its own database > answers zero items and zero pages when nothing matches

**C20** - `GET /work-orders` answers 400 `VALIDATION_ERROR` with no `pageSize`, with `pageSize` 101, with `page` 0, with `status=FOO` and with `status=RECEIVED,FOO`, and 200 with `pageSize` 100 (AC 9)
Proof: run e2e | ✓ The paginated board > validates page, pageSize and status

**C21** - Through the route, the work order just opened is the last item of the last page of `status=RECEIVED`, in an answer with `items`, `page`, `pageSize`, `totalItems` and `totalPages` (AC 6, AC 8)
Proof: run e2e | ✓ The paginated board > answers the page envelope with the newest RECEIVED work order last

**C22** - The board with no `status` answers no completed, delivered or canceled work order (AC 6)
Proof: run e2e | ✓ The paginated board > leaves completed, delivered and canceled work orders out by default

**C23** - `GET /work-orders` answers 401 without a token and 403 without `work-orders:read`, with `page` and `pageSize` set (Surface)
Proof: run e2e | ✓ The paginated board > answers 401 without a token and 403 without work-orders:read

### S3 - The status named in Portuguese

**C24** - The label map answers `RECEIVED` "Recebida", `IN_DIAGNOSIS` "Diagnóstico", `AWAITING_APPROVAL` "Aguardando Aprovação", `IN_EXECUTION` "Execução", `COMPLETED` "Finalizada", `DELIVERED` "Entregue" and `CANCELED` "Cancelada" (AC 10)
Proof: run unit | ✓ Work order status labels > labels each of the seven statuses

**C25** - `GET /work-orders/:number`, `GET /work-orders/me/:number`, `GET /work-orders/me` and the board answer `statusLabel` "Recebida" beside `RECEIVED` (AC 10)
Proof: run e2e | ✓ Status labels > answers statusLabel on the detail, the customer routes and the board

### S4 - The customer decides a budget through its links

**C26** - With round 1 pending, the work order answer carries on round 1 `approvalUrl` `${APP_PUBLIC_URL}/api/v1/work-orders/${number}/budgets/${budgetId}/approval` and `rejectionUrl` ending in `/rejection` (AC 11)
Proof: run e2e | ✓ Budget decision links > carries both links on the pending round 1

**C27** - With round 1 approved and round 2 pending, round 1 carries null in both links and round 2 carries both (AC 11)
Proof: run e2e | ✓ Budget decision links > moves the links to round 2 once round 1 is decided

**C28** - The owning customer's `POST` to `approvalUrl` with their Bearer token answers 200, the budget is `APPROVED`, the work order is `IN_EXECUTION`, and `decidedByUserId` is the customer's user id (AC 12)
Proof: run e2e | ✓ Budget decision links > approves the pending budget through its approval link with the customer's token

**C29** - `POST` to `rejectionUrl` moves round 1 back to `IN_DIAGNOSIS` and round 2 to `IN_EXECUTION` (AC 13)
Proof: run e2e | ✓ Budget decision links > rejects round 1 to IN_DIAGNOSIS and round 2 to IN_EXECUTION through the rejection link

**C30** - Round 1's approval link, after round 1 was approved and round 2 sent, answers 422 `BUDGET_INVALID_STATE`, and round 2 stays `PENDING` (AC 14)
Proof: run e2e | ✓ Budget decision links > refuses the approval link of a budget that is not pending with 422

**C31** - The rejection link of a budget that is not pending answers 422 `BUDGET_INVALID_STATE` and changes nothing (AC 14)
Proof: run e2e | ✓ Budget decision links > refuses the rejection link of a budget that is not pending with 422

**C32** - The approval link with a budget id of another work order answers 404 `WORK_ORDER_BUDGET_NOT_FOUND` (AC 15)
Proof: run e2e | ✓ Budget decision links > refuses an approval link whose budget belongs to another work order with 404

**C33** - The rejection link with a budget id of another work order answers 404 `WORK_ORDER_BUDGET_NOT_FOUND` (AC 15)
Proof: run e2e | ✓ Budget decision links > refuses a rejection link whose budget belongs to another work order with 404

**C34** - Both links answer 404 `WORK_ORDER_NOT_FOUND` to another customer's token and 401 without a token (AC 15)
Proof: run e2e | ✓ Budget decision links > answers 404 to another customer and 401 without a token on both links

**C35** - A holder of `work-orders:decide` approves through the approval link (Surface)
Proof: run e2e | ✓ Budget decision links > lets a holder of work-orders:decide use the approval link

### S5 - The customer hears of every status change by e-mail

**C36** - Each of the thirteen transitions of the plan's state diagram, the opening included, records exactly one status change event carrying its old and its new status, and the approval records one although it also records two other events (AC 16)
Proof: run unit | ✓ WorkOrder status change events > records one status change event per transition

**C37** - On a status change, the subscriber sends one e-mail to the customer's address with the subject `Ordem de serviço ${number}: ${statusLabel}` and a body that names the customer, the work order number, the vehicle plate and the new label (AC 16)
Proof: run unit | ✓ StatusMailSubscriber > sends one e-mail with the status subject to the customer

**C38** - When the new status is `AWAITING_APPROVAL`, the e-mail carries the budget total in reais and the `approvalUrl` and `rejectionUrl` of the pending budget (AC 17)
Proof: run unit | ✓ StatusMailSubscriber > adds the budget total and both links when the budget awaits approval

**C39** - When the `Mailer` fails, the subscriber logs at error level the work order number and the error, and does not throw (AC 18)
Proof: run unit | ✓ StatusMailSubscriber > logs a failed e-mail with the work order number and does not throw

**C40** - Through the routes, opening the work order, starting and completing the diagnosis, approving the budget, completing and delivering send six e-mails, one per change, whose subjects end in "Recebida", "Diagnóstico", "Aguardando Aprovação", "Execução", "Finalizada" and "Entregue", in that order (AC 16)
Proof: run e2e | ✓ Status e-mails > sends one e-mail per change along the whole flow

**C41** - A round 1 rejection sends one e-mail ending in "Diagnóstico", a supplementary round sends one ending in "Aguardando Aprovação" with that round's links, and a cancellation sends one ending in "Cancelada" (AC 16, AC 17)
Proof: run e2e | ✓ Status e-mails > sends one e-mail for a rejection, a supplementary round and a cancellation

**C42** - The e-mail of a budget awaiting approval carries the `approvalUrl` and `rejectionUrl` the API answers for that budget (AC 17)
Proof: run e2e | ✓ Status e-mails > puts the API's decision links in the budget e-mail

**C43** - With a `Mailer` that fails, a transition answers 200 and the new status is saved (AC 18)
Proof: run e2e | ✓ Status e-mails > keeps the transition when the e-mail fails

**C44** - A refused transition (422) and adding an item to a work order send no e-mail (AC 19)
Proof: run e2e | ✓ Status e-mails > sends nothing when no status changes

### S6 - Configuration and the mail doors

**C45** - The SMTP adapter sends from `MAIL_FROM` to the given address the subject, the text and the HTML through the configured transport (door 5)
Proof: run unit | ✓ SmtpMailer > sends the message through the configured transport

**C46** - The environment validation refuses a missing `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM` or `APP_PUBLIC_URL` and accepts all of them set (door 4, door 5)
Proof: run unit | ✓ mail settings > requires the mail settings and the public URL

**C47** - With nothing overriding it, the application binds the `Mailer` port to the SMTP adapter (door 5)
Proof: run integration | ✓ Mail wiring > binds the Mailer to the SMTP adapter

**C48** - `docker-compose.yml` defines a `mailpit` service that publishes ports 1025 and 8025 (door 6)
Proof: `docker compose config | grep -A20 '^  mailpit:' | grep -q 'target: 1025' && docker compose config | grep -A20 '^  mailpit:' | grep -q 'target: 8025'`

**C49** - The whole unit, integration and e2e suites pass, the OpenAPI contract case against the regenerated baseline included (every criterion; the changed readers of the plan's `Changes underneath`)
Proof: `npm run test:unit && npm run test:integration && npm run test:e2e`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `POST /api/v1/work-orders` statuses (7) | 201 C1 · 400 C7 · 404 C3 · 404 C4 · 409 C11 · 422 C5 · 422 C6 · 401 C12 · 403 C12 | - |
| `GET /api/v1/work-orders` statuses (4) | 200 C21 · 400 C20 · 401 C23 · 403 C23 | - |
| `POST /api/v1/work-orders/:number/budgets/:budgetId/approval` statuses (5) | 200 C28 · 200 for `work-orders:decide` C35 · 404 `WORK_ORDER_BUDGET_NOT_FOUND` C32 · 404 `WORK_ORDER_NOT_FOUND` C34 · 422 C30 · 401 C34 | - |
| `POST /api/v1/work-orders/:number/budgets/:budgetId/rejection` statuses (5) | 200 C29 · 404 `WORK_ORDER_BUDGET_NOT_FOUND` C33 · 404 `WORK_ORDER_NOT_FOUND` C34 · 422 C31 · 401 C34 | - |
| every route that answers a work order: the new fields (4 routes) | `GET /work-orders/:number` C25, C26 · `GET /work-orders/me/:number` C25 · `GET /work-orders/me` C25 · `GET /work-orders` C25; their other statuses are unchanged and stay under C49 | - |
| opening rule, AC 1 and AC 2 (5 examples) | two services and a part C1 · no lists C2 · third service unknown C3 · inactive item C6 · quantity 1 C7 | - |
| planning a part by status, door 1 (2 examples) | `RECEIVED` C8, C9 · `COMPLETED` C8 | - |
| status order of the board (7) | `IN_EXECUTION` C13, C17 · `AWAITING_APPROVAL` C13, C17 · `IN_DIAGNOSIS` C13, C17 · `RECEIVED` C13, C17 · `COMPLETED` C16, C17 · `DELIVERED` C15, C17 · `CANCELED` C15, C17 | - |
| default exclusion (3) | `COMPLETED` C13, C22 · `DELIVERED` C13, C22 · `CANCELED` C13, C22 | - |
| paging rule, AC 8 (4 examples) | full pages C18 · last partial page C18 · page past the last C18 · no match C19 | - |
| pagination and filter bounds, AC 9 (6 examples) | no `pageSize` C20 · `pageSize` 101 C20 · `pageSize` 100 C20 · `page` 0 C20 · `status=FOO` C20 · `status=RECEIVED,FOO` C20, table-driven over all 6 | - |
| status labels, door 3 (7) | C24, table-driven over all 7 | - |
| links by budget state, door 4 (3 examples) | round 1 pending C26 · round 1 decided and round 2 pending C27 · not pending refused C30, C31 | - |
| rejection by round, AC 13 (2 examples) | round 1 C29 · round 2 C29 | - |
| status transitions, each owing one event and one e-mail (13) | C36, table-driven over all 13; one e-mail per event C37; through the routes: opening, diagnosis start, diagnosis completion, approval, completion, delivery C40 · round 1 rejection, supplementary round, cancellation C41 | - |
| e-mail content (3 parts) | subject and body C37 · budget total and links C38, C42 · failure logged C39, C43 | - |
| startup config: the `Mailer` binding (2 assemblies) | application module C47 · e2e harness, which replaces it with a recording fake C40 | - |
| startup config: the settings (5) | `SMTP_HOST` C46 · `SMTP_PORT` C46 · `MAIL_FROM` C46 · `APP_PUBLIC_URL` C46, C26 · Mailpit service C48 | - |

## Swept

- validation: C7, C20
- failure modes: C3, C4, C5, C6 (a refused opening saves nothing), C43
- idempotency: C30, C31 (deciding a budget that is no longer pending answers 422 and changes nothing)
- authorization: C12, C23, C34, C35
- concurrency: existing - the version guard of AD-009 refuses the second of two simultaneous changes to one work order, two link decisions included (`test/e2e/work-order-concurrency.e2e.spec.ts`)
- data lifecycle: C1 (the quantity sent comes back on the work order); no stored shape changes
- dependency failure: C39, C43
- state transitions: C8, C9, C29, C30, C36
- observability: C39

## Handoff

- **Settled mid-build:** none
- **Dispatched:** none
- **Boundary:** none closed yet
- **Abandoned:** none
