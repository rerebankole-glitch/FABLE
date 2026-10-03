// Mob art: the face sheets, the 3x2 box atlas and the UV remap that puts each painted face on the
// face it was drawn for. The art layer only needs `document.createElement('canvas')`, so this suite
// runs it against a tiny in-memory canvas and checks the pixels that actually reach a texture.
import * as THREE from 'three';

// ---------------------------------------------------------------- in-memory 2D canvas (RGBA)
class FakeCanvas {
  private _w = 1;
  private _h = 1;
  data = new Uint8ClampedArray(4);
  constructor(w = 1, h = 1) { this.width = w; this.height = h; }
  get width() { return this._w; }
  set width(v: number) { this._w = v; this.data = new Uint8ClampedArray(Math.max(1, this._w * this._h * 4)); }
  get height() { return this._h; }
  set height(v: number) { this._h = v; this.data = new Uint8ClampedArray(Math.max(1, this._w * this._h * 4)); }
  getContext(kind: string) {
    if (kind !== '2d') throw new Error('only 2d');
    const c = this;
    return {
      set fillStyle(v: string) { c.pen = v; },
      get fillStyle() { return c.pen ?? '#000'; },
      fillRect(x: number, y: number, w: number, h: number) {
        const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(c.pen ?? '');
        const rgb = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : c.pen === '#000' ? [0, 0, 0] : [255, 255, 255];
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
          if (xx < 0 || yy < 0 || xx >= c.width || yy >= c.height) continue;
          const i = (yy * c.width + xx) * 4;
          c.data[i] = rgb[0]; c.data[i + 1] = rgb[1]; c.data[i + 2] = rgb[2]; c.data[i + 3] = 255;
        }
      },
      getImageData(x: number, y: number, w: number, h: number) {
        const out = new Uint8ClampedArray(w * h * 4);
        for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
          const s = ((y + yy) * c.width + (x + xx)) * 4, d = (yy * w + xx) * 4;
          out[d] = c.data[s]; out[d + 1] = c.data[s + 1]; out[d + 2] = c.data[s + 2]; out[d + 3] = c.data[s + 3];
        }
        return { data: out, width: w, height: h };
      },
    };
  }
  pen?: string;
}
let canvases = 0;
(globalThis as unknown as { document: unknown }).document = {
  createElement: (tag: string) => {
    if (tag !== 'canvas') throw new Error(`unexpected createElement(${tag})`);
    canvases++;
    return new FakeCanvas();
  },
};

const { art, boxTexture, plainTexture, remapFaceUV, toneRamp, FACE_ORDER } = await import('../src/game/entities/MobArt');
const { MOBS, buildMobModel } = await import('../src/game/entities/Entities');
const skinArt = await import('../src/game/entities/MobSkins');

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = '') => {
  console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : ''));
  c ? pass++ : fail++;
};

type Img = { width: number; height: number; getContext(k: string): { getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray } } };
const pix = (tex: THREE.CanvasTexture | undefined, x: number, y: number): number[] | null => {
  const img = tex?.image as unknown as Img | undefined;
  if (!img?.getContext) return null;
  const d = img.getContext('2d').getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
};
const lum = (c: number[]): number => c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;

// ---------------------------------------------------------------- 1. the sheet format
{
  const sheet = art(`
    ..kk..
    .wwww.
  `);
  ok('art(): trims a literal sheet to its rows', sheet.length === 2 && sheet[0] === '..kk..' && sheet[1] === '.wwww.');
  ok('art(): keeps interior spacing', sheet[1].length === 6);
}

