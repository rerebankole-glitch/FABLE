import { build } from 'esbuild';
await build({
  entryPoints: ['tools/playtest.mts'],
  bundle: true, platform: 'node', format: 'esm',
  outfile: 'dist/playtest.mjs', logLevel: 'error',
  plugins: [{
    name: 'worker-stub',
    setup(b) {
      b.onResolve({ filter: /worker\?worker&inline$/ }, () => ({ path: new URL('./worker-stub.mjs', import.meta.url).pathname }));
    },
  }],
});
console.log('built');
