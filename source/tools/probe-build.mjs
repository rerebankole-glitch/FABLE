import { build } from 'esbuild';
await build({
  entryPoints: ['/tmp/probe.mts'], bundle: true, platform: 'node', format: 'esm',
  outfile: '/tmp/probe.mjs', logLevel: 'error',
  plugins: [{ name: 'worker-stub', setup(b) { b.onResolve({ filter: /worker\?worker&inline$/ }, () => ({ path: new URL('./worker-stub.mjs', import.meta.url).pathname })); } }],
});
