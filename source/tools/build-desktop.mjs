// Prepares desktop/app (the game bundle) and desktop/build icons from site/assets. Run after `npm run build`.
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
const root = new URL('..', import.meta.url).pathname;
const game = join(root, 'dist', 'index.html');
if (!existsSync(game)) { console.error('dist/index.html missing - run `npm run build` first'); process.exit(1); }
mkdirSync(join(root, 'desktop', 'app'), { recursive: true });
cpSync(game, join(root, 'desktop', 'app', 'index.html'));
if (existsSync(join(root, 'dist', 'assets'))) cpSync(join(root, 'dist', 'assets'), join(root, 'desktop', 'app', 'assets'), { recursive: true });
cpSync(join(root, 'site', 'assets', 'icon-512.png'), join(root, 'desktop', 'build', 'icon-512.png'));
cpSync(join(root, 'site', 'assets', 'icon-512.png'), join(root, 'desktop', 'build', 'icon.png'));
// .ico (Windows) and .icns (macOS) via Pillow when available; electron-builder can also derive them from icon.png
try {
  execSync(`python3 -c "
from PIL import Image
im=Image.open('${join(root, 'site', 'assets', 'icon-512.png')}')
im.save('${join(root, 'desktop', 'build', 'icon.ico')}', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
im.save('${join(root, 'desktop', 'build', 'icon.icns')}')
"`, { stdio: 'inherit' });
} catch { console.log('(Pillow not available: electron-builder will derive icon.ico/icns from icon.png)'); }
console.log('desktop/app/index.html + desktop/build icons ready');
