# Infrastructure

Terraform provisions the only environment in AWS, `prod`, in `us-east-1`. Development runs on the developer's machine, so nothing here has a `dev` counterpart.

```
infra/
├── bootstrap/            applied once by hand: state bucket, GitHub OIDC provider, deploy role
├── main.tf               the entry: providers, the partial S3 backend and every module call
├── variables.tf          every setting an environment gives
├── outputs.tf            what the CD and the operator read after an apply
├── modules/              network, cluster, database, cache, registry
├── environments/         prod.tfvars and prod.backend.hcl, one pair per environment
└── tests/                terraform test runs with mocked providers
```

An environment is one pair of files in `environments/`. Another environment is another pair: copy `prod.tfvars` and `prod.backend.hcl`, change the environment's name, the sizes and the backend key, and apply with them. The bootstrap role trusts the GitHub environment `prod` only, so a second environment's deploys need their own trust in `bootstrap/`.

## Running Terraform

Only Docker has to be installed. `scripts/tool.sh` runs the build tools of the repository, each at the version pinned at the top of the script: Terraform (1.17.1), kubeconform, k6 and actionlint as containers, and kind, kubectl and Helm as binaries it downloads and checks against their published checksum. Terraform runs as your user, with the repository mounted at its own path. Run it from the repository root:

```bash
scripts/tool.sh terraform -chdir=infra <command>
```

The script passes `AWS_PROFILE`, `AWS_REGION`, `AWS_DEFAULT_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` and every `TF_VAR_*` variable to the container, and mounts `~/.aws` read-only. For an SSO profile, run `aws sso login` on the host first. Providers and a plugin cache live under `.tools/`, which git ignores.

The AWS provider is 6.71.0 and the random provider 3.9.1. Each `.terraform.lock.hcl` is committed and holds the hashes for Linux and macOS on amd64 and arm64.

## The modules

| Module     | What it creates                                                                                                                                                                                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `network`  | A VPC through `terraform-aws-modules/vpc/aws` 6.7.3: a public and a private subnet in each of two zones and one NAT gateway. The subnets carry the tags Kubernetes reads to place a load balancer.                                                                |
| `cluster`  | An EKS cluster through `terraform-aws-modules/eks/aws` 21.29.0: a public endpoint, one managed node group, the `vpc-cni`, `kube-proxy`, `coredns` and `metrics-server` add-ons, and an access entry for the deploy role and for each ARN in `cluster_admin_arns`. |
| `database` | RDS PostgreSQL in a subnet group of the private subnets, with a parameter group that sets `rds.force_ssl` to 1, encrypted storage and a password that `random_password` generates.                                                                                |
| `cache`    | ElastiCache Redis, one replication group in a subnet group of the private subnets, with encryption in transit and at rest and no auth token.                                                                                                                      |
| `registry` | One ECR repository that scans each image on push and keeps the newest N images.                                                                                                                                                                                   |

`main.tf` also holds what joins the modules. The database's security group admits only the cluster's node security group on 5432, and the cache's does the same on 6379. Two Secrets Manager secrets, `<project>-<environment>/database-password` and `<project>-<environment>/jwt-secret`, hold the generated database password and a generated JWT secret of 64 characters, and have no recovery window, so a destroy followed by an apply can reuse the names.

Kubernetes is 1.37, the newest version in EKS standard support when this was written (standard support ends on 1 December 2027). metrics-server is the EKS community add-on of that name. The add-on versions resolve to the newest one EKS lists for the cluster version. Before the first apply, confirm that EKS lists the add-on for 1.37:

```bash
aws eks describe-addon-versions --addon-name metrics-server --kubernetes-version 1.37
```

The cluster has no cluster autoscaler: the two nodes hold the pods that the HorizontalPodAutoscaler adds.

## The variables of `prod.tfvars`

A setting keeps one name from `prod.tfvars` through `main.tf` to the module that uses it, and nothing in `main.tf` or in `modules/` repeats a name or a size from the file.

