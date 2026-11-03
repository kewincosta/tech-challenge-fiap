# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Plan/Checks)

Corroborated across multiple features. Safe to apply as guidance.

### L-003 - A value object's passing unit tests, or a sibling use case with the same call pattern, do not prove another call site: give every route or use case that can produce an error its own asserting test, at the layer the repo's test docs name for it.
- signal: `ac_gap` · recurrence: 4 feature(s) · scope: `application-handlers` · harmful: 0
- features: customer-and-vehicle-registry, service-catalog, inventory-and-stock-movements, work-order-part-withdrawal
- evidence: CVR-01-AC7 (register-customer.handler.spec.ts has no malformed-address/phone case) (application-handlers) (+4 more)
- last seen: 2026-09-01T14:04:35Z

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-017 - A test that needs an empty slice of a never-truncated database must draw from a range its own runs cannot fill and bound its redraws, or the suite turns into timeouts as the database grows.
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `integration-tests` · harmful: 0
- features: clean-architecture
- evidence: test/integration/work-order-metrics-query.adapter.spec.ts:142 (integration-tests)
- last seen: 2026-10-29T23:29:55Z

### L-018 - Run the spec of an idempotent script against a database the spec creates and drops, because on a shared database every run after the first skips the work and asserts rows an older version wrote.
- signal: `weak_test` · recurrence: 1 feature(s) · scope: `integration-tests` · harmful: 0
- features: clean-architecture
- evidence: M12, W3b, W3c on a populated database; test/integration/seed.script.spec.ts:79 (integration-tests)
- last seen: 2026-10-29T23:29:55Z

### L-019 - Give each architecture rule a refusing fixture for every kind of path it must reject, so a looser pattern fails its own test.
- signal: `weak_test` · recurrence: 1 feature(s) · scope: `architecture-checks` · harmful: 0
- features: clean-architecture
- evidence: M07 .dependency-cruiser.cjs:71 (architecture-checks)
- last seen: 2026-10-29T23:29:55Z

### L-020 - In-memory repository fakes must store and return copies of the aggregate, so a use case spec can tell a missing save from a saved change.
- signal: `weak_test` · recurrence: 1 feature(s) · scope: `test-support` · harmful: 0
- features: clean-architecture
- evidence: W1 src/modules/work-orders/application/commands/remove-work-order-item/remove-work-order-item.use-case.ts:31 (test-support)
- last seen: 2026-10-29T23:29:55Z

### L-021 - When a use case checks its input before a port read on purpose, pin that order with a case that fails both checks and asserts which error wins.
- signal: `weak_test` · recurrence: 1 feature(s) · scope: `application-use-cases` · harmful: 0
- features: clean-architecture
- evidence: W2 src/modules/work-orders/application/commands/plan-part/plan-part.use-case.ts:33 (application-use-cases)
- last seen: 2026-10-29T23:29:55Z

### L-022 - When a change refines an existing AD-NNN decision, record the refinement in its ADR in the same commit, so the decision log and the ADR state the same decision.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `decisions` · harmful: 0
- features: clean-architecture
- evidence: CA-07 AC1 .specs/STATE.md:70 (decisions)
- last seen: 2026-10-29T23:29:55Z

### L-023 - When an outbox retries a failed step, make it still apply after a later step of the same aggregate has landed, or apply each aggregate's steps in the order they were recorded, and test a retry that follows a later step.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `outbox` · harmful: 0
- features: clean-architecture
- evidence: CA-02 AC5 and spec.md:279 edge case, round 2 probe on src/modules/inventory/infrastructure/persistence/typeorm-inventory-item.repository.ts:117 (outbox)
- last seen: 2026-10-31T19:53:15Z

### L-024 - Apply every idempotent operation twice through the real adapter in a test, so a dropped status guard on the repeat fails a suite.
- signal: `weak_test` · recurrence: 1 feature(s) · scope: `integration-tests` · harmful: 0
- features: clean-architecture
- evidence: S22 src/modules/inventory/infrastructure/persistence/typeorm-inventory-item.repository.ts:198 (integration-tests)
- last seen: 2026-10-31T19:53:15Z

