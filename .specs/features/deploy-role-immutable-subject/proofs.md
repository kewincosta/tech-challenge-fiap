# deploy-role-immutable-subject proofs

**HEAD**: 976a74d
**Tree**: clean
**Shell**: /bin/sh
**Result**: 7 pass, 0 fail

| Check | Proof | Result |
| --- | --- | --- |
| C1 | `run bootstrap / run "deploy_role_trust"... pass` | pass |
| C2 | `run bootstrap / run "subject_prefix_without_ids"... pass` | pass |
| C3 | `run bootstrap / run "subject_prefix_of_another_repository"... pass` | pass |
| C4 | `run infra / ✓ Bootstrap guide > names the immutable subject and where its prefix comes from` | pass |
| C5 | `run infra / ✓ Decision records > records AD-027 as ADR 0043, which amends ADR 0038` | pass |
| Build | `npm run build` | pass |
| Build | `npm run lint` | pass |

## Output

`Run bootstrap` - exit 0

```

If you ever set or change modules or backend configuration for Terraform,
rerun this command to reinitialize your working directory. If you forget, other
commands will detect it and remind you to do so if necessary.
tests/bootstrap.tftest.hcl... in progress
  run "state_bucket"... pass
  run "oidc_provider"... pass
  run "deploy_role_trust"... pass
  run "subject_prefix_without_ids"... pass
  run "subject_prefix_of_another_repository"... pass
  run "deploy_role_permissions"... pass
tests/bootstrap.tftest.hcl... tearing down
tests/bootstrap.tftest.hcl... pass

Success! 6 passed, 0 failed.
```

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
      Tests  93 passed (93)
   Start at  18:33:51
   Duration  7.09s (transform 128ms, setup 0ms, collect 241ms, tests 6.72s, environment 0ms, prepare 37ms)
```
