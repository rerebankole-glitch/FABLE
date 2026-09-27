import * as THREE from 'three';
import GenWorker from './worker?worker&inline';
import { B, BLOCKS, LIGHT } from '../blocks/Blocks';
import { CHUNK_HEIGHT, CHUNK_SIZE, Emitter, blockIndex, chunkKey, type ItemStack } from '../core/types';
import type { GenOptions, LootHint, SpawnHint } from './Generator';
import type { MeshBuffers } from './Mesher';
import { createChunkMaterial, setShaderFeatures, type ShaderFeatures } from '../renderer/Shaders';
import { getAtlas } from '../blocks/TextureAtlas';

export interface Chunk {
  cx: number; cz: number;
  data: Uint8Array;
  biomes: Uint8Array;
  heights: Uint8Array;
  light: Uint8Array | null;
  opaque: THREE.Mesh | null;
  water: THREE.Mesh | null;
  meshState: 'none' | 'pending' | 'ready';
  dirty: boolean;
  meshId: number;
}

export interface BlockEntity {
  type: 'chest' | 'furnace' | 'barrel' | 'altar' | 'hearth';
  items: (ItemStack | null)[];
  burn?: number; burnMax?: number; cook?: number; lit?: boolean;
  loot?: string;
}

type WorldEvents = {
  chunkLoaded: [Chunk, SpawnHint[], LootHint[], boolean];
  blockChanged: [number, number, number, number, number];
};

const S = CHUNK_SIZE;

export class World {
  chunks = new Map<string, Chunk>();
  edits = new Map<string, Map<number, number>>();
  blockEntities = new Map<string, BlockEntity>();
  visited = new Set<string>();
  group = new THREE.Group();
  events = new Emitter<WorldEvents>();
  opaqueMat: THREE.ShaderMaterial;
  waterMat: THREE.ShaderMaterial;
  private worker: Worker;
  private genInFlight = new Set<string>();
  /** set when any chunk is marked dirty; cleared by update() */
  private anyDirty = true;
  private meshInFlight = 0;
  private offsets: [number, number, number][] = [];
  private offsetsRadius = -1;
  private nextMeshId = 1;
  private _renderDistance = 6;
  get renderDistance(): number { return this._renderDistance; }
  set renderDistance(v: number) { if (v !== this._renderDistance) { this._renderDistance = v; this.anyDirty = true; } }
  chunkSpeed = 2;
  stats = { loaded: 0, meshed: 0, pendingGen: 0 };
  dimension: 'overworld' | 'void';

  constructor(public opts: GenOptions, smooth: boolean) {
    this.dimension = opts.dimension;
    const atlas = getAtlas();
    this.opaqueMat = createChunkMaterial(atlas.texture, false);
    this.waterMat = createChunkMaterial(atlas.texture, true);
    this.worker = new GenWorker();
    this.worker.onmessage = (e: MessageEvent) => this.onWorkerMessage(e.data);
    this.worker.postMessage({ type: 'init', opts, smooth });
  }

  setSmooth(smooth: boolean): void {
    this.worker.postMessage({ type: 'settings', smooth });
    for (const c of this.chunks.values()) c.dirty = true;
    this.anyDirty = true;
  }

  private onWorkerMessage(m: any): void {
    if (m.type === 'chunk') {
      const key = chunkKey(m.cx, m.cz);
      this.genInFlight.delete(key);
      if (this.chunks.has(key)) return;
      const chunk: Chunk = { cx: m.cx, cz: m.cz, data: m.data, biomes: m.biomes, heights: m.heights, light: null, opaque: null, water: null, meshState: 'none', dirty: false, meshId: 0 };
      this.chunks.set(key, chunk);
      this.anyDirty = true; // neighbours may now be meshable
      const first = !this.visited.has(key);
      this.visited.add(key);
      this.events.emit('chunkLoaded', chunk, m.spawns, m.loot, first);
    } else if (m.type === 'mesh') {
      this.meshInFlight = Math.max(0, this.meshInFlight - 1);
      const chunk = this.chunks.get(chunkKey(m.cx, m.cz));
      if (!chunk) return;
      if (m.id !== chunk.meshId) return; // stale
      this.applyMesh(chunk, m.opaque, m.water, m.light);
    }
  }

