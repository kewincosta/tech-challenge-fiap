import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { MODULE_OF_FOLDER, TABLE_OWNERS } from './table-owners';

/**
 * Table ownership check, run by `npm run lint:architecture` after dependency-cruiser.
 *
 * Each module queries only its own tables (AD-013). The check reads the SQL held in the string and
 * template literals of every `infrastructure` folder under `src/modules`, and takes the name after
 * FROM, JOIN, INTO and UPDATE as a table. It fails on a table another module owns, a table the
 * owner map does not list and a table name built at runtime, which a text search for the table
 * misses. It also fails on a table a migration creates that the map lacks.
 *
 * A finding listed in known-table-findings.json is tolerated until its module migrates, and the
 * list only shrinks. SQL keywords are upper case across the adapters, so only upper case keywords
 * count: a lower case "from" in a message is not a query.
 */

export type FindingKind =
  'foreign-table' | 'unknown-table' | 'runtime-table' | 'unmapped-migration-table';

export interface Finding {
  file: string;
  kind: FindingKind;
  table: string;
}

const MODULES_DIRECTORY = 'src/modules';
const MIGRATIONS_DIRECTORY = 'src/shared/infrastructure/database/migrations';
const KNOWN_FINDINGS_FILE = resolve(__dirname, 'known-table-findings.json');

// Stands in for each `${...}` of a template literal, so the text keeps its place in the query.
const PLACEHOLDER = '\uE000';
const KEYWORD = /\b(FROM|JOIN|INTO|UPDATE)\b/g;
// The name, or the placeholder, after a keyword. The optional schema prefix is dropped, and a
// name followed by "(" is a function (`FROM unnest(...)`) when the keyword is FROM or JOIN.
const OPERAND = /^\s+(?:(\uE000)|(?:[A-Za-z_]\w*\.)?([A-Za-z_]\w*)(\s*\()?)/;
const COMMON_TABLE_EXPRESSION = /(?:\bWITH(?:\s+RECURSIVE)?|,)\s*([A-Za-z_]\w*)\s+AS\s*\(/g;
const CREATED_TABLE = /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_]\w*)/g;

interface Literal {
  text: string;
  expressions: string[];
}

interface Reference {
  table: string;
  runtime: boolean;
}

function relativePath(root: string, path: string): string {
  return relative(root, path).split(sep).join('/');
}

function typeScriptFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return typeScriptFiles(path);
    }
    return path.endsWith('.ts') ? [path] : [];
  });
}

