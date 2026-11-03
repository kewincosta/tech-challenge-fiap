import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPOSITORY_ROOT } from '../support/docker';
import { readText } from '../support/hcl';
import { codeSpans, linkTargets, proseOf, sectionsOf } from '../support/markdown';

const ADR_FOLDER = join(REPOSITORY_ROOT, 'docs/adr');
const ARCHITECTURE_FOLDER = join(REPOSITORY_ROOT, 'docs/architecture');

type Pair = [adr: number, decision: number];

/**
 * The records of the infrastructure feature and the decisions of `.specs/STATE.md` they come from.
 * The third place names the record and the decision that amended it, when one did.
 */
const RECORDS: Array<[...Pair, amendedBy?: Pair]> = [
  [38, 22],
  [39, 23],
  [40, 24],
  [41, 25, [42, 26]],
];

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

/** The line of a record that starts with a header such as `**Status**:`. */
function headerLine(text: string, header: string): string | undefined {
  return text.split('\n').find((line) => line.startsWith(`**${header}**:`));
}

/** The file of a record, which is the only one in `docs/adr` that starts with its number. */
function recordFile(adr: number): string {
  const matching = readdirSync(ADR_FOLDER).filter(
    (file) => file.startsWith(`${pad(adr, 4)}-`) && file.endsWith('.md'),
  );

  expect(matching, `one file for ADR ${pad(adr, 4)}`).toHaveLength(1);
  return matching[0];
}

/**
 * Checks a record, its row in the index and the row of its decision in the log. A record is
 * accepted and its decision active, unless a later record amended them: the record then says
 * `Amended by` that record, the index says the same, and the decision says it was amended.
 */
function expectRecord(
  adr: number,
  decision: number,
  amendedBy?: Pair,
): { file: string; text: string } {
  const state = readText(join(REPOSITORY_ROOT, '.specs/STATE.md')).split('\n');
  const index = readText(join(ADR_FOLDER, 'README.md')).split('\n');
  const number = pad(adr, 4);
  const id = `AD-${pad(decision, 3)}`;
  const file = recordFile(adr);
  const text = readText(join(ADR_FOLDER, file));
  const title = /^# (\d{4})\. (.+)$/m.exec(text);
  const status =
    amendedBy === undefined
      ? 'Accepted'
      : `Amended by [${pad(amendedBy[0], 4)}](${recordFile(amendedBy[0])})`;

  // The record has its status, says where it comes from, and has the four sections in order.
  expect(title?.[1], `${file} opens with its number`).toBe(number);
  expect(headerLine(text, 'Status'), `${file} status`).toBe(`**Status**: ${status}`);
  expect(text, `${file} names ${id}`).toMatch(
    new RegExp(`^\\*\\*Source\\*\\*: ${id} in \`\\.specs/STATE\\.md\`$`, 'm'),
  );
  expect(text, `${file} says when it was recorded`).toMatch(
    /^\*\*Recorded\*\*: \d{4}-\d{2}-\d{2}/m,
  );
  const sections = [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
  expect(sections, file).toEqual(['Context', 'Decision', 'Alternatives', 'Consequences']);

  // The row of the log names the record, and says whether the decision stands or was amended.
  const row = state.find((line) => line.startsWith(`| ${id} |`));
  expect(row, `${id} is in the log`).toBeDefined();
  expect(row, `${id} names ADR ${number}`).toContain(`(ADR ${number})`);
  expect(row, `${id} is ${amendedBy === undefined ? 'active' : 'amended'}`).toMatch(
    amendedBy === undefined
      ? /\| active \|/
      : new RegExp(`\\| active, amended by AD-${pad(amendedBy[1], 3)} \\|`),
  );

  // The index lists the record under the title it carries, with its status.
  const entry = index.find((line) => line.startsWith(`| [${number}](${file})`));
  const cells = (entry ?? '').split('|').map((cell) => cell.trim());
  expect(entry, `${file} is in the index`).toBeDefined();
  expect(cells[2], `${file} has its title in the index`).toBe(title?.[2]);
  expect(cells[3], `${file} is ${status} in the index`).toBe(status);

  return { file, text };
}

describe('Decision records', () => {
  it('records AD-022 to AD-025 as ADRs 0038 to 0041 that name each other', () => {
    const files = readdirSync(ADR_FOLDER);
    const named = new Set<string>();

    for (const [adr, decision, amendedBy] of RECORDS) {
      const { file, text } = expectRecord(adr, decision, amendedBy);

      // Every record it links to exists, and the four link to one another.
      for (const link of text.matchAll(/\]\((\d{4}-[^)\s]+\.md)\)/g)) {
        expect(files, `${file} links to ${link[1]}`).toContain(link[1]);
        if (
          RECORDS.some(([other]) => link[1].startsWith(`${pad(other, 4)}-`)) &&
          !link[1].startsWith(pad(adr, 4))
        ) {
          named.add(link[1].slice(0, 4));
        }
      }
    }
    expect([...named].sort(), 'each of the four is named by another one').toEqual([
      '0038',
      '0039',
      '0040',
      '0041',
    ]);
  });

  it('records AD-026 as ADR 0042, which amends ADR 0041', () => {
    // ADR 0042 is accepted and comes from AD-026. ADR 0041 and AD-025 say that they were amended.
    const { text } = expectRecord(42, 26);
    expectRecord(41, 25, [42, 26]);

    expect(headerLine(text, 'Amends'), 'ADR 0042 says which record it amends').toBe(
      `**Amends**: [0041](${recordFile(41)})`,
    );
  });
});