### L-025 - When a spec moves writes into retried steps, state the order in which the steps of one aggregate apply after a failure.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `planning` · harmful: 0
- features: clean-architecture
- evidence: spec.md:71 Concurrency / ordering row, round 2 spec-precision gap 1 (planning)
- last seen: 2026-10-31T19:53:15Z

### L-026 - Keep a step from drawing on the movements of an operation that is still in flight, or the compensation that returns that operation's net remaining gives back less than it took.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `outbox` · harmful: 0
- features: clean-architecture
- evidence: CA-02 AC5 and spec.md:283, probes B2, B3 and B5 in validation.md round 3 (outbox)
- last seen: 2026-11-01T00:36:15Z

### L-027 - When a spec lets an operation's first step commit before its last, state what the other steps of the same aggregate may read from that operation until it is confirmed or compensated.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `planning` · harmful: 0
- features: clean-architecture
- evidence: validation.md round 3, spec-precision gap 1 (CA-10) (planning)
- last seen: 2026-11-01T00:36:15Z

### L-028 - State in the ordering rule of retried steps whether a compensation step may apply before the older steps of its aggregate that read what it undoes.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `planning` · harmful: 0
- features: clean-architecture
- evidence: validation.md round 3, spec-precision gap 2 (CA-10 AC10, probe B4) (planning)
- last seen: 2026-11-01T00:36:15Z

### L-029 - When a spec adds a rule that holds a step behind another, state how it combines with each criterion that promises the step applies after a set delay.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `planning` · harmful: 0
- features: clean-architecture
- evidence: validation.md round 3, spec-precision gap 3 (CA-10 AC8 and AC10) (planning)
- last seen: 2026-11-01T00:36:15Z

### L-030 - Give every step kind that an ordering rule names its own case that holds a later step behind it, so a kind that drops out of the order fails a suite.
- signal: `weak_test` · recurrence: 1 feature(s) · scope: `outbox` · harmful: 0
- features: clean-architecture
- evidence: O1 (typeorm-pending-stock-steps.ts:49), validation.md round 4 (outbox)
- last seen: 2026-11-01T12:41:12Z

### L-032 - Bind a link to the generation of the record it decides when that record can be regenerated in place, or an old copy of the link acts on the new version.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `links` · harmful: 0
- features: work-order-phase-2-api
- evidence: verification.md finding 1; src/modules/work-orders/domain/entities/budget.ts:59-61 (links)
- last seen: 2026-11-02T08:57:44Z

### L-033 - Give ordering fixtures creation times where the required order differs from both oldest first and newest first, so the test cannot pass on the order it replaced.
- signal: `weak_test` · recurrence: 1 feature(s) · scope: `query-adapters` · harmful: 0
- features: work-order-phase-2-api
- evidence: verification.md finding 2; C13, C17 (query-adapters)
- last seen: 2026-11-02T08:57:44Z

### L-034 - When a criterion promises one side effect per change, assert the exact count after each change, so a duplicate fails the test.
- signal: `weak_test` · recurrence: 1 feature(s) · scope: `notifications` · harmful: 0
- features: work-order-phase-2-api
- evidence: verification.md finding 3; C41 (notifications)
- last seen: 2026-11-02T08:57:44Z

### L-035 - Assert the error code beside the status for every refusal a Surface row lists, so a different refusal with the same status fails.
- signal: `weak_test` · recurrence: 1 feature(s) · scope: `routes` · harmful: 0
- features: work-order-phase-2-api
- evidence: verification.md finding 4; C54 (routes)
- last seen: 2026-11-02T08:57:44Z

### L-036 - Check every criterion against the exclusions of the binding brief, and list each departure in Differences from the source with its decision before the plan is approved.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `planning` · harmful: 0
- features: work-order-phase-2-api
- evidence: verification.md finding 5; plan.md Differences from the source (planning)
- last seen: 2026-11-02T08:57:44Z

### L-037 - Compare the whole TLS option object of every assembly that opens a connection, so a weakened certificate check in any of them fails the test.
- signal: `weak_test` · recurrence: 1 feature(s) · scope: `config` · harmful: 0
- features: phase-2-infrastructure
- evidence: C11 src/config/database.config.spec.ts:111 (config)
- last seen: 2026-11-03T09:46:34Z

