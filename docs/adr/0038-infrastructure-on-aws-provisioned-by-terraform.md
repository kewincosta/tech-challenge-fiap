# 0038. Infrastructure on AWS in us-east-1, provisioned by Terraform

**Status**: Amended by [0043](0043-the-deploy-role-trusts-the-immutable-oidc-subject.md)
**Source**: AD-022 in `.specs/STATE.md`
**Recorded**: 2026-11-03, from AD-022, taken on 2026-11-02 during the `phase-2-infrastructure` feature

## Context

The Phase 2 brief asks for Terraform scripts that provision a Kubernetes cluster and a database, and
for documentation of the resources they create and how to apply them. Until then the system ran only
through `docker-compose.yml` on one machine: one replica, a local PostgreSQL and Redis, no cluster,
no registry and no managed database.

The user chose on 2026-11-02: EKS and RDS, variables kept per environment with the configuration
gathered in one main file, ECR for the images, GitHub OIDC with an IAM role, the region `us-east-1`
and the economical sizes. The user then corrected the environments: "Na verdade, quando falei dev
deveria ser local. Unico ambiente deployavel deve ser o de prod", with development running on the
machine against local containers, and "O cd precisa rodar com merge na main e não disparo manual".

## Decision

The infrastructure runs on AWS in `us-east-1`, and Terraform provisions it in two stacks.

`infra/bootstrap` is applied once, by hand, with the user's own credentials. Its state stays on the
user's machine, because the bucket that would hold it is one of the things it creates. It makes the
S3 bucket `workshop-tfstate-kewincosta`, with versioning, server-side encryption and all four public
access blocks on, the GitHub OIDC provider, and the role `workshop-deploy`. Only a job of
`kewincosta/tech-challenge-fiap` that runs in the GitHub environment `prod` can assume the role: the
audience is `sts.amazonaws.com` and the subject is `repo:kewincosta/tech-challenge-fiap:environment:prod`.
The role carries the AWS managed `AdministratorAccess` policy. The main stack creates IAM roles, a
VPC, EKS, RDS, ElastiCache, ECR, Secrets Manager secrets, KMS keys and log groups, and a policy that
lists every action of those services would run to hundreds of lines. The trust policy is the limit.

`infra/main.tf` is the one entry of the main stack. It declares the providers and the S3 backend,
whose bucket, key and region come from the environment's backend file, and it calls five modules of
`infra/modules`: `network`, `cluster`, `database`, `cache` and `registry`. `network` and `cluster`
call `terraform-aws-modules/vpc/aws` 6.7.3 and `terraform-aws-modules/eks/aws` 21.29.0, each pinned
to one exact version. An environment is a pair of files in `infra/environments`. `<env>.tfvars` holds
every name and size, and `<env>.backend.hcl` says where the state lives, with `use_lockfile`, so the
lock is an object in the bucket and no DynamoDB table exists. Neither `main.tf` nor a module repeats
a name or a size from the file, and a spec reads the code for it.

`prod` is the only environment in AWS, applied by the CD on every merge to `main` that passes the CI
([ADR 0041](0041-ci-and-cd-run-on-github-actions.md)). It holds:

- a VPC with a public and a private subnet in each of two zones and one NAT gateway;
- an EKS cluster on Kubernetes 1.37, the newest version in standard support, with one managed node
  group of two `t3.medium` nodes and the `metrics-server` add-on;
- RDS PostgreSQL 16 on `db.t4g.micro`, in one zone, in the private subnets;
- ElastiCache Redis 7 on `cache.t4g.micro`, in the private subnets, with encryption in transit;
- Secrets Manager secrets for the generated database password and JWT secret
  ([ADR 0039](0039-database-and-redis-reached-by-configuration.md));
- one ECR repository that scans each image on push and keeps the last 20.

The database and the cache accept connections only from the security group of the cluster's nodes.
The cluster gives administrator access to the deploy role and to the IAM principals that the variable
`cluster_admin_arns` lists, and to no one else. The CD fills that variable from a variable of the
GitHub `prod` environment, so the identifiers of the account stay out of the repository.

`dev` is the developer's machine. `docker compose` runs PostgreSQL, Redis and Mailpit, `.env` points
the application at them, and a kind cluster runs the same chart against those containers
([ADR 0040](0040-the-application-runs-in-kubernetes-as-a-helm-chart.md)). Nothing of `dev` runs in
AWS.

`terraform destroy` removes `prod` in one run. The database takes no final snapshot and has no
deletion protection, the secrets have no recovery window, and the repository goes with its images.

## Alternatives

Terraform workspaces were rejected. They keep the environment in the state of the CLI, so one command
applies different things depending on what was selected. With a pair of files, every command names
its environment.

Terragrunt was rejected as one more tool for a stack with one environment.

Access keys stored in GitHub were ruled out by the user. OIDC gives each job a short-lived credential
that only this repository and its `prod` environment can obtain.

A `dev` environment in AWS was ruled out by the user, who develops on the machine.

A bastion host to reach the database was rejected, because it is one more machine to pay for and to
patch. The way in is a pod of the cluster, which costs nothing more.

Hand-written VPC and EKS resources were rejected. The community modules already keep the hundreds of
lines of subnets, routes and IAM that they need.

## Consequences

`prod` costs about US$ 0.31 an hour at the on-demand prices of `us-east-1`, about US$ 225 a month,
whether or not anyone uses it. `infra/README.md` has the table. Destroy it when the demonstration is
over.

The first apply takes about 20 minutes. The credentials of a CD job last the default hour.

Destroying `prod` erases its database for good. The Service of type LoadBalancer has to go first
(`helm uninstall workshop -n workshop`), because the load balancer it created keeps the VPC from being
deleted.

The state of the bootstrap lives on one machine. Losing the file leaves the resources to be imported
one by one.

Another environment is another pair of files, and its deploys need their own trust in `bootstrap`,
which admits the environment `prod` only.

The cluster has a public API endpoint, which the GitHub runner and the user's `kubectl` reach over the
internet. It has no cluster autoscaler: the two nodes hold the six replicas that the
HorizontalPodAutoscaler allows.

Whoever can run a job in the `prod` environment acts with administrator permissions in the account.
The environment admits `main` only, so that means whoever can merge to it.
