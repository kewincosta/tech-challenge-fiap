import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

/**
 * Module cycle check, run by `npm run lint:architecture` after the table check.
 *
 * `no-circular` in dependency-cruiser sees a cycle only when it closes file by file. Two modules
 * depend on each other as soon as a file of one imports a file of the other and a different file
 * of the other imports back, with no loop between the files. This check takes the graph that
 * dependency-cruiser builds from .dependency-cruiser.cjs, type-only imports included, collapses it
 * to modules (each folder under `src/modules`, and `src/shared`) and fails on every cycle between
 * them. Files outside those folders, such as `app.module.ts` and `src/config`, stay out of the
 * graph. There is no known list: the module graph has no cycle once `identity` exists.
 *
 * dependency-cruiser has no module-level cycle rule. Its folder-scoped `circular` rule compares the
 * directories that hold the imported files (`src/modules/beta/domain`), so it misses a cycle
 * between `src/modules/alpha` and `src/modules/beta` unless both sides land in one directory.
 */

const run = promisify(execFile);

const DEPCRUISE = resolve(
  __dirname,
  '../../node_modules/dependency-cruiser/bin/dependency-cruiser.mjs',
);
const CONFIG = resolve(__dirname, '../../.dependency-cruiser.cjs');
const MODULE_FOLDER = /^(src\/modules\/[^/]+|src\/shared)\//;
// The cruise output of the whole tree is a few megabytes, above the default buffer of execFile.
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

export interface CruisedModule {
  source: string;
  dependencies?: Array<{ resolved: string; circular?: boolean }>;
}

/** One dependency between two modules, with a file that imports and the file it imports. */
interface Step {
  from: string;
  to: string;
  importer: string;
  imported: string;
}

type ModuleGraph = Map<string, Map<string, Step>>;

export function moduleOf(file: string): string | null {
  return MODULE_FOLDER.exec(file)?.[1] ?? null;
}

function count(amount: number, one: string, many: string): string {
  return `${amount} ${amount === 1 ? one : many}`;
}

function label(name: string): string {
  return name.replace(/^src\/(modules\/)?/, '');
}

/** The graph dependency-cruiser builds for the tree under `root`, every cruised file included. */
export async function cruise(root: string): Promise<CruisedModule[]> {
  const { stdout } = await run(
    process.execPath,
    [DEPCRUISE, '--config', CONFIG, '--output-type', 'json', 'src'],
    { cwd: root, maxBuffer: MAX_OUTPUT_BYTES },
  );
  return (JSON.parse(stdout) as { modules: CruisedModule[] }).modules;
}

function precedes(a: Step, b: Step): boolean {
  return `${a.importer}\t${a.imported}` < `${b.importer}\t${b.imported}`;
}

/** An edge for each pair of modules where a file of one imports a file of the other. */
export function moduleGraph(modules: readonly CruisedModule[]): ModuleGraph {
  const graph: ModuleGraph = new Map();
  const edgesOf = (name: string): Map<string, Step> => {
    if (!graph.has(name)) {
      graph.set(name, new Map());
    }
    return graph.get(name)!;
  };
  for (const { source, dependencies = [] } of modules) {
    const from = moduleOf(source);
    if (from === null) {
      continue;
    }
    const edges = edgesOf(from);
    for (const { resolved } of dependencies) {
      const to = moduleOf(resolved);
      if (to === null || to === from) {
        continue;
      }
      edgesOf(to);
      const step: Step = { from, to, importer: source, imported: resolved };
      const known = edges.get(to);
      if (known === undefined || precedes(step, known)) {
        edges.set(to, step);
      }
    }
  }
  return graph;
}

/** The fewest dependencies that lead from one module to another, in a stable order. */
function shortestPath(graph: ModuleGraph, start: string, goal: string): Step[] | null {
  const arrivedBy = new Map<string, Step>();
  const queue = [start];
  const seen = new Set(queue);
  for (let head = 0; head < queue.length && !arrivedBy.has(goal); head += 1) {
    const edges = [...(graph.get(queue[head])?.entries() ?? [])].sort(([a], [b]) =>
      a < b ? -1 : 1,
    );
    for (const [next, step] of edges) {
      if (!seen.has(next)) {
        seen.add(next);
        arrivedBy.set(next, step);
        queue.push(next);
      }
    }
  }
  const path: Step[] = [];
  for (let current = goal; current !== start;) {
    const step = arrivedBy.get(current);
    if (step === undefined) {
      return null;
    }
    path.unshift(step);
    current = step.from;
  }
  return path;
}

/** Every dependency that closes a cycle gives its shortest cycle; rotations of one cycle count once. */
export function findCycles(graph: ModuleGraph): Step[][] {
  const cycles = new Map<string, Step[]>();
  for (const edges of graph.values()) {
    for (const step of edges.values()) {
      const way = shortestPath(graph, step.to, step.from);
      if (way === null) {
        continue;
      }
      const cycle = [step, ...way];
      const first = cycle.reduce(
        (low, next, index) => (next.from < cycle[low].from ? index : low),
        0,
      );
      const rotated = [...cycle.slice(first), ...cycle.slice(0, first)];
      cycles.set(rotated.map((each) => each.from).join(' '), rotated);
    }
  }
  return [...cycles.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, cycle]) => cycle);
}

function describe(cycle: Step[]): string[] {
  const route = [...cycle.map((step) => label(step.from)), label(cycle[0].from)].join(' -> ');
  return [
    `Dependency cycle between modules: ${route}`,
    ...cycle.map(
      (step) =>
        `  ${label(step.from)} -> ${label(step.to)}: ${step.importer} imports ${step.imported}`,
    ),
  ];
}

/** Exit code 1 means a cycle between modules in the tree under `root`. */
export async function checkModuleCycles(
  root: string,
): Promise<{ exitCode: number; report: string[] }> {
  const graph = moduleGraph(await cruise(root));
  const cycles = findCycles(graph);
  if (cycles.length === 0) {
    const dependencies = [...graph.values()].reduce((sum, edges) => sum + edges.size, 0);
    return {
      exitCode: 0,
      report: [
        `No dependency cycle between modules found (${count(graph.size, 'module', 'modules')}, ${count(dependencies, 'dependency', 'dependencies')} between them).`,
      ],
    };
  }
  return {
    exitCode: 1,
    report: [
      ...cycles.flatMap(describe),
      `${count(cycles.length, 'dependency cycle', 'dependency cycles')} between modules found.`,
    ],
  };
}

async function main(): Promise<void> {
  const { exitCode, report } = await checkModuleCycles(resolve(__dirname, '../..'));
  for (const line of report) {
    if (exitCode === 0) {
      console.log(line);
    } else {
      console.error(line);
    }
  }
  process.exitCode = exitCode;
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
