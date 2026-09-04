# 0001. Modular monolith in layers, with CQRS through `@nestjs/cqrs`

**Status**: Accepted
**Recorded**: 2026-09-02, from the state the domain model described at the outset

## Context

The workshop management system serves one workshop, with four business actors and five bounded
contexts that share a single database and a single deployment. The build began from a shape the
repository already had: a NestJS modular monolith with a four-layer structure per module
(`domain`, `application`, `infrastructure`, `presentation`), CQRS through `@nestjs/cqrs`, TypeORM
over PostgreSQL, and Vitest for tests.

The four layers are enforced rather than advisory. `eslint.config.mjs` forbids framework imports
inside `domain` and infrastructure imports inside `application`, so a layering violation fails
`npm run lint` rather than passing review.

## Decision

The system is one deployable NestJS application, divided into modules that each own a bounded
context or part of one. Every module carries the same four layers. Commands and queries travel
through `@nestjs/cqrs`, so a handler is addressed by its message rather than by a direct import,
which is what makes a module boundary crossable without coupling the caller to the callee's
internals. See ADR 0008 for the rule that governs those crossings.

## Alternatives

No alternative is recorded in this repository. The plan's section 1 states this structure as the
state the build inherited, not as a choice deliberated at the time. Distributed services and a
layerless single module are the obvious alternatives, and neither was written down as considered,
so neither is claimed here as rejected.

## Consequences

A module boundary costs a bus dispatch instead of a method call, and a write that spans two
modules needs an explicit shared transaction rather than getting one for free. ADR 0023 is the
rule that makes such a write behave.

The layering is checkable: `npm run lint` fails on a `domain` file importing NestJS, so the
structure cannot erode quietly.

One deployment means one scaling unit and one failure domain. At one workshop's traffic that is
the honest trade, and nothing in the system currently argues otherwise.