### L-038 - Assert the exact false a driver option takes when a feature is off, because undefined lets the driver fall back to its own environment variable.
- signal: `weak_test` · recurrence: 1 feature(s) · scope: `config` · harmful: 0
- features: phase-2-infrastructure
- evidence: C9 src/config/database.config.spec.ts:75 (config)
- last seen: 2026-11-03T09:46:34Z

### L-039 - Assert the exact TLS option a client receives, not that one is defined, so an option that skips certificate verification fails.
- signal: `weak_test` · recurrence: 1 feature(s) · scope: `config` · harmful: 0
- features: phase-2-infrastructure
- evidence: C10 src/config/redis.config.spec.ts:22 (config)
- last seen: 2026-11-03T09:46:34Z

### L-040 - Key a Terraform map built from a user-supplied list by its distinct values, so a repeated entry does not fail the plan.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `infra` · harmful: 0
- features: phase-2-infrastructure
- evidence: infra/modules/cluster/main.tf:25 (infra)
- last seen: 2026-11-03T09:46:34Z

### L-041 - Keep a value that identifies the cloud account, such as a deploy role ARN, in a CI secret, because a CI variable's value prints in the public log.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `ci` · harmful: 0
- features: phase-2-infrastructure
- evidence: C65 .github/workflows/cd.yml role-to-assume (ci)
- last seen: 2026-11-03T09:46:34Z

### L-042 - Give each part of a claim that spans a module and the root that wires it a proof of its own, because a module run with made-up inputs does not prove the wiring.
- signal: `weak_test` · recurrence: 1 feature(s) · scope: `infra` · harmful: 0
- features: phase-2-infrastructure
- evidence: C44 C45 C49 test/infra/static/terraform.spec.ts:151 (infra)
- last seen: 2026-11-03T09:46:34Z

### L-043 - Validate a setting where every entry point reads it, because compiled scripts that skip the application's env validation otherwise accept an invalid value.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `config` · harmful: 0
- features: phase-2-infrastructure
- evidence: src/config/database.config.ts:11 (config)
- last seen: 2026-11-03T09:46:34Z

### L-044 - Check what a module output holds, not only that the caller reads it by name, because a swapped output passes a test that follows the name.
- signal: `weak_test` · recurrence: 1 feature(s) · scope: `infra` · harmful: 0
- features: phase-2-infrastructure
- evidence: C75 infra/modules/network/outputs.tf (infra)
- last seen: 2026-11-03T09:46:34Z

### L-045 - Compare a workflow's trigger filters as a whole beside the example events, because a few examples miss an added branch, pattern, ignore list or action.
- signal: `weak_test` · recurrence: 1 feature(s) · scope: `ci` · harmful: 0
- features: ci-triggers-and-test-collisions
- evidence: C1 test/infra/static/workflows.spec.ts:134 (ci)
- last seen: 2026-11-03T13:24:24Z

### L-046 - Rename a test together with every proof line under .specs that names it, because the renamed test leaves that check with no test that runs.
- signal: `weak_test` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: ci-triggers-and-test-collisions
- evidence: phase-2-infrastructure C61, renamed in 7383f9f (specs)
- last seen: 2026-11-03T13:24:24Z

### L-047 - Assert the kind of a generated document, not only that it parses, because PersonDocument accepts a CPF and a CNPJ alike.
- signal: `weak_test` · recurrence: 1 feature(s) · scope: `test-support` · harmful: 0
- features: ci-triggers-and-test-collisions
- evidence: C4 test/integration/test-values.spec.ts:136 (test-support)
- last seen: 2026-11-03T13:24:24Z

### L-048 - Check the mechanism a document credits against the code that does it, not only the outcome it names.
- signal: `weak_test` · recurrence: 1 feature(s) · scope: `docs` · harmful: 0
- features: phase-2-architecture-docs
- evidence: C2 docs/architecture/high-level-design.md, configureApp (docs)
- last seen: 2026-11-03T18:41:19Z

