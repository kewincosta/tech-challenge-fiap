# phase-2-architecture-docs proofs

**HEAD**: cd46ba0
**Tree**: clean
**Shell**: /bin/sh
**Result**: 6 pass, 0 fail

| Check | Proof | Result |
| --- | --- | --- |
| C1 | `run infra / ✓ Architecture documents > names the units Phase 2 added in the high level design` | pass |
| C2 | `run infra / ✓ Architecture documents > places the probes outside the API prefix in the high level design` | pass |
| C3 | `run infra / ✓ Architecture documents > gives the health module a low level page the index links` | pass |
| C4 | `git check-ignore -q docs/roteiro-video.md && git check-ignore -q docs/roteiro-video-fase-2.md` | pass |
| Build | `npm run build` | pass |
| Build | `npm run lint` | pass |

## Output

`Run infra` - exit 0

```
 ✓ test/infra/static/expressions.spec.ts > Workflow expressions > finds the status functions of an expression 0ms
 ✓ test/infra/static/triggers.spec.ts > Workflow triggers > starts on the events the workflow lists and on no other 0ms
 ✓ test/infra/static/triggers.spec.ts > Workflow triggers > matches a pattern against the whole name, and lets * stop at a slash and ** go through it 0ms
 ✓ test/infra/static/triggers.spec.ts > Workflow triggers > reads ?, + and a class of characters 0ms
 ✓ test/infra/static/triggers.spec.ts > Workflow triggers > lets a later ! pattern drop a name and a later plain pattern restore it 0ms
 ✓ test/infra/static/triggers.spec.ts > Workflow triggers > skips what branches-ignore names 0ms
 ✓ test/infra/static/triggers.spec.ts > Workflow triggers > keeps a tag away from a workflow that filters only branches, and a branch from one that filters only tags 0ms
 ✓ test/infra/static/triggers.spec.ts > Workflow triggers > filters a pull request by the branch it targets 0ms
 ✓ test/infra/static/triggers.spec.ts > Workflow triggers > runs a pull request for opened, synchronize and reopened unless types list others 0ms
 ✓ test/infra/static/triggers.spec.ts > Workflow triggers > refuses a filter that needs the files of a change 0ms

 Test Files  7 passed (7)
      Tests  91 passed (91)
   Start at  15:14:56
   Duration  8.89s (transform 187ms, setup 0ms, collect 325ms, tests 8.40s, environment 0ms, prepare 46ms)
```

`git check-ignore -q docs/roteiro-video.md && git check-ignore -q docs/roteiro-video-fase-2.md` - exit 0

```
(no output)
```
