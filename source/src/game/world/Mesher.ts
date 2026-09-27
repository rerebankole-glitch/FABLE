import { B, BLOCKS, OPAQUE, LIGHT, ATTEN } from '../blocks/Blocks';
import { BIOMES, leafTint } from './Biomes';
import { CHUNK_HEIGHT, CHUNK_SIZE, blockIndex } from '../core/types';
import { ATLAS_COLS, ATLAS_ROWS } from '../blocks/Tiles';

export interface ChunkSource {
  get(cx: number, cz: number): { data: Uint8Array; biomes: Uint8Array } | undefined;
}

export interface MeshBuffers {
  pos: Float32Array;
  uv: Float32Array;
  light: Float32Array;
  color: Float32Array;
  /** per-vertex shader flags: 0 static, 1 waving foliage (leaves), 2 waving plant (pivots at its base) */
  flags: Float32Array;
  /** atlas cell of the quad (u0, v0, uw, vh); greedy quads repeat their uv inside this rect */
  tile: Float32Array;
  index: Uint32Array;
}

export interface MeshResult {
  opaque: MeshBuffers;
  water: MeshBuffers;
  light: Uint8Array;
}

const H = CHUNK_HEIGHT;
const S = CHUNK_SIZE;
const P = 16;
const PW = S + P * 2; // 48

const ridx = (x: number, y: number, z: number) => ((x + P) * PW + (z + P)) * H + y;

// Face tables: normal, 4 corners (unit cube), tangent axes
interface Face { n: [number, number, number]; c: number[][]; ta: number; tb: number; shade: number }
const FACES: Face[] = [
  { n: [0, 1, 0], c: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], ta: 0, tb: 2, shade: 1.0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], ta: 0, tb: 2, shade: 0.5 },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], ta: 0, tb: 1, shade: 0.8 },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], ta: 0, tb: 1, shade: 0.8 },
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], ta: 2, tb: 1, shade: 0.65 },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], ta: 2, tb: 1, shade: 0.65 },
];
const AO_CURVE = [0.4, 0.62, 0.82, 1.0];
const SKY_CURVE = new Float32Array(16);
const BLK_CURVE = new Float32Array(16);
for (let i = 0; i < 16; i++) {
  SKY_CURVE[i] = Math.pow(i / 15, 1.6);
  BLK_CURVE[i] = Math.pow(i / 15, 1.25);
}

class Builder {
  pos: number[] = [];
  uv: number[] = [];
  light: number[] = [];
  color: number[] = [];
  flags: number[] = [];
  tile: number[] = [];
  index: number[] = [];
  vcount = 0;

  quad(px: number[], uvs: number[], lights: number[][], col: number[], flip: boolean, flag = 0, cell?: number[]): void {
    // A non-greedy quad's uv already points at the atlas cell, so its tile rect is the whole atlas
    // (0,0,1,1) and the shader's wrap becomes a no-op.
    const t0 = cell ? cell[0] : 0, t1 = cell ? cell[1] : 0, t2 = cell ? cell[2] : 1, t3 = cell ? cell[3] : 1;
    for (let i = 0; i < 4; i++) {
      this.pos.push(px[i * 3], px[i * 3 + 1], px[i * 3 + 2]);
      this.uv.push(uvs[i * 2], uvs[i * 2 + 1]);
      this.light.push(lights[i][0], lights[i][1], lights[i][2]);
      this.color.push(col[0], col[1], col[2]);
      this.flags.push(flag);
      this.tile.push(t0, t1, t2, t3);
    }
    const v = this.vcount;
    if (flip) this.index.push(v + 1, v + 2, v + 3, v + 1, v + 3, v);
    else this.index.push(v, v + 1, v + 2, v, v + 2, v + 3);
    this.vcount += 4;
  }

  build(): MeshBuffers {
    return {
      pos: new Float32Array(this.pos),
      uv: new Float32Array(this.uv),
      light: new Float32Array(this.light),
      color: new Float32Array(this.color),
      flags: new Float32Array(this.flags),
      tile: new Float32Array(this.tile),
      index: new Uint32Array(this.index),
    };
  }
}

export class Region {
  blocks = new Uint8Array(PW * PW * H);
  biomes = new Uint8Array(PW * PW);
  sky = new Uint8Array(PW * PW * H);
  blk = new Uint8Array(PW * PW * H);
  private tops = new Int16Array(PW * PW);
  private queue = new Int32Array(PW * PW * H);

