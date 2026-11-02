# Work order Phase 2 API verification

**Verdict**: FAIL
**Proofs**: `proofs.md` at 8e5233a
**Verifier**: independent sub-agent (author != verifier)

## Checks

| Check | Test | Holds |
| --- | --- | --- |
| C1 | `work-order-phase-2-opening.e2e.spec.ts` `Opening a work order with items > opens a work order with two services and one part as draft items` | yes |
| C2 | `work-order-phase-2-opening.e2e.spec.ts` `Opening a work order with items > opens a work order with no services and no parts` | yes: covers both absent and empty lists |
| C3 | `work-order-phase-2-opening.e2e.spec.ts` `Opening a work order with items > refuses an unknown service with 404 and opens nothing` | yes: the third of three is unknown, and reopening the vehicle answers 201 |
| C4 | `work-order-phase-2-opening.e2e.spec.ts` `Opening a work order with items > refuses an unknown inventory item with 404 and opens nothing` | yes |
| C5 | `work-order-phase-2-opening.e2e.spec.ts` `Opening a work order with items > refuses an inactive service with 422 and opens nothing` | yes |
| C6 | `work-order-phase-2-opening.e2e.spec.ts` `Opening a work order with items > refuses an inactive inventory item with 422 and opens nothing` | yes |
| C7 | `work-order-phase-2-opening.e2e.spec.ts` `Opening a work order with items > refuses quantity 0 and an item without its id with 400, and accepts quantity 1` | yes |
| C8 | `work-order-phase-2-opening.e2e.spec.ts` `Opening a work order with items > plans a part on a RECEIVED work order and refuses it on a COMPLETED one` | yes |
| C9 | `work-order.spec.ts` `WorkOrder parts at reception > plans a part while RECEIVED` | yes |
| C10 | `work-order-phase-2-opening.e2e.spec.ts` `Opening a work order with items > builds round 1 from the items left after the diagnosis` | yes: asserts the round of every item and a total without B |
| C11 | `work-order-phase-2-opening.e2e.spec.ts` `Opening a work order with items > refuses a vehicle that already has an active work order with 409` | yes |
| C12 | `work-order-phase-2-opening.e2e.spec.ts` `Opening a work order with items > answers 401 without a token and 403 without work-orders:manage` | yes |
| C13 | `work-order-phase-2-board.spec.ts` `Board listing on its own database > lists only the open statuses in the brief's order by default` | no: the four open work orders are created at minutes 1, 3, 5 and 7 in the reverse of the board order, so a board sorted newest first with no status order answers the same list (finding 2) |
| C14 | `work-order-phase-2-board.spec.ts` `Board listing on its own database > lists the older work order first within a status` | yes: the newer one is saved first, so insertion order and id order give the wrong answer |
| C15 | `work-order-phase-2-board.spec.ts` `Board listing on its own database > lists delivered before canceled for status=CANCELED,DELIVERED` | yes: interleaved times separate the status order from the time order |
| C16 | `work-order-phase-2-board.spec.ts` `Board listing on its own database > lists only completed work orders for status=COMPLETED` | yes |
| C17 | `work-order-phase-2-board.spec.ts` `Board listing on its own database > orders all seven statuses when the filter names them all` | no: the seven are created newest to oldest in board order, so a board sorted newest first with no status order answers the same list (finding 2) |
| C18 | `work-order-phase-2-board.spec.ts` `Board listing on its own database > splits five matches into pages of two and answers an empty page past the last` | yes: exact ids on each page and the envelope on all four |
| C19 | `work-order-phase-2-board.spec.ts` `Board listing on its own database > answers zero items and zero pages when nothing matches` | yes |
| C20 | `work-order-phase-2-board.e2e.spec.ts` `The paginated board > validates page, pageSize and status` | yes: all six named cases, each 400 with `VALIDATION_ERROR` |
| C21 | `work-order-phase-2-board.e2e.spec.ts` `The paginated board > answers the page envelope with the newest RECEIVED work order last` | yes |
| C22 | `work-order-phase-2-board.e2e.spec.ts` `The paginated board > leaves completed, delivered and canceled work orders out by default` | yes: also compares the board total with the sum of the four open statuses |
| C23 | `work-order-phase-2-board.e2e.spec.ts` `The paginated board > answers 401 without a token and 403 without work-orders:read` | yes |
| C24 | `work-order-status-label.spec.ts` `Work order status labels > labels each of the seven statuses` | yes |
| C25 | `work-order-phase-2-status-labels.e2e.spec.ts` `Status labels > answers statusLabel on the detail, the customer routes and the board` | yes |
| C26 | `work-order-phase-2-links.e2e.spec.ts` `Budget decision links > carries both links on the pending round 1` | yes: compares with `APP_PUBLIC_URL` of `.env.test` (`http://workshop.test`), which differs from the code default |
| C27 | `work-order-phase-2-links.e2e.spec.ts` `Budget decision links > moves the links to round 2 once round 1 is decided` | yes |
| C28 | `work-order-phase-2-links.e2e.spec.ts` `Budget decision links > approves the pending budget through its approval link with the customer's token` | yes |
| C29 | `work-order-phase-2-links.e2e.spec.ts` `Budget decision links > rejects round 1 to IN_DIAGNOSIS and round 2 to IN_EXECUTION through the rejection link` | yes |
| C30 | `work-order-phase-2-links.e2e.spec.ts` `Budget decision links > refuses the approval link of a budget that is not pending with 422` | yes: round 2 stays `PENDING` and keeps its link |
| C31 | `work-order-phase-2-links.e2e.spec.ts` `Budget decision links > refuses the rejection link of a budget that is not pending with 422` | yes: refused while round 2 awaits and while the work order is in execution |
| C32 | `work-order-phase-2-links.e2e.spec.ts` `Budget decision links > refuses an approval link whose budget belongs to another work order with 404` | yes |
| C33 | `work-order-phase-2-links.e2e.spec.ts` `Budget decision links > refuses a rejection link whose budget belongs to another work order with 404` | yes |
| C34 | `work-order-phase-2-links.e2e.spec.ts` `Budget decision links > answers 404 to another customer and 401 without a token on both links` | yes |
| C35 | `work-order-phase-2-links.e2e.spec.ts` `Budget decision links > lets a holder of work-orders:decide use the approval link` | yes |
| C36 | `work-order-status-events.spec.ts` `WorkOrder status change events > records one status change event per transition` | yes: all 13 transitions with their old and new status; the approval's two other events are asserted by the next test in the same file |
| C37 | `status-mail.subscriber.spec.ts` `StatusMailSubscriber > sends one e-mail with the status subject to the customer` | yes: exact subject for all seven labels |
| C38 | `status-mail.subscriber.spec.ts` `StatusMailSubscriber > adds the budget total and both links when the budget awaits approval` | yes |
| C39 | `status-mail.subscriber.spec.ts` `StatusMailSubscriber > logs a failed e-mail with the work order number and does not throw` | yes: the error level is asserted by `nest-status-mail-log.spec.ts` and by C43's spy on `Logger.prototype.error` |
| C40 | `work-order-phase-2-status-emails.e2e.spec.ts` `Status e-mails > sends one e-mail per change along the whole flow` | yes: the exact list of six subjects after a pause, so a seventh e-mail fails it |
| C41 | `work-order-phase-2-status-emails.e2e.spec.ts` `Status e-mails > sends one e-mail for a rejection, a supplementary round and a cancellation` | no: it waits for at least 4, then at least 6 e-mails and reads one index each time, so a second e-mail for the rejection or the cancellation passes (finding 3) |
| C42 | `work-order-phase-2-status-emails.e2e.spec.ts` `Status e-mails > puts the API's decision links in the budget e-mail` | yes |
| C43 | `work-order-phase-2-status-emails.e2e.spec.ts` `Status e-mails > keeps the transition when the e-mail fails` | yes |
| C44 | `work-order-phase-2-status-emails.e2e.spec.ts` `Status e-mails > sends nothing when no status changes` | yes: the exact list of three subjects |
| C45 | `smtp-mailer.spec.ts` `SmtpMailer > sends the message through the configured transport` | yes |
| C46 | `env.validation.spec.ts` `mail settings > requires the mail settings and the public URL` | yes |
| C47 | `work-order-phase-2-mail-wiring.spec.ts` `Mail wiring > binds the Mailer to the SMTP adapter` | yes |
| C48 | lone proof: `docker compose config`, searched for `target: 1025` and `target: 8025` in the 20 lines after `  mailpit:` | yes: both lines fall inside that window (lines 15 and 19 of the rendered block) |
| C49 | lone proof: `npm run test:unit && npm run test:integration && npm run test:e2e` | yes: `openapi-contract.e2e.spec.ts` compares the document with the committed baseline |
| C50 | `work-order-phase-2-opening.e2e.spec.ts` `Opening a work order with items > refuses a part quantity above the integer limit with 400 on the opening and on the parts route` | yes |
| C51 | `work-order-phase-2-links.e2e.spec.ts` `Budget decision links > answers null links on the pending budget of a canceled work order` | yes: the cancellation answer and the detail both carry null links on the `PENDING` budget |

