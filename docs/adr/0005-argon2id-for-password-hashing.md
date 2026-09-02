# 0005. Argon2id for password hashing

**Status**: Accepted
**Recorded**: 2026-09-02, from the state `docs/ddd/implementation-plan.md` section 1 describes

## Context

The system stores a password for every account, staff and customer alike, and verifies it on every
login. A stolen database must not hand the attacker usable passwords.

## Decision

Argon2id, through the `argon2` package, in `Argon2PasswordHasher`
(`src/modules/users/infrastructure/security/argon2-password-hasher.ts`). Hashing calls
`argon2.hash(plain, { type: argon2.argon2id })`; verification calls `argon2.verify`, which reads
the parameters from the stored hash rather than being told them.

The seed script uses the same algorithm and the same options, so the super administrator created
outside the API (ADR 0012) carries a hash indistinguishable from one the API would have produced.

## Alternatives

No alternative is recorded in this repository. The plan's section 1 states Argon2 as part of the
state the build inherited, not as a choice deliberated at the time. Argon2id is the default
recommended by OWASP for new applications, which is context rather than a project decision, and
bcrypt and scrypt were not written down as considered.

## Consequences

Hashing is deliberately slow, which is the point, and it is the dominant cost of a login request.

The package is native, so the container image builds it. `Dockerfile` and the CI-less local flow
both go through `npm install` with build tooling available.

Because `argon2.verify` reads its parameters from the stored hash, raising the cost parameters
later rehashes new passwords without invalidating existing ones.
