# 0039. The database and Redis are reached by configuration, with no cloud SDK

**Status**: Accepted
**Source**: AD-023 in `.specs/STATE.md`
**Recorded**: 2026-11-03, from AD-023, taken on 2026-11-02 during the `phase-2-infrastructure` feature

## Context

The user asked on 2026-11-02 for "RDS através de abstração (respeitar clean arch)", and chose to read
it as configuration only. The persistence ports already hide the database from the domain and the
use cases ([ADR 0026](0026-use-cases-are-plain-classes.md)), so RDS is one more PostgreSQL, and the
application has no reason to know it is on AWS.

Two things stopped the application from reaching the managed services. RDS refuses a connection that
is not encrypted when the parameter `rds.force_ssl` is on, and an ElastiCache replication group with
encryption in transit takes TLS only. `DatabaseModule` and `RedisModule` opened plain connections.
The pods also need a database password and a JWT secret, and no secret value may sit in the
repository.

## Decision

The application gains three optional settings and no AWS code.

- `DATABASE_SSL` set to `true` connects to PostgreSQL over TLS and verifies the server's certificate.
  `DATABASE_SSL_CA` names the PEM file of authorities to verify against. With none named, the
  authorities that Node trusts decide. Unset or `false`, the connection is the plain one of before.
- `REDIS_TLS` set to `true` connects to Redis over TLS and verifies the certificate, with the
  authorities of Node. Unset or `false`, the connection is plain.

Local runs and the test suites leave all three unset, so they behave as they did. The application and
the data source of the compiled migrations and admin seed build their connection from the same
function, `postgresConnection` in `src/config/database.config.ts`, and the Redis client takes its
options from `redisClientOptions` in `src/config/redis.config.ts`.

The production image carries the certificate authorities of Amazon RDS at
`/app/certs/rds-global-bundle.pem`, which the prod values give to `DATABASE_SSL_CA`. The Dockerfile
downloads the bundle from `truststore.pki.rds.amazonaws.com` when the image is built, and the build
fails if the file holds fewer than two certificates.

Terraform ([ADR 0038](0038-infrastructure-on-aws-provisioned-by-terraform.md)) generates the secrets
and keeps them in Secrets Manager: the database user's password, 32 letters and digits, as
`workshop-prod/database-password`, and a JWT secret of 64 letters and digits as
`workshop-prod/jwt-secret`. The CD reads both during a run, masks them, and hands them to Helm,
which renders them into the Kubernetes `Secret` that the pods read
([ADR 0040](0040-the-application-runs-in-kubernetes-as-a-helm-chart.md)). No file of the repository
holds a secret value, and the chart refuses to render without them.

RDS requires TLS through `rds.force_ssl`, so the database refuses a plain connection even if a
setting is missing. The ElastiCache group has encryption in transit and at rest and no auth token,
because its security group admits only the cluster's nodes.

## Alternatives

A credentials port in the application, implemented with the AWS SDK, and RDS IAM authentication were
rejected, and the user chose configuration only. A port for credentials would pull a cloud SDK into
the application for what two settings do.

A password that RDS manages (`manage_master_user_password`) was rejected. RDS rotates it every seven
days, while the pods keep the one they read at deploy time and would lose the connection until the
next deploy.

TLS without verifying the server (`rejectUnauthorized: false`) was rejected. It encrypts the traffic
and accepts any certificate, so a party in the middle would pass.

## Consequences

The application knows nothing about AWS. Pointing it at another PostgreSQL or Redis changes settings
and nothing else.

The RDS bundle is a copy taken when the image is built. A bundle that AWS replaces reaches the pods
with the next build.

The database password and the JWT secret never rotate by themselves. A new value in Secrets Manager
reaches the pods at the next deploy, and the pods roll when the `Secret` changes.

The CD passes both secrets to Helm as arguments of one command, on a runner that runs that job alone,
and it masks them in the log.