  private buildGeometry(buf: MeshBuffers): THREE.BufferGeometry | null {
    if (buf.index.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(buf.pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(buf.uv, 2));
    g.setAttribute('aLight', new THREE.BufferAttribute(buf.light, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(buf.color, 3));
    g.setAttribute('aFlags', new THREE.BufferAttribute(buf.flags, 1));
    g.setAttribute('aTile', new THREE.BufferAttribute(buf.tile, 4));
    g.setIndex(new THREE.BufferAttribute(buf.index, 1));
    g.computeBoundingSphere();
    return g;
  }

  private applyMesh(chunk: Chunk, opaque: MeshBuffers, water: MeshBuffers, light: Uint8Array): void {
    this.disposeMeshes(chunk);
    chunk.light = light;
    const og = this.buildGeometry(opaque);
    if (og) {
      const m = new THREE.Mesh(og, this.opaqueMat);
      m.position.set(chunk.cx * S, 0, chunk.cz * S);
      m.matrixAutoUpdate = false; m.updateMatrix();
      this.group.add(m);
      chunk.opaque = m;
    }
    const wg = this.buildGeometry(water);
    if (wg) {
      const m = new THREE.Mesh(wg, this.waterMat);
      m.position.set(chunk.cx * S, 0, chunk.cz * S);
      m.matrixAutoUpdate = false; m.updateMatrix();
      m.renderOrder = 5;
      this.group.add(m);
      chunk.water = m;
    }
    chunk.meshState = 'ready';
  }

  private disposeMeshes(chunk: Chunk): void {
    if (chunk.opaque) { this.group.remove(chunk.opaque); chunk.opaque.geometry.dispose(); chunk.opaque = null; }
    if (chunk.water) { this.group.remove(chunk.water); chunk.water.geometry.dispose(); chunk.water = null; }
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cz));
  }

  getBlock(x: number, y: number, z: number): number {
    if (y < 0 || y >= CHUNK_HEIGHT) return B.AIR;
    const c = this.chunks.get(chunkKey(Math.floor(x / S), Math.floor(z / S)));
    if (!c) return B.AIR;
    return c.data[blockIndex(x, y, z)];
  }

  isLoaded(x: number, z: number): boolean {
    return this.chunks.has(chunkKey(Math.floor(x / S), Math.floor(z / S)));
  }

  /** Returns [skyLight, blockLight] 0..15 */
  getLight(x: number, y: number, z: number): [number, number] {
    if (y < 0) return [0, 0];
    if (y >= CHUNK_HEIGHT) return [15, 0];
    const c = this.chunks.get(chunkKey(Math.floor(x / S), Math.floor(z / S)));
    if (!c || !c.light) return [15, 0];
    const v = c.light[blockIndex(x, y, z)];
    return [v >> 4, v & 15];
  }

  getTop(x: number, z: number): number {
    const c = this.chunks.get(chunkKey(Math.floor(x / S), Math.floor(z / S)));
    if (!c) return 0;
    return c.heights[(x & 15) * S + (z & 15)];
  }

  /** Highest non-air block at column (searching down from top). */
  surfaceY(x: number, z: number): number {
    const c = this.chunks.get(chunkKey(Math.floor(x / S), Math.floor(z / S)));
    if (!c) return 64;
    const base = blockIndex(x, 0, z);
    for (let y = CHUNK_HEIGHT - 1; y > 0; y--) {
      const id = c.data[base + y];
      if (id !== B.AIR && BLOCKS[id].solid) return y;
    }
    return 0;
  }

  getBiome(x: number, z: number): number {
    const c = this.chunks.get(chunkKey(Math.floor(x / S), Math.floor(z / S)));
    if (!c) return 3;
    return c.biomes[(x & 15) * S + (z & 15)];
  }

