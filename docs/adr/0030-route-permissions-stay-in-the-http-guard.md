# 0030. Route permissions stay in the guard, and each entry point checks its own caller

**Status**: Accepted
**Source**: AD-015 in `.specs/STATE.md`
**Recorded**: 2026-10-28, from AD-015, taken during the `clean-architecture` feature

## Context

Two kinds of authorization rule exist. A route permission, declared with `@RequirePermissions`, is
checked by `PermissionsGuard` against the effective access of the caller before the controller runs.
A rule that depends on the data is checked inside a use case: deciding a budget needs the owning
customer or a holder of `work-orders:decide`, completing a work order needs the assigned mechanic or
a holder of `work-orders:manage`, and cancelling a work order that has withdrawn parts needs
`work-orders:cancel-in-execution`.

The guard cannot express the second kind. It requires every permission it is given, and some of
these rules depend on the state of the work order.

## Decision

Route permissions stay in the HTTP guard. `@RequirePermissions` keeps declaring them on the
controller, and `PermissionsGuard` keeps checking them before the controller runs. Rules that depend
on the data stay in the use cases.

Each entry point authenticates and authorizes its own caller before it calls a use case. The HTTP
API checks a JWT and the permissions of the route. The seed script runs as a trusted process. The
budget approval webhook planned for Phase 2 will validate a signature.

## Alternatives

Moving the route permission checks into the use cases was rejected. A route permission depends on
who calls and through which channel: a JWT over HTTP, a trusted process for the seed, a signature
for a webhook. A use case that checked permissions would need one caller model that fits all three.
The rules that depend on the data are the same on every channel, so they belong to the use cases and
every entry point shares them.

## Consequences

A new entry point has to check its caller before it calls a use case. A use case does not check the
permission of a route, so an entry point that skips the check exposes every use case it calls.

The permission of each route stays readable on its controller. The e2e suite pins both kinds of
rule: the 403 answers of the routes, and the decision, completion and cancellation rules of the work
order use cases.
