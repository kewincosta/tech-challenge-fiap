# Deploy role immutable subject verification

**Verdict**: FAIL
**Proofs**: `proofs.md` at 976a74d
**Verifier**: independent sub-agent (author != verifier)

Judged at 2b6873b, which changes only `.specs` after 976a74d, so the code and the tests are the ones `proofs.md` ran. The feature has no `plan.md`: C1 to C5 are judged against `checks.md` and its `## Intent`, and no capture binds them. The experiments ran in a scratch worktree at 2b6873b with the pinned Terraform 1.17.1 image and the mocked provider of the tests, and the container got no AWS variable and no `~/.aws`. Nothing reached AWS or GitHub.

## Checks

| Check | Test | Holds |
| --- | --- | --- |
| C1 | `bootstrap.tftest.hcl` `deploy_role_trust` | no: it plans with the defaults only, so it holds the audience and the subject but not that `github_subject_prefix` builds the subject. With the subject written out in `main.tf` (M1), all six runs pass |
| C2 | `bootstrap.tftest.hcl` `subject_prefix_without_ids` | no: `expect_failures` passes on any failed validation of the variable and reads no message, so a message that does not name `sub_claim_prefix` (M2) passes. Its prefix has neither ID, and a validation that asks for one ID only (M5) passes too |
| C3 | `bootstrap.tftest.hcl` `subject_prefix_of_another_repository` | no: its prefix differs from `github_repository` in both the owner and the name, so a validation that compares the owner only (M3) or the name only (M4) passes |
| C4 | `readme.spec.ts` `names the immutable subject and where its prefix comes from` | yes: the subject sentence, the `gh api` command, the sentence on `sub_claim_prefix` and the apply command are compared exactly, and the name-based subject is refused in the section |
| C5 | `documents.spec.ts` `records AD-027 as ADR 0043, which amends ADR 0038` | yes: the two status lines, the `Amends` line, the rows of AD-022 and AD-027 and the two index rows are compared exactly |

## Findings

| Finding | Evidence | Fix | Closed |
| --- | --- | --- | --- |
| A subject written out in `main.tf` passes every run, so no test holds that `github_subject_prefix` builds it | `bootstrap.tftest.hcl:65` plans with the defaults only, and the runs that set the variable expect a refusal. M1 puts `"repo:kewincosta@72565745/tech-challenge-fiap@1357566072:environment:${var.github_environment}"` at `main.tf:90` and passes all six runs. The guide would then have the user change a variable that changes no trust | add a run whose prefix passes both validations, such as `repo:kewincosta@1/tech-challenge-fiap@2`, and assert the subject `repo:kewincosta@1/tech-challenge-fiap@2:environment:prod` | |
| C2's test holds neither the message that names `sub_claim_prefix` nor a prefix that carries one of the two IDs | `bootstrap.tftest.hcl:116` uses `expect_failures`, which reads no message, on a prefix with no ID at all. M2 cuts the message at `variables.tf:26` to "The prefix must carry the owner and repository IDs." and passes all six runs. M5 makes the condition at `variables.tf:25` `can(regex("@[0-9]+", var.github_subject_prefix))`, passes all six runs, and accepts `repo:kewincosta@72565745/tech-challenge-fiap`, a trust no token matches | assert that the first validation's `error_message` names `sub_claim_prefix`, for instance in a static test over `variables.tf` with the `blocks` helpers of `test/infra/support/hcl.ts`, as a second proof of C2; and add refusal runs for `repo:kewincosta@72565745/tech-challenge-fiap` and `repo:kewincosta/tech-challenge-fiap@1357566072` | |
| C3's test passes a check of the owner alone or of the name alone | `bootstrap.tftest.hcl:126` uses `repo:someone-else@1234/other-repository@5678`, which differs from `github_repository` in both halves. M3 compares the owner only at `variables.tf:30`, passes all six runs, and accepts `repo:kewincosta@72565745/other-repository@5678`: the role would trust the `prod` jobs of another repository of the same owner. M4 compares the name only, passes all six runs, and accepts `repo:someone-else@1234/tech-challenge-fiap@1357566072` | refuse one prefix per half: another owner with the same name, `repo:someone-else@1234/tech-challenge-fiap@1357566072`, and the same owner with another name, `repo:kewincosta@72565745/other-repository@5678` | |
| C71 of `phase-2-infrastructure` still says ADR 0038 is `Accepted`, while its test now requires `Amended by 0043` | b16597c set `documents.spec.ts:18` to `[38, 22, [43, 27]]`, so `records AD-022 to AD-025 as ADRs 0038 to 0041 that name each other`, C71's proof, requires ADR 0038 and its index row to read `Amended by [0043](...)` and AD-022 to read `active, amended by AD-027`. `phase-2-infrastructure/checks.md:267` names only the amendment of 0041. 8e5da7a amended C54's text for this feature, and 9da3341 amended C71's for ADR 0042 | append to C71's parenthetical that ADR 0043 amended 0038 and AD-027 amended AD-022, so their statuses read `Amended by 0043` and `amended by AD-027` | |
| The README still says Phase 2 has five records, 0038 to 0042 | `README.md:328` "Five records in `docs/adr/` hold the decisions" lists 0038 to 0042, and `README.md:1220` reads "The five of Phase 2, 0038 to 0042". fb144cf updated both when it added 0042; b16597c changed only the count on line 1219. Neither names 0043, the record of the subject the deploy role trusts | name 0043 in both places, as six records, with what it decides | |

