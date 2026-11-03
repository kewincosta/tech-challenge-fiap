import { readdirSync } from 'node:fs';
import { join } from 'node:path';
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

/** Every file under a folder of infra that is committed and can name an account. */
function filesToScan(relative = ''): string[] {
  return readdirSync(join(INFRA, relative), { withFileTypes: true }).flatMap((entry) => {
    const path = join(relative, entry.name);
    if (entry.isDirectory()) {
      return ['.terraform', 'tests'].includes(entry.name) ? [] : filesToScan(path);
    }
    return entry.name === '.terraform.lock.hcl' ? [] : [path];
  });
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
