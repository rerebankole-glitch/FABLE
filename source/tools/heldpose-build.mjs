import { build } from 'esbuild';
await build({ entryPoints: ['tests/heldpose.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile: 'dist/heldpose.test.mjs', logLevel: 'warning',
  plugins: [{ name: 'stub-worker', setup(b) {
    b.onResolve({ filter: /worker\?worker&inline$/ }, (a) => ({ path: a.path, namespace: 'stubw' }));
    b.onLoad({ filter: /.*/, namespace: 'stubw' }, () => ({ contents: 'export default class {};', loader: 'js' }));
  } }],
});
