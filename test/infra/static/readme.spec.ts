import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPOSITORY_ROOT } from '../support/docker';
import { readText } from '../support/hcl';
import {
  codeSpans,
  fencesOf,
  linkTargets,
  proseOf,
  sectionsOf,
  type Fence,
  type Section,
} from '../support/markdown';
import { wordsOf, logicalLines } from '../support/workflows';

const README = readText(join(REPOSITORY_ROOT, 'README.md'));
const SECTIONS = sectionsOf(README);

const SHELL = ['bash', 'sh', 'shell'];
const FILE_EXTENSION = /\.(?:md|ts|js|json|ya?ml|sh|tf|tfvars|hcl|mmd|pem|kubeconfig|tfstate)$/;

/** Every file the repository holds, tracked or not yet committed and not ignored, and its folders. */
function repositoryPaths(): Set<string> {
  const listed = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    },
  )
    .split('\0')
    .filter(Boolean);
  const paths = new Set<string>();
  for (const file of listed) {
    const parts = file.split('/');
    for (let length = 1; length <= parts.length; length += 1) {
      paths.add(parts.slice(0, length).join('/'));
    }
  }
  return paths;
}

function isIgnored(path: string): boolean {
  return spawnSync('git', ['check-ignore', '-q', path], { cwd: REPOSITORY_ROOT }).status === 0;
}

function section(title: RegExp): Section {
  const found = SECTIONS.filter((candidate) => title.test(candidate.title));

  expect(found, `the README has one section titled ${title}`).toHaveLength(1);
  return found[0];
}

function commandsOf(fences: Fence[]): string {
  return fences
    .filter((fence) => SHELL.includes(fence.language))
    .map((fence) => fence.content)
    .join('\n');
}

/** What a part of the README has to hold, as the brief and the plan ask for it. */
interface Expected {
  /** The section that holds it. */
  heading: RegExp;
  /** Words and names its text has to hold. */
  mentions?: RegExp[];
  /** Commands its shell blocks have to hold. */
  commands?: RegExp[];
  /** Mermaid drawings: one drawing of the section has to show everything a line lists. */
  drawings?: Array<[shows: string, patterns: RegExp[]]>;
}

const PARTS: Array<{ part: string; expected: Expected[] }> = [
  {
    part: "the solution and this phase's goals",
    expected: [
      {
        heading: /^The solution and its goals$/,
        mentions: [/Phase 2/, /Docker/, /Kubernetes/, /autoscal/i, /Terraform/, /CI/, /CD/],
      },
    ],
  },
  {
    part: "a drawing of the application's components, the AWS infrastructure and the deploy flow",
    expected: [
      {
        heading: /^The architecture$/,
        drawings: [
          [
            "the application's components",
            [/identity/, /work-orders/, /PostgreSQL/, /Redis/, /Mailpit/],
          ],
          ['the AWS infrastructure', [/Load Balancer/, /VPC/, /EKS/, /RDS/, /ElastiCache/, /ECR/]],
          ['the deploy flow', [/GitHub Actions/, /CI/, /CD/, /Terraform/, /Helm/, /OIDC/]],
        ],
      },
    ],
  },
  {
    part: 'the resources Terraform creates, how to apply and destroy them, and the warning about the database',
    expected: [
      {
        heading: /^Provisioning with Terraform$/,
        mentions: [
          /S3/,
          /OIDC/,
          /VPC/,
          /NAT gateway/,
          /EKS/,
          /metrics-server/,
          /RDS/,
          /ElastiCache/,
          /ECR/,
          /Secrets Manager/,
          /Destroying `prod` erases its database/,
        ],
        commands: [
          /terraform -chdir=infra\/bootstrap apply/,
          /terraform -chdir=infra init -backend-config=environments\/prod\.backend\.hcl/,
          /terraform -chdir=infra apply -var-file=environments\/prod\.tfvars/,
          /terraform -chdir=infra destroy -var-file=environments\/prod\.tfvars/,
        ],
      },
    ],
  },
  {
    part: 'running locally with compose and with the local cluster',
    expected: [
      {
        heading: /^Running locally$/,
        mentions: [/docker compose/i, /kind/, /localhost:13000/, /localhost:18080/],
        commands: [
          /docker compose up/,
          /scripts\/local-cluster\.sh up/,
          /scripts\/local-cluster\.sh down/,
        ],
      },
    ],
  },
  {
    part: 'provisioning prod and deploying it',
    expected: [
      {
        heading: /^The CI and the CD$/,
        mentions: [
          /ci\.yml/,
          /cd\.yml/,
          /(?<!\w)DEPLOY_ROLE_ARN/,
          /CLUSTER_ADMIN_ARNS/,
          /environment/,
          /`main`/,
        ],
      },
      {
        heading: /^Deploying to Kubernetes$/,
        mentions: [/cd\.yml/, /migration/i, /--set-string/],
        commands: [/helm upgrade --install/, /aws eks update-kubeconfig/],
      },
    ],
  },
  {
    part: 'reaching the prod database through the cluster and creating the SUPER_ADMIN',
    expected: [
      {
        heading: /^The prod database$/,
        mentions: [
          /Secrets Manager/,
          /SUPER_ADMIN/,
          /by hand/,
          /admin seed/,
          /dist\/seed-admin\.js/,
        ],
        commands: [/aws secretsmanager get-secret-value/, /kubectl run /, /--command -- psql /],
      },
    ],
  },
];