/** A deployment node (a box that holds others) or an element (a box that holds nothing) of a C4 diagram. */
interface Box {
  alias: string;
  label: string;
  technology: string;
  /** The aliases of the nodes around it, outermost first. */
  within: string[];
}

interface Deployment {
  nodes: Box[];
  elements: Box[];
  relations: Array<{ from: string; to: string }>;
}

const NODE =
  /^(?:Deployment_Node|Node|Node_L|Node_R)\(\s*(\w+)\s*,\s*"([^"]*)"\s*(?:,\s*"([^"]*)")?[^)]*\)\s*\{$/;
const ELEMENT =
  /^(?:Container|ContainerDb|ContainerQueue|System|SystemDb|System_Ext|Person)\(\s*(\w+)\s*,\s*"([^"]*)"\s*(?:,\s*"([^"]*)")?/;
const RELATION = /^Rel(?:_[UDLR])?\(\s*(\w+)\s*,\s*(\w+)\s*,/;

/** The code of a Mermaid diagram: no `%%` comments and no blank lines. */
function diagramCode(file: string): string[] {
  return readText(join(ARCHITECTURE_FOLDER, file))
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('%%'));
}

/** Reads which box holds which from the braces of a `C4Deployment` diagram. */
function parseDeployment(lines: string[]): Deployment {
  const deployment: Deployment = { nodes: [], elements: [], relations: [] };
  const open: Box[] = [];
  for (const line of lines) {
    const node = NODE.exec(line);
    const element = ELEMENT.exec(line);
    const relation = RELATION.exec(line);
    const within = open.map((box) => box.alias);
    if (node !== null) {
      const box = { alias: node[1], label: node[2], technology: node[3] ?? '', within };
      deployment.nodes.push(box);
      open.push(box);
    } else if (line === '}') {
      open.pop();
    } else if (element !== null) {
      deployment.elements.push({
        alias: element[1],
        label: element[2],
        technology: element[3] ?? '',
        within,
      });
    } else if (relation !== null) {
      deployment.relations.push({ from: relation[1], to: relation[2] });
    }
  }
  expect(open, 'every brace of the diagram is closed').toEqual([]);
  return deployment;
}

describe('Architecture diagrams', () => {
  it('draws the prod deployment', () => {
    const deployments = readdirSync(ARCHITECTURE_FOLDER)
      .filter((file) => file.endsWith('.mmd'))
      .filter((file) => diagramCode(file)[0] === 'C4Deployment');

    expect(deployments, 'one C4 deployment diagram under docs/architecture').toHaveLength(1);
    const { nodes, elements, relations } = parseDeployment(diagramCode(deployments[0]));
    const named = (boxes: Box[], pattern: RegExp, what: string): Box => {
      const found = boxes.filter((box) => pattern.test(`${box.label} ${box.technology}`));

      expect(found, what).toHaveLength(1);
      return found[0];
    };

    // The cluster is a node, and the pods and Mailpit are inside it.
    const cluster = named(nodes, /\bEKS\b/, 'the EKS cluster');
    const pods = named(elements, /NestJS application/i, "the application's pods");
    const mailpit = named(elements, /Mailpit/i, 'Mailpit');
    expect(pods.within, 'the pods run inside the EKS cluster').toContain(cluster.alias);
    expect(mailpit.within, 'Mailpit runs inside the EKS cluster').toContain(cluster.alias);

    // The rest of AWS sits around the cluster and not in it.
    const balancer = named(elements, /load balancer/i, 'the load balancer');
    const database = named(elements, /\bRDS\b/, 'RDS');
    const cache = named(elements, /ElastiCache/i, 'ElastiCache');
    const registry = named(elements, /\bECR\b/, 'ECR');
    for (const [box, what] of [
      [balancer, 'the load balancer'],
      [database, 'RDS'],
      [cache, 'ElastiCache'],
      [registry, 'ECR'],
    ] as const) {
      const around = box.within.map(
        (alias) => nodes.find((node) => node.alias === alias)?.label ?? '',
      );

      expect(box.within, `${what} is not inside the EKS cluster`).not.toContain(cluster.alias);
      expect(
        around.some((label) => /\bAWS\b/.test(label)),
        `${what} is in AWS`,
      ).toBe(true);
    }

    // What a request and a deploy cross.
    const arrow = (from: Box, to: Box): boolean =>
      relations.some((relation) => relation.from === from.alias && relation.to === to.alias);
    expect(arrow(balancer, pods), 'the load balancer forwards to the pods').toBe(true);
    expect(arrow(pods, database), 'the pods reach RDS').toBe(true);
    expect(arrow(pods, cache), 'the pods reach ElastiCache').toBe(true);
    expect(arrow(pods, mailpit), 'the pods send e-mail to Mailpit').toBe(true);
    const aliases = new Set([...nodes, ...elements].map((box) => box.alias));
    for (const relation of relations) {
      expect(aliases, `${relation.from} is drawn`).toContain(relation.from);
      expect(aliases, `${relation.to} is drawn`).toContain(relation.to);
    }
  });

  it('sends the overview and the container diagram to the prod deployment', () => {
    const overview = readText(join(ARCHITECTURE_FOLDER, 'architecture-overview.md'));
    const containers = readText(join(ARCHITECTURE_FOLDER, 'c4-containers.mmd'));

    expect(overview).toContain('(c4-deployment-prod.mmd)');
    expect(containers).toContain('c4-deployment-prod.mmd');
    // The pieces run in compose and in prod, so neither document calls Mailpit a local piece.
    expect(overview).not.toMatch(/SMTP server of local development/);
    expect(containers).not.toMatch(/Local SMTP server|all started by docker-compose/);
  });
});

const HIGH_LEVEL_DESIGN = join(ARCHITECTURE_FOLDER, 'high-level-design.md');
const HEALTH_PAGE = join(ARCHITECTURE_FOLDER, 'low-level-design/health.md');
const LOW_LEVEL_INDEX = join(ARCHITECTURE_FOLDER, 'low-level-design/README.md');

/** The text under a heading of a document. */
function sectionText(file: string, title: string): string {
  const found = sectionsOf(readText(file)).filter((section) => section.title === title);

  expect(found, `one section titled "${title}" in ${file}`).toHaveLength(1);
  return found[0].text;
}

/**
 * The files and folders a text names in code spans: a span with a slash that is no route, or with a
 * file extension. Compiled output under `dist` exists only after a build, so it is left out.
 */
function pathsNamed(prose: string): string[] {
  return codeSpans(prose).filter(
    (span) =>
      /^[\w.@-]+(\/[\w.@-]+)*(\.\w+)?$/.test(span) &&
      (span.includes('/') || /\.(ts|js|json|ya?ml|md|hcl|tf)$/.test(span)) &&
      !span.startsWith('dist/'),
  );
}

/** Every path a text names in code spans, and every relative link, exists. */
function expectPathsToExist(prose: string, folder: string, what: string): void {
  for (const path of pathsNamed(prose)) {
    expect(existsSync(join(REPOSITORY_ROOT, path)), `${what} names ${path}`).toBe(true);
  }
  for (const target of linkTargets(prose)) {
    if (/^(https?:|#)/.test(target)) {
      continue;
    }
    const file = resolve(folder, target.split('#')[0]);

    expect(existsSync(file), `${what} links ${target}`).toBe(true);
  }
}

describe('Architecture documents', () => {
  it('names the units Phase 2 added in the high level design', () => {
    const units = sectionText(HIGH_LEVEL_DESIGN, 'The code units');
    const rows = units.split('\n').filter((line) => line.startsWith('|'));
    const rowOf = (module: string): string => {
      const row = rows.filter((line) => line.split('|')[2]?.trim() === `\`${module}\``);

      expect(row, `one row for ${module}`).toHaveLength(1);
      return row[0];
    };

    expect(units).toContain(
      'Six modules under `src/modules`, plus a shared kernel at `src/shared`',
    );

    // The health module and what it holds.
    expect(units).toContain('`src/health`');
    for (const name of [
      'HealthController',
      'CheckReadinessUseCase',
      'readiness checks port',
      'DependencyReadinessChecks',
    ]) {
      expect(rowOf('health'), `the health row names ${name}`).toContain(name);
    }

    // The configuration, and the three that share its database and Redis settings.
    expect(units).toContain('`src/config`');
    for (const name of [
      'environment validation',
      'src/config/database.config.ts',
      'src/config/redis.config.ts',
      'DatabaseModule',
      'RedisModule',
      'data source of the migrations',
    ]) {
      expect(rowOf('config'), `the config row names ${name}`).toContain(name);
    }

    // The two entry points, which run compiled.
    const migrate = units.split('\n\n').find((paragraph) => paragraph.includes('`src/migrate.ts`'));
    expect(migrate, 'a paragraph on the entry points').toBeDefined();
    expect(migrate).toContain('`src/seed-admin.ts`');
    expect(migrate).toContain('`dist/migrate.js`');
    expect(migrate).toContain('`dist/seed-admin.js`');
    expect(migrate).toMatch(/migration Job[\s\S]*by hand against `prod`/);

    expectPathsToExist(units, dirname(HIGH_LEVEL_DESIGN), 'the code units');
  });

  it('places the probes outside the API prefix in the high level design', () => {
    const surface = sectionText(HIGH_LEVEL_DESIGN, 'The HTTP surface');
    const prose = proseOf(surface).replace(/\s+/g, ' ');

    // The page names the routes that `configureApp` leaves out of the prefix, and no others.
    const setup = readText(join(REPOSITORY_ROOT, 'src/app.setup.ts'));
    const excluded = [...(/exclude:\s*\[([^\]]*)\]/.exec(setup)?.[1] ?? '').matchAll(/'([^']+)'/g)]
      .map((match) => `GET /${match[1]}`)
      .sort();
    const named = [
      ...new Set([...prose.matchAll(/`(GET \/health\/\w+)`/g)].map((match) => match[1])),
    ].sort();
    expect(excluded, 'configureApp excludes the two probes').toEqual([
      'GET /health/live',
      'GET /health/ready',
    ]);
    expect(named, 'the surface names the probes configureApp excludes').toEqual(excluded);

    // Every route but those is under `/api/v1`, and the sentence that says so makes the exception.
    const rule = prose.split(/(?<=\.)\s/).find((sentence) => sentence.includes('`/api/v1/...`'));
    expect(rule, 'a sentence on the /api/v1 routes').toBeDefined();
    expect(rule).toMatch(/every route except `GET \/health\/live` and `GET \/health\/ready`/);

    expect(prose).toMatch(/outside the `api` prefix and the version/);
    expect(prose).toMatch(/need no token/);
    expect(prose).toMatch(/not rate limited/);
  });

  it('gives the health module a low level page the index links', () => {
    const index = readText(LOW_LEVEL_INDEX);
    const page = readText(HEALTH_PAGE);

    // The opening sentence and the table of the index name the page.
    expect(index.split('\n\n')[1], 'the opening sentence names the health module').toContain(
      '`src/health`',
    );
    expect(
      index.split('\n').some((line) => line.startsWith('| [health](health.md)')),
      'the table links the page',
    ).toBe(true);

    // The routes the controller declares, read from its source.
    const source = readText(join(REPOSITORY_ROOT, 'src/health/presentation/health.controller.ts'));
    const base = /@Controller\(\{\s*path:\s*'([^']+)'/.exec(source)?.[1];
    const declared = [...source.matchAll(/@Get\('([^']+)'\)/g)]
      .map((match) => `GET /${base}/${match[1]}`)
      .sort();
    expect(declared, 'the controller declares the two probes').toHaveLength(2);

    // The page names those routes and no other, in code spans and in running text.
    const prose = proseOf(page);
    const routes = new Set<string>();
    for (const span of codeSpans(prose)) {
      const route = /^(GET|POST|PUT|PATCH|DELETE) (\/\S+)$/.exec(span);
      if (route !== null) {
        routes.add(`${route[1]} ${route[2]}`);
      }
    }
    expect([...routes].sort(), 'the routes the page names').toEqual(declared);
    const bare = new Set(
      [...prose.matchAll(/(?<![\w.])\/health\/\w+/g)].map((match) => `GET ${match[0]}`),
    );
    expect(
      [...bare].every((route) => declared.includes(route)),
      'every /health route in the text is declared',
    ).toBe(true);

    // Their statuses and bodies, and the limit of a check.
    expect(page).toContain('| `GET /health/live` ');
    expect(page).toMatch(/\| `GET \/health\/ready`\s*\| 200 /);
    expect(page).toMatch(/\| `GET \/health\/ready`\s*\| 503 /);
    expect(page).toMatch(/\| `GET \/health\/live`\s*\| 200 /);
    expect(page).toContain('"status": "error"');
    expect(page).toContain('"database": "down"');
    expect(page).toMatch(/Each check has 2 seconds/);

    expectPathsToExist(page, dirname(HEALTH_PAGE), 'the health page');
  });
});
