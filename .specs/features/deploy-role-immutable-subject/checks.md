# Deploy role immutable subject checks

Build: `npm run build`; `npm run lint`
Run bootstrap: `scripts/tool.sh terraform -chdir=infra/bootstrap init -backend=false -input=false -no-color && scripts/tool.sh terraform -chdir=infra/bootstrap test -no-color`
Run infra: `npx vitest run --config vitest.infra.config.ts --reporter=verbose test/infra/static`

## Intent

The first deploy fails at the credentials step of the `terraform` job with "Could not assume role with OIDC: Not authorized to perform sts:AssumeRoleWithWebIdentity". GitHub has opted the repository into the immutable OIDC subject: `GET repos/kewincosta/tech-challenge-fiap/actions/oidc/customization/sub` answers `use_immutable_subject: true` and `sub_claim_prefix: repo:kewincosta@72565745/tech-challenge-fiap@1357566072`, so a job of the `prod` environment carries the subject `repo:kewincosta@72565745/tech-challenge-fiap@1357566072:environment:prod`. The role `workshop-deploy` trusts only `repo:kewincosta/tech-challenge-fiap:environment:prod`, the name-based form, and AWS compares the subject exactly. This amends AD-022 and C54 of `phase-2-infrastructure`.

When this ships, the bootstrap builds the trusted subject from a variable `github_subject_prefix` that holds the immutable prefix, refuses a prefix without the owner and repository IDs or of another repository, and the guide says where the prefix comes from. The user then applies the bootstrap again and re-runs the CD. The user, 2026-11-03: "Vamos fazer o ajuste do projeto".

10 checks in 2 slices · 0 one-way doors · 0 open, of which 0 block

## Checks

### S1 - The deploy role trusts the immutable subject

**C1** - A plan of the bootstrap with its defaults gives `workshop-deploy` a trust with the audience `sts.amazonaws.com` and the subject `repo:kewincosta@72565745/tech-challenge-fiap@1357566072:environment:prod`, built from the variable `github_subject_prefix`
Proof: run bootstrap | run "deploy_role_trust"... pass

**C2** - A plan whose `github_subject_prefix` has no owner and repository IDs, such as `repo:kewincosta/tech-challenge-fiap`, fails on the validation of that variable, with a message that names `sub_claim_prefix`
Proof: run bootstrap | run "subject_prefix_without_ids"... pass

**C3** - A plan whose `github_subject_prefix` names another owner or another repository than `github_repository` fails on the validation of that variable
Proof: run bootstrap | run "subject_prefix_of_another_repository"... pass

**C6** - A plan with another valid prefix, `repo:kewincosta@1/tech-challenge-fiap@2`, gives the role the subject `repo:kewincosta@1/tech-challenge-fiap@2:environment:prod` (appended after the verification's finding 1)
Proof: run bootstrap | run "deploy_role_trust_follows_the_prefix"... pass

**C7** - The error message of the validation that refuses a prefix without the IDs names `sub_claim_prefix` and `gh api repos/<owner>/<repo>/actions/oidc/customization/sub` (appended after the verification's finding 2)
Proof: run infra | ✓ Bootstrap variables > names sub_claim_prefix where a prefix without the IDs is refused

**C8** - A plan whose prefix carries only one of the two IDs fails on the validation of `github_subject_prefix`: `repo:kewincosta@72565745/tech-challenge-fiap` and `repo:kewincosta/tech-challenge-fiap@1357566072` (appended after the verification's finding 2)
Proof: run bootstrap | run "subject_prefix_without_repository_id"... pass
Proof: run bootstrap | run "subject_prefix_without_owner_id"... pass

**C9** - A plan whose prefix names another owner with the same repository name, or the same owner with another repository name, fails on the validation of `github_subject_prefix` (appended after the verification's finding 3)
Proof: run bootstrap | run "subject_prefix_of_another_owner"... pass
Proof: run bootstrap | run "subject_prefix_of_another_repository_name"... pass

### S2 - The guide and the records say which subject the role trusts

**C4** - `infra/README.md` says the role trusts `repo:kewincosta@72565745/tech-challenge-fiap@1357566072:environment:prod`, and shows how to read the prefix with `gh api repos/<owner>/<repo>/actions/oidc/customization/sub`, whose `sub_claim_prefix` goes into `github_subject_prefix`
Proof: run infra | ✓ Bootstrap guide > names the immutable subject and where its prefix comes from

**C5** - ADR 0043 exists, `Accepted`, names AD-027 and says it amends ADR 0038; ADR 0038's status reads `Amended by 0043`; AD-027 names ADR 0043, and AD-022's status reads `active, amended by AD-027`
Proof: run infra | ✓ Decision records > records AD-027 as ADR 0043, which amends ADR 0038

**C10** - The README names ADRs 0038 to 0043 wherever it lists the Phase 2 records, and gives their count as six (appended after the verification's finding 5)
Proof: run infra | ✓ README > lists the Phase 2 records 0038 to 0043

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| subject prefixes (8 examples) | the default, with the IDs C1 · another valid one C6 · without the IDs C2 · without the repository ID C8 · without the owner ID C8 · another owner and name C3 · another owner, same name C9 · same owner, another name C9 | - |
| documents (5) | `infra/README.md` C4 · ADR 0043 and the index C5 · rows AD-022 and AD-027 C5 · the README's list of Phase 2 records C10 · the message of the prefix validation C7 | - |

## Swept

- validation: C2, C3, C7, C8, C9
- failure modes: n/a - a plan that fails validation changes nothing
- idempotency: n/a - one in-place change of the role's trust
- authorization: C1 (the subject the role trusts), C2 and C3 (a looser or foreign prefix is refused)
- concurrency: n/a - the bootstrap is applied by hand, once
- data lifecycle: n/a - no data
- dependency failure: n/a - no external call in the checks
- state transitions: n/a - no status
- observability: n/a - no logging requirement

## Out of scope

| Excluded | Why |
| --- | --- |
| Applying the bootstrap to AWS | The user applies it with their own credentials, after this ships |
| Turning the repository's immutable subject off | GitHub documents only the opt-in, and the immutable subject keeps a renamed or recreated repository from assuming the role |
| The main stack and the CD workflow | The role's name and ARN do not change, and the CD reads the ARN from the same secret |

## Handoff

- **Settled mid-build:** none
- **Dispatched:** build (Sonnet sub-agent, C1 to C5) at `87782a9`, returned at `245c310`; Verifier (fresh sub-agent, default model) at `976a74d`, over `8e5da7a..976a74d`, with `proofs.md` 7 pass at `976a74d`, returned FAIL with 5 findings at `2b6873b`; fix of the 5 findings (Sonnet sub-agent, C6 to C10) at `2b6873b`, returned at `b6476ff`; the user applied the bootstrap at 18:38 on 2026-11-03, and its local state now holds the immutable subject
- **Boundary:** C1-C5 closed at `245c310`; C6-C10 closed at `b6476ff`
- **Abandoned:** none
