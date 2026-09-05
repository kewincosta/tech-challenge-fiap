# Security Assessment Tool

The project's internal vulnerability assessment tool. It runs four recognised scanners,
consolidates the results into one model and writes a report ready to attach to a piece of academic
work.

## Purpose

Produce a **reproducible** security assessment: anyone who clones this repository on another
machine runs one command and gets the same kind of report, with the same tools at the same
versions.

The tool answers three complementary questions:

| Question                                           | Analysis | Tool                              |
| -------------------------------------------------- | -------- | --------------------------------- |
| Do the libraries I use have known vulnerabilities? | SCA      | npm audit, OWASP Dependency-Check |
| Does the code I wrote match an insecure pattern?   | SAST     | Semgrep                           |
| Does the running application respond insecurely?   | DAST     | OWASP ZAP                         |

```text
npm run security:scan
        │
        ├── npm audit              (SCA, declared dependencies)
        ├── Semgrep                (SAST, source code)
        ├── OWASP Dependency-Check (SCA, bundled components)
        └── OWASP ZAP              (DAST, running application)
                │
                ▼
       Normalisation and consolidation
                │
                ▼
       security/reports/security-report.html
```

## Tools

| Tool                       | Role                             | How it runs                            |
| -------------------------- | -------------------------------- | -------------------------------------- |
| **npm audit**              | Advisories from the npm registry | Local binary, ships with npm           |
| **Semgrep**                | Security rules over the source   | Local binary, or a pinned Docker image |
| **OWASP Dependency-Check** | NVD CVEs over the components     | Pinned Docker image                    |
| **OWASP ZAP**              | Scan of the running API          | Pinned Docker image                    |

The Semgrep rules are the `p/security-audit` pack, configurable.

## Prerequisites

| Requirement  | Required | What for                                                   |
| ------------ | -------- | ---------------------------------------------------------- |
| Node.js ≥ 22 | Yes      | Running the tool                                           |
| npm          | Yes      | Running `npm audit`                                        |
| Docker       | No       | Dependency-Check, ZAP, and Semgrep without a local install |
| Semgrep      | No       | An alternative to Docker for the SAST                      |

Without Docker and without Semgrep, `npm audit` still runs and the report declares the other three
scanners absent in its limitations section. **A scanner that did not run is never presented as an
absence of vulnerabilities.**

For ZAP, the application has to be up. The tool brings everything up on its own with `--prepare`:

```bash
npm run security:scan -- --prepare
```

That runs `docker compose up -d`, applies the migrations, runs the seed and makes sure the scan
account described below exists. With the stack already up, `npm run security:scan` is enough.

## Installation

Nothing to install beyond what the project already asks for:

```bash
npm install
```

The tool resolves Semgrep on its own, from the least intrusive option to the most:

1. A `semgrep` binary already installed on the machine.
2. A pinned Docker image (`semgrep/semgrep:1.97.0`), installing nothing on the host.
3. Only with an explicit `--install`, and only when there is no Docker:
   `pipx install semgrep==1.97.0`.

Step 3 uses **pipx** rather than `pip`, so the system interpreter's packages are left alone. If
pipx is missing, the tool prints the manual instructions instead of trying something else.

```bash
npm run security:scan -- --install
```

### NVD API key (recommended)

Dependency-Check downloads the NVD database on the first run. Without an API key that download is
slow, rate limited, and can hit the timeout. Request a free key at
<https://nvd.nist.gov/developers/request-an-api-key> and export it:

```bash
export NVD_API_KEY=your-key
npm run security:scan
```

The database is cached in `security/.cache/dependency-check`, which is in `.gitignore`. The second
run is fast.

## Running it

```bash
npm run security:scan
```

Output:

```text
Security Assessment
────────────────────────────────────

[Security] Checking dependencies...

  ✓ Node.js (24.15.0)
  ✓ npm (11.12.1)
  ✓ Docker (Docker version 29.5.0, build 98f1464)
  ✗ Semgrep
      Semgrep was not found on PATH.

  Semgrep is not installed locally; it will run from a pinned container image.

[Security] Preparing the environment...

  ✓ Application: Answering at http://localhost:13000.
  ✓ Scan account: Reused the existing scan account security-scanner@oficina.local, which already holds ADMIN.

  Pulling owasp/dependency-check:12.1.0 ... ✓
  Pulling ghcr.io/zaproxy/zaproxy:stable ... ✓
  Pulling semgrep/semgrep:1.97.0 ... ✓

[1/4] npm audit ..................... ✓
[2/4] Semgrep ....................... ✓
[3/4] Dependency-Check .............. ✓
[4/4] OWASP ZAP ..................... ✓ API scan, driven by the OpenAPI definition, authenticated as security-scanner@oficina.local.

Generating report ............... ✓

Findings: 4 (critical 0, high 0, medium 0, low 1, informational 3)

Report:
  security/reports/security-report.html
  security/reports/security-report.md
```

