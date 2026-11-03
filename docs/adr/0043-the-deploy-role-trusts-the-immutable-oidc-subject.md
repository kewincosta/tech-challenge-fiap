# 0043. The deploy role trusts the immutable OIDC subject of the repository

**Status**: Accepted
**Amends**: [0038](0038-infrastructure-on-aws-provisioned-by-terraform.md)
**Source**: AD-027 in `.specs/STATE.md`
**Recorded**: 2026-11-03, from AD-027, taken the same day while fixing the first deploy

## Context

[ADR 0038](0038-infrastructure-on-aws-provisioned-by-terraform.md) made the role `workshop-deploy`
trust the subject `repo:kewincosta/tech-challenge-fiap:environment:prod`, the form that names the
owner and the repository. AWS compares the subject exactly.

The first deploy failed at the credentials step of the `terraform` job with "Could not assume role
with OIDC: Not authorized to perform sts:AssumeRoleWithWebIdentity". GitHub has opted the repository
into the immutable subject. `gh api repos/kewincosta/tech-challenge-fiap/actions/oidc/customization/sub`
answers `use_immutable_subject: true` and a `sub_claim_prefix` of
`repo:kewincosta@72565745/tech-challenge-fiap@1357566072`, so a job of the `prod` environment carries
`repo:kewincosta@72565745/tech-challenge-fiap@1357566072:environment:prod`. The role trusted the
name-based form, which no token carries any more.

The user said on 2026-11-03: "Vamos fazer o ajuste do projeto".

## Decision

The role trusts the immutable subject, `repo:kewincosta@72565745/tech-challenge-fiap@1357566072:environment:prod`.
The audience stays `sts.amazonaws.com`, and the match stays exact.

`infra/bootstrap` builds the subject from a new variable, `github_subject_prefix`, followed by
`:environment:` and `github_environment`. The variable defaults to the `sub_claim_prefix` above. Two
validations guard it:

- a prefix without the owner and repository IDs, in the form `repo:<owner>@<digits>/<name>@<digits>`,
  is refused, and the message names `sub_claim_prefix`;
- a prefix whose owner and name differ from `github_repository` is refused.

`github_repository` stays, for the role's description and for that second validation. The guide in
`infra/README.md` says where the prefix comes from and how to apply the bootstrap again.

This replaces the subject that ADR 0038 names. The rest of that record stays in force: the role, its
policy, the audience and the environment do not change, and neither do the role's name and ARN, so
the secret `DEPLOY_ROLE_ARN` of the `prod` environment stays valid.

## Alternatives

Turning the immutable subject off for the repository was rejected. GitHub documents the immutable
subject as an opt-in, and it is the safer form: the IDs survive a rename of the owner or the
repository, and a repository recreated under the same name has other IDs, so it cannot assume the
role.

A `StringLike` condition with wildcards, such as `repo:kewincosta*/tech-challenge-fiap*:environment:prod`,
was rejected. It trusts more subjects than the one repository, and the exact match is what ADR 0038
chose.

## Consequences

The bootstrap has to be applied again. Its plan updates the trust policy of `workshop-deploy` in
place, and creates and destroys nothing. The CD can be re-run after that.

A change of the owner or the repository name needs a new prefix in `github_subject_prefix`. The
validation against `github_repository` catches a prefix left behind, and one without IDs cannot be
applied.
