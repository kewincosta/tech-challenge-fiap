# CI triggers and test collisions verification

**Verdict**: FAIL
**Proofs**: `proofs.md` at 9da3341
**Verifier**: independent sub-agent (author != verifier)

## Checks

| Check | Test | Holds |
| --- | --- | --- |
| C1 | `workflows.spec.ts` `runs lint, unit and build in parallel on pull requests into main and pushes to main only` | no - "on nothing else" rests on one other branch per event and one other action, and six trigger blocks that start runs elsewhere pass it |
| C2 | `documents.spec.ts` `records AD-026 as ADR 0042, which amends ADR 0041` | yes |
| C3 | `readme.spec.ts` `says the CI runs on pull requests into main and pushes to main` | yes |
| C4 | `test-values.spec.ts` `skips a CPF an active user holds` | no - it holds the skip, but `PersonDocument.create` also accepts a valid 14-digit CNPJ, so "another CPF" is not asserted |
| C5 | `test-values.spec.ts` `skips a plate an active vehicle holds` | yes |
| C6 | `test-values.spec.ts` `never hands out the same CPF or plate twice` | yes |
| C7 | `test-values.spec.ts` `loads the taken values in the integration and e2e suites only` | yes |

## Findings

| Finding | Evidence | Fix | Closed |
| --- | --- | --- | --- |
| C1's test passes trigger blocks that start the CI on other branches and on other pull request actions | `workflows.spec.ts:134` names one other branch per event (`feat/tech-challenge-2` for a push, `develop` for a pull request) and one other action (`closed`). In a scratch worktree the test passed with each of these `on:` blocks: `push: branches: [main, develop]`; `pull_request: branches-ignore: [develop]`; `push: branches-ignore: ['feat/**']`; `branches: ['main*']` on both events; `pull_request: branches: [main, 'release/**']`; `types: [opened, synchronize, reopened, labeled, ready_for_review]`. With the first two, the repository's own `startsRun` says a push to `develop` and a pull request into `staging` start a run | assert that `triggersOf(ci)` is `{ pull_request: { branches: ['main'] }, push: { branches: ['main'] } }` beside the examples | |
| The proof of `phase-2-infrastructure` C61 selects no test | `phase-2-infrastructure/checks.md:233` names `CI workflow > runs lint, unit and build as parallel jobs on every push and pull request`, and `7383f9f` renamed that test. The matcher of `check_proofs.py` (`sees`) finds no such line in the infra run at HEAD, so `check_proofs.py phase-2-infrastructure` would read C61 as `no test ran` | point C61's `Proof:` at the renamed test. It still asserts C61's jobs, commands and parallelism, and C61 already says C1 superseded its triggers | |
| C4's test accepts a CNPJ where C4 fixes a CPF | `test-values.spec.ts:136` asserts only that `PersonDocument.create(another)` does not throw, and that call accepts a valid 14-digit CNPJ. With the factory's redraw changed to return `11222333000181`, the test passed in a scratch worktree | assert that `PersonDocument.create(another).kind` is `CPF` | |

## The closed feature's tests

C61's test is now C1's test. Its lines after the trigger assertions did not change, so it still asserts the jobs `lint`, `unit` and `build`, their three commands, no `needs`, no `if` and no `continue-on-error`. Only the trigger assertion changed: it now runs the `CI_EVENTS` examples through `startsRun` where it used to require no filter, which is the change AD-026 made. Its proof line in the closed feature is stale (second finding).

C71's test still asserts, for ADRs 0038 to 0041, one file per number, the number in the title, the `Source` and `Recorded` lines, the four sections in order, the log row that names the ADR, the title in the index and the links among the four. The status check now compares the first `**Status**:` line exactly, which is at least as strict as the old multiline match. Only ADR 0041's status, in the record and the index, and AD-025's row changed: from `Accepted` and `active` to `Amended by [0042](...)` and `amended by AD-026`, as AD-026 requires. Its proof line still prints.

## Own examples

All ran at `db585f6`, whose code is that of `9da3341`. They ran in a scratch worktree, and each example inserted its own rows and deleted them.

- With the committed `ci.yml`, `startsRun` says a push to `develop` or `release/1` and a pull request into `staging` or `release/1` start no run.
- E1: the draws give an active user's CPF twice in a row, and the factory skips both and returns a third value whose kind is `CPF`. E1 also fails a factory that redraws only once, a mutant that C4 to C6 pass.
- E2: the factory hands out a CPF that only a removed user holds, and the partial index accepts an active user with it.
- E3: 20,000 CPFs and 20,000 plates drawn in one file are all different, and no active row holds any of them.
- E4: with `Math.random` held constant, the second plate call throws after 1000 draws (4000 calls).
- E5: under the e2e configuration, all 155,630 active CPFs and plates were in the set before the file's first test.

At HEAD, `npm run test:integration` passes 61 files and 530 tests, and `npm run test:e2e` passes 25 files and 296 tests. Mutants the tests failed: a factory that does not record what it hands out (C6), a loader that reads removed users (C4, C7) or skips vehicles (C5, C7), a setup that loads nothing (C7), an e2e configuration without the setup (C7), and seven record mutants (C2). The C3 test passes a README that says "A push to any other branch runs it too.", because it rules out only the words "every push" and "each push".
