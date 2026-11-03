# deploy-role-immutable-subject proofs

**HEAD**: 23af302
**Tree**: clean
**Shell**: /bin/sh
**Result**: 14 pass, 0 fail

| Check | Proof | Result |
| --- | --- | --- |
| C1 | `run bootstrap / run "deploy_role_trust"... pass` | pass |
| C2 | `run bootstrap / run "subject_prefix_without_ids"... pass` | pass |
| C3 | `run bootstrap / run "subject_prefix_of_another_repository"... pass` | pass |
| C6 | `run bootstrap / run "deploy_role_trust_follows_the_prefix"... pass` | pass |
| C7 | `run infra / ✓ Bootstrap variables > names sub_claim_prefix where a prefix without the IDs is refused` | pass |
| C8 | `run bootstrap / run "subject_prefix_without_repository_id"... pass` | pass |
| C8 | `run bootstrap / run "subject_prefix_without_owner_id"... pass` | pass |
| C9 | `run bootstrap / run "subject_prefix_of_another_owner"... pass` | pass |
| C9 | `run bootstrap / run "subject_prefix_of_another_repository_name"... pass` | pass |
| C4 | `run infra / ✓ Bootstrap guide > names the immutable subject and where its prefix comes from` | pass |
| C5 | `run infra / ✓ Decision records > records AD-027 as ADR 0043, which amends ADR 0038` | pass |
| C10 | `run infra / ✓ README > lists the Phase 2 records 0038 to 0043` | pass |
| Build | `npm run build` | pass |
| Build | `npm run lint` | pass |

## Output

`Run bootstrap` - exit 0

```
  run "state_bucket"... pass
  run "oidc_provider"... pass
  run "deploy_role_trust"... pass
  run "deploy_role_trust_follows_the_prefix"... pass
  run "subject_prefix_without_ids"... pass
  run "subject_prefix_without_repository_id"... pass
  run "subject_prefix_without_owner_id"... pass
  run "subject_prefix_of_another_owner"... pass
  run "subject_prefix_of_another_repository_name"... pass
  run "subject_prefix_of_another_repository"... pass
  run "deploy_role_permissions"... pass
tests/bootstrap.tftest.hcl... tearing down
tests/bootstrap.tftest.hcl... pass

Success! 11 passed, 0 failed.
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
      Tests  95 passed (95)
   Start at  19:11:42
   Duration  8.96s (transform 210ms, setup 0ms, collect 332ms, tests 8.43s, environment 0ms, prepare 53ms)
```
