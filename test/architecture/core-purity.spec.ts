import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const FIXTURES = resolve(__dirname, 'fixtures/core-purity');

// The packages the core never imports, besides `@nestjs/*` and `node:*` (CA-01).
const BANNED_PACKAGES = [
  'typeorm',
  'ioredis',
  'argon2',
  'pg',
  'express',
  'class-validator',
  'class-transformer',
  'zod',
  'rxjs',
];

function isBanned(specifier: string): boolean {
  return (
    specifier.startsWith('@nestjs/') ||
    specifier.startsWith('node:') ||
    BANNED_PACKAGES.some((name) => specifier === name || specifier.startsWith(`${name}/`))
  );
}

function directoryOf(module: string): string {
  return module === 'shared' ? 'src/shared' : `src/modules/${module}`;
}

function typeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return typeScriptFiles(path);
    }
    return path.endsWith('.ts') ? [path] : [];
  });
}

// The files of a module under a `domain` or `application` folder, the ones of an identity area too.
function coreFiles(root: string, module: string): string[] {
  const base = join(root, directoryOf(module));
  return typeScriptFiles(base).filter((path) =>
    relative(base, path)
      .split(sep)
      .slice(0, -1)
      .some((folder) => folder === 'domain' || folder === 'application'),
  );
}

function importedModule(node: ts.Node): string | undefined {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier !== undefined &&
    ts.isStringLiteral(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier.text;
  }
  if (
    ts.isImportEqualsDeclaration(node) &&
    ts.isExternalModuleReference(node.moduleReference) &&
    ts.isStringLiteral(node.moduleReference.expression)
  ) {
    return node.moduleReference.expression.text;
  }
  if (ts.isCallExpression(node) && node.arguments.length === 1) {
    const [argument] = node.arguments;
    const isLoader =
      node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === 'require');
    return isLoader && ts.isStringLiteral(argument) ? argument.text : undefined;
  }
  if (
    ts.isImportTypeNode(node) &&
    ts.isLiteralTypeNode(node.argument) &&
    ts.isStringLiteral(node.argument.literal)
  ) {
    return node.argument.literal.text;
  }
  return undefined;
}

function problemsIn(path: string): string[] {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const problems: string[] = [];
  const visit = (node: ts.Node): void => {
    const specifier = importedModule(node);
    if (specifier !== undefined && isBanned(specifier)) {
      problems.push(`imports ${specifier}`);
    }
    if (ts.isDecorator(node)) {
      problems.push(`carries the decorator @${node.expression.getText(source)}`);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Symbol'
    ) {
      problems.push('declares a token with Symbol()');
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return problems;
}

// Every problem in the domain and application code of the listed modules, specs included.
function scanCore(root: string, modules: readonly string[]): string[] {
  return modules
    .flatMap((module) => coreFiles(root, module))
    .flatMap((path) => {
      const file = relative(root, path).split(sep).join('/');
      return problemsIn(path).map((problem) => `${file}: ${problem}`);
    })
    .sort();
}

const migratedModules = JSON.parse(
  readFileSync(resolve(ROOT, 'scripts/architecture/migrated-modules.json'), 'utf8'),
) as string[];

describe('core purity', () => {
  it('reports a banned package or Node.js import, in a spec, as a type, a re-export, a dynamic import or a require', () => {
    expect(scanCore(resolve(FIXTURES, 'imports'), ['alpha'])).toEqual([
      'src/modules/alpha/application/loads-rxjs.ts: imports rxjs',
      'src/modules/alpha/application/operators.spec.ts: imports rxjs/operators',
      'src/modules/alpha/application/reexports-zod.ts: imports zod',
      'src/modules/alpha/application/uses-nest.ts: imports @nestjs/common',
      'src/modules/alpha/application/uses-orm-type.ts: imports typeorm',
      'src/modules/alpha/application/uses-packages.ts: imports argon2',
      'src/modules/alpha/application/uses-packages.ts: imports class-transformer',
      'src/modules/alpha/application/uses-packages.ts: imports class-validator',
      'src/modules/alpha/application/uses-packages.ts: imports express',
      'src/modules/alpha/application/uses-packages.ts: imports ioredis',
      'src/modules/alpha/application/uses-packages.ts: imports pg',
      'src/modules/alpha/domain/requires-express.ts: imports express',
      'src/modules/alpha/domain/uses-node.ts: imports node:crypto',
    ]);
  });

  it('reports a decorator on a class, a method and a constructor parameter, in application and domain code', () => {
    expect(scanCore(resolve(FIXTURES, 'decorators'), ['alpha'])).toEqual([
      'src/modules/alpha/application/decorated-class.ts: carries the decorator @Sealed()',
      "src/modules/alpha/application/decorated-members.ts: carries the decorator @Inject('dependency')",
      'src/modules/alpha/application/decorated-members.ts: carries the decorator @Logged()',
      'src/modules/alpha/domain/decorated-entity.ts: carries the decorator @Sealed()',
    ]);
  });

  it('reports a Symbol() token, in a module and in shared', () => {
    expect(scanCore(resolve(FIXTURES, 'symbols'), ['alpha', 'shared'])).toEqual([
      'src/modules/alpha/application/tokens.ts: declares a token with Symbol()',
      'src/shared/application/shared-token.ts: declares a token with Symbol()',
    ]);
  });

  it('reports nothing for a pure core, whatever its infrastructure holds', () => {
    expect(scanCore(resolve(FIXTURES, 'pure'), ['alpha'])).toEqual([]);
  });

  it('scans only the listed modules', () => {
    const root = resolve(FIXTURES, 'unlisted');

    expect(scanCore(root, ['alpha'])).toEqual([]);
    expect(scanCore(root, ['beta'])).toEqual([
      'src/modules/beta/application/impure.ts: imports @nestjs/common',
    ]);
  });

  it('lists only modules that exist', () => {
    expect(
      migratedModules.filter((module) => !existsSync(join(ROOT, directoryOf(module)))),
    ).toEqual([]);
  });

  it('keeps the domain and application code of every listed module pure', () => {
    expect(scanCore(ROOT, migratedModules)).toEqual([]);
  });
});
