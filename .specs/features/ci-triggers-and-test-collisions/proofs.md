# ci-triggers-and-test-collisions proofs

**HEAD**: eb8dc93
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
 ✓ test/infra/static/expressions.spec.ts > Workflow expressions > finds the status functions of an expression 0ms
 ✓ test/infra/static/triggers.spec.ts > Workflow triggers > starts on the events the workflow lists and on no other 0ms
 ✓ test/infra/static/triggers.spec.ts > Workflow triggers > matches a pattern against the whole name, and lets * stop at a slash and ** go through it 1ms
 ✓ test/infra/static/triggers.spec.ts > Workflow triggers > reads ?, + and a class of characters 1ms
 ✓ test/infra/static/triggers.spec.ts > Workflow triggers > lets a later ! pattern drop a name and a later plain pattern restore it 1ms
 ✓ test/infra/static/triggers.spec.ts > Workflow triggers > skips what branches-ignore names 0ms
 ✓ test/infra/static/triggers.spec.ts > Workflow triggers > keeps a tag away from a workflow that filters only branches, and a branch from one that filters only tags 0ms
 ✓ test/infra/static/triggers.spec.ts > Workflow triggers > filters a pull request by the branch it targets 0ms
 ✓ test/infra/static/triggers.spec.ts > Workflow triggers > runs a pull request for opened, synchronize and reopened unless types list others 0ms
 ✓ test/infra/static/triggers.spec.ts > Workflow triggers > refuses a filter that needs the files of a change 0ms

 Test Files  7 passed (7)
      Tests  88 passed (88)
   Start at  10:23:25
   Duration  10.40s (transform 218ms, setup 0ms, collect 381ms, tests 9.79s, environment 0ms, prepare 63ms)
```

`Run integration` - exit 0

```
RUN  v3.2.7 /home/kewin/side_projects/fiap/tech_challenger_1

 ✓ test/integration/test-values.spec.ts > Test values > skips a CPF an active user holds 195ms
 ✓ test/integration/test-values.spec.ts > Test values > skips a plate an active vehicle holds 184ms
 ✓ test/integration/test-values.spec.ts > Test values > never hands out the same CPF or plate twice 1ms
 ✓ test/integration/test-values.spec.ts > Test values > loads the taken values in the integration and e2e suites only 104ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  10:23:36
   Duration  1.58s (transform 206ms, setup 141ms, collect 298ms, tests 678ms, environment 0ms, prepare 54ms)
```