/** Every string and template literal of the file. Comments are not literals, so they never count. */
function literalsOf(path: string): Literal[] {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const literals: Literal[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      literals.push({ text: node.text, expressions: [] });
    } else if (ts.isTemplateExpression(node)) {
      literals.push({
        text:
          node.head.text +
          node.templateSpans.map((span) => PLACEHOLDER + span.literal.text).join(''),
        expressions: node.templateSpans.map((span) => span.expression.getText(source)),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return literals;
}

function referencesIn({ text, expressions }: Literal): Reference[] {
  const commonTableExpressions = new Set(
    [...text.matchAll(COMMON_TABLE_EXPRESSION)].map((match) => match[1].toLowerCase()),
  );
  const references: Reference[] = [];
  for (const match of text.matchAll(KEYWORD)) {
    const keyword = match[1];
    const before = text.slice(0, match.index);
    const after = text.slice(match.index + keyword.length);
    if (keyword === 'UPDATE' && /\b(?:FOR|KEY|DO)\s+$/.test(before)) {
      continue; // FOR UPDATE, FOR NO KEY UPDATE and DO UPDATE lock or upsert, they name no table
    }
    if (after.trim() === '') {
      // The literal ends at the keyword: the name is appended, as in `'SELECT ... FROM ' + table`.
      references.push({ table: '<concatenated>', runtime: true });
      continue;
    }
    const operand = OPERAND.exec(after);
    if (operand === null) {
      continue;
    }
    if (operand[1] !== undefined) {
      const placeholdersBefore = before.split(PLACEHOLDER).length - 1;
      references.push({ table: `\${${expressions[placeholdersBefore]}}`, runtime: true });
      continue;
    }
    const table = operand[2].toLowerCase();
    const isFunction = operand[3] !== undefined && (keyword === 'FROM' || keyword === 'JOIN');
    if (!isFunction && !commonTableExpressions.has(table)) {
      references.push({ table, runtime: false });
    }
  }
  return references;
}

function moduleOfFile(file: string): string {
  const folder = file.split('/')[2];
  return MODULE_OF_FOLDER[folder] ?? folder;
}

function keyOf(finding: Finding): string {
  return `${finding.file}\t${finding.kind}\t${finding.table}`;
}

function compareFindings(a: Finding, b: Finding): number {
  const [first, second] = [keyOf(a), keyOf(b)];
  if (first === second) {
    return 0;
  }
  return first < second ? -1 : 1;
}

/** Every finding of the tree under `root`, one per adapter, kind and table, in a stable order. */
export function scanTableOwnership(root: string): Finding[] {
  const found = new Map<string, Finding>();
  const add = (finding: Finding): void => {
    found.set(keyOf(finding), finding);
  };

  const adapters = typeScriptFiles(join(root, MODULES_DIRECTORY)).filter((path) => {
    const file = relativePath(root, path);
    return file.includes('/infrastructure/') && !file.endsWith('.spec.ts');
  });
  for (const path of adapters) {
    const file = relativePath(root, path);
    const module = moduleOfFile(file);
    for (const reference of literalsOf(path).flatMap(referencesIn)) {
      if (reference.runtime) {
        add({ file, kind: 'runtime-table', table: reference.table });
      } else if (!Object.hasOwn(TABLE_OWNERS, reference.table)) {
        add({ file, kind: 'unknown-table', table: reference.table });
      } else if (TABLE_OWNERS[reference.table] !== module) {
        add({ file, kind: 'foreign-table', table: reference.table });
      }
    }
  }

  for (const path of typeScriptFiles(join(root, MIGRATIONS_DIRECTORY))) {
    for (const { text } of literalsOf(path)) {
      for (const match of text.matchAll(CREATED_TABLE)) {
        const table = match[1].toLowerCase();
        if (!Object.hasOwn(TABLE_OWNERS, table)) {
          add({ file: relativePath(root, path), kind: 'unmapped-migration-table', table });
        }
      }
    }
  }

  return [...found.values()].sort(compareFindings);
}

function explain(finding: Finding): string {
  switch (finding.kind) {
    case 'foreign-table':
      return `${finding.file}: queries ${finding.table}, a table owned by ${TABLE_OWNERS[finding.table]}`;
    case 'unknown-table':
      return `${finding.file}: queries ${finding.table}, which scripts/architecture/table-owners.ts does not list`;
    case 'runtime-table':
      return `${finding.file}: builds a table name at runtime (${finding.table})`;
    case 'unmapped-migration-table':
      return `${finding.file}: creates ${finding.table}, which scripts/architecture/table-owners.ts does not list`;
  }
}

/** Compares the findings of the tree under `root` with the known ones. Exit code 1 means a new finding. */
export function checkTableOwnership(
  root: string,
  known: readonly Finding[],
): { exitCode: number; report: string[] } {
  const found = scanTableOwnership(root);
  const knownKeys = new Set(known.map(keyOf));
  const fresh = found.filter((finding) => !knownKeys.has(keyOf(finding)));
  const ignored = found.length - fresh.length;

  const report = fresh.map(explain);
  report.push(
    fresh.length > 0
      ? `${fresh.length} table ownership violation(s) found (${ignored} known findings ignored).`
      : `No table ownership violations found (${ignored} known findings ignored).`,
  );
  return { exitCode: fresh.length > 0 ? 1 : 0, report };
}

function main(): void {
  const known = JSON.parse(readFileSync(KNOWN_FINDINGS_FILE, 'utf8')) as Finding[];
  const { exitCode, report } = checkTableOwnership(resolve(__dirname, '../..'), known);
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
  main();
}
