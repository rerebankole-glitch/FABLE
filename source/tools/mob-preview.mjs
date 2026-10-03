// Offline contact sheet of every mob model, drawn from the game's own model builders
// Run: node tools/mob-preview-build.mjs && node tools/mob-preview.mjs [mob[:variant] ...]   (needs @napi-rs/canvas)
// (entities/Entities.ts buildMobModel) through a tiny three.js stub, so creature art can be
// reviewed without a browser. Oblique 2.5D projection, same family as the store's skin cards.
//
//   node tools/mob-preview.mjs [mobId ...]      MOB_SHEET=/tmp/mobs.png
//
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';

// the model builders paint 8x8 "hide" textures through document.createElement('canvas')
globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? createCanvas(8, 8) : {}),
};

const { buildMobModel, MOBS } = await import('../dist/mob-preview-src.mjs');

const K = Math.SQRT1_2 / 2;

/**
 * The box's colour comes from its face atlas (3 columns x 2 rows of cells; the front face is the
 * bottom-right cell). Sample the middle of the front cell at the top of the texture, where the base
 * tone sits — the plain hide pattern darkens the bottom rows.
 */
function texColor(material, fallback) {
  const img = material?.map?.image;
  if (img && typeof img.getContext === 'function' && img.width >= 3 && img.height >= 2) {
    const cw = img.width / 3, ch = img.height / 2;
    const x = Math.min(img.width - 1, Math.floor(cw * 2 + cw / 2));
    const y = Math.min(img.height - 1, Math.floor(ch + Math.max(2, ch * 0.3)));
    const d = img.getContext('2d').getImageData(x, y, 1, 1).data;
    return (d[0] << 16) | (d[1] << 8) | d[2];
  }
  return fallback ?? 0xffffff;
}

function collect(root) {
  const boxes = [];
  const walk = (o, px, py, pz, sc) => {
    const x = px + o.position.x * 16 * sc, y = py + o.position.y * 16 * sc, z = pz + o.position.z * 16 * sc;
    const s2 = sc * (o.scale?.x ?? 1);
    const g = o.geometry;
    if (g && typeof g.w === 'number') {
      boxes.push({
        x, y, z, w: g.w * 16 * s2, h: g.h * 16 * s2, d: g.d * 16 * s2,
        pivotTop: Math.abs(g.translatedBy) > 1e-9,
        color: texColor(o.material, o.material?.color),
        map: o.material?.map,
        emissive: o.material?.emissiveIntensity ?? 0,
      });
    }
    for (const c of o.children) walk(c, x, y, z, s2);
  };
  walk(root, 0, 0, 0, 1);
  return boxes;
}

