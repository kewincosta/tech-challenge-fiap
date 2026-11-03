import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPOSITORY_ROOT } from '../support/docker';
import { readText } from '../support/hcl';

const ADR_FOLDER = join(REPOSITORY_ROOT, 'docs/adr');
const ARCHITECTURE_FOLDER = join(REPOSITORY_ROOT, 'docs/architecture');

/** The records of the infrastructure feature and the decisions of `.specs/STATE.md` they come from. */
const RECORDS: Array<[adr: number, decision: number]> = [
  [38, 22],
  [39, 23],
  [40, 24],
  [41, 25],
];

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

describe('Decision records', () => {
  it('records AD-022 to AD-025 as ADRs 0038 to 0041 that name each other', () => {
    const state = readText(join(REPOSITORY_ROOT, '.specs/STATE.md')).split('\n');
    const index = readText(join(ADR_FOLDER, 'README.md')).split('\n');
    const files = readdirSync(ADR_FOLDER);
    const named = new Set<string>();

    for (const [adr, decision] of RECORDS) {
      const number = pad(adr, 4);
      const id = `AD-${pad(decision, 3)}`;
      const matching = files.filter(
        (file) => file.startsWith(`${number}-`) && file.endsWith('.md'),
      );

      expect(matching, `one file for ADR ${number}`).toHaveLength(1);
      const file = matching[0];
      const text = readText(join(ADR_FOLDER, file));
      const title = /^# (\d{4})\. (.+)$/m.exec(text);

      // The record is accepted, says where it comes from, and has the four sections in order.
      expect(title?.[1], `${file} opens with its number`).toBe(number);
      expect(text, `${file} is accepted`).toMatch(/^\*\*Status\*\*: Accepted$/m);
      expect(text, `${file} names ${id}`).toMatch(
        new RegExp(`^\\*\\*Source\\*\\*: ${id} in \`\\.specs/STATE\\.md\`$`, 'm'),
      );
      expect(text, `${file} says when it was recorded`).toMatch(
        /^\*\*Recorded\*\*: \d{4}-\d{2}-\d{2}/m,
      );
      const sections = [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
      expect(sections, file).toEqual(['Context', 'Decision', 'Alternatives', 'Consequences']);

      // The row of the log names the record.
      const row = state.find((line) => line.startsWith(`| ${id} |`));
      expect(row, `${id} is in the log`).toBeDefined();
      expect(row, `${id} names ADR ${number}`).toContain(`(ADR ${number})`);
      expect(row, `${id} is active`).toMatch(/\| active \|/);

      // The index lists the record under the title it carries, as accepted.
      const entry = index.find((line) => line.startsWith(`| [${number}](${file})`));
      const cells = (entry ?? '').split('|').map((cell) => cell.trim());
      expect(entry, `${file} is in the index`).toBeDefined();
      expect(cells[2], `${file} has its title in the index`).toBe(title?.[2]);
      expect(cells[3], `${file} is accepted in the index`).toBe('Accepted');

      // Every record it links to exists, and the four link to one another.
      for (const link of text.matchAll(/\]\((\d{4}-[^)\s]+\.md)\)/g)) {
        expect(files, `${file} links to ${link[1]}`).toContain(link[1]);
        if (
          RECORDS.some(([other]) => link[1].startsWith(`${pad(other, 4)}-`)) &&
          !link[1].startsWith(number)
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