| Variable                       | Value              | Meaning                                                                 |
| ------------------------------ | ------------------ | ----------------------------------------------------------------------- |
| `project`, `environment`       | workshop, prod     | Every resource is named `<project>-<environment>`                       |
| `region`                       | us-east-1          | The AWS region                                                          |
| `deploy_role_name`             | workshop-deploy    | The role the bootstrap creates, which gets cluster administration       |
| `vpc_cidr`                     | 10.0.0.0/16        | The address range of the VPC                                            |
| `availability_zone_count`      | 2                  | Zones that get a public and a private subnet                            |
| `single_nat_gateway`           | true               | One NAT gateway for the VPC. False gives one per zone                   |
| `kubernetes_version`           | 1.37               | The control plane version                                               |
| `node_instance_type`           | t3.medium          | The nodes' instance type                                                |
| `node_count`                   | 2                  | Nodes in the managed node group                                         |
| `cluster_log_retention_days`   | 7                  | Days the control plane logs stay in CloudWatch                          |
| `database_name`                | workshop           | The database the application connects to                                |
| `database_user`                | workshop           | The master user. Its password is generated                              |
| `database_engine_version`      | 16.15              | PostgreSQL 16, the newest minor RDS lists                               |
| `database_instance_class`      | db.t4g.micro       | The instance class                                                      |
| `database_allocated_storage`   | 20                 | Storage in GiB                                                          |
| `database_multi_az`            | false              | One zone, no standby                                                    |
| `database_skip_final_snapshot` | true               | Destroying the database takes no snapshot                               |
| `database_deletion_protection` | false              | Nothing stops a destroy                                                 |
| `cache_engine_version`         | 7.1                | Redis 7                                                                 |
| `cache_node_type`              | cache.t4g.micro    | The cache's node type                                                   |
| `cache_node_count`             | 1                  | Nodes in the replication group                                          |
| `registry_image_count`         | 20                 | Images the repository keeps                                             |
| `cluster_admin_arns`           | `[]` (the default) | IAM users and roles that administer the cluster besides the deploy role |

Both the cluster's name and the database's identifier are `workshop-prod`.

## Bootstrap

The bootstrap creates what the main stack needs before it can run:

- the S3 bucket `workshop-tfstate-kewincosta`, with versioning, server-side encryption and all four public access blocks on;
- the GitHub OIDC provider for `https://token.actions.githubusercontent.com`, with the client id `sts.amazonaws.com`;
- the role `workshop-deploy`, which only a job of `kewincosta/tech-challenge-fiap` running in the GitHub environment `prod` can assume: the audience is `sts.amazonaws.com` and the subject is exactly `repo:kewincosta/tech-challenge-fiap:environment:prod`.

You run it once, with your own AWS credentials:

```bash
scripts/tool.sh terraform -chdir=infra/bootstrap init
scripts/tool.sh terraform -chdir=infra/bootstrap apply
```

Its state stays on your machine, in `infra/bootstrap/terraform.tfstate` (git ignores it). The bucket that would hold it does not exist before the first apply. Keep that file: it is the only record of what the bootstrap created, and losing it leaves you to import the resources one by one. Back it up with your other private files.

An S3 bucket name is unique across all AWS accounts. If `workshop-tfstate-kewincosta` is taken, change `state_bucket_name` in `bootstrap/variables.tf` and `bucket` in `environments/prod.backend.hcl` to the same new name before the apply.

The role carries the AWS managed `AdministratorAccess` policy. The main stack creates and destroys IAM roles, a VPC, EKS, RDS, ElastiCache, ECR, Secrets Manager secrets, KMS keys and CloudWatch log groups, and a policy that lists every action of those services would run to hundreds of lines. The trust policy is the limit: no other repository, branch, pull request or environment can use the role.

## What the CD needs in GitHub

Set these in the repository's Settings, under Environments, in an environment named `prod`:

1. Under "Deployment branches and tags", choose "Selected branches and tags" and add `main`, so no other branch can run a job in the environment.
2. A secret `DEPLOY_ROLE_ARN`, under "Environment secrets", with the `deploy_role_arn` output of the bootstrap (`scripts/tool.sh terraform -chdir=infra/bootstrap output deploy_role_arn`).
3. A variable `CLUSTER_ADMIN_ARNS`, under "Environment variables", with a JSON list of the IAM users and roles that may administer the cluster besides the deploy role, such as `["arn:aws:iam::<account-id>:user/<name>"]`. The CD passes it as `TF_VAR_cluster_admin_arns`, and an unset variable means the empty list, so only the deploy role administers the cluster. A role's ARN carries no path, so write an SSO role as `arn:aws:iam::<account-id>:role/AWSReservedSSO_<permission-set>_<hash>`.