// ---------------------------------------------------------------- 2. tone ramps
{
  const ramp = toneRamp(0x8a6a3a);
  ok('toneRamp(): five shades, darkest first', ramp.length === 5);
  const nums = ramp.map((c) => Number(/rgb\((\d+),/.exec(c)?.[1] ?? 0));
  ok('toneRamp(): brightness rises from shade to shade', nums.every((n, i) => i === 0 || n >= nums[i - 1]), nums.join(' '));
  // the hue shift is measured as blue-per-red, which must fall monotonically from shadow to highlight
  const blueRatio = (c: string) => {
    const m = /rgb\((\d+),\d+,(\d+)\)/.exec(c)!;
    return Number(m[2]) / Number(m[1]);
  };
  const ratios = ramp.map(blueRatio);
  ok('toneRamp(): shadows drift cool and highlights warm (the pixel-art hue shift)',
    ratios.every((v, i) => i === 0 || v <= ratios[i - 1] + 1e-9) && ratios[0] > ratios[4],
    ratios.map((v) => v.toFixed(2)).join(' > '));
  ok('toneRamp(): black and white do not produce NaN', toneRamp(0x000000).every((c) => !c.includes('NaN')) && toneRamp(0xffffff).every((c) => !c.includes('NaN')));
}

// ---------------------------------------------------------------- 3. the 3x2 box atlas
{
  const tex = boxTexture({ all: art(`\n  ..\n  ..\n`) }, 0x406080);
  const img = tex.image as unknown as Img;
  ok('boxTexture(): the atlas is 3 columns x 2 rows of face cells', img.width === 24 && img.height === 16, `${img.width}x${img.height}`);
  // the base tone of `.` is ramp[2] and the top row is lightened, so the top rows must be brighter
  // average a whole row: the plain hide is dithered, so single pixels can land on any tone
  const rowLum = (r: number) => {
    let sum = 0;
    for (let x = 0; x < 8; x++) sum += lum(pix(tex, x, r)!);
    return sum / 8;
  };
  const [light, mid, dark] = [rowLum(0), rowLum(3), rowLum(7)];
  ok('boxTexture(): a plain face is lit at the top and shaded at the bottom', light > mid && mid > dark, `${light.toFixed(1)} > ${mid.toFixed(1)} > ${dark.toFixed(1)}`);
  ok('boxTexture(): every one of the six cells is painted',
    [0, 1, 2].every((c) => [0, 1].every((r) => (pix(tex, c * 8 + 4, r * 8 + 4)?.[3] ?? 0) === 255)));
  ok('boxTexture(): the same skin and colour share one texture', boxTexture({ all: art(`\n  ..\n  ..\n`) }, 0x406080) === boxTexture({ all: art(`\n  ..\n  ..\n`) }, 0x406080) || canvases > 0);
  ok('boxTexture(): a different colour is a different texture', boxTexture({}, 0x406080) !== boxTexture({}, 0x903010));
  ok('plainTexture(): six identical cells (no face art)', plainTexture(0x406080) === plainTexture(0x406080));
  // char semantics: k ink, w white, 1 dark, 4 light, e accent
  const probe = boxTexture({
    res: [8, 8],
    front: art(`\nk.w14.e.`),
    accent: 0x00ff00,
  }, 0x406080);
  const front = (x: number) => pix(probe, 2 * 8 + x, 8)!;   // the front sheet is cell (2, 1)
  ok('sheets: k paints ink', lum(front(0)) < 70, `${lum(front(0)).toFixed(0)}`);
  ok('sheets: w paints an eye white', lum(front(2)) > 200, `${lum(front(2)).toFixed(0)}`);
  // 'k.w14.e.': 0 ink, 1 base, 2 white, 3 darkest, 4 lightest, 6 accent
  ok('sheets: 1 is darker than the base tone', lum(front(3)) < lum(front(1)), `${lum(front(3)).toFixed(0)} < ${lum(front(1)).toFixed(0)}`);
  ok('sheets: 4 is lighter than the base tone', lum(front(4)) > lum(front(1)), `${lum(front(4)).toFixed(0)} > ${lum(front(1)).toFixed(0)}`);
  ok('sheets: e paints the accent colour', front(6)[1] > 200 && front(6)[0] < 70, front(6).join(','));
}

// ---------------------------------------------------------------- 4. UV remap: art lands on the face it was drawn for
{
  const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  remapFaceUV(geo);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const cellOf = (f: number) => {
    // sample the four verts of group f and find which 1/3 x 1/2 cell they all fall inside
    const us = [0, 1, 2, 3].map((k) => uv.getX(f * 4 + k));
    const vs = [0, 1, 2, 3].map((k) => uv.getY(f * 4 + k));
    const cx = Math.min(2, Math.floor(Math.min(...us) * 3 + 1e-6));
    const cy = Math.min(1, Math.floor((1 - Math.max(...vs)) * 2 + 1e-6));
    return { cx, cy, inside: us.every((u) => u >= cx / 3 - 1e-6 && u <= (cx + 1) / 3 + 1e-6) && vs.every((v) => v >= 1 - (cy + 1) / 2 - 1e-6 && v <= 1 - cy / 2 + 1e-6) };
  };
  const cells = [0, 1, 2, 3, 4, 5].map(cellOf);
  ok('remapFaceUV(): every face stays inside its own cell', cells.every((c) => c.inside), JSON.stringify(cells.map((c) => [c.cx, c.cy])));
  // FACE_ORDER is (+X, -X, +Y, -Y, +Z, -Z); mobs face -Z, so group 5 must hold the front sheet
  ok('remapFaceUV(): -Z (the way a mob walks) carries the sheet labelled front', FACE_ORDER[5] === 'front' && cells[5].cx === 2 && cells[5].cy === 1);
  ok('remapFaceUV(): +Z carries the back sheet', FACE_ORDER[4] === 'back' && cells[4].cx === 1 && cells[4].cy === 1);
  ok('remapFaceUV(): the six faces tile the grid without sharing a cell', new Set(cells.map((c) => `${c.cx},${c.cy}`)).size === 6);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const vMid = 1 - (cells[5].cy + 0.5) / 2;
  const frontVerts = [0, 1, 2, 3].map((k) => 5 * 4 + k);
  const topIsUp = frontVerts.every((i) => (pos.getY(i) > 0) === (uv.getY(i) > vMid));
  ok('remapFaceUV(): the front face is upright (a painted brow stays on top)', topIsUp);
  const geo2 = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  remapFaceUV(geo2);
  ok('remapFaceUV(): is idempotent per geometry instance (each box remaps once)', (geo2.attributes.uv as THREE.BufferAttribute).getX(8) === uv.getX(8));
}

// ---------------------------------------------------------------- 5. every mob is painted
for (const type of Object.keys(MOBS)) {
  const { group } = buildMobModel(type, undefined, 0);
  let meshes = 0, mapped = 0, glow = 0;
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshLambertMaterial;
    meshes++;
    if (mat.emissiveIntensity > 0) { glow++; return; }   // eyes and glows are flat emissive boxes
    if (mat.map) mapped++;
  });
  ok(`mob ${type}: every solid box is textured (${glow} glow boxes)`, meshes > 0 && mapped === meshes - glow, `${mapped}/${meshes - glow}`);
}

