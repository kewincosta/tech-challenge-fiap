# 0031. Four patterns kept beyond the dependency rule, each with its own justification

**Status**: Accepted
**Source**: AD-016 in `.specs/STATE.md`
**Recorded**: 2026-10-28, from AD-016, taken during the `clean-architecture` feature

## Context

The study that ADR 0026 cites treats CQRS, a bus, one class per use case, a dependency injection
container and full DDD as choices that each need their own justification, and it never counts them
as purity criteria. ADR 0026 removes the bus. Four other patterns stay: the split between command
and query use cases, one class per use case, Nest's dependency injection confined to the composition
roots, and domain events. This record gives the justification of each.

## Decision

The split between command and query use cases stays. A command use case changes state: it loads the
aggregate through its repository, calls its behavior and saves it, so every rule stays in the
aggregate. A query use case reads through a query port that returns DTOs and loads no aggregate,
because a read carries no rule. The `commands/` and `queries/` folders and the `<Name>Command` and
`<Name>Query` input classes stay and keep the split visible in the file tree, and no bus carries
them.

Each operation stays one class. A use case is `<Name>UseCase` in `<name>.use-case.ts`, with one
`execute` method. Its constructor lists exactly the ports the operation uses, its spec sits beside
it as `<name>.use-case.spec.ts`, and its composition root wires one provider for it. The code
already has one class per operation, so the rewrite changes names and wiring.

Nest's dependency injection stays in the composition roots. `<module>.module.ts` and
`<module>.tokens.ts` build the use cases, and controllers receive them by constructor injection.
`domain` and `application` never see the container. A use case spec builds the class with in-memory
fakes and no Nest testing module, and the seed script resolves the same use cases from the
composition root.

Domain events stay, published through a port. A use case hands the events of its aggregate to the
`DomainEventPublisher` port in `shared/application`. An in-memory dispatcher in
`shared/infrastructure` delivers them to subscribers registered in the composition roots. The
dispatcher starts every subscriber at once and does not wait for it, and it logs a subscriber's
error at error level with the subscriber's name without letting it reach the caller. The code that
emits a fact and the code that reacts to it change independently. Cache invalidation already reacts
to role changes, and the Phase 2 status e-mails will react to work order changes, with no use case
knowing who listens.

## Alternatives

One port for reads and writes in each module was rejected. A listing would then load aggregates or
return the shape of the persistence model.

A service class that groups several operations was rejected. Its constructor would list the union of
their dependencies, and a spec would build collaborators that the operation under test never uses.

Use cases that resolve their collaborators from Nest's container were rejected, because that ties
them to the framework, which the dependency rule forbids.

Calling each reaction directly from the use case that emits the event was rejected. The use case
would know every reaction and change whenever one is added.

## Consequences

Four conventions have to be kept and explained: where reads go, the name and shape of a use case,
where Nest's container may appear, and how events travel.

The dispatcher gives no delivery guarantee. A subscriber that fails loses its event, and the caller
never learns of it. The effective access cache expires after 60 seconds, which bounds the effect of
a lost invalidation. The audit trail does not travel by events: the repository writes it inside the
aggregate's transaction (ADR 0021).
