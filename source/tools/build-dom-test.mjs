// Bundles the DOM inventory suite for node: stubs the vite ?worker&inline import (World.ts)
// and jsdom stays external. Run:  node tools/build-dom-test.mjs && node tests/run-dom.mjs
import { build } from 'esbuild';

await build({
  entryPoints: ['tests/inventory.dom.tsx'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  outfile: 'dist/inventory.dom.test.mjs',
  logLevel: 'error',
  plugins: [{
    name: 'stub-worker',
    setup(b) {
      b.onResolve({ filter: /worker\?worker&inline$/ }, (args) => ({ path: args.path, namespace: 'stubw' }));
      b.onLoad({ filter: /.*/, namespace: 'stubw' }, () => ({ contents: 'export default class {};', loader: 'js' }));
    },
  }],
});
console.log('built dist/inventory.dom.test.mjs');
