/**
 * Architecture rules, run by `npm run lint:architecture` as `depcruise src --ignore-known`.
 * A violation listed in .dependency-cruiser-known-violations.json is tolerated and any other one
 * fails the build. The list shrinks as each module migrates and is empty when the feature ends.
 *
 * Type-only imports count (`tsPreCompilationDeps`): the compiler drops them, but the source still
 * depends on the file they name.
 *
 * dependency-cruiser rejects a regular expression with a quantified group that holds a quantifier,
 * so the layer patterns spell out the three folder depths instead of making one segment optional.
 */

// A layer folder (`domain`, `application`, `infrastructure`, `presentation`) sits under `shared`,
// directly under a module, or under one area of the identity module.
const LAYER_FOLDER = '^src/(?:shared/|modules/[^/]+/|modules/[^/]+/[^/]+/)';
const CORE = `${LAYER_FOLDER}(?:domain|application)/`;
const DOMAIN = `${LAYER_FOLDER}domain/`;
const APPLICATION = `${LAYER_FOLDER}application/`;
const OUTER = `${LAYER_FOLDER}(?:infrastructure|presentation)/`;

// `resolved` is relative to the directory the cruise runs in, so a package outside it keeps its
// leading `../`. Type packages count as the package they describe.
const BANNED_PACKAGES = [
  '(?:^|/)node_modules/(?:@types/)?(?:',
  '@nestjs/[^/]+|typeorm|ioredis|argon2|pg|express|class-validator|class-transformer|zod|rxjs',
  ')(?:/|$)',
].join('');

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: 'Files that import one another in a loop cannot change or load apart.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'core-no-frameworks',
      comment:
        'domain and application code, specs included, imports no framework or infrastructure package.',
      severity: 'error',
      from: { path: CORE },
      to: { path: BANNED_PACKAGES },
    },
    {
      name: 'core-no-frameworks',
      comment: 'domain and application code, specs included, imports no Node.js module.',
      severity: 'error',
      from: { path: CORE },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'core-stays-in-module',
      comment:
        'domain and application code reaches another module only through a port of its own, never by import.',
      severity: 'error',
      from: {
        path: '^src/modules/([^/]+)/(?:(?:domain|application)/|[^/]+/(?:domain|application)/)',
      },
      to: { path: '^src/modules/', pathNot: '^src/modules/$1/' },
    },
    {
      name: 'through-public-api',
      comment: 'A module imports another module only through that module index.ts.',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/[^/]+/',
        pathNot: ['^src/modules/$1/', '^src/modules/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'inward-only',
      comment: 'domain and application code never imports infrastructure or presentation code.',
      severity: 'error',
      from: { path: CORE },
      to: { path: OUTER },
    },
    {
      name: 'inward-only',
      comment: 'domain code never imports application code.',
      severity: 'error',
      from: { path: DOMAIN },
      to: { path: APPLICATION },
    },
    {
      name: 'shared-is-a-leaf',
      comment: 'src/shared imports nothing from src/modules.',
      severity: 'error',
      from: { path: '^src/shared/' },
      to: { path: '^src/modules/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['main', 'types', 'typings'],
    },
  },
};