function tone(color, f) {
  const r = Math.max(0, Math.min(255, Math.round(((color >> 16) & 255) * f)));
  const g = Math.max(0, Math.min(255, Math.round(((color >> 8) & 255) * f)));
  const b = Math.max(0, Math.min(255, Math.round((color & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

const FACE_NAME = ['right (+X)', 'left (-X)', 'top (+Y)', 'bottom (-Y)', 'back (+Z)', 'front (-Z)'];
let blank = 0;

function drawSheet(ids, outPath) {
  const cols = Math.min(4, ids.length);
  const zoom = Number(process.env.MOB_ZOOM || 1);
  const cellW = 250 * zoom, cellH = 300 * zoom;
  const rows = Math.ceil(ids.length / cols);
  const sheet = createCanvas(cols * cellW, rows * cellH);
  const g = sheet.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#14161f';
  g.fillRect(0, 0, sheet.width, sheet.height);

  ids.forEach((spec, i) => {
    const [id, v] = spec.split(':');
    const def = MOBS[id];
    if (!def) { console.log('unknown mob:', id); return; }
    const { group } = buildMobModel(id, undefined, v ? Number(v) : 0);
    const boxes = collect(group);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity;
    const spans = boxes.map((b) => {
      const y0 = b.pivotTop ? b.y - b.h : b.y - b.h / 2;
      return { ...b, y0, y1: y0 + b.h };
    });
    for (const b of spans) {
      minZ = Math.min(minZ, b.z - b.d / 2);
      minX = Math.min(minX, b.x - b.w / 2 - K * 24); maxX = Math.max(maxX, b.x + b.w / 2);
      minY = Math.min(minY, b.y0); maxY = Math.max(maxY, b.y1 + K * 24);
    }
    const scale = Math.min((cellW - 70) / Math.max(1, maxX - minX), (cellH - 84) / Math.max(1, maxY - minY));
    const cx = (i % cols) * cellW, cy = Math.floor(i / cols) * cellH;
    const ox = cx + (cellW - (maxX - minX) * scale) / 2 - minX * scale;
    const oy = cy + cellH - 34 - minY * scale;

    // project a model-space point; the depth axis goes up-left, mobs face -Z (the nearest face)
    const P = (x, y, z) => [ox + (x - K * (z - minZ)) * scale, oy - (y + K * (z - minZ)) * scale];
    const V = (dx, dy, dz) => [(dx - K * dz) * scale, -(dy + K * dz) * scale];

    // farthest boxes first, then bottom-up
    spans.sort((a, b) => (b.z + b.d / 2) - (a.z + a.d / 2) || a.y0 - b.y0);

    /** draw one face of a box: the cell of its 3x2 face atlas mapped onto the projected quad */
    const drawFace = (b, cell, origin, uVec, vVec) => {
      const img = b.map?.image;
      const flat = tone(b.color, b.emissive ? 1.2 : 1);
      const [ax, ay] = P(...origin);
      if (!img || img.width < 3 || img.height < 2) {
        const [bx, by] = [ax + uVec[0], ay + uVec[1]];
        const [dx2, dy2] = [ax + vVec[0], ay + vVec[1]];
        g.beginPath();
        g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(bx + vVec[0], by + vVec[1]); g.lineTo(dx2, dy2);
        g.closePath(); g.fillStyle = flat; g.fill();
        return;
      }
      const cw = img.width / 3, ch = img.height / 2;
      const col = cell % 3, row = Math.floor(cell / 3);
      // source pixel (sx, sy) -> screen; sy 0 is the top of the cell, which is v = 1
      g.save();
      g.setTransform(
        uVec[0] / cw, uVec[1] / cw,
        -vVec[0] / ch, -vVec[1] / ch,
        ax + vVec[0], ay + vVec[1],
      );
      g.drawImage(img, col * cw, row * ch, cw, ch, 0, 0, cw, ch);
      g.restore();
      g.setTransform(1, 0, 0, 1, 0, 0);
    };

    // every face of every box must actually be painted, or a face renders black in the game (an
    // unpainted cell is fully transparent, and the opaque Lambert material reads it as black)
    for (const b of spans) {
      const img = b.map?.image;
      if (!img || typeof img.getContext !== 'function' || img.width < 3) continue;
      const cw = img.width / 3, ch = img.height / 2;
      for (let cell = 0; cell < 6; cell++) {
        const col = cell % 3, row = Math.floor(cell / 3);
        const d = img.getContext('2d').getImageData(col * cw, row * ch, cw, ch).data;
        let painted = false;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 0) { painted = true; break; }
        if (!painted) { console.log(`BLANK FACE: ${id}${v ? ':' + v : ''} box(${b.w}x${b.h}x${b.d}) cell ${cell} (${FACE_NAME[cell]}) has no art`); blank++; }
      }
    }

    for (const b of spans) {
      const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
      // top (+Y), right (+X), front (-Z) — the three faces a front-right-above camera sees
      drawFace(b, 2, [x0, b.y1, z0], V(b.w, 0, 0), V(0, 0, b.d));
      drawFace(b, 0, [x1, b.y0, z0], V(0, 0, b.d), V(0, b.h, 0));
      drawFace(b, 5, [x0, b.y0, z0], V(b.w, 0, 0), V(0, b.h, 0));
    }

    g.fillStyle = '#eef0f7';
    g.font = '15px sans-serif';
    g.fillText(def.name, cx + 16, cy + 26);
    g.fillStyle = '#6d758c';
    g.font = '12px sans-serif';
    const prof = id === 'keeper' ? [' · farmer', ' · smith', ' · mystic'][Number(v) % 3] : '';
    g.fillText(`${id}${prof} · ${def.boss ? 'boss · ' : ''}${def.hostile ? 'hostile' : 'passive'}`, cx + 16, cy + 44);
  });

  writeFileSync(outPath, sheet.toBuffer('image/png'));
  console.log('wrote', outPath, `(${ids.length} mobs)`);
  if (blank) { console.log(`${blank} blank box face(s) — those render black in game`); process.exitCode = 1; }
}

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(MOBS);
drawSheet(ids, process.env.MOB_SHEET || '/tmp/mobs.png');
