# work-order-phase-2-api proofs

**HEAD**: 91eb94c
**Tree**: clean
**Shell**: /bin/sh
**Result**: 56 pass, 0 fail

| Check | Proof | Result |
| --- | --- | --- |
| C1 | `run e2e / ✓ Opening a work order with items > opens a work order with two services and one part as draft items` | pass |
| C2 | `run e2e / ✓ Opening a work order with items > opens a work order with no services and no parts` | pass |
| C3 | `run e2e / ✓ Opening a work order with items > refuses an unknown service with 404 and opens nothing` | pass |
| C4 | `run e2e / ✓ Opening a work order with items > refuses an unknown inventory item with 404 and opens nothing` | pass |
| C5 | `run e2e / ✓ Opening a work order with items > refuses an inactive service with 422 and opens nothing` | pass |
| C6 | `run e2e / ✓ Opening a work order with items > refuses an inactive inventory item with 422 and opens nothing` | pass |
| C7 | `run e2e / ✓ Opening a work order with items > refuses quantity 0 and an item without its id with 400, and acce` | pass |
| C8 | `run e2e / ✓ Opening a work order with items > plans a part on a RECEIVED work order and refuses it on a COMPLE` | pass |
| C9 | `run unit / ✓ WorkOrder parts at reception > plans a part while RECEIVED` | pass |
| C10 | `run e2e / ✓ Opening a work order with items > builds round 1 from the items left after the diagnosis` | pass |
| C11 | `run e2e / ✓ Opening a work order with items > refuses a vehicle that already has an active work order with 409` | pass |
| C12 | `run e2e / ✓ Opening a work order with items > answers 401 without a token and 403 without work-orders:manage` | pass |
| C13 | `run integration / ✓ Board listing on its own database > lists only the open statuses in the brief's order by d` | pass |
| C14 | `run integration / ✓ Board listing on its own database > lists the older work order first within a status` | pass |
| C15 | `run integration / ✓ Board listing on its own database > lists delivered before canceled for status=CANCELED,DE` | pass |
| C16 | `run integration / ✓ Board listing on its own database > lists only completed work orders for status=COMPLETED` | pass |
| C17 | `run integration / ✓ Board listing on its own database > orders all seven statuses when the filter names them a` | pass |
| C18 | `run integration / ✓ Board listing on its own database > splits five matches into pages of two and answers an e` | pass |
| C19 | `run integration / ✓ Board listing on its own database > answers zero items and zero pages when nothing matches` | pass |
| C20 | `run e2e / ✓ The paginated board > validates page, pageSize and status` | pass |
| C21 | `run e2e / ✓ The paginated board > answers the page envelope with the newest RECEIVED work order last` | pass |
| C22 | `run e2e / ✓ The paginated board > leaves completed, delivered and canceled work orders out by default` | pass |
| C23 | `run e2e / ✓ The paginated board > answers 401 without a token and 403 without work-orders:read` | pass |
| C24 | `run unit / ✓ Work order status labels > labels each of the seven statuses` | pass |
| C25 | `run e2e / ✓ Status labels > answers statusLabel on the detail, the customer routes and the board` | pass |
| C26 | `run e2e / ✓ Budget decision links > carries both links on the pending round 1` | pass |
| C27 | `run e2e / ✓ Budget decision links > moves the links to round 2 once round 1 is decided` | pass |
| C28 | `run e2e / ✓ Budget decision links > approves the pending budget through its approval link with the customer's ` | pass |
| C29 | `run e2e / ✓ Budget decision links > rejects round 1 to IN_DIAGNOSIS and round 2 to IN_EXECUTION through the re` | pass |
| C30 | `run e2e / ✓ Budget decision links > refuses the approval link of a budget that is not pending with 422` | pass |
| C31 | `run e2e / ✓ Budget decision links > refuses the rejection link of a budget that is not pending with 422` | pass |
| C32 | `run e2e / ✓ Budget decision links > refuses an approval link whose budget belongs to another work order with 4` | pass |
| C33 | `run e2e / ✓ Budget decision links > refuses a rejection link whose budget belongs to another work order with 4` | pass |
| C34 | `run e2e / ✓ Budget decision links > answers 404 to another customer and 401 without a token on both links` | pass |
| C35 | `run e2e / ✓ Budget decision links > lets a holder of work-orders:decide use the approval link` | pass |
| C51 | `run e2e / ✓ Budget decision links > answers null links on the pending budget of a canceled work order` | pass |
| C52 | `run e2e / ✓ Budget decision links > refuses a link from before round 1 was generated again and accepts the new` | pass |
| C53 | `run e2e / ✓ Budget decision links > refuses a tampered or missing link hash on both links` | pass |
| C54 | `run e2e / ✓ Budget decision links > answers 400 BAD_REQUEST for a budget id that is not a UUID on both links` | pass |
| C36 | `run unit / ✓ WorkOrder status change events > records one status change event per transition` | pass |
| C37 | `run unit / ✓ StatusMailSubscriber > sends one e-mail with the status subject to the customer` | pass |
| C38 | `run unit / ✓ StatusMailSubscriber > adds the budget total and both links when the budget awaits approval` | pass |
| C39 | `run unit / ✓ StatusMailSubscriber > logs a failed e-mail with the work order number and does not throw` | pass |
| C40 | `run e2e / ✓ Status e-mails > sends one e-mail per change along the whole flow` | pass |
| C41 | `run e2e / ✓ Status e-mails > sends one e-mail for a rejection, a supplementary round and a cancellation` | pass |
| C42 | `run e2e / ✓ Status e-mails > puts the API's decision links in the budget e-mail` | pass |
| C43 | `run e2e / ✓ Status e-mails > keeps the transition when the e-mail fails` | pass |
| C44 | `run e2e / ✓ Status e-mails > sends nothing when no status changes` | pass |
| C45 | `run unit / ✓ SmtpMailer > sends the message through the configured transport` | pass |
| C46 | `run unit / ✓ mail settings > requires the mail settings and the public URL` | pass |
| C47 | `run integration / ✓ Mail wiring > binds the Mailer to the SMTP adapter` | pass |
| C48 | `docker compose config / grep -A20 '^  mailpit:' / grep -q 'target: 1025' && docker compose config / grep -A20 ` | pass |
| C49 | `npm run test:unit && npm run test:integration && npm run test:e2e` | pass |
| C50 | `run e2e / ✓ Opening a work order with items > refuses a part quantity above the integer limit with 400 on the ` | pass |
| Build | `npm run build` | pass |
| Build | `npm run lint` | pass |

