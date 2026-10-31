import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);

const ROOT = resolve(__dirname, '../..');
const DEPCRUISE = resolve(ROOT, 'node_modules/dependency-cruiser/bin/dependency-cruiser.mjs');
const CONFIG = resolve(ROOT, '.dependency-cruiser.cjs');
const FIXTURES = resolve(__dirname, 'fixtures/dependency-rules');
const FIXTURE_NAMES = [
  'circular',
  'core-no-frameworks',
  'core-stays-in-module',
  'through-public-api',
  'inward-only',
  'shared-is-a-leaf',
  'allowed',
] as const;

interface Violation {
  rule: { name: string; severity: string };
  from: string;
  to: string;
  cycle?: Array<{ name: string }>;
}

// Each fixture is a small `src` tree. The cruise runs inside it, so the rules, whose paths start at
// `src`, match the fixture the way they match the real tree.
async function cruise(fixture: string): Promise<Violation[]> {
  const { stdout } = await run(
    process.execPath,
    [DEPCRUISE, '--config', CONFIG, '--output-type', 'json', 'src'],
    { cwd: resolve(FIXTURES, fixture) },
  );
  return (JSON.parse(stdout) as { summary: { violations: Violation[] } }).summary.violations;
}

// A package keeps only its name, because its resolved path depends on how deep the fixture sits.
function target(path: string): string {
  return /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(path)?.[1] ?? path;
}

function summarize(violations: Violation[]): string[] {
  return violations
    .map((violation) => `${violation.rule.name}: ${violation.from} -> ${target(violation.to)}`)
    .sort();
}

const violationsOf = new Map<string, Violation[]>();

beforeAll(async () => {
  const results = await Promise.all(FIXTURE_NAMES.map((name) => cruise(name)));
  FIXTURE_NAMES.forEach((name, index) => violationsOf.set(name, results[index]));
}, 60_000);

describe('dependency-cruiser rules', () => {
  it('reports a cycle between modules, type-only imports included, naming every file in it', () => {
    const violations = violationsOf.get('circular')!;

    expect(violations.map((violation) => violation.rule.name)).toEqual(['no-circular']);
    expect(violations[0].cycle!.map((file) => file.name).sort()).toEqual([
      'src/modules/alpha/index.ts',
      'src/modules/alpha/infrastructure/alpha-gateway.ts',
      'src/modules/beta/index.ts',
      'src/modules/beta/infrastructure/beta-gateway.ts',
    ]);
  });

  it('reports a framework, infrastructure or Node.js import in domain and application code, specs and type-only imports included', () => {
    expect(summarize(violationsOf.get('core-no-frameworks')!)).toEqual([
      'core-no-frameworks: src/modules/alpha/application/uses-nest.ts -> @nestjs/common',
      'core-no-frameworks: src/modules/alpha/application/uses-orm-type.ts -> typeorm',
      'core-no-frameworks: src/modules/alpha/application/uses-packages.ts -> argon2',
      'core-no-frameworks: src/modules/alpha/application/uses-packages.ts -> class-transformer',
      'core-no-frameworks: src/modules/alpha/application/uses-packages.ts -> class-validator',
      'core-no-frameworks: src/modules/alpha/application/uses-packages.ts -> express',
      'core-no-frameworks: src/modules/alpha/application/uses-packages.ts -> ioredis',
      'core-no-frameworks: src/modules/alpha/application/uses-packages.ts -> pg',
      'core-no-frameworks: src/modules/alpha/application/uses-rxjs.spec.ts -> rxjs',
      'core-no-frameworks: src/modules/alpha/domain/uses-node.ts -> crypto',
      'core-no-frameworks: src/shared/application/uses-zod.ts -> zod',
    ]);
  });

  it('reports domain and application code that imports another module, but not its own module or area', () => {
    expect(summarize(violationsOf.get('core-stays-in-module')!)).toEqual([
      'core-stays-in-module: src/modules/alpha/application/calls-beta.ts -> src/modules/beta/index.ts',
      'core-stays-in-module: src/modules/gamma/users/application/calls-beta.ts -> src/modules/beta/index.ts',
    ]);
  });

  it('reports an import of another module that skips its index.ts, and accepts the index.ts', () => {
    expect(summarize(violationsOf.get('through-public-api')!)).toEqual([
      'through-public-api: src/modules/alpha/infrastructure/deep-gateway.ts -> src/modules/beta/application/run.ts',
      'through-public-api: src/modules/alpha/infrastructure/tokens-gateway.ts -> src/modules/beta/beta.tokens.ts',
      'through-public-api: src/modules/alpha/presentation/deep-controller.ts -> src/modules/beta/application/run.ts',
    ]);
  });

  it('reports an import of a file at the root of another module other than its index.ts', () => {
    const rootImports = summarize(violationsOf.get('through-public-api')!).filter((line) =>
      line.endsWith('-> src/modules/beta/beta.tokens.ts'),
    );

    expect(rootImports).toEqual([
      'through-public-api: src/modules/alpha/infrastructure/tokens-gateway.ts -> src/modules/beta/beta.tokens.ts',
    ]);
  });

  it('reports domain or application code that imports an outer layer, and domain code that imports application code', () => {
    expect(summarize(violationsOf.get('inward-only')!)).toEqual([
      'inward-only: src/modules/alpha/application/use-case.ts -> src/modules/alpha/infrastructure/repo.ts',
      'inward-only: src/modules/alpha/application/web-use-case.ts -> src/modules/alpha/presentation/controller.ts',
      'inward-only: src/modules/alpha/domain/entity.ts -> src/modules/alpha/application/port.ts',
      'inward-only: src/modules/alpha/domain/orm-entity.ts -> src/modules/alpha/infrastructure/repo.ts',
      'inward-only: src/shared/application/shared-port.ts -> src/shared/infrastructure/impl.ts',
    ]);
  });

  it('reports a shared file that imports a module, and accepts a module that imports shared', () => {
    expect(summarize(violationsOf.get('shared-is-a-leaf')!)).toEqual([
      'shared-is-a-leaf: src/shared/infrastructure/registry.ts -> src/modules/alpha/index.ts',
    ]);
  });

  it('reports nothing for the imports the layers and modules allow', () => {
    expect(violationsOf.get('allowed')).toEqual([]);
  });

  it('fails the build on every violation of every rule', () => {
    const severities = FIXTURE_NAMES.flatMap((name) =>
      violationsOf.get(name)!.map((violation) => violation.rule.severity),
    );

    expect(new Set(severities)).toEqual(new Set(['error']));
  });

  it('exits non-zero and names the file and the rule of a violation', async () => {
    const failure = await run(process.execPath, [DEPCRUISE, '--config', CONFIG, 'src'], {
      cwd: resolve(FIXTURES, 'core-no-frameworks'),
    }).then(
      () => ({ code: 0, stdout: '' }),
      (error: { code: number; stdout: string }) => error,
    );

    expect(failure.code).toBeGreaterThan(0);
    expect(failure.stdout).toContain('core-no-frameworks');
    expect(failure.stdout).toContain('src/modules/alpha/application/uses-nest.ts');
  });

  it('passes on the source tree apart from its known violations', async () => {
    const { stdout } = await run(process.execPath, [DEPCRUISE, 'src', '--ignore-known'], {
      cwd: ROOT,
    });

    expect(stdout).toContain('no dependency violations found');
  }, 60_000);
});