## Findings

| Finding | Evidence | Fix | Closed |
| --- | --- | --- | --- |
| 1. The approval link in the e-mail of a rejected round 1 approves the regenerated round 1, at a total that e-mail never showed | `work-order.ts:390-392` regenerates round 1 in place, and `budget.ts:59-61` sets it back to `PENDING` under the same id; `work-order.ts:551-565` checks only that the id belongs to the work order and is pending. Probe at `8e5233a`: round 1 quoted at R$ 100,00 in the third e-mail, rejected through its link, a R$ 500,00 service added, the diagnosis completed again, and the first e-mail's approval link answered 200 and approved round 1 at R$ 600,00. Door 4 (`plan.md:138`) chose links by budget id so an older e-mail cannot decide a round the customer never saw, and `README.md:589-590` says the link in an old e-mail cannot decide a later round. No criterion or check names a regenerated round | Ask the user, since it touches door 4. Either refuse a link issued before the round's last regeneration (for example, the link carries the round's generation, and the route answers 422 `BUDGET_INVALID_STATE` when it no longer matches), or record in the plan that the link of a rejected round 1 decides its regeneration. Then append a check that proves the chosen answer | |
| 2. C13 and C17 pass on a board sorted newest first with no status order | `test/integration/work-order-phase-2-board.spec.ts:157-173`: the open work orders are created at minutes 1, 3, 5 and 7 in the reverse of the board order, though the comment at :157 says only the status can sort them. `:232-259`: the seven are created newest to oldest in board order. The query this diff replaced, `ORDER BY wo.created_at DESC` (`typeorm-work-order-query.adapter.ts:163` at `1c876a1`), answers both expected lists. C14, C15, C16 and C18 fail on that order, so the run holds the rule; the two named tests alone pass on it | Create the work orders of C13 and C17 at times where the board order differs from both oldest first and newest first, for example in C13 `IN_EXECUTION` at minute 1, `RECEIVED` at 2, `AWAITING_APPROVAL` at 3 and `IN_DIAGNOSIS` at 4, and shuffle C17 the same way | |
| 3. C41 does not hold "one e-mail" for the round 1 rejection and for the cancellation | `test/e2e/work-order-phase-2-status-emails.e2e.spec.ts:185-188` waits for at least 4 e-mails and reads index 3, and `:225-226` waits for at least 6 and reads index 5. Nothing counts the e-mails afterwards, so a second e-mail for either change passes. A probe at `8e5233a` counted exactly 4 after a round 1 rejection and 5 after a cancellation, so the behavior holds | After the rejection and after the cancellation, pause as C40 and C44 do, and assert that `sentTo(email)` holds exactly 4 and exactly 6 messages | |
| 4. The 400 `BAD_REQUEST` the Surface names for a budget id that is not a UUID has no check, and its test reads the status only | `plan.md:129` names the answer. `checks.md:186-187` list no 400 for either link route. `test/e2e/work-order-phase-2-links.e2e.spec.ts:476` asserts status 400 and no code. A probe at `8e5233a` answered 400 with `code` `BAD_REQUEST`, so the behavior holds | Append a check proven by `answers 400 for a budget id that is not a UUID on both links`, assert `code: 'BAD_REQUEST'` in that test, and add the 400 to both Coverage rows | |
| 5. The `status` filter lists finalized and delivered work orders, which the brief excludes from the listing, and `## Differences from the source` does not list that departure | Brief, page 3: "Excluir (lógica não física) da listagem as OS finalizadas e entregues". `plan.md:171-172` (AC 7, `status=COMPLETED` lists completed ones). `plan.md:262-264` list three departures, none for the listing, and AD-021 (`.specs/STATE.md:27`) covers the opening, the status lookup and the budget notifications only. The user approved the filter in the Assumptions row at `plan.md:239`, so the gap is in the record | Add the filter to `## Differences from the source` with the user's words from `plan.md:239` and a `Confirmed: y` cell that names an AD, and record that decision in `.specs/STATE.md` (a new AD or an amendment of AD-021) | |

## Own examples

Each ran at `8e5233a` as a throwaway e2e or unit spec, deleted afterwards, with its own data on `workshop_test`.

- Board `status`: `RECEIVED,RECEIVED` answers the same total as `RECEIVED` (11224); `status=RECEIVED&status=IN_DIAGNOSIS` answers the sum (14186). A space after the comma, a leading space, an empty value, a lone comma, a trailing comma and `Received` each answer 400 `VALIDATION_ERROR`. Holds.
- `page` and `pageSize`: `pageSize=2.5`, an empty `pageSize`, `page=-1`, `page=Infinity`, a repeated `page` and `pageSize=99999999999999999999` answer 400. `page=2.0` and `page=1e2` read as 2 and 100. `page=90071992547410` with `pageSize=100` (an offset just under 2^53) and `page=9007199254740993` answer 200 with no items and the right totals; the second echoes `page` as 9007199254740992. Holds.
- An opening with the same service twice and the same part twice (quantities 1 and 2) answers 201 with two service items and two part items, and round 1 totals 23000 cents (2 x 10000 + 3 x 1000), the same as calls to the separate routes. Holds.
- An opening with `services: [null]`, `parts: [null]`, `services: "x"`, `services: [1]`, a quantity of 1.5, a quantity of "2" or a service id that is not a UUID answers 400 `VALIDATION_ERROR`, and the vehicle opens afterwards with 201. Holds.
- Round 3: only round 3 carries links; its e-mail carries round 3's links and R$ 30,00 and no round 2 id; round 2's approval and rejection links answer 422 `BUDGET_INVALID_STATE`; round 3's rejection link answers 200 with `IN_EXECUTION`; the flow sends exactly 8 e-mails for its 8 changes. Holds.
- Round 1 rejected and then regenerated: the old e-mail's approval link approves the regenerated total (finding 1).
- A link on the pending budget of a canceled work order answers 422 `WORK_ORDER_INVALID_STATE`; no rule names this answer.
- Configuration: `SMTP_PORT` 65536 and 70000 pass the boot validation, as the other port settings do, while 1025.5, -1 and a blank value are refused. `SMTP_HOST=" "` and `MAIL_FROM="not an address"` pass. `APP_PUBLIC_URL` with a trailing slash or a path passes and builds correct links; with a query string (`http://localhost:13000?x=1`) it passes and builds `http://localhost:13000?x=1/api/v1/...`. The plan requires presence only, so none of these is a finding.