## Output

`Run e2e` - exit 0

```
 ✓ test/e2e/work-order-phase-2-opening.e2e.spec.ts > Opening a work order with items > builds round 1 from the items left after the diagnosis 247ms
 ✓ test/e2e/work-order-phase-2-opening.e2e.spec.ts > Opening a work order with items > refuses a vehicle that already has an active work order with 409 153ms
 ✓ test/e2e/work-order-phase-2-opening.e2e.spec.ts > Opening a work order with items > answers 401 without a token and 403 without work-orders:manage 139ms
 ✓ test/e2e/work-order-phase-2-board.e2e.spec.ts > The paginated board > validates page, pageSize and status 239ms
 ✓ test/e2e/work-order-phase-2-board.e2e.spec.ts > The paginated board > answers an empty page for a page number beyond any offset a query can take 87ms
 ✓ test/e2e/work-order-phase-2-board.e2e.spec.ts > The paginated board > answers the page envelope with the newest RECEIVED work order last 264ms
 ✓ test/e2e/work-order-phase-2-board.e2e.spec.ts > The paginated board > leaves completed, delivered and canceled work orders out by default 1341ms
 ✓ test/e2e/work-order-phase-2-board.e2e.spec.ts > The paginated board > answers 401 without a token and 403 without work-orders:read 155ms
 ✓ test/e2e/work-order-phase-2-status-labels.e2e.spec.ts > Status labels > answers statusLabel on the detail, the customer routes and the board 423ms
 ✓ test/e2e/work-order-phase-2-status-labels.e2e.spec.ts > Status labels > names each status in Portuguese along the whole flow and on a cancellation 756ms

 Test Files  5 passed (5)
      Tests  40 passed (40)
   Start at  05:54:22
   Duration  23.24s (transform 1.13s, setup 18ms, collect 4.06s, tests 18.74s, environment 0ms, prepare 38ms)
```

`Run unit` - exit 0