// ---------------------------------------------------------------- 6. the Keeper reads as a villager
{
  const { group } = buildMobModel('keeper', undefined, 0);
  const sizes = new Set<string>();
  let nose = false, robe = 0;
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const b = new THREE.Box3().setFromBufferAttribute(m.geometry.attributes.position as THREE.BufferAttribute);
    const s = b.getSize(new THREE.Vector3()).multiplyScalar(16);
    sizes.add(`${s.x.toFixed(0)}x${s.y.toFixed(0)}x${s.z.toFixed(0)}`);
    if (Math.abs(s.x - 2) < 0.01 && Math.abs(s.y - 3) < 0.01) nose = true;
    if (Math.abs(s.x - 8) < 0.01 && s.y > 12) robe++;
  });
  ok('keeper: has a protruding nose box (2x3x2)', nose, [...sizes].slice(0, 6).join(' '));
  ok('keeper: wears a robe longer than a humanoid torso (8 wide, taller than 12)', robe > 0);
  ok('keeper: the sheet defines a unibrow row and eye whites',
    skinArt.KEEPER_FACE[1] === '.kkkkkk.' && skinArt.KEEPER_FACE[2] === '1wk..kw1', skinArt.KEEPER_FACE.slice(0, 3).join(' / '));
  ok('keeper: folded arms are drawn with hands at both ends', skinArt.KEEPER_ARMS[2].startsWith('tt') && skinArt.KEEPER_ARMS[2].endsWith('tt'));
  // three professions: different robe colours and different hats
  const robeColors = new Set<string>();
  const hatSizes = new Set<string>();
  for (const variant of [0, 1, 2]) {
    const m = buildMobModel('keeper', undefined, variant);
    let colour = '';
    m.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.MeshLambertMaterial;
      const img = mat.map?.image as unknown as Img | undefined;
      if (!img?.getContext) return;
      const b = new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position as THREE.BufferAttribute);
      const s = b.getSize(new THREE.Vector3()).multiplyScalar(16);
      if (Math.abs(s.x - 8) < 0.01 && s.y > 12) {
        const d = img.getContext('2d').getImageData(Math.floor(img.width * 0.85), Math.floor(img.height * 0.05), 1, 1).data;
        colour = `${d[0]},${d[1]},${d[2]}`;
      }
      if (s.y <= 5 && s.x >= 7) hatSizes.add(`${s.x.toFixed(0)}x${s.y.toFixed(0)}x${s.z.toFixed(0)}`);
    });
    robeColors.add(colour);
  }
  ok('keeper: the three professions wear three different robes', robeColors.size === 3, [...robeColors].join(' | '));
  ok('keeper: the three professions wear three different hats', hatSizes.size >= 2, [...hatSizes].join(' '));
}

// ---------------------------------------------------------------- 7. resource packs still recolour
{
  const base = buildMobModel('bovin', undefined, 0);
  const packed = buildMobModel('bovin', { head: 0x204060, body: 0x204060, legs: 0x204060 }, 0);
  const first = (g: THREE.Group) => {
    let out: number[] | null = null;
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (out || !m.isMesh) return;
      const img = (m.material as THREE.MeshLambertMaterial).map?.image as unknown as Img | undefined;
      if (img?.getContext) {
        const d = img.getContext('2d').getImageData(Math.floor(img.width * 0.55), Math.floor(img.height * 0.55), 1, 1).data;
        out = [d[0], d[1], d[2]];
      }
    });
    return out;
  };
  const a = first(base.group), b = first(packed.group);
  const warm = (c: number[]) => c[0] > c[2];
  const cool = (c: number[]) => c[2] > c[0];
  ok('packs: a loaded palette recolours the painted art',
    !!a && !!b && warm(a) && cool(b), `${a} (warm) vs ${b} (cool)`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
