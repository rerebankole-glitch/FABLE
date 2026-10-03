// Flat 2.5D skin renderer: the projection, the view box and the sheet face layout must all agree
// with the 64x64 vanilla net the 3D model samples, otherwise cards would show stretched or
// clipped art. Pure geometry — no canvas required.
import { FIGURE_BOX, HEAD_BOX, figureBounds, fitScale, viewAspect, FIGURE_ASPECT } from '../src/game/core/SkinRender';
import { skinPartFaceRects, SKIN_SHEET, SKIN_PRESETS, builtinSkinPixels } from '../src/game/core/Skins';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = '') => {
  console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : ''));
  c ? pass++ : fail++;
};

// 1. the view box frames the whole figure (classic and slim) with a margin but no waste
for (const slim of [false, true]) {
  const b = figureBounds(slim);
  const inside = b.minX >= FIGURE_BOX.x && b.maxX <= FIGURE_BOX.x + FIGURE_BOX.w && b.minY >= FIGURE_BOX.y && b.maxY <= FIGURE_BOX.y + FIGURE_BOX.h;
  ok(`bounds ${slim ? 'slim' : 'classic'}: figure fits the view box`, inside, `${b.minX.toFixed(2)}..${b.maxX.toFixed(2)} x ${b.minY.toFixed(2)}..${b.maxY.toFixed(2)}`);
  const fill = ((b.maxX - b.minX) / FIGURE_BOX.w + (b.maxY - b.minY) / FIGURE_BOX.h) / 2;
  ok(`bounds ${slim ? 'slim' : 'classic'}: box is snug (>= 85% filled)`, fill >= 0.85, `${(fill * 100).toFixed(1)}%`);
}

// 2. the head sits above the body and the arms beside it, as in the model
const classic = figureBounds(false);
ok('geometry: figure is taller than wide', classic.maxY - classic.minY > classic.maxX - classic.minX);
// the hat overlay tops out at 32.5 texels and projects K*8.5 further up; the trouser overlay dips
// a quarter texel below the soles
ok('geometry: head reaches the top of the model', classic.maxY > 35.4 && classic.maxY < 35.6, `${classic.maxY.toFixed(2)}`);
ok('geometry: soles sit on y = 0', classic.minY >= -0.3 && classic.minY <= 0.05, `${classic.minY.toFixed(2)}`);

// 3. face rects stay inside the sheet and never collide with each other
for (const slim of [false, true]) {
  const { base, overlay } = skinPartFaceRects(slim);
  const rects = [...Object.values(base), ...Object.values(overlay)].flatMap((p) => [p.front, p.right, p.top]);
  const inSheet = rects.every(([x0, y0, x1, y1]) => x0 >= 0 && y0 >= 0 && x1 <= SKIN_SHEET && y1 <= SKIN_SHEET && x1 > x0 && y1 > y0);
  ok(`faces ${slim ? 'slim' : 'classic'}: every rect is inside the 64x64 sheet`, inSheet);
  const keys = new Set(rects.map((r) => r.join(',')));
  ok(`faces ${slim ? 'slim' : 'classic'}: no two faces share a rect`, keys.size === rects.length, `${keys.size}/${rects.length}`);
  const front = base.body.front;
  ok(`faces ${slim ? 'slim' : 'classic'}: body front is 8x12`, front[2] - front[0] === 8 && front[3] - front[1] === 12);
  ok(`faces ${slim ? 'slim' : 'classic'}: arm width follows the model`, base.rightArm.front[2] - base.rightArm.front[0] === (slim ? 3 : 4));
}
// the slim arm sheet must still sample painted pixels (the nets shift by one column)
for (const id of ['alex', 'rose']) {
  const p = SKIN_PRESETS.find((s) => s.id === id)!;
  const sheet = builtinSkinPixels(p);
  const { base } = skinPartFaceRects(true);
  const [x0, y0, x1] = base.rightArm.front;
  let opaque = 0;
  for (let y = y0; y < y0 + 12; y++) for (let x = x0; x < x1; x++) if (sheet[(y * SKIN_SHEET + x) * 4 + 3] === 255) opaque++;
  ok(`faces slim ${id}: arm front samples opaque pixels`, opaque === (x1 - x0) * 12, `${opaque}`);
}

// 3b. the head view box frames the head overlay (nothing clipped, nothing wasted)
ok('head box: covers the hat overlay', HEAD_BOX.x <= -7.5 && HEAD_BOX.x + HEAD_BOX.w >= 4.68 && HEAD_BOX.y <= 23.32 && HEAD_BOX.y + HEAD_BOX.h >= 35.51);

// 4. sizing helpers
ok('fit: aspect ratio matches the box', Math.abs(FIGURE_ASPECT - viewAspect(FIGURE_BOX)) < 1e-9);
ok('fit: scales to the tighter axis', fitScale(FIGURE_BOX, FIGURE_BOX.w * 10, FIGURE_BOX.h * 20) === 10 && fitScale(FIGURE_BOX, FIGURE_BOX.w * 20, FIGURE_BOX.h * 10) === 10);
ok('fit: never returns a zero/negative scale', fitScale(HEAD_BOX, 0, 0) >= 1);

if (fail > 0) process.exit(1);
console.log(`\n${pass} passed, ${fail} failed`);