## The closed feature's tests

C54's test is now C1's test. b548337 changed only its subject literal and that assertion's message. The run still asserts the role's name, one statement, `Allow` with `sts:AssumeRoleWithWebIdentity`, a `Principal` that is the provider's ARN and nothing else, and the whole `Condition` under `StringEquals`. M8 (a second principal beside the provider) and M9 (`StringLike` in place of `StringEquals`) each fail it. The subject no longer comes from `github_repository`, but that variable's default is still held: with it changed, the second validation fails every default plan (M10). The owner and the name in the literal are those of `origin`, `git@github.com:kewincosta/tech-challenge-fiap.git`. The two IDs come from the user's call to GitHub in the Intent, which I could not repeat offline. So the test still proves all that C54 proved except its subject, which C1 now fixes and which C54's text marks as superseded. Its proof line still prints.

C71's test changed too, through `RECORDS` (fourth finding). For ADRs 0038 to 0041 it still asserts one file per number, the number in the title, the `Source` and `Recorded` lines, the four sections in order, the log row that names the ADR, the title in the index and the links among the four. ADR 0038's new link to 0043 resolves, and 0043 stays out of the set the four must name. Its proof line still prints.

## The trust against the token

With the defaults, the plan gives `workshop-deploy` one statement: `sts:AssumeRoleWithWebIdentity` from the GitHub provider, with `StringEquals` on `aud` `sts.amazonaws.com` and on `sub` `repo:kewincosta@72565745/tech-challenge-fiap@1357566072:environment:prod`. The CD's three jobs that call AWS (`terraform`, `image` and `deploy`) run in `environment: prod` with `id-token: write`, and `configure-aws-credentials` v6.3.0 asks for its default audience, `sts.amazonaws.com`. Their token carries `<prefix>:environment:prod` and matches the trust. The diff changes only the role's `assume_role_policy`, which the provider updates in place; I did not plan against the real state. The guide's new apply command reaches the profile, because `scripts/tool.sh:142` hands `AWS_PROFILE` to the container and mounts `~/.aws` read-only. `terraform fmt -check -recursive infra` and `terraform validate` on the bootstrap, C57 and C59 of `phase-2-infrastructure`, pass at 2b6873b.

## Own examples

All ran at 2b6873b in a throwaway test file beside the suite. None broke a rule.

- C2's rule refuses `repo:kewincosta@72565745/tech-challenge-fiap` (the owner's ID only), `repo:kewincosta/tech-challenge-fiap@1357566072` (the repository's ID only), the whole subject `repo:kewincosta@72565745/tech-challenge-fiap@1357566072:environment:prod`, the old subject `repo:kewincosta/tech-challenge-fiap:environment:prod`, the prefix with a trailing newline, and the empty string. Run without `expect_failures`, the prefix with the owner's ID only fails the first validation alone, with the message that names `sub_claim_prefix`. That is what 245c310 gave the second validation, and no test holds it.
- C3's rule refuses another owner with the same name, `repo:someone-else@1234/tech-challenge-fiap@1357566072`, and the same owner with another name, `repo:kewincosta@72565745/other-repository@5678`, each on the second validation alone. It also refuses the owner in other case, `repo:KewinCosta@72565745/tech-challenge-fiap@1357566072`, and the default prefix left behind when `github_repository` changes to `kewincosta/renamed-repository`.
- The subject follows the variables. `repo:kewincosta@1/tech-challenge-fiap@2` gives `repo:kewincosta@1/tech-challenge-fiap@2:environment:prod`. `github_repository` `other-owner/other.repo_name` with `repo:other-owner@11/other.repo_name@22` gives that prefix and `:environment:prod`. `github_environment` `staging` gives the default prefix and `:environment:staging`.

## Mutants

Each changed a copy of `infra/bootstrap` at 2b6873b, and the committed `bootstrap.tftest.hcl` ran against it.

| Mutant | Change | Runs |
| --- | --- | --- |
| M1 | `main.tf:90` writes the subject out, with only `github_environment` left as a variable | 6 of 6 pass |
| M2 | the message at `variables.tf:26` becomes "The prefix must carry the owner and repository IDs." | 6 of 6 pass |
| M3 | the condition at `variables.tf:30` compares the owner only | 6 of 6 pass |
| M4 | the condition at `variables.tf:30` compares the name only | 6 of 6 pass |
| M5 | the condition at `variables.tf:25` asks for `@[0-9]+` anywhere | 6 of 6 pass |
| M6 | no second validation | `subject_prefix_of_another_repository` fails |
| M7 | no first validation | `subject_prefix_without_ids` fails |
| M8 | a second principal, `AWS = "arn:aws:iam::123456789012:root"`, beside the provider | `deploy_role_trust` fails |
| M9 | `StringLike` in place of `StringEquals` | `deploy_role_trust` fails |
| M10 | `github_repository` defaults to `kewincosta/other-repository` | `state_bucket`, the first run, fails on the second validation, and the rest are skipped |
