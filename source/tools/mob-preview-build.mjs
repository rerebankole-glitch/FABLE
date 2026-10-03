// Bundles the mob-model entry point for tools/mob-preview.mjs, with three.js replaced by a stub so
// the model builders run in plain node.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints: [join(here, 'mob-preview-entry.ts')],
  bundle: true, platform: 'node', format: 'esm', outfile: 'dist/mob-preview-src.mjs',
  logLevel: 'warning', external: ['@napi-rs/canvas'],
  alias: { three: join(here, 'three-stub.js') },
  define: { 'import.meta.url': '"file:///home/user/FABLE/source/tools/mob-preview-entry.ts"' },
});