Real output from this project on 2026-09-04. Semgrep shows up as absent and runs from the
container anyway, which is the normal path on a machine without it installed.

### Options

| Option                    | Effect                                                          |
| ------------------------- | --------------------------------------------------------------- |
| `--prepare`               | Starts the stack, migrates, seeds and prepares the scan account |
| `--install`               | Authorises installing Semgrep with pipx when there is no Docker |
| `--only=npmaudit,semgrep` | Runs only the listed scanners                                   |

```bash
npm run security:scan -- --only=npmaudit,semgrep
npm run security:scan -- --install
```

The names accepted by `--only` are `npmaudit`, `semgrep`, `dependencycheck` and `zap`.

### Exit code

The command exits 0 even when it finds vulnerabilities. The exit code reports whether the
**analysis ran**, not whether it found anything: a command that breaks the build on every new
advisory ends up being switched off, and then it protects nothing. If a scanner fails, that is
said in the terminal and recorded in the report's limitations section.

## Authenticated scanning

Without a token, every route behind the JWT guard answers 401. The dynamic analysis can then
establish exactly one thing: that the API refuses anonymous calls. Nothing about the behaviour of
the routes.

The tool solves that by preparing a dedicated account before scanning:

1. It signs in as the scan account. If it exists and already holds the configured role, it reuses it.
2. Otherwise it signs in as the bootstrap account (the `SUPER_ADMIN` the seed creates).
3. It registers the scan account through the public route and grants it the role.
4. It signs in and hands the token to ZAP.

The token reaches ZAP through the `replacer` add-on, which rewrites the `Authorization` header on
every request. That is the mechanism ZAP's own documentation points to for a bearer token on an
API scan.

The account is created through the API only, using the same routes an operator would. Nothing
writes to the database directly. The CPF is computed by the same algorithm the domain's
`PersonDocument` verifies, derived from the email, so re-running reuses the account rather than
creating another.

> **Warning.** The authenticated scan sends write requests with an administrative token. Run it
> against a disposable environment. In the local `docker compose`, the data comes back with
> `npm run seed`.

No password lives in the versioned configuration file. They come from the environment:

| Variable                 | What for                                                    |
| ------------------------ | ----------------------------------------------------------- |
| `SECURITY_SCAN_PASSWORD` | The scan account's password. Local default `Str0ngPassword` |
| `ADMIN_PASSWORD`         | The `SUPER_ADMIN`'s password, used to grant the role        |

Only the `SUPER_ADMIN` can grant `ADMIN` (ADR 0012), so `authentication.bootstrapEmail` has to
point at that account. A plain `ADMIN` gets a 403 and the tool says so in the message.

To switch it off and scan anonymously, set `authentication.enabled: false`. The report records the
choice in its limitations section.

### The rate limiter and coverage

The `ThrottlerGuard` is first in the chain and answers before the JWT one. With the default limit
of 100 requests per minute, a scan that sends thousands in under a minute gets a 429 for most of
them: one measured run answered **429 to 72% of the scan traffic**.

The control is working, and at the same time it bounds what the dynamic analysis can reach. To get
real coverage, raise the limit in the scan environment before running:

```bash
RATE_LIMIT_MAX_REQUESTS=100000 RATE_LIMIT_AUTH_MAX_REQUESTS=10000 docker compose up -d
npm run security:scan
```

Put the original values back afterwards. The report declares the change in its limitations section
when it is made, because a scan with the limiter loosened does not measure the same system that
runs in production.

## The short report

The full report answers "what did the tools say". The short one answers "what is the state, and
what changed", which is the question a reader who is not going to run the scanners actually has.

```bash
npm run security:snapshot before   # freezes the current result as the baseline
# apply the fixes
npm run security:scan              # measure again
npm run security:snapshot after
npm run security:summary           # writes the comparison
```

It lands in `security/reports/security-summary.html` and `.md`, with before and after counts per
severity, what was resolved, what is still open and what turned up new.

The snapshots come from the dump the scan writes to
`security/reports/raw/consolidation.json`, so the summary cannot drift from the technical report.

What was done about each finding lives in `security/config/resolutions.json`, written by hand. A
finding with no entry shows up as "open" rather than getting a generated sentence: a fix without
an explanation is worse than an open question.

## The submission document

```bash
npm run security:deliverable
```