The CD starts from the copy of `.github/workflows/cd.yml` on `main`, so it runs for the first time after the merge that adds it. Its jobs assume the deploy role through GitHub OIDC, and the workflows hold no AWS access key. The deploy role is the only way in, and the account id never appears in the repository. GitHub prints the inputs of a step at the top of its log, and anyone can read that log in a public repository. The ARN of the role holds the account id, so it is a secret: GitHub prints `***` where the credentials step reads it, and the step masks the id in everything after it.

The role's session lasts the default hour, because `bootstrap/main.tf` sets no `max_session_duration`. Each job of the CD assumes the role on its own and ends before the hour is over: the first apply takes about 20 minutes, and the jobs that apply and deploy stop at 55.

## Apply and destroy

The CD applies `prod` on every merge to `main` that passes the CI. To apply by hand with the same files, run from the repository root:

```bash
scripts/tool.sh terraform -chdir=infra init -backend-config=environments/prod.backend.hcl
scripts/tool.sh terraform -chdir=infra apply -var-file=environments/prod.tfvars \
  -var 'cluster_admin_arns=["arn:aws:iam::<account-id>:user/<name>"]'
```

The state lock is an object next to the state file (`use_lockfile = true`), so the backend needs no DynamoDB table. The apply takes about 20 minutes. Then point `kubectl` at the cluster:

```bash
aws eks update-kubeconfig --name workshop-prod --region us-east-1
```

To remove `prod`:

```bash
scripts/tool.sh terraform -chdir=infra destroy -var-file=environments/prod.tfvars
```

**Destroying `prod` erases its database for good.** The database has no final snapshot and no deletion protection, so the destroy deletes the PostgreSQL instance and everything in it in one run. It also removes the ECR repository with its images, and the secrets at once. Delete the Kubernetes Service of type LoadBalancer first (`helm uninstall workshop -n workshop`), or the load balancer it created keeps the VPC from being deleted.

## Cost

`prod` costs about US$ 0.31 an hour at the on-demand prices of `us-east-1` (about US$ 225 a month), whether or not anyone uses it:

| Part                                          | Per hour (US$) |
| --------------------------------------------- | -------------- |
| EKS control plane                             | 0.100          |
| Two `t3.medium` nodes                         | 0.083          |
| NAT gateway                                   | 0.045          |
| RDS `db.t4g.micro` and 20 GiB of storage      | 0.019          |
| ElastiCache `cache.t4g.micro`                 | 0.016          |
| Network load balancer and public IPv4 address | about 0.05     |

Data transfer and CloudWatch logs come on top. Destroy `prod` when the demonstration is over.

## Checks without AWS

Nothing below needs credentials or reaches AWS:

```bash
scripts/tool.sh terraform fmt -check -recursive infra
scripts/tool.sh terraform -chdir=infra init -backend=false -input=false
scripts/tool.sh terraform -chdir=infra validate
scripts/tool.sh terraform -chdir=infra test -var-file=environments/prod.tfvars
scripts/tool.sh terraform -chdir=infra/bootstrap init -backend=false -input=false
scripts/tool.sh terraform -chdir=infra/bootstrap test
scripts/tool.sh actionlint
```

The last one lints the workflows in `.github/workflows`, the scripts of their steps included.

`terraform test` plans each run with mocked providers. A run against the root configuration reaches the root's resources and the outputs of the modules. A run with a `module` block tests one module on its own: it takes the subnets and the security groups the way `main.tf` gives them, and every other variable from `prod.tfvars` through `-var-file`, because the module's variables carry the names the file sets. `test/infra/static/terraform.spec.ts` reads the files for what a plan cannot show: no environment literal in `main.tf` or `modules/`, the state in the bootstrap bucket, exact versions for the community modules, and the wiring from `main.tf` to the modules.
