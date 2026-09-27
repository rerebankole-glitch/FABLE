import { build } from 'esbuild';
await build({
  entryPoints: ['tests/packload.test.ts'], bundle: true, platform: 'node', format: 'esm',
  outfile: 'dist/packload.test.mjs', logLevel: 'warning', target: 'node20',
  plugins: [{ name: 'worker-stub', setup(b) { b.onResolve({ filter: /worker\?worker&inline$/ }, () => ({ path: new URL('./worker-stub.mjs', import.meta.url).pathname })); } }],
});