Generates `security/reports/tech-challenge-entrega.html` from the two snapshots, the resolutions
and `security/config/deliverable.json`, which carries the group, the participants and the links.
It then renders the PDF with headless Chrome. If no browser is found, the command says to print
the HTML by hand rather than failing.

## Suppressions

`security/config/dependency-check-suppressions.xml` records the findings that were reviewed and
judged false positives, each with the reasoning that supports it.

The case that sits there today: Dependency-Check matches components against CPE entries by name,
and the npm package `validator` (a string validation library) was matched to the CPE of the Nu
Html Checker (`validator.nu`), a Java service. CVE-2025-15104 is an SSRF in that service, which
fetches URLs on behalf of its callers. The npm package makes no network access at all.

A suppression without the reasoning written beside it does not go in this file.

## Configuration

`security/security.config.json`:

```json
{
  "application": {
    "baseUrl": "http://localhost:13000",
    "apiPrefix": "/api/v1"
  },
  "openapi": {
    "url": "http://localhost:13000/api/docs-json",
    "path": null
  },
  "scanners": {
    "npmAudit": true,
    "semgrep": true,
    "dependencyCheck": true,
    "zap": true
  },
  "semgrep": {
    "config": "p/security-audit",
    "dockerImage": "semgrep/semgrep:1.97.0",
    "timeoutMs": 600000
  },
  "dependencyCheck": {
    "dockerImage": "owasp/dependency-check:12.1.0",
    "timeoutMs": 2700000
  },
  "zap": {
    "dockerImage": "ghcr.io/zaproxy/zaproxy:stable",
    "mode": "auto",
    "timeoutMs": 900000
  },
  "authentication": {
    "enabled": true,
    "email": "security-scanner@oficina.local",
    "role": "ADMIN",
    "bootstrapEmail": "admin@workshop.local"
  },
  "report": {
    "title": "Security Vulnerability Assessment",
    "markdown": true
  }
}
```

| Field                           | Meaning                                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `application.baseUrl`           | ZAP's target. Only `http` and `https` are accepted                                                        |
| `openapi.url`                   | The OpenAPI specification. `null` switches the API scan off                                               |
| `scanners.*`                    | Turns each scanner on and off                                                                             |
| `semgrep.config`                | The Semgrep rule pack                                                                                     |
| `*.dockerImage`                 | The image used, always pinned by tag                                                                      |
| `zap.mode`                      | `auto` uses the API scan when the OpenAPI answers, otherwise the baseline. `baseline` and `api` force one |
| `*.timeoutMs`                   | The maximum time for each scanner                                                                         |
| `authentication.enabled`        | Whether the dynamic scan authenticates                                                                    |
| `authentication.email`          | The scan account's address                                                                                |
| `authentication.role`           | The role granted to the scan account                                                                      |
| `authentication.bootstrapEmail` | The account used to create and promote the scan account                                                   |
| `report.markdown`               | Also writes the `.md` alongside the HTML                                                                  |

The configuration is validated at startup. An invalid field produces a message that names the
field, rather than an obscure error in the middle of the scan.

## Report structure

```text
security/
├── README.md                  this file
├── security.config.json       configuration
├── config/
│   ├── deliverable.json       group, participants and links for the submission
│   ├── resolutions.json       what was done about each finding
│   └── dependency-check-suppressions.xml   reviewed false positives
├── scripts/
│   ├── security-scan.ts       orchestrator and entry point
│   ├── config.ts              configuration reading and validation
│   ├── environment.ts         dependency checks and resolution
│   ├── prepare.ts             environment and scan account preparation
│   ├── exec.ts                external process execution
│   ├── finding.ts             the normalised model
│   ├── owasp.ts               OWASP Top 10 catalog and mapping
│   ├── consolidate.ts         deduplication, counts and summary
│   ├── report.ts              HTML and Markdown generation
│   ├── snapshot.ts            snapshot and comparison CLI
│   ├── summary-report.ts      the short report
│   ├── deliverable.ts         the submission document and its PDF
│   └── scanners/              one parser per tool
└── reports/                   generated, outside version control
    ├── security-report.html   the main artefact
    ├── security-report.md     the same content in Markdown
    ├── security-summary.html  the before and after comparison
    ├── snapshots/             the frozen results
    └── raw/                   each tool's original output
```

The whole of `reports/` is in `.gitignore`, except the `.gitkeep`. The original outputs stay in
`reports/raw/` for anyone who wants to check a conclusion in the report against what the tool
actually said.

The HTML has its stylesheet inline and fetches nothing from the network: it opens the same way on
a machine with no internet. For the PDF, open it in a browser and print; there are `@media print`
rules for that.