```
 ✓ src/modules/work-orders/infrastructure/gateways/stock-ledger.gateway.spec.ts > StockLedgerGateway > should let the error of the inventory module through on consume 1ms
 ✓ src/modules/work-orders/infrastructure/gateways/stock-ledger.gateway.spec.ts > StockLedgerGateway > should let the error of the inventory module through on restore 0ms
 ✓ src/modules/work-orders/infrastructure/gateways/stock-ledger.gateway.spec.ts > StockLedgerGateway > should let the error of the inventory module through on undoConsumption 0ms
 ✓ src/modules/work-orders/infrastructure/gateways/stock-ledger.gateway.spec.ts > StockLedgerGateway > should let the error of the inventory module through on confirmConsumption 0ms
 ✓ src/modules/work-orders/infrastructure/gateways/stock-ledger.gateway.spec.ts > StockLedgerGateway > should let the error of the inventory module through on settle 0ms
 ✓ src/modules/work-orders/infrastructure/gateways/stock-ledger.gateway.spec.ts > StockLedgerGateway > should let the error of the inventory module through on writeOff 0ms
 ✓ src/modules/work-orders/infrastructure/gateways/vehicle-directory.gateway.spec.ts > VehicleDirectoryGateway > should map the vehicles module answer to the vehicle, its owner and its description 3ms
 ✓ src/modules/work-orders/infrastructure/gateways/vehicle-directory.gateway.spec.ts > VehicleDirectoryGateway > should answer null when the vehicles module answers null 0ms
 ✓ src/modules/work-orders/infrastructure/gateways/vehicle-directory.gateway.spec.ts > VehicleDirectoryGateway > should answer null when the vehicles module throws its not-found error 0ms
 ✓ src/modules/work-orders/infrastructure/gateways/vehicle-directory.gateway.spec.ts > VehicleDirectoryGateway > should let any other error from the vehicles module through 1ms

 Test Files  57 passed (57)
      Tests  534 passed (534)
   Start at  05:54:46
   Duration  7.00s (transform 5.46s, setup 1.99s, collect 31.88s, tests 1.43s, environment 28ms, prepare 9.14s)
```

`Run integration` - exit 0

```

 ✓ test/integration/work-order-phase-2-board.spec.ts > Board listing on its own database > lists only the open statuses in the brief's order by default 220ms
 ✓ test/integration/work-order-phase-2-board.spec.ts > Board listing on its own database > lists the older work order first within a status 117ms
 ✓ test/integration/work-order-phase-2-board.spec.ts > Board listing on its own database > lists delivered before canceled for status=CANCELED,DELIVERED 165ms
 ✓ test/integration/work-order-phase-2-board.spec.ts > Board listing on its own database > lists only completed work orders for status=COMPLETED 152ms
 ✓ test/integration/work-order-phase-2-board.spec.ts > Board listing on its own database > orders all seven statuses when the filter names them all 166ms
 ✓ test/integration/work-order-phase-2-board.spec.ts > Board listing on its own database > splits five matches into pages of two and answers an empty page past the last 148ms
 ✓ test/integration/work-order-phase-2-board.spec.ts > Board listing on its own database > answers an empty page for a page number beyond any offset a query can take 108ms
 ✓ test/integration/work-order-phase-2-board.spec.ts > Board listing on its own database > answers zero items and zero pages when nothing matches 179ms
 ✓ test/integration/work-order-phase-2-mail-wiring.spec.ts > Mail wiring > binds the Mailer to the SMTP adapter 47ms

 Test Files  2 passed (2)
      Tests  9 passed (9)
   Start at  05:54:53
   Duration  5.23s (transform 1.26s, setup 9ms, collect 2.96s, tests 1.81s, environment 0ms, prepare 46ms)
```

`docker compose config / grep -A20 '^  mailpit:' / grep -q 'target: 1025' && docker compose config / grep -A20 ` - exit 0

```
(no output)
```

`npm run test:unit && npm run test:integration && npm run test:e2e` - exit 0

```
 ✓ test/e2e/services.e2e.spec.ts (12 tests) 1022ms
 ✓ test/e2e/staff-account.e2e.spec.ts (3 tests) 815ms
   ✓ Staff account creation > should create an account with a generated password, gate it until the password changes, then let it through  311ms
 ✓ test/e2e/roles.e2e.spec.ts (13 tests) 741ms
 ✓ test/e2e/pending-password.e2e.spec.ts (3 tests) 737ms
   ✓ Pending password > should allow the password change route while pending, and clear the flag afterwards  305ms
 ✓ test/e2e/openapi-contract.e2e.spec.ts (1 test) 218ms

 Test Files  24 passed (24)
      Tests  286 passed (286)
   Start at  05:55:49
   Duration  65.97s (transform 1.12s, setup 44ms, collect 6.82s, tests 58.54s, environment 0ms, prepare 38ms)

[Nest] 343976  - 11/02/2026, 5:55:27 AM   ERROR [AccountStepOutbox] Account step DISCARD_ACCOUNT 486cb242-7e56-4a39-8425-3c24ee05a1cc for user 9ea78e3b-b27b-48f4-9761-c560a895c67c failed for good: The account is in use and cannot be discarded.
[Nest] 343976  - 11/02/2026, 5:55:28 AM   ERROR [StockStepOutbox] Stock step RESTORE b69ad901-4e32-4fa5-804c-9f9c97bcda9d for work order d4a24dc0-d277-4b0c-bd07-8f510f88b864 failed for good: Inventory item not found.
```
