// Writes the FABLE title mark (the same generator the in-game menu uses) to site/assets/logo.svg
// and a 512px PNG-ready icon SVG. Run: npx esbuild tools/export-logo.ts --bundle --platform=node --format=esm --outfile=dist/export-logo.mjs && node dist/export-logo.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { logoSvg } from '../src/ui/Logo';

mkdirSync('site/assets', { recursive: true });
const { svg, W, H } = logoSvg('FABLE');
writeFileSync('site/assets/logo.svg', svg);
// square app icon: a grass block with the F glyph, 16-px grid
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
<rect width="16" height="16" fill="#5a3d22"/><rect width="16" height="5" fill="#6a9b3a"/><rect y="4" width="16" height="1" fill="#4f7c2a"/>
<rect x="2" y="7" width="2" height="2" fill="#443016"/><rect x="10" y="10" width="3" height="2" fill="#443016"/><rect x="6" y="12" width="2" height="1" fill="#6b4a2a"/>
<g fill="#e8ce8c"><rect x="5" y="6" width="6" height="1"/><rect x="5" y="7" width="2" height="7"/><rect x="7" y="9" width="3" height="1"/></g>
<g fill="#8a6a3a"><rect x="5" y="13" width="2" height="1"/><rect x="10" y="6" width="1" height="1"/></g></svg>`;
writeFileSync('site/assets/icon.svg', icon);
console.log('logo', W, H, 'written');