  load(src: ChunkSource, cx: number, cz: number): void {
    this.blocks.fill(0);
    this.biomes.fill(3);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const ch = src.get(cx + dx, cz + dz);
      if (!ch) continue;
      for (let lx = 0; lx < S; lx++) for (let lz = 0; lz < S; lz++) {
        const from = blockIndex(lx, 0, lz);
        const to = ridx(dx * S + lx, 0, dz * S + lz);
        this.blocks.set(ch.data.subarray(from, from + H), to);
        this.biomes[(dx * S + lx + P) * PW + (dz * S + lz + P)] = ch.biomes[lx * S + lz];
      }
    }
  }

  computeLight(): void {
    const { blocks, sky, blk } = this;
    sky.fill(0);
    blk.fill(0);
    const tops = this.tops;
    const queue = this.queue;
    let qh = 0, qt = 0;
    // sky columns
    for (let x = 0; x < PW; x++) for (let z = 0; z < PW; z++) {
      const base = (x * PW + z) * H;
      let l = 15;
      let y = H - 1;
      for (; y >= 0; y--) {
        const id = blocks[base + y];
        if (OPAQUE[id]) break;
        const at = ATTEN[id];
        if (at) { l = Math.max(0, l - at); }
        sky[base + y] = l;
        if (l < 15 && l > 0) queue[qt++] = base + y;
        if (l === 0) { y--; break; }
      }
      tops[x * PW + z] = y; // first opaque (or -1)
    }
    // seeds: lit cells next to columns whose surface is higher
    for (let x = 0; x < PW; x++) for (let z = 0; z < PW; z++) {
      const t = tops[x * PW + z];
      let lim = t;
      if (x > 0) lim = Math.max(lim, tops[(x - 1) * PW + z]);
      if (x < PW - 1) lim = Math.max(lim, tops[(x + 1) * PW + z]);
      if (z > 0) lim = Math.max(lim, tops[x * PW + z - 1]);
      if (z < PW - 1) lim = Math.max(lim, tops[x * PW + z + 1]);
      const base = (x * PW + z) * H;
      for (let y = t + 1; y <= lim && y < H; y++) if (sky[base + y] === 15) queue[qt++] = base + y;
    }
    this.bfs(sky, queue, qh, qt);
    // block light
    qh = 0; qt = 0;
    for (let i = 0; i < blocks.length; i++) {
      const l = LIGHT[blocks[i]];
      if (l) { blk[i] = l; queue[qt++] = i; }
    }
    this.bfs(blk, queue, qh, qt);
  }

  private bfs(arr: Uint8Array, queue: Int32Array, qh: number, qt: number): void {
    const blocks = this.blocks;
    const maxQ = queue.length;
    while (qh < qt) {
      const i = queue[qh++];
      const l = arr[i];
      if (l <= 1) continue;
      const y = i % H;
      const col = (i - y) / H;
      const z = col % PW;
      const x = (col - z) / PW;
      // neighbours
      if (y < H - 1) this.spread(arr, i + 1, l, queue, qt, maxQ) && qt++;
      if (y > 0) this.spread(arr, i - 1, l, queue, qt, maxQ) && qt++;
      if (z < PW - 1) this.spread(arr, i + H, l, queue, qt, maxQ) && qt++;
      if (z > 0) this.spread(arr, i - H, l, queue, qt, maxQ) && qt++;
      if (x < PW - 1) this.spread(arr, i + PW * H, l, queue, qt, maxQ) && qt++;
      if (x > 0) this.spread(arr, i - PW * H, l, queue, qt, maxQ) && qt++;
      void blocks;
    }
  }

  private spread(arr: Uint8Array, n: number, l: number, queue: Int32Array, qt: number, maxQ: number): boolean {
    const id = this.blocks[n];
    if (OPAQUE[id]) return false;
    const nl = l - 1 - ATTEN[id];
    if (nl > arr[n]) {
      arr[n] = nl;
      if (qt < maxQ) { queue[qt] = n; return true; }
    }
    return false;
  }
}

/**
 * True when all four corners of a face share the same sky/block/AO values. Only such faces can be
 * merged: a face with an ambient-occlusion gradient must keep its own corner lighting, otherwise
 * merging would visibly flatten the shading in corners and under overhangs.
 */
function flatLit(l: number[][]): boolean {
  const a0 = l[0][0], a1 = l[0][1], a2 = l[0][2];
  for (let i = 1; i < 4; i++) if (l[i][0] !== a0 || l[i][1] !== a1 || l[i][2] !== a2) return false;
  return true;
}

const tileUV = (t: number) => {
  const col = t % ATLAS_COLS;
  const row = Math.floor(t / ATLAS_COLS);
  return [col / ATLAS_COLS, row / ATLAS_ROWS, 1 / ATLAS_COLS, 1 / ATLAS_ROWS];
};