const COLLECTION = 'postman/workshop-api.postman_collection.json';

describe('README', () => {
  it('documents every part the brief asks for', () => {
    for (const { part, expected } of PARTS) {
      for (const want of expected) {
        const found = section(want.heading);
        // The README wraps its lines, so a name that spans two of them is still one name.
        const written =
          `${proseOf(found.text)}\n${found.fences.map((fence) => fence.content).join('\n')}`.replace(
            /\s+/g,
            ' ',
          );

        for (const pattern of want.mentions ?? []) {
          expect(written, `${part}: ${pattern}`).toMatch(pattern);
        }
        for (const pattern of want.commands ?? []) {
          expect(commandsOf(found.fences), `${part}: a command ${pattern}`).toMatch(pattern);
        }
        if (want.drawings !== undefined) {
          const drawings = found.fences
            .filter((fence) => fence.language === 'mermaid')
            .map((fence) => fence.content);

          expect(drawings.length, `${part}: the section draws it`).toBeGreaterThan(0);
          for (const [shows, patterns] of want.drawings) {
            const missing = drawings.map((drawing) =>
              patterns.filter((pattern) => !pattern.test(drawing)).map(String),
            );

            expect(
              missing.some((absent) => absent.length === 0),
              `${part}: one drawing shows ${shows}, and the best one lacks ${missing.sort((a, b) => a.length - b.length)[0]?.join(', ')}`,
            ).toBe(true);
          }
        }
      }
    }

    // The link to the collection of the API.
    expect(linkTargets(proseOf(README)), 'the README links the collection').toContain(COLLECTION);

    // The video: a marked placeholder until it is recorded, and the link to it after.
    const video = section(/video/i);
    expect(
      /placeholder/i.test(video.text) ||
        /https:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|vimeo\.com)\//.test(video.text),
      'the video section holds a marked placeholder or the link',
    ).toBe(true);
  });

  it('says the CI runs on pull requests into main and pushes to main', () => {
    const flat = (text: string): string => text.replace(/\s+/g, ' ');
    const ciSection = flat(proseOf(section(/^The CI and the CD$/).text));
    const goals = flat(proseOf(section(/^The solution and its goals$/).text));
    const deployFlow = section(/^The architecture$/)
      .fences.filter((fence) => fence.language === 'mermaid')
      .find((fence) => /GitHub Actions/.test(fence.content));

    // The section on the CI says it, the table of goals says it, and the drawing of the deploy
    // flow starts the CI from a pull request into main and from the push a merge makes to main.
    expect(ciSection).toContain('runs on pull requests into `main` and on pushes to `main`');
    expect(goals).toContain(
      'the CI lints, tests and builds on pull requests into `main` and pushes to `main`',
    );
    expect(deployFlow, 'the architecture draws the deploy flow').toBeDefined();
    expect(deployFlow?.content).toMatch(/-->\|"[^"]*pull request into main[^"]*"\|\s*ci\b/);
    expect(deployFlow?.content).toMatch(/-->\|"[^"]*pushes to main[^"]*"\|\s*ci\b/);

    // Nothing says it runs on every push.
    expect(flat(README)).not.toMatch(/\b(?:every|each) push\b/i);
  });

  it('names only files and scripts that exist', () => {
    const paths = repositoryPaths();
    const basenames = new Set([...paths].map((path) => path.split('/').pop()));
    const roots = new Set([...paths].filter((path) => !path.includes('/')));
    const dockerfile = readText(join(REPOSITORY_ROOT, 'Dockerfile'));
    const offenders: string[] = [];

    /** What the README names that a build writes, a command makes or the image holds. Each one is checked. */
    const generated = (path: string, where: string): void => {
      if (path.startsWith('/app/')) {
        const inside = path.slice('/app/'.length);
        const compiled = /^dist\/(.+)\.js$/.exec(inside);
        const copied =
          dockerfile.includes(`./${inside}`) || ['package.json', 'node_modules'].includes(inside);

        if (!(compiled !== null ? paths.has(`src/${compiled[1]}.ts`) : copied)) {
          offenders.push(`${where}: ${path} is not in the image`);
        }
      } else if (/^dist\//.test(path)) {
        const compiled = /^dist\/(.+)\.js$/.exec(path);

        if (!isIgnored(path) || (compiled !== null && !paths.has(`src/${compiled[1]}.ts`))) {
          offenders.push(`${where}: ${path} is not built from a source file`);
        }
      } else if (!isIgnored(path)) {
        offenders.push(
          `${where}: ${path} is not in the repository, and git does not ignore it as a generated path`,
        );
      }
    };

    /** The path a word of the README names, or undefined when the word names none. */
    const pathOf = (word: string): string | undefined => {
      // Terraform reads these two flags relative to -chdir=infra, where the commands run.
      const fromInfra = /^-(?:var-file|backend-config)=/.test(word);
      const stripped = word
        .replace(/^[("'`[]+|[)"'`\],;:.]+$/g, '')
        .replace(/^--?[\w-]+=/, '')
        .replace(/^\.\//, '')
        .replace(/\/+$/, '');
      const token = fromInfra ? `infra/${stripped}` : stripped;

      if (token === '' || /[$<>*{}|\\:]/.test(token)) {
        return undefined;
      }
      if (token.startsWith('/')) {
        return token.startsWith('/app/') ? token : undefined;
      }
      if (token.includes('/')) {
        // A folder of the repository, or a file whatever folder it is said to be in: a typo in the
        // first folder is a path to a file that does not exist.
        return roots.has(token.split('/')[0]) ||
          ['dist', '.tools'].includes(token.split('/')[0]) ||
          FILE_EXTENSION.test(token)
          ? token
          : undefined;
      }
      return FILE_EXTENSION.test(token) ||
        ['Dockerfile', 'LICENSE', '.env', '.env.example', '.env.test'].includes(token)
        ? token
        : undefined;
    };

    const check = (path: string, where: string): void => {
      const exists =
        path.includes('/') || path.startsWith('.')
          ? paths.has(path)
          : paths.has(path) || basenames.has(path);

      if (!exists) {
        generated(path, where);
      }
    };

    const prose = proseOf(README);

    // The links.
    for (const target of linkTargets(prose)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) {
        continue;
      }
      const path = join(dirname('README.md'), target.split('#')[0]).replace(/\/+$/, '');

      if (!paths.has(path)) {
        offenders.push(`link ${target}: no such file or folder`);
      }
    }

    // The words of every inline code span, and of every command in a shell block.
    for (const span of codeSpans(prose)) {
      for (const word of span.split(/\s+/)) {
        const path = pathOf(word);

        if (path !== undefined) {
          check(path, `\`${span}\``);
        }
      }
    }
    const commands = fencesOf(README).filter((fence) => SHELL.includes(fence.language));
    for (const fence of commands) {
      for (const line of logicalLines(fence.content)) {
        for (const word of wordsOf(line)) {
          const path = pathOf(word);

          if (path !== undefined) {
            check(path, line);
          }
        }
      }
    }

    // The tree of the project structure, and any other tree that starts at a folder of the repository.
    for (const fence of fencesOf(README).filter((candidate) => candidate.content.includes('├──'))) {
      const [first, ...rows] = fence.content.split('\n');
      const root = first.trim().replace(/\/+$/, '');
      if (root !== '.' && !paths.has(root)) {
        continue; // A layout that no folder of the repository has, such as modules/customers.
      }
      const stack: string[] = [];
      for (const row of rows) {
        const entry = /^((?:│ {3}| {4})*)(?:├── |└── )(\S+)/.exec(row);
        if (entry !== null) {
          stack.length = entry[1].length / 4;
          stack.push(entry[2].replace(/\/+$/, ''));
          const path = (root === '.' ? stack : [root, ...stack]).join('/');

          if (!paths.has(path)) {
            offenders.push(`tree ${root}: ${path} does not exist`);
          }
        }
      }
    }

    // The npm scripts, the tools of tool.sh and the commands of the local cluster script.
    const text = `${prose}\n${commands.map((fence) => fence.content).join('\n')}`;
    const scripts = Object.keys(
      (
        JSON.parse(readText(join(REPOSITORY_ROOT, 'package.json'))) as {
          scripts: Record<string, string>;
        }
      ).scripts,
    );
    for (const match of text.matchAll(/\bnpm run ([\w:.-]+)/g)) {
      if (!scripts.includes(match[1])) {
        offenders.push(`npm run ${match[1]}: package.json has no such script`);
      }
    }
    const toolScript = readText(join(REPOSITORY_ROOT, 'scripts/tool.sh'));
    const tools = [
      ...(/case "\$TOOL" in([\s\S]*?)\nesac/.exec(toolScript)?.[1] ?? '').matchAll(
        /^ {2}(\w+)\)/gm,
      ),
    ].map((match) => match[1]);
    for (const match of text.matchAll(/scripts\/tool\.sh (\w[\w-]*)/g)) {
      if (!tools.includes(match[1])) {
        offenders.push(`scripts/tool.sh ${match[1]}: the script runs no such tool`);
      }
    }
    const clusterScript = readText(join(REPOSITORY_ROOT, 'scripts/local-cluster.sh'));
    const commandsOfCluster = [
      ...(/case "\$\{1:-\}" in([\s\S]*?)\nesac/.exec(clusterScript)?.[1] ?? '').matchAll(
        /^ {2}(\w+)\)/gm,
      ),
    ].map((match) => match[1]);
    for (const match of text.matchAll(/scripts\/local-cluster\.sh (\w+)/g)) {
      if (!commandsOfCluster.includes(match[1])) {
        offenders.push(`scripts/local-cluster.sh ${match[1]}: the script has no such command`);
      }
    }

    expect(tools.length, 'tool.sh lists its tools').toBeGreaterThan(3);
    expect(commandsOfCluster.sort(), 'local-cluster.sh has two commands').toEqual(['down', 'up']);
    expect(offenders).toEqual([]);

    // The READMEs of the two halves are among what it links.
    const targets = linkTargets(prose).map((target) => target.split('#')[0]);
    expect(targets).toContain('infra/README.md');
    expect(targets).toContain('k8s/README.md');
  });

  it('points every link at a heading or a file that exists', () => {
    const anchorsOf = (markdown: string): string[] =>
      sectionsOf(markdown).map((found) => found.slug);
    const own = anchorsOf(README);

    for (const target of linkTargets(proseOf(README))) {
      const [file, anchor] = target.split('#');

      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || (anchor === undefined && file !== '')) {
        continue;
      }
      const anchors =
        file === ''
          ? own
          : file.endsWith('.md')
            ? anchorsOf(readText(join(REPOSITORY_ROOT, file)))
            : [];

      if (file === '' || file.endsWith('.md')) {
        expect(anchors, `${target} names a heading`).toContain(anchor);
      }
    }
  });

  it('counts the decision records it says it holds', () => {
    const count = readdirSync(join(REPOSITORY_ROOT, 'docs/adr')).filter((file) =>
      /^\d{4}-.+\.md$/.test(file),
    ).length;
    const words = (value: number): string => {
      const units = [
        '',
        'one',
        'two',
        'three',
        'four',
        'five',
        'six',
        'seven',
        'eight',
        'nine',
        'ten',
        'eleven',
        'twelve',
        'thirteen',
        'fourteen',
        'fifteen',
        'sixteen',
        'seventeen',
        'eighteen',
        'nineteen',
      ];
      const tens = [
        '',
        '',
        'twenty',
        'thirty',
        'forty',
        'fifty',
        'sixty',
        'seventy',
        'eighty',
        'ninety',
      ];
      return value < 20
        ? units[value]
        : `${tens[Math.floor(value / 10)]}${value % 10 === 0 ? '' : `-${units[value % 10]}`}`;
    };

    expect(README).toContain(`${count} architecture decision records`);
    expect(README.toLowerCase()).toContain(`${words(count)} numbered records`);
  });

  it('states the versions that scripts/tool.sh pins', () => {
    const script = readText(join(REPOSITORY_ROOT, 'scripts/tool.sh'));
    const pins = [...script.matchAll(/^([A-Z0-9]+)_(?:IMAGE|VERSION)='([^']+)'/gm)].map(
      (match) => ({
        tool: match[1],
        version: /(\d+\.\d+\.\d+)$/.exec(match[2])?.[1] ?? '',
      }),
    );

    expect(pins.map((pin) => pin.tool).sort()).toEqual(
      ['ACTIONLINT', 'HELM', 'K6', 'KIND', 'KUBECONFORM', 'KUBECTL', 'TERRAFORM'].sort(),
    );
    for (const { tool, version } of pins) {
      expect(version, `${tool} has a version`).not.toBe('');
      expect(README, `the README states the ${tool} version`).toContain(version);
    }
  });

  it('keeps the AWS account id out of the README', () => {
    expect(README).not.toMatch(/(?<![\w-])\d{12}(?![\w-])/);
  });
});