### L-049 - Compare the bodies and the failure condition a document gives for a route with the controller and its use case.
- signal: `weak_test` · recurrence: 1 feature(s) · scope: `docs` · harmful: 0
- features: phase-2-architecture-docs
- evidence: C3 docs/architecture/low-level-design/health.md bodies (docs)
- last seen: 2026-11-03T18:41:19Z

### L-050 - Pair each entry point a document names with what it does, so a test fails when two roles are swapped.
- signal: `weak_test` · recurrence: 1 feature(s) · scope: `docs` · harmful: 0
- features: phase-2-architecture-docs
- evidence: C1 high-level-design.md entry points (docs)
- last seen: 2026-11-03T18:41:19Z

### L-051 - Read routes from every form the decorator and a URL take, an empty path and a port included.
- signal: `weak_test` · recurrence: 1 feature(s) · scope: `docs` · harmful: 0
- features: phase-2-architecture-docs
- evidence: C3 route scan in test/infra/static/documents.spec.ts (docs)
- last seen: 2026-11-03T18:41:19Z

### L-052 - Check that the folders a document names exist, not only its files.
- signal: `weak_test` · recurrence: 1 feature(s) · scope: `docs` · harmful: 0
- features: phase-2-architecture-docs
- evidence: pathsNamed in test/infra/static/documents.spec.ts (docs)
- last seen: 2026-11-03T18:41:19Z

### L-053 - Check that a file a document sends the reader to holds what the document says it holds.
- signal: `weak_test` · recurrence: 1 feature(s) · scope: `docs` · harmful: 0
- features: phase-2-architecture-docs
- evidence: health.md pointer to k8s/README.md (docs)
- last seen: 2026-11-03T18:41:19Z

### L-054 - Name in a document which consumer each configuration file serves, and test each pairing.
- signal: `weak_test` · recurrence: 1 feature(s) · scope: `docs` · harmful: 0
- features: phase-2-architecture-docs
- evidence: high-level-design.md config row (docs)
- last seen: 2026-11-03T18:41:19Z

### L-055 - Do not pin a sentence in a test without checking that it is still true of the section around it.
- signal: `weak_test` · recurrence: 1 feature(s) · scope: `docs` · harmful: 0
- features: phase-2-architecture-docs
- evidence: C1 pinned the stale code units sentence (docs)
- last seen: 2026-11-03T18:41:19Z

### L-056 - Name the file when two scripts could fit a sentence of a document.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `docs` · harmful: 0
- features: phase-2-architecture-docs
- evidence: high-level-design.md How a request travels (docs)
- last seen: 2026-11-03T18:41:19Z

### L-057 - Set every variable a guide's command reads in the terminal that runs it.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `guides` · harmful: 0
- features: phase-2-architecture-docs
- evidence: docs/roteiro-video-fase-2.md block 7 k6 (guides)
- last seen: 2026-11-03T18:41:20Z

### L-058 - Write the status code where a guide names a work order status, with the Portuguese label beside it.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `guides` · harmful: 0
- features: phase-2-architecture-docs
- evidence: docs/roteiro-video-fase-2.md block 6 status (guides)
- last seen: 2026-11-03T18:41:20Z

### L-059 - Start a guide's terraform destroy with the init a machine that never applied needs.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `guides` · harmful: 0
- features: phase-2-architecture-docs
- evidence: README.md and docs/roteiro-video-fase-2.md destroy (guides)
- last seen: 2026-11-03T18:41:20Z

### L-060 - Count the completed pod of the migration Job among what kubectl get pods shows.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `guides` · harmful: 0
- features: phase-2-architecture-docs
- evidence: docs/roteiro-video-fase-2.md block 5 pods (guides)
- last seen: 2026-11-03T18:41:20Z

### L-061 - Create a demonstration branch from main, so its pull request holds only the demonstration commit.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `guides` · harmful: 0
- features: phase-2-architecture-docs
- evidence: docs/roteiro-video-fase-2.md step 6 branch (guides)
- last seen: 2026-11-03T18:41:20Z

### L-062 - Cite a source in a guide only after reading that it holds what the guide takes from it.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `guides` · harmful: 0
- features: phase-2-architecture-docs
- evidence: docs/roteiro-video-fase-2.md sources (guides)
- last seen: 2026-11-03T18:41:20Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