  setBlock(x: number, y: number, z: number, id: number, record = true): boolean {
    if (y < 0 || y >= CHUNK_HEIGHT) return false;
    const cx = Math.floor(x / S), cz = Math.floor(z / S);
    const key = chunkKey(cx, cz);
    const c = this.chunks.get(key);
    if (!c) return false;
    const idx = blockIndex(x, y, z);
    const old = c.data[idx];
    if (old === id) return false;
    c.data[idx] = id;
    // heights
    const hi = (x & 15) * S + (z & 15);
    if (id !== B.AIR && y > c.heights[hi]) c.heights[hi] = y;
    else if (id === B.AIR && y === c.heights[hi]) {
      let yy = y; while (yy > 0 && c.data[blockIndex(x, yy, z)] === B.AIR) yy--;
      c.heights[hi] = yy;
    }
    if (record) {
      let m = this.edits.get(key);
      if (!m) { m = new Map(); this.edits.set(key, m); }
      m.set(idx, id);
    }
    this.worker.postMessage({ type: 'set', x, y, z, id });
    const pk = x + ',' + y + ',' + z;
    if (this.blockEntities.has(pk) && !BLOCK_ENTITY_BLOCKS.has(id)) this.blockEntities.delete(pk);
    // dirty marking
    const lightChange = LIGHT[old] !== LIGHT[id] || BLOCKS[old].opaque !== BLOCKS[id].opaque;
    const lx = x & 15, lz = z & 15;
    const range = lightChange ? 1 : 0;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (dx === 0 && dz === 0) continue;
      const border = (dx === -1 && lx === 0) || (dx === 1 && lx === 15) || (dz === -1 && lz === 0) || (dz === 1 && lz === 15);
      if (range || border) {
        const n = this.chunks.get(chunkKey(cx + dx, cz + dz));
        if (n && (border || (Math.abs(dx) + Math.abs(dz) >= 1))) n.dirty = true;
      }
    }
    c.dirty = true;
    this.anyDirty = true;
    this.events.emit('blockChanged', x, y, z, old, id);
    return true;
  }

  getBlockEntity(x: number, y: number, z: number): BlockEntity | undefined {
    return this.blockEntities.get(x + ',' + y + ',' + z);
  }

  setBlockEntity(x: number, y: number, z: number, be: BlockEntity): void {
    this.blockEntities.set(x + ',' + y + ',' + z, be);
  }

  private ensureOffsets(r: number): void {
    if (this.offsetsRadius === r) return;
    this.offsetsRadius = r;
    this.offsets = [];
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d <= r + 0.5) this.offsets.push([dx, dz, d]);
    }
    this.offsets.sort((a, b) => a[2] - b[2]);
  }

  /** Facing direction (unit xz) used to prioritise chunks in front of the camera; set by Game each frame. */
  viewDirX = 0;
  viewDirZ = -1;
  private lastUpdateCx = NaN;
  private lastUpdateCz = NaN;
  private updateSkip = 0;

  update(px: number, pz: number): void {
    const R = this.renderDistance;
    this.ensureOffsets(R + 1);
    const pcx = Math.floor(px / S), pcz = Math.floor(pz / S);
    // The full scan is only needed when the player changes chunk, when something is dirty or in flight,
    // or every ~10 frames as a fallback; otherwise skip it (dirty flag) to keep the per-frame cost near zero.
    const moved = pcx !== this.lastUpdateCx || pcz !== this.lastUpdateCz;
    const busy = this.genInFlight.size > 0 || this.meshInFlight > 0 || this.anyDirty;
    if (!moved && !busy && this.updateSkip++ < 10) return;
    this.updateSkip = 0;
    this.lastUpdateCx = pcx; this.lastUpdateCz = pcz;
    this.anyDirty = false;
    const genLimit = 3 + this.chunkSpeed * 2;
    const meshLimit = 2 + this.chunkSpeed * 2;
    // dirty chunks first (player edits)
    if (this.meshInFlight < meshLimit + 2) {
      for (const c of this.chunks.values()) {
        if (c.dirty && Math.abs(c.cx - pcx) <= R && Math.abs(c.cz - pcz) <= R && this.neighborsLoaded(c.cx, c.cz)) {
          this.requestMesh(c);
          if (this.meshInFlight >= meshLimit + 2) break;
        }
      }
    }
    // Two passes: chunks in front of the camera first (so the view fills in fastest), then the rest.
    for (let pass = 0; pass < 2; pass++) {
      for (const [dx, dz, d] of this.offsets) {
        const inFront = d < 1.5 || dx * this.viewDirX + dz * this.viewDirZ > -0.2 * d;
        if ((pass === 0) !== inFront) continue;
        const cx = pcx + dx, cz = pcz + dz;
        const key = chunkKey(cx, cz);
        const c = this.chunks.get(key);
        if (!c) {
          if (this.genInFlight.size < genLimit && !this.genInFlight.has(key)) {
            this.genInFlight.add(key);
            const ed = this.edits.get(key);
            const edits: number[] = [];
            if (ed) for (const [i, id] of ed) edits.push(i, id);
            this.worker.postMessage({ type: 'gen', cx, cz, edits });
          }
          continue;
        }
        if (d <= R && c.meshState === 'none' && this.meshInFlight < meshLimit && this.neighborsLoaded(cx, cz)) this.requestMesh(c);
      }
    }
    // unload
    for (const c of this.chunks.values()) {
      if (Math.abs(c.cx - pcx) > R + 2 || Math.abs(c.cz - pcz) > R + 2) {
        this.disposeMeshes(c);
        this.chunks.delete(chunkKey(c.cx, c.cz));
        this.worker.postMessage({ type: 'unload', cx: c.cx, cz: c.cz });
      } else if (c.meshState === 'ready' && (Math.abs(c.cx - pcx) > R || Math.abs(c.cz - pcz) > R)) {
        this.disposeMeshes(c);
        c.meshState = 'none';
      }
    }
    this.stats.loaded = this.chunks.size;
    this.stats.pendingGen = this.genInFlight.size;
  }

  private neighborsLoaded(cx: number, cz: number): boolean {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (!this.chunks.has(chunkKey(cx + dx, cz + dz))) return false;
    return true;
  }

  private requestMesh(c: Chunk): void {
    c.dirty = false;
    c.meshState = c.meshState === 'ready' ? 'ready' : 'pending';
    c.meshId = this.nextMeshId++;
    this.meshInFlight++;
    this.worker.postMessage({ type: 'mesh', cx: c.cx, cz: c.cz, id: c.meshId });
  }

  /** Fraction of chunks within radius r of a point that are meshed. */
  readiness(px: number, pz: number, r: number): number {
    const pcx = Math.floor(px / S), pcz = Math.floor(pz / S);
    let total = 0, ready = 0;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      total++;
      const c = this.chunks.get(chunkKey(pcx + dx, pcz + dz));
      if (c && c.meshState === 'ready') ready++;
    }
    return ready / total;
  }

  serializeEdits(): Record<string, number[]> {
    const out: Record<string, number[]> = {};
    for (const [k, m] of this.edits) {
      const arr: number[] = [];
      for (const [i, id] of m) arr.push(i, id);
      out[k] = arr;
    }
    return out;
  }

  loadEdits(e: Record<string, number[]>): void {
    this.edits.clear();
    for (const k in e) {
      const m = new Map<number, number>();
      const arr = e[k];
      for (let i = 0; i < arr.length; i += 2) m.set(arr[i], arr[i + 1]);
      this.edits.set(k, m);
    }
  }

  setTime(t: number): void {
    this.opaqueMat.uniforms.uTime.value = t;
    this.waterMat.uniforms.uTime.value = t;
  }

  setLighting(daylight: number, fog: THREE.Color, near: number, far: number, tint: THREE.Color, sunDir?: THREE.Vector3, sunStrength = 1, wind = 0): void {
    for (const m of [this.opaqueMat, this.waterMat]) {
      m.uniforms.uDaylight.value = daylight;
      (m.uniforms.uFogColor.value as THREE.Color).copy(fog);
      m.uniforms.uFogNear.value = near;
      m.uniforms.uFogFar.value = far;
      (m.uniforms.uSkyTint.value as THREE.Color).copy(tint);
      if (sunDir) (m.uniforms.uSunDir.value as THREE.Vector3).copy(sunDir);
      m.uniforms.uSunStrength.value = sunStrength;
      m.uniforms.uWind.value = wind;
    }
  }

  /** Brightness / gamma setting (0 = authored look, 1 = lifted shadows). */
  setBrightness(v: number): void {
    this.opaqueMat.uniforms.uBrightness.value = v;
    this.waterMat.uniforms.uBrightness.value = v;
  }

  /** Switch the shader-pack features on the chunk materials (recompiles the two shaders once). */
  setShaderFeatures(f: ShaderFeatures): void {
    setShaderFeatures(this.opaqueMat, f);
    setShaderFeatures(this.waterMat, f);
  }

  dispose(): void {
    for (const c of this.chunks.values()) this.disposeMeshes(c);
    this.chunks.clear();
    this.worker.terminate();
    this.opaqueMat.dispose();
    this.waterMat.dispose();
  }
}

export const BLOCK_ENTITY_BLOCKS = new Set<number>([B.CHEST, B.FURNACE, B.FURNACE_LIT, B.BARREL, B.RUNE_ALTAR, B.BREWING_HEARTH]);
