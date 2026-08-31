import swc from 'unplugin-swc';
import type { Plugin } from 'vite';

export function swcPlugin(): Plugin {
  return swc.vite({
    module: { type: 'es6' },
    jsc: {
      target: 'es2022',
      parser: { syntax: 'typescript', decorators: true },
      transform: { legacyDecorator: true, decoratorMetadata: true },
    },
  }) as Plugin;
}