The report has ten sections: executive summary, scope, methodology, tools, results summary,
vulnerabilities, OWASP Top 10 mapping, recommendations, limitations and conclusion.

## Reading the results

### Severities

| Level             | How to read it                                                       |
| ----------------- | -------------------------------------------------------------------- |
| **Critical**      | Exploitable with serious impact. Fix before exposing the application |
| **High**          | Relevant impact. Prioritise                                          |
| **Medium**        | Depends on context or on preconditions                               |
| **Low**           | Limited impact                                                       |
| **Informational** | An observation, not necessarily a problem                            |

npm's `moderate` becomes `medium`. When a tool gives no usable severity word but does give a CVSS
score, the severity comes from the bands the CVSS specification itself defines. An unknown
severity becomes `informational`, never something higher: inventing a severity is inventing a
finding.

### Classification

The tool does not decide what is a false positive. That requires a human reading the code, and
claiming it without that reading would discard a real finding as easily as it confirms a false
one.

| Classification    | What it means                                                                |
| ----------------- | ---------------------------------------------------------------------------- |
| **Confirmed**     | The tool establishes the fact: a CVE in an installed version, for instance   |
| **Potential**     | A candidate until someone reads the context. Every Semgrep match starts here |
| **Informational** | Observed and reported, with no claim of risk                                 |

A finding two tools report independently is promoted to **Confirmed** and lists both.

### OWASP mapping

A finding only lands in a Top 10 category when the tool supplied the basis for it:

- a **CWE** that appears on the list OWASP publishes for that category;
- an **OWASP 2021 identifier** published by the rule itself, as Semgrep does;
- a **dependency advisory**, which is A06 by definition.

Without a basis, the finding shows up as **Not determined**. The 2017 list is ignored on purpose:
it is a different taxonomy, and treating `A3:2017` as `A03:2021` would misfile it.

### Deduplication

npm audit and Dependency-Check see the same dependency tree and report the same CVEs. The
consolidation groups by CVE plus package name, keeps the higher of the two severities, unions the
CVEs and CWEs, and shows a single row naming both tools.

## Limitations

Structural limitations, which hold on every run:

- **The DAST runs with an administrative role.** Routes behind a permission that role lacks answer
  403 and are not exercised.
- **The SAST is rule based.** It reports what its rules describe, and stays silent about
  weaknesses no rule covers.
- **The dependency analysis is bounded by the advisory databases** at the time of the run.
- **There is no manual penetration testing and no business logic review.** The report distinguishes
  what a tool established from what it merely flagged.

The generated report lists only the limitations that **actually occurred on that run**, plus these
structural ones.

## Troubleshooting

**`Docker is required for OWASP ZAP`**
The daemon did not answer. Check with `docker info`. On Linux, see whether your user is in the
`docker` group.

**`The application did not answer at http://localhost:13000`**
Start the application with `docker compose up -d`, or pass `--prepare`. ZAP is skipped, not failed.

**Dependency-Check hits the timeout**
That is the NVD download on the first run. Set `NVD_API_KEY` and try again; the cache in
`security/.cache/` makes the following runs fast.

**ZAP cannot reach `localhost`**
On Linux the container uses `--network host` when the target is local. On Docker Desktop (macOS,
Windows) host networking does not behave the same way: change `application.baseUrl` to
`http://host.docker.internal:13000`.

**Semgrep unavailable and no Docker**
Install it by hand and try again:

```bash
pipx install semgrep==1.97.0
```

**The scan account could not be granted its role**
Only the `SUPER_ADMIN` grants `ADMIN`. Point `authentication.bootstrapEmail` at that account and
make sure `ADMIN_PASSWORD` in `.env` matches the one the seed used.

## The tool's own security

- **Read-only against the project.** It never runs `npm audit fix`, never upgrades a dependency
  and never touches `package-lock.json`.
- **No shell.** Every external process is started with `spawn` and an argument array, without
  `shell: true`. Values from the configuration are never concatenated into a command string.
- **No `eval`** and no embedded secret. The NVD key and the scan passwords come from the
  environment.
- **Validated configuration**, including the protocol of the URLs, which has to be `http` or
  `https`.
- **Images pinned by tag**, so tomorrow's run is the same as today's.
- **Escaping on report generation**: a finding title coming from a scanner is escaped before it
  enters the HTML.

## Tests

The tool's own logic is tested with the project's Vitest:

```bash
npm run test:unit
```

They cover the parsing of all four tools, severity and CWE normalisation, OWASP mapping,
deduplication, consolidation, summary generation, handling of a scanner that failed, and report
escaping. The external tools themselves are not tested: they have tests of their own.
