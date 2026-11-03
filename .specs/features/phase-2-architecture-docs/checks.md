# Phase 2 architecture docs checks

Build: `npm run build`; `npm run lint`
Run infra: `npx vitest run --config vitest.infra.config.ts --reporter=verbose test/infra/static`

## Intent

`docs/architecture/high-level-design.md` describes six modules under `src/modules` and a shared kernel, and says every route is `/api/v1/...`. Phase 2 added `src/health`, whose two probes `GET /health/live` and `GET /health/ready` sit outside the `api` prefix and the version and need no token and no rate limit, `src/config`, where the TLS settings live, and the compiled entry points `src/migrate.ts` and `src/seed-admin.ts`. The design names none of them, and the low level design has no page for the health module. The Phase 2 video has no script: `docs/roteiro-video.md`, which `.gitignore` keeps out of the repository as personal presentation notes, is the Phase 1 one.

When this ships, the high level design names the units Phase 2 added and places the probes outside the API prefix, the low level design has a page for the health module that its index links, and a Phase 2 video script sits beside the Phase 1 one, out of the repository as well. The user approved on 2026-11-03: "Sim, pode seguir".

4 checks in 2 slices · 0 one-way doors · 0 open, of which 0 block

## Checks

### S1 - The architecture documents describe what Phase 2 added

**C1** - "The code units" of the high level design names `src/health`, `src/config`, `src/migrate.ts` and `src/seed-admin.ts`, each with what it holds, and every path it names exists
Proof: run infra | ✓ Architecture documents > names the units Phase 2 added in the high level design

**C2** - "The HTTP surface" of the high level design says that `GET /health/live` and `GET /health/ready` sit outside the `api` prefix and the version, need no token and are not rate limited, and that every other route is `/api/v1/...`
Proof: run infra | ✓ Architecture documents > places the probes outside the API prefix in the high level design

**C3** - `docs/architecture/low-level-design/health.md` exists and the index of the low level design links it; it names the routes `HealthController` declares, and no other, with their bodies, 200 for both and 503 for `/health/ready` when a check fails, and the 2 seconds after which a check gives up; every path it names exists
Proof: run infra | ✓ Architecture documents > gives the health module a low level page the index links

### S2 - The Phase 2 video script stays out of the repository

**C4** - `.gitignore` keeps both `docs/roteiro-video.md` and `docs/roteiro-video-fase-2.md` out of the repository
Proof: `git check-ignore -q docs/roteiro-video.md && git check-ignore -q docs/roteiro-video-fase-2.md`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| units Phase 2 added (4) | `src/health` C1 · `src/config` C1 · `src/migrate.ts` C1 · `src/seed-admin.ts` C1 | - |
| probe routes (2) | `/health/live` C2, C3 · `/health/ready` C2, C3 | - |
| `/health/ready` statuses (2) | 200 C3 · 503 C3 | - |
| video scripts kept out of git (2) | Phase 1 C4 · Phase 2 C4 | - |

## Swept

- validation: n/a - documents only
- failure modes: C3 (503 when a check fails)
- idempotency: n/a - documents only
- authorization: C2 (no token, no rate limit)
- concurrency: n/a - documents only
- data lifecycle: n/a - documents only
- dependency failure: C3 (the 2 seconds after which a check gives up)
- state transitions: n/a - documents only
- observability: n/a - documents only

## Out of scope

| Excluded | Why |
| --- | --- |
| Recording the video | The user records it |
| The Phase 1 script's mentions of CQRS and the buses | It belongs to the Phase 1 delivery, and `.specs/STATE.md` keeps it as a follow-up |
| The health module's behaviour | `phase-2-infrastructure` built and verified it; only its documents change here |

## Handoff

- **Settled mid-build:** none
- **Dispatched:** build (Sonnet sub-agent, C1 to C4, and the Phase 2 video script) at `29f839d`, returned at `ebc9ede`; Verifier (fresh sub-agent, default model) at `cd46ba0`, over `c8b2a1e..cd46ba0`, with `proofs.md` 6 pass at `cd46ba0`, returned FAIL with 15 findings at `3acef2a`; fix of the 15 findings (Sonnet sub-agent) at `3acef2a`, returned at `3d0103a`: findings 1 to 9 in `78bc54e`, the README part of 12 in `3d0103a`, and findings 10 to 15 in `docs/roteiro-video-fase-2.md`, which git ignores, fixed in place on 2026-11-03; `aff1e0b` makes the account id test of `phase-2-infrastructure` scan only the files git holds, after the bootstrap's local state named the account on this machine
- **Boundary:** C1-C4 closed at `ebc9ede`, their tests made stricter at `78bc54e`; the video script is `docs/roteiro-video-fase-2.md`, which git ignores; `check_proofs.py` 6 pass and `validate_verification.py` exits 0 at `e70ff40`
- **Abandoned:** none
