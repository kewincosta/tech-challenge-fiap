# ci-triggers-and-test-collisions proofs

**HEAD**: 9da3341
**Tree**: clean
**Shell**: /bin/sh
**Result**: 9 pass, 0 fail

| Check | Proof | Result |
| --- | --- | --- |
| C1 | `run infra / ✓ CI workflow > runs lint, unit and build in parallel on pull requests into main and pushes to mai` | pass |
| C2 | `run infra / ✓ Decision records > records AD-026 as ADR 0042, which amends ADR 0041` | pass |
| C3 | `run infra / ✓ README > says the CI runs on pull requests into main and pushes to main` | pass |
| C4 | `run integration / ✓ Test values > skips a CPF an active user holds` | pass |
| C5 | `run integration / ✓ Test values > skips a plate an active vehicle holds` | pass |
| C6 | `run integration / ✓ Test values > never hands out the same CPF or plate twice` | pass |
| C7 | `run integration / ✓ Test values > loads the taken values in the integration and e2e suites only` | pass |
| Build | `npm run build` | pass |
| Build | `npm run lint` | pass |

## Output

`Run infra` - exit 0

```
 ✓ test/infra/static/expressions.spec.ts > Workflow expressions > compares strings without regard to case 0ms
 ✓ test/infra/static/expressions.spec.ts > Workflow expressions > turns a pair of different types into numbers before it compares them 0ms
 ✓ test/infra/static/expressions.spec.ts > Workflow expressions > gives null for a property that is not there 0ms
 ✓ test/infra/static/expressions.spec.ts > Workflow expressions > returns an operand from && and ||, and binds && tighter than || 0ms
 ✓ test/infra/static/expressions.spec.ts > Workflow expressions > negates by truthiness 0ms
 ✓ test/infra/static/expressions.spec.ts > Workflow expressions > formats text and reads functions 0ms
 ✓ test/infra/static/expressions.spec.ts > Workflow expressions > keeps the type of one expression and turns expressions inside text into text 0ms
 ✓ test/infra/static/expressions.spec.ts > Workflow expressions > runs a job whose needs succeeded only when its condition holds 0ms
 ✓ test/infra/static/expressions.spec.ts > Workflow expressions > skips a job after a failure unless its condition names a status 0ms
 ✓ test/infra/static/expressions.spec.ts > Workflow expressions > finds the status functions of an expression 0ms

 Test Files  7 passed (7)
      Tests  88 passed (88)
   Start at  08:11:25
   Duration  6.72s (transform 112ms, setup 0ms, collect 201ms, tests 6.40s, environment 0ms, prepare 33ms)
```

`Run integration` - exit 0

```
RUN  v3.2.7 /home/kewin/side_projects/fiap/tech_challenger_1

 ✓ test/integration/test-values.spec.ts > Test values > skips a CPF an active user holds 129ms
 ✓ test/integration/test-values.spec.ts > Test values > skips a plate an active vehicle holds 128ms
 ✓ test/integration/test-values.spec.ts > Test values > never hands out the same CPF or plate twice 1ms
 ✓ test/integration/test-values.spec.ts > Test values > loads the taken values in the integration and e2e suites only 69ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  08:11:32
   Duration  1.08s (transform 129ms, setup 100ms, collect 184ms, tests 476ms, environment 0ms, prepare 35ms)
```
