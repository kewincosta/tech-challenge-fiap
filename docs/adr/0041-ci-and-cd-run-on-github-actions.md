# 0041. CI and CD run on GitHub Actions

**Status**: Accepted
**Source**: AD-025 in `.specs/STATE.md`
**Recorded**: 2026-11-03, from AD-025, taken on 2026-11-02 during the `phase-2-infrastructure` feature

## Context

The Phase 2 brief asks for a pipeline that builds the application, runs the automated tests, builds
the Docker image, deploys to the Kubernetes cluster, deploys the database and applies the manifests.
Until then every check ran by hand, and a release was whatever someone built locally.

The user chose on 2026-11-02: GitHub Actions, "Vamos executar somente os unitários no ci por
enquanto", provisioning with Terraform inside the CD, credentials through OIDC and no access key, and
"O cd precisa rodar com merge na main e não disparo manual".

## Decision

Two workflows live in `.github/workflows`.

`ci.yml` runs on every push and every pull request. Its jobs `lint`, `unit` and `build` run
`npm run lint`, `npm run test:unit` and `npm run build` side by side on Node 24, the version of the
production image, and none waits for another, so one failure does not hide the others. The token
reads the repository and nothing more. The integration and e2e suites need PostgreSQL and Redis and
run on the developer's machine for now.

`cd.yml` starts when the CI run completes, and it has four jobs in a chain: `tip`, `terraform`,
`image` and `deploy`.

- `tip` runs only when the CI run was a push to `main` of this repository and succeeded. A pull
  request's run is a `pull_request` event whatever its branch is called, so a pull request from a
  fork whose branch is named `main` deploys nothing. The job then compares the commit that the CI
  tested with the tip of `main`, through the GitHub API. Two merges can finish their CI out of order,
  and the older commit would then deploy after the newer one. The older commit sees that it is no
  longer the tip and stops, and the newer one deploys through its own run.
- `terraform` applies `prod` with `infra/environments/prod.backend.hcl` and
  `infra/environments/prod.tfvars`. The variable `cluster_admin_arns` comes from the
  `CLUSTER_ADMIN_ARNS` variable of the GitHub environment, and is an empty list when that is unset.
- `image` builds the `Dockerfile` and pushes it to the ECR repository that Terraform made, tagged with
  the commit's SHA.
- `deploy` reads the Terraform outputs and both secrets. It upgrades the chart with
  `helm upgrade --install`, the prod values, that tag and `--wait --timeout 15m`, and then reads the
  hostname of the load balancer. When `APP_PUBLIC_URL` differs from it, the job upgrades the release
  again. [ADR 0040](0040-the-application-runs-in-kubernetes-as-a-helm-chart.md) describes the chart.

Every job of the CD that checks out code takes `github.event.workflow_run.head_sha`, and the image
carries it as its tag. In a `workflow_run` run, `github.sha` is the tip of `main` when the CD starts,
which can be a later commit than the one the CI tested.

The three jobs that call AWS run in the GitHub environment `prod`, which admits only `main`, with
`id-token: write`. Each assumes `workshop-deploy`, the role of the bootstrap
([ADR 0038](0038-infrastructure-on-aws-provisioned-by-terraform.md)), through
`aws-actions/configure-aws-credentials`, with the role's ARN taken from the environment variable
`AWS_DEPLOY_ROLE_ARN`. No job holds an access key, and the credentials step masks the account id. A
job reads the Terraform outputs that it needs from the state, with `terraform output`, and receives
none from the job before it. GitHub drops a job output that holds a masked value, and the repository
URL holds the account id.

The CD reads the database password and the JWT secret from Secrets Manager during the run and
masks both with `::add-mask::` before anything else can print them. It hands them to Helm with
`--set-string`, so they touch no file. It passes all eleven values on each upgrade and never
`--reuse-values`.

One deploy runs at a time. The workflow's concurrency group is `deploy-prod`, with
`cancel-in-progress: false`: a second run waits for the first, a third replaces the second while it
waits, and a running deploy is never cancelled, because stopping an apply leaves the state locked. A
run that deploys nothing, such as the CD of a failed CI run, takes a group of its own, so it cannot
replace a deploy that waits.

Terraform, Helm and kubectl run through `scripts/tool.sh`, so the CD uses the versions pinned in one
place and the developer runs the same ones. `scripts/tool.sh actionlint` checks both workflows. Each
action is pinned to a full commit SHA with its release in a comment: `actions/checkout` v7.0.1,
`actions/setup-node` v7.1.0 and `aws-actions/configure-aws-credentials` v6.3.0.

## Alternatives

One workflow for both was rejected. It would tie the permissions of the deploy to every pull request.

A manual run was ruled out by the user, and so were access keys in GitHub.

The integration and e2e suites in the CI were left out for now by the user.

`cancel-in-progress: true` was rejected. It would stop an apply that is running and leave the state
locked.

`github.sha` as the commit to deploy was rejected, because it names the tip of `main` when the CD
starts and not the commit the CI tested.

Setup actions for Terraform, Helm and kubectl were rejected. Their versions would repeat the ones
pinned in `scripts/tool.sh`.

Passing the Terraform outputs between jobs was rejected. GitHub drops a job output that holds the
account id, and any signed-in GitHub user can download the artifact of a public repository.

## Consequences

The CD starts from the copy of `cd.yml` on `main`, so the first deploy happens on the first merge to
`main` after the setup in `infra/README.md`. The first apply takes about 20 minutes, and the build and
the install add several more.

A commit that fails its CI deploys nothing. When a newer commit fails its CI and an older one passed,
the older one does not deploy either, because it is no longer the tip. `prod` stays where it was until
the next green merge.

A re-run of only the failed jobs of a CD run keeps the answer of the first `tip` job. After a newer
merge, re-run all the jobs, so the check runs again.

The credentials of a job last an hour, so the jobs that apply and deploy stop at 55 minutes.

The CI does not gate the deploy on the integration and e2e suites. A change that only they would catch
reaches `prod`.

The specs in `test/infra/static` read the workflows and run the scripts of their steps against
stand-ins for AWS, GitHub and the cluster.
