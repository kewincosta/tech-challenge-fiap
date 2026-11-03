# 0026. Use cases are plain classes that the controllers call directly

**Status**: Accepted
**Source**: AD-011 in `.specs/STATE.md`
**Recorded**: 2026-10-28, from AD-011, taken during the `clean-architecture` feature

## Context

The project measures its architecture against the Clean Architecture study it adopted on 2026-10-27,
summarized in `.specs/archive/clean-architecture/context.md`. The study's first premise is the
dependency rule: source dependencies point inward, and business rules know nothing of the framework,
the database or the delivery mechanism. The domain layer meets that rule. The application layer does
not.

76 handlers carry `@CommandHandler` or `@QueryHandler` and `@Inject`. Five application services
carry `@Injectable`, and two event subscribers carry `@EventsHandler`. Four authentication handlers
read `@nestjs/config`, and one subscriber logs through Nest's `Logger`. Injection tokens sit in
`domain` and `application`. A handler that calls another module receives the bus and resolves its
collaborator through a global registry, so its constructor does not show what it depends on.

ADR 0001 chose `@nestjs/cqrs` for commands and queries, and ADR 0008 made the two buses the way
modules reach each other.

## Decision

A use case is a plain class. It imports no framework package, carries no decorator and declares no
injection token. It receives its collaborators through its constructor and has one method,
`execute(input)`, where the input is the existing `<Name>Command` or `<Name>Query` class.

Controllers call the use case class directly. Each module's composition root, `<module>.module.ts`,
builds every use case with a factory provider keyed by the class and hands each dependency to the
constructor. Injection tokens live in `<module>.tokens.ts` beside the composition root. Repository
contracts live in `application/ports`, because use cases consume them and no entity does.

`@nestjs/cqrs` leaves the project: the dependency, `CqrsModule` and both buses. Authentication use
cases receive their token lifetimes as a plain settings object that the composition root builds from
the environment configuration. The refresh token reuse warning moves to a subscriber in
`infrastructure` and keeps its `AuthenticationSecurity` context and its message.

## Alternatives

Keeping `@nestjs/cqrs` was rejected. Its handlers carry framework decorators, and with a bus the use
case resolves its collaborators through a global registry, which the study says to avoid.

An interface for each use case and a generic handler interface were rejected. The study creates no
interface by default, and each use case has one implementation.

A `Logger` port for the reuse warning was rejected. The subscriber writes one log line, so it lives
in `infrastructure`, where Nest's `Logger` is allowed.

## Consequences

Every use case is wired by hand in its composition root. The 76 handlers, their specs and the seed
script are rewritten, and each handler class is renamed `<Name>UseCase` in a commit of its own per
module.

A use case spec builds the class with fakes at its ports and runs without a Nest testing module. The
seed script resolves the same use cases that the controllers call, so a second entry point reuses
the business rules without copying them.

`npm run lint` will fail on a framework or infrastructure import under `domain` or `application`,
specs included, and on a decorator or a `Symbol()` token declared there.

ADR 0001 stays in force for the modular monolith and the four layers. This record replaces
`@nestjs/cqrs`, the mechanism ADR 0001 names, and ADR 0031 keeps the split between commands and
queries as a way to organize the code.
