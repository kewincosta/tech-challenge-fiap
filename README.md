# Workshop Management API

Identity and access foundation for a workshop management system: customers, vehicles, the
service catalog, inventory, and a work order's full lifecycle from reception to delivery.

## Prerequisites

- Node.js >= 22 (see `engines` in `package.json`)
- Docker and Docker Compose

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`. `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `ADMIN_DOCUMENT` are read once, by
`npm run seed:admin` below; every other value already has a default that matches
`docker-compose.yml`.

## Infrastructure

```bash
docker compose up -d
```

Starts three services: `postgres` (host port `15432`), `redis` (host port `16379`), and the
`app` itself (host port `13000`). Postgres's init script also creates `workshop_test`, the
dedicated database the test suites run against - nothing further to set up for testing.

## Migrations

```bash
npm run migration:run
```

Other migration commands: `npm run migration:generate` and `npm run migration:revert`.

## Seed

```bash
npm run seed:admin
```

Creates the first `SUPER_ADMIN` user from `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_DOCUMENT` in
`.env`. Safe to run more than once; it does nothing if that email already exists.

## API documentation

Swagger UI is served at `http://localhost:13000/api/docs` once the `app` service is up. Every
route sits under the `/api/v1` prefix.

## Testing

| Command                    | Suite                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm run test:unit`        | Unit tests, co-located with the source they cover (`src/**/*.spec.ts`)                                               |
| `npm run test:integration` | Integration tests against the real `workshop_test` Postgres (`test/integration/`)                                    |
| `npm run test:e2e`         | End-to-end tests against a running app instance (`test/e2e/`)                                                        |
| `npm run test:coverage`    | Unit tests with coverage, enforcing the 80% floor on each critical path (`vitest.config.ts`'s `coverage.thresholds`) |

Integration and e2e tests read `.env.test` and run their own migrations on `workshop_test`
before the suite starts (`test/support/global-setup.ts`) - no manual step beyond
`docker compose up -d`. The test database is never truncated between runs, so every test
generates its own unique fixture data rather than relying on a clean slate.

```bash
npm run lint
npm run build
```

## Architecture

Four entry points, each owning one altitude and pointing at the next:

| Document                                                            | Answers                                                                                                                |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [Architecture overview](docs/architecture/architecture-overview.md) | What the system is, its four actors, its five bounded contexts, its three runtime pieces                               |
| [High level design](docs/architecture/high-level-design.md)         | The modules and what each owns, the layers, the bus rule, the guard chain, the transaction boundaries, the conventions |
| [Low level design](docs/architecture/low-level-design/README.md)    | One page per module: aggregates, value objects, handlers, columns, endpoints, errors                                   |
| [Decision records](docs/adr/README.md)                              | Why any of it was decided that way, one numbered record per decision                                                   |

`docs/ddd/` carries the domain model this API implements: `event-storming.md` (the events,
aggregates and invariants) and `implementation-plan.md` (the phased build plan these features
follow). Those two stay the source of truth for the domain; the four documents above describe what
was built from it.
