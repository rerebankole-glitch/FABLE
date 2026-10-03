import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints: [join(here, 'skin-dump-entry.ts')],
  bundle: true, platform: 'node', format: 'esm', outfile: 'dist/skin-dump-src.mjs',
  logLevel: 'error', external: ['@napi-rs/canvas'],
  alias: { three: join(here, 'three-stub.js') },
});
