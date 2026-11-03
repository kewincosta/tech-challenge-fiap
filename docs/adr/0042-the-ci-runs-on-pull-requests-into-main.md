# 0042. The CI runs on pull requests into main and on pushes to main

**Status**: Accepted
**Amends**: [0041](0041-ci-and-cd-run-on-github-actions.md)
**Source**: AD-026 in `.specs/STATE.md`
**Recorded**: 2026-11-03, from AD-026, taken the same day during the `ci-triggers-and-test-collisions` feature

## Context

[ADR 0041](0041-ci-and-cd-run-on-github-actions.md) made `ci.yml` run on every push and every pull
request. A developer who pushed a development branch spent a run, and the pull request that branch
opened spent a second run on the same commit. The user said on 2026-11-03: "O CI deveria ser ao
abrir PR para main e não ao fazer push na branch de desenvolvimento."

The CD deploys nothing for a pull request. It starts when a CI run completes, and it deploys only a
run that was a push to `main` of this repository, passed, and tested the commit that is still the
tip of `main`. The push that a merge makes to `main` is the run that deploys.

## Decision

`ci.yml` runs on two events:

- a `pull_request` into `main`, when it opens, gets a new commit or reopens. These are the activity
  types GitHub uses when a workflow lists none;
- a `push` to `main`, which is what a merge makes.

A push to any other branch starts nothing, and neither does a pull request into any other branch.
The jobs `lint`, `unit` and `build`, their commands and the permissions of the token stay as ADR 0041
decided, and `cd.yml` does not change.

This replaces one sentence of ADR 0041, the one that says `ci.yml` runs on every push and every pull
request. The rest of that record stays in force.

## Alternatives

Pull requests only was rejected. The CD starts from the CI run of a push to `main`, so a merge would
run no CI and deploy nothing.

## Consequences

A commit pushed to a branch with no open pull request runs no CI. The `pre-push` hook still runs lint,
build and the unit tests on the developer's machine.

A pull request into `main` runs the CI once for each push to its branch. Under ADR 0041 each push
ran it twice, as a push and as a pull request.

A merge runs the CI again, on the commit that reaches `main`, and the CD deploys that run. The commit
that deploys is always one the CI tested on `main`.