export function meshChunk(region: Region, cx: number, cz: number, smooth: boolean, greedy = true): MeshResult {
  const { blocks, sky, blk, biomes } = region;
  const opaque = new Builder();
  const water = new Builder();
  const ox = cx * S, oz = cz * S;
  const lightOut = new Uint8Array(S * S * H);
  const colCache = new Float32Array(S * S * 6);
  // biome colours (blended 5x5)
  for (let lx = 0; lx < S; lx++) for (let lz = 0; lz < S; lz++) {
    let r = 0, g = 0, b = 0, fr = 0, fg = 0, fb = 0, n = 0;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const bm = BIOMES[biomes[(lx + dx + P) * PW + (lz + dz + P)]] || BIOMES[3];
      r += bm.grass[0]; g += bm.grass[1]; b += bm.grass[2];
      fr += bm.foliage[0]; fg += bm.foliage[1]; fb += bm.foliage[2];
      n++;
    }
    const o = (lx * S + lz) * 6;
    colCache[o] = r / n; colCache[o + 1] = g / n; colCache[o + 2] = b / n;
    colCache[o + 3] = fr / n; colCache[o + 4] = fg / n; colCache[o + 5] = fb / n;
  }
  const WHITE = [1, 1, 1];
  // Deferred full-cube faces, one flat list per face direction. Each entry is
  // [lx, y, lz, tile, sky, blk, aoShade, flag] and is merged into rectangles below.
  const greedyMask: number[][] = [[], [], [], [], [], []];
  const lightsTmp: number[][] = [[0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1]];
  const pxTmp = new Array<number>(12);
  const uvTmp = new Array<number>(8);

  for (let lx = 0; lx < S; lx++) {
    for (let lz = 0; lz < S; lz++) {
      const colBase = ridx(lx, 0, lz);
      for (let y = 0; y < H; y++) {
        const ri = colBase + y;
        const id = blocks[ri];
        lightOut[blockIndex(lx, y, lz)] = (sky[ri] << 4) | blk[ri];
        if (id === B.AIR) continue;
        const def = BLOCKS[id];
        if (def.shape === 'none') continue;
        const cidx = (lx * S + lz) * 6;
        const tint = def.tint ? (def.name.endsWith('leaves') ? leafTint(def.name, [colCache[cidx + 3], colCache[cidx + 4], colCache[cidx + 5]]) : [colCache[cidx], colCache[cidx + 1], colCache[cidx + 2]]) : WHITE;
        const wx = lx, wy = y, wz = lz; // local mesh coords (chunk-local, chunk positioned in world)
        void ox; void oz;

        if (def.shape === 'cross') {
          const l = [SKY_CURVE[sky[ri]], BLK_CURVE[blk[ri]], 1];
          const [u0, v0, uw, vh] = tileUV(def.tiles[0]);
          const uvs = [u0, v0, u0 + uw, v0, u0 + uw, v0 + vh, u0, v0 + vh];
          const L = [l, l, l, l];
          const a = 0.15, b2 = 0.85;
          const wave = def.needsSupport ? 2 : 0; // plants sway from their base; static crosses (ladders etc.) do not
          opaque.quad([wx + a, wy, wz + a, wx + b2, wy, wz + b2, wx + b2, wy + 1, wz + b2, wx + a, wy + 1, wz + a], uvs, L, tint, false, wave);
          opaque.quad([wx + b2, wy, wz + b2, wx + a, wy, wz + a, wx + a, wy + 1, wz + a, wx + b2, wy + 1, wz + b2], uvs, L, tint, false, wave);
          opaque.quad([wx + a, wy, wz + b2, wx + b2, wy, wz + a, wx + b2, wy + 1, wz + a, wx + a, wy + 1, wz + b2], uvs, L, tint, false, wave);
          opaque.quad([wx + b2, wy, wz + a, wx + a, wy, wz + b2, wx + a, wy + 1, wz + b2, wx + b2, wy + 1, wz + a], uvs, L, tint, false, wave);
          continue;
        }

        const isLiquid = def.shape === 'liquid';
        let box: number[] | null = null;
        if (def.shape === 'box') box = def.box!;
        else if (isLiquid) {
          const above = blocks[ri + 1];
          box = above === id ? null : [0, 0, 0, 1, 0.875, 1];
        }
        const target = id === B.WATER ? water : opaque;
        const fullCube = box === null;
        const leafy = def.tint && def.name.endsWith('leaves') ? 1 : 0;

        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          const nx = lx + face.n[0], ny = y + face.n[1], nz = lz + face.n[2];
          if (ny < 0 || ny >= H) { if (ny < 0) continue; }
          const nri = ny >= H ? -1 : ridx(nx, ny, nz);
          const nid = nri < 0 ? B.AIR : blocks[nri];
          let flush = true;
          if (box) {
            const axis = f < 2 ? 1 : f < 4 ? 2 : 0;
            const positive = f % 2 === 0;
            flush = positive ? box[axis + 3] >= 0.999 : box[axis] <= 0.001;
          }
          if (flush) {
            if (OPAQUE[nid]) continue;
            if (def.cullSame && nid === id) continue;
            if (isLiquid && nid === id) continue;
          }
          const tile = def.tiles[f];
          const [u0, v0, uw, vh] = tileUV(tile);
          // corners
          for (let k = 0; k < 4; k++) {
            const c = face.c[k];
            let px = c[0], py = c[1], pz = c[2];
            if (box) {
              px = box[0] + px * (box[3] - box[0]);
              py = box[1] + py * (box[4] - box[1]);
              pz = box[2] + pz * (box[5] - box[2]);
            }
            pxTmp[k * 3] = wx + px; pxTmp[k * 3 + 1] = wy + py; pxTmp[k * 3 + 2] = wz + pz;
            const local = [px, py, pz];
            let uu = local[face.ta], vv = local[face.tb];
            if (f === 3 || f === 5) uu = 1 - uu; // keep textures un-mirrored on back faces
            if (f === 1) vv = 1 - vv;
            uvTmp[k * 2] = u0 + uu * uw;
            uvTmp[k * 2 + 1] = v0 + vv * vh;
            // lighting
            const sampleIdx = (flush && nri >= 0) ? nri : ri;
            let skyV = sky[sampleIdx], blkV = blk[sampleIdx], ao = 3;
            if (smooth && fullCube && nri >= 0) {
              const sa = c[face.ta] ? 1 : -1;
              const sb = c[face.tb] ? 1 : -1;
              const stepA = face.ta === 0 ? PW * H : face.ta === 1 ? 1 : H;
              const stepB = face.tb === 0 ? PW * H : face.tb === 1 ? 1 : H;
              const ia = nri + sa * stepA, ib = nri + sb * stepB, ic = nri + sa * stepA + sb * stepB;
              const va = ia >= 0 && ia < blocks.length, vb = ib >= 0 && ib < blocks.length, vc = ic >= 0 && ic < blocks.length;
              const oa = va ? OPAQUE[blocks[ia]] : 0, ob = vb ? OPAQUE[blocks[ib]] : 0, oc = vc ? OPAQUE[blocks[ic]] : 0;
              ao = oa && ob ? 0 : 3 - (oa + ob + oc);
              let ss = skyV, bs = blkV, n = 1;
              if (va && !oa) { ss += sky[ia]; bs += blk[ia]; n++; }
              if (vb && !ob) { ss += sky[ib]; bs += blk[ib]; n++; }
              if (vc && !oc && !(oa && ob)) { ss += sky[ic]; bs += blk[ic]; n++; }
              skyV = ss / n; blkV = bs / n;
            }
            const sI = Math.floor(skyV), bI = Math.floor(blkV);
            const sF = skyV - sI, bF = blkV - bI;
            const skyN = SKY_CURVE[sI] + (SKY_CURVE[Math.min(15, sI + 1)] - SKY_CURVE[sI]) * sF;
            const blkN = BLK_CURVE[bI] + (BLK_CURVE[Math.min(15, bI + 1)] - BLK_CURVE[bI]) * bF;
            lightsTmp[k][0] = skyN;
            lightsTmp[k][1] = blkN;
            lightsTmp[k][2] = AO_CURVE[ao] * face.shade;
          }
          const flip = lightsTmp[0][2] + lightsTmp[2][2] < lightsTmp[1][2] + lightsTmp[3][2];
          const useTint = def.tint ? tint : WHITE;
          // Full opaque cube faces are deferred to the greedy pass, which merges runs of identical
          // faces into single quads. Everything else (boxes, liquids, tinted foliage) is emitted
          // immediately and untouched, so their geometry is bit-for-bit what it was before.
          // Full opaque cube faces whose four corners are lit identically are deferred to the greedy
          // pass below, which merges runs of them into single quads. Everything else (boxes,
          // liquids, tinted foliage, and any face with an AO/light gradient) is emitted here and is
          // bit-for-bit unchanged.
          if (greedy && fullCube && target === opaque && !def.tint && flatLit(lightsTmp)) {
            const gi = (f * S + lx) * H + y;
            void gi;
            greedyMask[f].push(lx, y, lz, tile, lightsTmp[0][0], lightsTmp[0][1], lightsTmp[0][2], leafy);
            continue;
          }
          target.quad(pxTmp, uvTmp, lightsTmp, useTint, flip, leafy);
        }
      }
    }
  }
  // ---- greedy pass ------------------------------------------------------------------------
  // For each face direction, the deferred faces are bucketed into slices perpendicular to the face
  // normal, then each slice is covered with maximal rectangles of identical (tile, light, ao)
  // faces. This is the standard 2D greedy sweep: walk the slice, grow a run along u, then grow that
  // run down v for as long as every cell matches. Merged quads keep the per-block texture because
  // their uv runs 0..w / 0..h and the shader wraps it inside the quad's atlas cell (aTile).
  if (greedy) {
    // slice axes per face: [sliceAxis, uAxis, vAxis]; 0 = x, 1 = y, 2 = z
    const AXES: number[][] = [[1, 0, 2], [1, 0, 2], [2, 0, 1], [2, 0, 1], [0, 2, 1], [0, 2, 1]];
    const DIM = [S, H, S];
    const cellPos = [0, 0, 0];
    for (let f = 0; f < 6; f++) {
      const list = greedyMask[f];
      if (list.length === 0) continue;
      const [sa, ua, va] = AXES[f];
      const uDim = DIM[ua], vDim = DIM[va], sDim = DIM[sa];
      // bucket faces by slice so each slice is a small dense grid
      const bySlice = new Map<number, Map<number, number[]>>();
      for (let i = 0; i < list.length; i += 8) {
        cellPos[0] = list[i]; cellPos[1] = list[i + 1]; cellPos[2] = list[i + 2];
        const sv = cellPos[sa];
        let g = bySlice.get(sv);
        if (!g) { g = new Map(); bySlice.set(sv, g); }
        g.set(cellPos[ua] * vDim + cellPos[va], [list[i + 3], list[i + 4], list[i + 5], list[i + 6], list[i + 7]]);
      }
      void sDim;
      const face = FACES[f];
      for (const [sv, grid] of bySlice) {
        const used = new Set<number>();
        for (let u = 0; u < uDim; u++) for (let v = 0; v < vDim; v++) {
          const k0 = u * vDim + v;
          if (used.has(k0)) continue;
          const cell = grid.get(k0);
          if (!cell) continue;
          const [tile, skyL, blkL, aoS, flag] = cell;
          const same = (kk: number): boolean => {
            if (used.has(kk)) return false;
            const c = grid.get(kk);
            return !!c && c[0] === tile && c[1] === skyL && c[2] === blkL && c[3] === aoS && c[4] === flag;
          };
          // grow along v, then along u for the full height
          let h = 1;
          while (v + h < vDim && same(u * vDim + v + h)) h++;
          let w = 1;
          grow: while (u + w < uDim) {
            for (let dv = 0; dv < h; dv++) if (!same((u + w) * vDim + v + dv)) break grow;
            w++;
          }
          for (let du = 0; du < w; du++) for (let dv = 0; dv < h; dv++) used.add((u + du) * vDim + v + dv);
          // emit one quad covering w x h cells
          const [u0, v0, uw, vh] = tileUV(tile);
          const L = [[skyL, blkL, aoS], [skyL, blkL, aoS], [skyL, blkL, aoS], [skyL, blkL, aoS]];
          const px: number[] = [];
          const uvs: number[] = [];
          for (let k = 0; k < 4; k++) {
            const c = face.c[k];
            const base = [0, 0, 0];
            base[sa] = sv + c[sa];
            base[ua] = u + c[ua] * w;
            base[va] = v + c[va] * h;
            px.push(base[0], base[1], base[2]);
            // uv spans the merged extent; the shader wraps it per block inside the atlas cell
            let uu = c[face.ta], vv = c[face.tb];
            const spanA = face.ta === ua ? w : face.ta === va ? h : 1;
            const spanB = face.tb === ua ? w : face.tb === va ? h : 1;
            uu *= spanA; vv *= spanB;
            if (f === 3 || f === 5) uu = spanA - uu;
            if (f === 1) vv = spanB - vv;
            uvs.push(uu, vv);
          }
          opaque.quad(px, uvs, L, WHITE, false, flag, [u0, v0, uw, vh]);
        }
      }
    }
  }
  return { opaque: opaque.build(), water: water.build(), light: lightOut };
}
