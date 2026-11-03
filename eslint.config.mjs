import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import tseslint from 'typescript-eslint';

const CORE_BANNED_IMPORTS = [
  '@nestjs/*',
  'typeorm',
  'ioredis',
  'argon2',
  'pg',
  'class-validator',
  'class-transformer',
  'zod',
  'express',
  'node:*',
  'rxjs',
  'rxjs/*',
];

// A module listed in this file takes the full set of bans below on its domain and application code,
// specs included. Every module is listed, so the bans cover src/**, and core-purity.spec.ts fails
// when a module under src/modules is missing from the list.
const migratedModules = JSON.parse(
  readFileSync(join(import.meta.dirname, 'scripts/architecture/migrated-modules.json'), 'utf8'),
);
const migratedCoreFiles = migratedModules.flatMap((name) => {
  const root = name === 'shared' ? 'src/shared' : `src/modules/${name}`;
  return [`${root}/**/domain/**/*.ts`, `${root}/**/application/**/*.ts`];
});

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      '.dependency-cruiser.cjs',
      'test/architecture/fixtures/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/**/domain/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: CORE_BANNED_IMPORTS,
              message: 'Domain code must not depend on frameworks or infrastructure.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/application/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'typeorm',
                '@nestjs/typeorm',
                'ioredis',
                'argon2',
                'pg',
                '@nestjs/jwt',
                'express',
              ],
              message: 'Application code must depend on ports, not on infrastructure.',
            },
          ],
        },
      ],
    },
  },
  // An ESLint block with an empty `files` list is invalid, so the block exists once a module is listed.
  ...(migratedCoreFiles.length === 0
    ? []
    : [
        {
          files: migratedCoreFiles,
          rules: {
            'no-restricted-imports': [
              'error',
              {
                patterns: [
                  {
                    group: CORE_BANNED_IMPORTS,
                    message: 'The core must not depend on frameworks or infrastructure.',
                  },
                ],
              },
            ],
            'no-restricted-syntax': [
              'error',
              {
                selector: 'Decorator',
                message: 'The core carries no decorators. Wire it in the composition root.',
              },
              {
                selector: "CallExpression[callee.name='Symbol']",
                message: 'Injection tokens live next to the composition root, never in the core.',
              },
            ],
          },
        },
      ]),
  {
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    files: ['scripts/**/*.ts', 'security/scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.mjs', '**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // k6 runs these scripts in its own JavaScript runtime, which supplies __ENV, __VU and __ITER and
    // resolves imports such as k6/http itself.
    files: ['k6/**/*.js'],
    languageOptions: {
      globals: { __ENV: 'readonly', __VU: 'readonly', __ITER: 'readonly' },
    },
    rules: { '@typescript-eslint/explicit-function-return-type': 'off' },
  },
  prettier,
);
