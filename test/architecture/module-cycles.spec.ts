import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { checkModuleCycles, cruise } from '../../scripts/architecture/check-module-cycles';

const ROOT = resolve(__dirname, '../..');
const FIXTURES = resolve(__dirname, 'fixtures/module-cycles');
const FIXTURE_NAMES = [
  'two-modules',
  'three-modules',
  'shared-cycle',
  'acyclic',
  'outside-the-graph',
] as const;

type Outcome = Awaited<ReturnType<typeof checkModuleCycles>>;

const outcomes = new Map<string, Outcome>();
let fileCyclesOfTwoModules: unknown[] = [];

beforeAll(async () => {
  const [fixtures, real, twoModules] = await Promise.all([
    Promise.all(FIXTURE_NAMES.map((name) => checkModuleCycles(resolve(FIXTURES, name)))),
    checkModuleCycles(ROOT),
    cruise(resolve(FIXTURES, 'two-modules')),
  ]);
  FIXTURE_NAMES.forEach((name, index) => outcomes.set(name, fixtures[index]));
  outcomes.set('real tree', real);
  fileCyclesOfTwoModules = twoModules
    .flatMap((file) => file.dependencies ?? [])
    .filter((dependency) => dependency.circular === true);
}, 60_000);

describe('module cycle check', () => {
  it('reports a cycle between two modules that does not close file by file, type-only imports included, naming the files of each step', () => {
    expect(fileCyclesOfTwoModules).toEqual([]);
    expect(outcomes.get('two-modules')).toEqual({
      exitCode: 1,
      report: [
        'Dependency cycle between modules: alpha -> beta -> alpha',
        '  alpha -> beta: src/modules/alpha/application/starts.ts imports src/modules/beta/domain/target.ts',
        '  beta -> alpha: src/modules/beta/infrastructure/returns.ts imports src/modules/alpha/presentation/landing.ts',
        '1 dependency cycle between modules found.',
      ],
    });
  });

  it('reports a cycle between three modules, naming the same first file for a step that has several', () => {
    expect(outcomes.get('three-modules')).toEqual({
      exitCode: 1,
      report: [
        'Dependency cycle between modules: alpha -> beta -> gamma -> alpha',
        '  alpha -> beta: src/modules/alpha/application/also-to-beta.ts imports src/modules/beta/domain/beta-in.ts',
        '  beta -> gamma: src/modules/beta/infrastructure/to-gamma.ts imports src/modules/gamma/domain/gamma-in.ts',
        '  gamma -> alpha: src/modules/gamma/infrastructure/to-alpha.ts imports src/modules/alpha/domain/alpha-in.ts',
        '1 dependency cycle between modules found.',
      ],
    });
  });

  it('counts src/shared as a module', () => {
    expect(outcomes.get('shared-cycle')).toEqual({
      exitCode: 1,
      report: [
        'Dependency cycle between modules: alpha -> shared -> alpha',
        '  alpha -> shared: src/modules/alpha/infrastructure/uses-clock.ts imports src/shared/infrastructure/clock.ts',
        '  shared -> alpha: src/shared/infrastructure/registry.ts imports src/modules/alpha/domain/alpha-in.ts',
        '1 dependency cycle between modules found.',
      ],
    });
  });

  it('passes when the dependencies between modules form no cycle, whatever imports stay inside a module', () => {
    expect(outcomes.get('acyclic')).toEqual({
      exitCode: 0,
      report: [
        'No dependency cycle between modules found (3 modules, 3 dependencies between them).',
      ],
    });
  });

  it('keeps files outside src/modules and src/shared out of the module graph', () => {
    expect(outcomes.get('outside-the-graph')).toEqual({
      exitCode: 0,
      report: ['No dependency cycle between modules found (2 modules, 1 dependency between them).'],
    });
  });

  it('passes on the source tree, whose module graph has no cycle', () => {
    expect(outcomes.get('real tree')?.exitCode).toBe(0);
  });
});
