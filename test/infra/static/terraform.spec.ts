import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPOSITORY_ROOT } from '../support/docker';
import {
  blockArguments,
  blocks,
  numericLiterals,
  readText,
  stringLiterals,
  terraformFiles,
  unquoted,
  withoutComments,
} from '../support/hcl';

const INFRA = join(REPOSITORY_ROOT, 'infra');

/** The names an environment goes by, and the shape of an instance size. Neither belongs in the code. */
const ENVIRONMENT_NAME =
  /(?:^|[^A-Za-z0-9])(?:prod|production|staging|stage|dev|development|qa|uat)(?:$|[^A-Za-z0-9])/i;
const INSTANCE_SIZE =
  /(?:^|[^A-Za-z0-9])(?:db\.|cache\.)?[a-z]{1,3}\d[a-z]{0,2}\.(?:nano|micro|small|medium|large|\d*xlarge)(?:$|[^A-Za-z0-9])/;

/** A pattern for `text` as a whole word: the characters around it are not letters or digits. */
function wholeWord(text: string): RegExp {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^A-Za-z0-9])${escaped}(?:$|[^A-Za-z0-9])`);
}

function readInfra(path: string): string {
  return readText(join(INFRA, path));
}

/** The Terraform code of a file: no comments and no descriptions, which are prose. */
function codeOf(path: string): string {
  return withoutComments(readInfra(path)).replace(
    /^\s*description\s*=\s*"(?:[^"\\]|\\.)*"\s*$/gm,
    '',
  );
}

function modulesFolder(): string[] {
  return terraformFiles(join(INFRA, 'modules')).map((file) => join('modules', file));
}

/**
 * Every file under infra that git holds or would take, relative to infra, that can name an account.
 * An ignored file, such as the local state of the bootstrap, stays on the machine and may name it.
 */
function filesToScan(): string[] {
  return execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', 'infra'],
    { cwd: REPOSITORY_ROOT, encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean)
    .map((file) => relative(INFRA, join(REPOSITORY_ROOT, file)))
    .filter(
      (path) =>
        !path.split(sep).some((part) => part === '.terraform' || part === 'tests') &&
        basename(path) !== '.terraform.lock.hcl',
    );
}

describe('Terraform files', () => {
  it('holds no environment literal in the main file or the modules', () => {
    // Everything prod.tfvars sets is a name or a size of the environment: the code may not repeat it.
    const settings = Object.values(
      blockArguments(withoutComments(readInfra('environments/prod.tfvars'))),
    );
    const names = settings.flatMap((expression) => unquoted(expression) ?? []).filter(Boolean);
    const sizes = settings
      .filter((expression) => /^\d+(?:\.\d+)?$/.test(expression))
      .map(Number)
      .filter((size) => size > 1);
    expect(names.length).toBeGreaterThan(0);
    expect(sizes.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of ['main.tf', ...modulesFolder()]) {
      const code = codeOf(file);
      for (const literal of stringLiterals(code)) {
        const repeated = names.filter((name) => wholeWord(name).test(literal));
        if (repeated.length > 0 || ENVIRONMENT_NAME.test(literal) || INSTANCE_SIZE.test(literal)) {
          offenders.push(`${file}: "${literal}"`);
        }
      }
      for (const number of numericLiterals(code)) {
        if (sizes.includes(number)) {
          offenders.push(`${file}: ${number}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the prod state in the bootstrap bucket with a lock file', () => {
    const backend = blockArguments(withoutComments(readInfra('environments/prod.backend.hcl')));
    const bootstrapVariable = blocks(codeOf('bootstrap/variables.tf'), 'variable').find(
      (block) => block.labels[0] === 'state_bucket_name',
    );
    const bootstrapBucket = unquoted(blockArguments(bootstrapVariable?.body ?? '').default);

    expect(bootstrapBucket).toBeDefined();
    expect(unquoted(backend.bucket)).toBe(bootstrapBucket);
    expect(unquoted(backend.key)).toMatch(/(?:^|[^a-z])prod(?:$|[^a-z])/);
    expect(unquoted(backend.region)).toBe('us-east-1');
    expect(backend.use_lockfile).toBe('true');
    expect(backend.encrypt).toBe('true');
  });

  it('pins the community modules to exact versions', () => {
    const community = [
      ['network', 'terraform-aws-modules/vpc/aws'],
      ['cluster', 'terraform-aws-modules/eks/aws'],
    ];
    for (const [module, source] of community) {
      const code = terraformFiles(join(INFRA, 'modules', module))
        .map((file) => codeOf(join('modules', module, file)))
        .join('\n');
      const calls = blocks(code, 'module').filter(
        (block) => unquoted(blockArguments(block.body).source) === source,
      );
      expect(calls, `the ${module} module calls ${source}`).toHaveLength(1);
      expect(unquoted(blockArguments(calls[0].body).version), `${source} version`).toMatch(
        /^\d+\.\d+\.\d+$/,
      );
    }
  });

  it('calls the network, cluster, database, cache and registry modules', () => {
    const called = blocks(codeOf('main.tf'), 'module').map((block) => block.labels[0]);
    const folders = readdirSync(join(INFRA, 'modules'));

    expect([...called].sort()).toEqual(['cache', 'cluster', 'database', 'network', 'registry']);
    expect(folders.sort()).toEqual(['cache', 'cluster', 'database', 'network', 'registry']);
  });

  it('passes each setting to its module under the same name', () => {
    // A module-level run takes its settings from prod.tfvars by name, so main.tf must hand the
    // module the variable of that name and nothing else.
    for (const call of blocks(codeOf('main.tf'), 'module')) {
      for (const [name, expression] of Object.entries(blockArguments(call.body))) {
        if (name === 'source') {
          continue;
        }
        const setting = /^var\.(\w+)$/.exec(expression);
        if (setting === null) {
          expect(expression, `${call.labels[0]} ${name}`).toMatch(
            /^(?:module\.\w+\.\w+|\[aws_\w+\.\w+\.id\])$/,
          );
        } else {
          expect(setting[1], `${call.labels[0]} ${name}`).toBe(name);
        }
      }
    }
  });

  it('places the cluster, the database and the cache in the private subnets', () => {
    const calls = blocks(codeOf('main.tf'), 'module');
    for (const name of ['cluster', 'database', 'cache']) {
      const call = calls.find((block) => block.labels[0] === name);
      expect(blockArguments(call?.body ?? '').subnet_ids, name).toBe(
        'module.network.private_subnet_ids',
      );
    }

    // The output main.tf reads must hold the VPC's private subnets, never its public ones.
    const outputs = blocks(codeOf('modules/network/outputs.tf'), 'output');
    const value = (name: string) =>
      blockArguments(outputs.find((block) => block.labels[0] === name)?.body ?? '').value;
    expect(value('private_subnet_ids'), 'private_subnet_ids').toBe('module.vpc.private_subnets');
    expect(value('public_subnet_ids'), 'public_subnet_ids').toBe('module.vpc.public_subnets');
  });

  it('gives the database and the cache a security group of their own', () => {
    const calls = blocks(codeOf('main.tf'), 'module');
    for (const name of ['database', 'cache']) {
      const call = calls.find((block) => block.labels[0] === name);
      expect(blockArguments(call?.body ?? '').security_group_ids, name).toBe(
        `[aws_security_group.${name}.id]`,
      );
    }
  });

  it('leaves the bucket, the key and the region of the state to the backend file', () => {
    const declared = blocks(codeOf('main.tf'), 'backend');

    expect(declared).toHaveLength(1);
    expect(declared[0].labels).toEqual(['s3']);
    expect(declared[0].body.trim()).toBe('');
  });

  it('declares every variable that prod.tfvars sets', () => {
    const declared = blocks(codeOf('variables.tf'), 'variable').map((block) => block.labels[0]);
    const set = Object.keys(blockArguments(withoutComments(readInfra('environments/prod.tfvars'))));

    expect(set.filter((name) => !declared.includes(name))).toEqual([]);
    expect(declared.filter((name) => !set.includes(name))).toEqual(['cluster_admin_arns']);
  });

  it('keeps the AWS account id out of the committed files', () => {
    const offenders = filesToScan().filter((file) =>
      /(?<![\w-])\d{12}(?![\w-])/.test(readInfra(file)),
    );

    expect(offenders).toEqual([]);
  });
});

describe('Bootstrap variables', () => {
  it('names sub_claim_prefix where a prefix without the IDs is refused', () => {
    const variables = blocks(readText(join(INFRA, 'bootstrap/variables.tf')), 'variable');
    const prefix = variables.find((variable) => variable.labels[0] === 'github_subject_prefix');
    expect(prefix, 'the bootstrap declares github_subject_prefix').toBeDefined();

    // The validation is found by the condition that refuses a prefix without the IDs, so its
    // message is the one a user reads when the IDs are missing.
    const validations = blocks(prefix?.body ?? '', 'validation');
    const withoutIds = validations.find((validation) =>
      /^can\(regex\("\^repo:.*@\[0-9\]\+\/.*@\[0-9\]\+\$", var\.github_subject_prefix\)\)$/.test(
        blockArguments(validation.body).condition ?? '',
      ),
    );
    expect(withoutIds, 'a validation refuses a prefix without the IDs').toBeDefined();

    const message = unquoted(blockArguments(withoutIds?.body ?? '').error_message) ?? '';
    expect(message).toContain('sub_claim_prefix');
    expect(message).toContain('gh api repos/<owner>/<repo>/actions/oidc/customization/sub');
  });
});
