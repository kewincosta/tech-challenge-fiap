# CI triggers and test collisions checks

Build: `npm run build`; `npm run lint`
Run infra: `npx vitest run --config vitest.infra.config.ts --reporter=verbose test/infra/static`
Run integration: `npx vitest run --config vitest.integration.config.ts --reporter=verbose test/integration/test-values`

## Intent

The CI runs on every push to any branch and on every pull request, so each push to a development branch spends a run. The user wants it on the pull requests into `main`: "O CI deveria ser ao abrir PR para main e não ao fazer push na branch de desenvolvimento." The CD starts only from a successful CI run of a push to `main`, so the push a merge makes to `main` keeps its CI run. This amends door 6 of `phase-2-infrastructure` and AD-025.

The integration and e2e suites fail about one run in ten on a value another run left behind. `uniqueValidCpf()` draws from 10^9 bases against the 96,740 active users of `workshop_test`, which is never truncated, and `uniqueLicensePlate()` draws from 175,760,000 plates against its 56,442 active vehicles. A draw that repeats a stored value meets the partial unique index `ux_users_document` or `ux_vehicles_plate`, and the API answers 409 or the insert fails.

When this ships, the CI runs on pull requests into `main` and on pushes to `main`, and a push to any other branch runs nothing. The factories of the integration and e2e suites never hand out a CPF or a plate an active row of `workshop_test` holds, nor the same value twice in a file. The user approved both on 2026-11-03: "Sim".

7 checks in 3 slices · 0 one-way doors · 0 open, of which 0 block

## Checks

### S1 - The CI runs on pull requests into main

**C1** - The CI workflow starts on a pull request into `main` when it opens, gets a new commit or reopens, and on a push to `main`, and on nothing else: a push to another branch and a pull request into another branch start no run. Its jobs `lint`, `unit` and `build` stay parallel, none needing another, and run `npm run lint`, `npm run test:unit` and `npm run build`
Proof: run infra | ✓ CI workflow > runs lint, unit and build in parallel on pull requests into main and pushes to main only

### S2 - The records say where the CI runs

**C2** - ADR 0042 exists, `Accepted`, names AD-026 and says it amends ADR 0041; ADR 0041's status reads `Amended by 0042`; AD-026 names ADR 0042, and AD-025's status reads amended by AD-026
Proof: run infra | ✓ Decision records > records AD-026 as ADR 0042, which amends ADR 0041

**C3** - The README says the CI runs on pull requests into `main` and on pushes to `main`, and no longer says it runs on every push
Proof: run infra | ✓ README > says the CI runs on pull requests into main and pushes to main

### S3 - Test values never collide

**C4** - Under the integration setup, with an active user of `workshop_test` holding a CPF and the random draws set to give that CPF first, `uniqueValidCpf()` returns another CPF with valid check digits; the test removes the user it inserted
Proof: run integration | ✓ Test values > skips a CPF an active user holds

**C5** - Under the integration setup, with an active vehicle of `workshop_test` holding a plate and the random draws set to give that plate first, `uniqueLicensePlate()` returns another plate in the same format; the test removes the rows it inserted
Proof: run integration | ✓ Test values > skips a plate an active vehicle holds

**C6** - In one test file, with the random draws repeating the same CPF and the same plate, the second call of each factory returns a value different from the first
Proof: run integration | ✓ Test values > never hands out the same CPF or plate twice

**C7** - The integration and e2e configurations load the CPFs and plates the active rows of the test database hold before each test file, and the unit configuration loads none
Proof: run integration | ✓ Test values > loads the taken values in the integration and e2e suites only

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| CI trigger examples (6) | push to `main` C1 · push to another branch C1 · pull request into `main` opened C1 · a new commit on it C1 · reopened C1 · pull request into another branch C1 | - |
| decision records (3) | ADR 0042 C2 · ADR 0041's status C2 · rows AD-025 and AD-026 C2 | - |
| factories (2) | `uniqueValidCpf` C4, C6 · `uniqueLicensePlate` C5, C6 | - |
| unique indexes the draws avoid (2) | `ux_users_document` C4 · `ux_vehicles_plate` C5 | - |
| startup config: taken values (3 configurations) | integration C7 · e2e C7 · unit, with none C7 | - |

## Swept

- validation: n/a - no input or setting changes
- failure modes: existing - the integration and e2e suites already stop when `workshop_test` cannot be reached, and the values load in their setup
- idempotency: C6
- authorization: existing - the CI keeps `permissions: contents: read`, which the workflow spec of `phase-2-infrastructure` asserts
- concurrency: C6 within a file; two runs at the same time are out of scope
- data lifecycle: C4, C5 (each removes what it inserted)
- dependency failure: existing - as in failure modes
- state transitions: n/a - no status changes
- observability: n/a - no logging requirement

## Out of scope

| Excluded | Why |
| --- | --- |
| Removing the rows earlier runs left in `workshop_test` | The convention never truncates it; the factories avoid those rows instead |
| Two test runs at the same time against `workshop_test` | Each file loads the taken values when it starts, so two simultaneous runs can still draw the same value; the suites run one at a time here |
| The unit suite's draws | They reach no database |
| The CD's trigger | It still starts when the CI succeeds on a push to `main` |

## Handoff

- **Settled mid-build:** none
- **Dispatched:** build (Sonnet sub-agent, C1 to C7) at `71ceae3`
- **Boundary:** none
- **Abandoned:** none
