import * as THREE from 'three';
import { getAtlas } from '../blocks/TextureAtlas';
import { BLOCKS } from '../blocks/Blocks';
import { ATLAS_COLS, ATLAS_ROWS } from '../blocks/Tiles';
import { T } from '../blocks/Tiles';

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number;
  size: number;
  u: number; v: number; // uv offset within tile (0..0.75)
  uvSize: number;       // fraction of the tile sampled
  tile: number;
  r: number; g: number; b: number;
  gravity: number;
  collide: boolean;
  fade: boolean;
  drag: number;
}

const MAX = 2000;

/**
 * Billboard particle system rendered as a single THREE.Points object with a custom shader.
 * `points` must be added to the scene by the owner; `getBlock` is used for collisions.
 */
export class ParticleSystem {
  points: THREE.Points;
  /** 0 = none, 1 = reduced, 2 = all */
  quality = 2;
  getBlock: (x: number, y: number, z: number) => number = () => 0;
  private particles: Particle[] = [];
  private pos: Float32Array;
  private uvs: Float32Array;
  private cols: Float32Array;
  private sizes: Float32Array;
  private geo: THREE.BufferGeometry;
  private mat: THREE.ShaderMaterial;
  /** Number of live particles. */
  get count(): number { return this.particles.length; }

  constructor() {
    this.pos = new Float32Array(MAX * 3);
    this.uvs = new Float32Array(MAX * 3);
    this.cols = new Float32Array(MAX * 3);
    this.sizes = new Float32Array(MAX);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aUv', new THREE.BufferAttribute(this.uvs, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aCol', new THREE.BufferAttribute(this.cols, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uAtlas: { value: getAtlas().texture }, uScale: { value: 600 } },
      vertexShader: /* glsl */ `
        attribute vec3 aUv;
        attribute vec3 aCol;
        attribute float aSize;
        uniform float uScale;
        varying vec3 vUv;
        varying vec3 vCol;
        void main() {
          vUv = aUv;
          vCol = aCol;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.5, -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uAtlas;
        varying vec3 vUv;
        varying vec3 vCol;
        void main() {
          vec2 uv = vUv.xy + gl_PointCoord * vUv.z;
          vec4 t = texture2D(uAtlas, uv);
          if (t.a < 0.4) discard;
          // atlas sample is linear (encode it); vCol is an authored display-space colour
          gl_FragColor = vec4(pow(t.rgb, vec3(1.0 / 2.2)) * vCol, 1.0);
        }
      `,
      transparent: false,
      depthWrite: true,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
  }

  /** Round-robin index used to evict the oldest particle once the buffer is full. */
  private evict = 0;

  private add(p: Particle): void {
    if (this.quality === 0) return;
    if (this.quality === 1 && Math.random() < 0.5) return;
    if (this.particles.length >= MAX) {
      // Overwrite in place rather than Array.shift(). shift() is O(n): at MAX=2000 it moved ~2000
      // entries for EVERY particle spawned once the buffer was full -- i.e. exactly during heavy
      // mining/explosions, when the frame budget is already tight. The update loop compacts the
      // array each frame, so the slot order carries no meaning and overwriting is safe.
      this.particles[this.evict] = p;
      this.evict = (this.evict + 1) % MAX;
      return;
    }
    this.particles.push(p);
  }

  private static tileFor(color: [number, number, number] | undefined): { tile: number; r: number; g: number; b: number } {
    // Particles use the plain white tile tinted with the average block colour: this keeps them readable at any size.
    if (!color) return { tile: T.white, r: 1, g: 1, b: 1 };
    return { tile: T.white, r: color[0], g: color[1], b: color[2] };
  }

  // ------------------------------------------------------------------ material chips
  // Block particles sample the block's OWN atlas tiles (actual texture pixels: wood grain, stone
  // grit, sand speckle...), and each material family gets its own count, size, weight and drag so
  // sand crumbles, stone chips heavy and glass glints. styleForBlock classifies a block id once.

  private static styleForBlock(id: number): { count: number; sizeMin: number; sizeMax: number; lifeMin: number; lifeMax: number; speed: number; up: number; gravity: number; drag: number; spark: number } {
    const def = BLOCKS[id];
    const n = def ? def.name : '';
    const tool = def?.tool;
    const shape = def?.shape;
    // cross-shaped blocks and crops are fragile: a small, light puff
    if (shape === 'cross') return { count: 9, sizeMin: 0.05, sizeMax: 0.1, lifeMin: 0.3, lifeMax: 0.55, speed: 1.7, up: 1.4, gravity: 8, drag: 2.2, spark: 0 };
    if (n.includes('glass') || n === 'Ice' || n.includes('ice')) return { count: 14, sizeMin: 0.07, sizeMax: 0.13, lifeMin: 0.35, lifeMax: 0.7, speed: 3.2, up: 2, gravity: 11, drag: 1.2, spark: 0.35 };
    if (n.includes('sand')) return { count: 30, sizeMin: 0.045, sizeMax: 0.1, lifeMin: 0.22, lifeMax: 0.5, speed: 2.4, up: 1.5, gravity: 13, drag: 2.4, spark: 0 };
    if (n.includes('gravel')) return { count: 26, sizeMin: 0.055, sizeMax: 0.12, lifeMin: 0.3, lifeMax: 0.6, speed: 2.8, up: 1.8, gravity: 15, drag: 1.6, spark: 0 };
    if (n.includes('leaves')) return { count: 18, sizeMin: 0.05, sizeMax: 0.1, lifeMin: 0.35, lifeMax: 0.8, speed: 2, up: 1.6, gravity: 6, drag: 1.6, spark: 0 };
    if (n === 'Snow' || n.includes('snow')) return { count: 16, sizeMin: 0.05, sizeMax: 0.1, lifeMin: 0.25, lifeMax: 0.5, speed: 1.8, up: 1.2, gravity: 9, drag: 2, spark: 0 };
    if (n.includes('ore') || n === 'Lumen' || n.includes('ember') || n.includes('crystal')) return { count: 28, sizeMin: 0.07, sizeMax: 0.15, lifeMin: 0.4, lifeMax: 0.85, speed: 3.6, up: 2.4, gravity: 17, drag: 1.1, spark: 0.8 };
    if (tool === 'pickaxe' || def?.sound === 'stone') return { count: 24, sizeMin: 0.075, sizeMax: 0.16, lifeMin: 0.4, lifeMax: 0.9, speed: 3.4, up: 2.2, gravity: 18, drag: 1.1, spark: 0.18 };
    if (def?.sound === 'wood') return { count: 20, sizeMin: 0.07, sizeMax: 0.14, lifeMin: 0.45, lifeMax: 0.95, speed: 2.8, up: 2.2, gravity: 11, drag: 1.4, spark: 0 };
    if (tool === 'shovel' || tool === 'hoe') return { count: 22, sizeMin: 0.055, sizeMax: 0.12, lifeMin: 0.3, lifeMax: 0.6, speed: 2.3, up: 1.6, gravity: 13, drag: 2, spark: 0 };
    return { count: 18, sizeMin: 0.06, sizeMax: 0.13, lifeMin: 0.3, lifeMax: 0.7, speed: 2.6, up: 1.8, gravity: 13, drag: 1.6, spark: 0.1 };
  }

  /** atlas tile index for the block face a hit normal points at (mesher order: 0 top, 1 bottom, 2/3 ±z, 4/5 ±x). */
  private static faceTile(def: { tiles: number[] }, nx: number, ny: number, nz: number): number {
    const tiles = def.tiles;
    if (ny === 1) return tiles[0];
    if (ny === -1) return tiles[1];
    if (nz === 1) return tiles[2];
    if (nz === -1) return tiles[3];
    return nx === 1 ? tiles[4] : tiles[5];
  }

  /** Which tile the chips of a broken block mostly come from: weighted toward the sides, tops for grass-y blocks. */
  private static randomTile(def: { tiles: number[]; tint?: boolean }, topBias = false): number {
    const tiles = def.tiles;
    if (def.tint && tiles[0] !== tiles[2]) {
      // grass-like: mostly dirt sides with some green-top chips for character
      return Math.random() < 0.28 ? tiles[0] : tiles[2];
    }
    const r = Math.random();
    if (topBias && r < 0.4) return tiles[0];
    if (r < 0.62) return tiles[2];
    if (r < 0.78) return tiles[3];
    if (r < 0.9) return tiles[4];
    return tiles[5];
  }

  /** One textured chip: samples a random sub-square of one atlas tile so the block's own pixels show. */
  private emitChip(defId: number, tile: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, opts: { size: number; life: number; gravity: number; drag: number; shade: number }): void {
    const s = Math.random() < 0.45 ? 0.5 : Math.random() < 0.6 ? 0.375 : 0.25; // 8px / 6px / 4px chunks of the 16px tile
    const u = Math.random() * (1 - s);
    const v = Math.random() * (1 - s);
    const col = tile % ATLAS_COLS;
    const row = Math.floor(tile / ATLAS_COLS);
    void col; void row;
    const sh = opts.shade;
    this.add({
      x, y, z, vx, vy, vz,
      life: 0, maxLife: opts.life, size: opts.size,
      u, v, uvSize: s, tile,
      r: sh, g: sh, b: sh, gravity: opts.gravity, collide: true, fade: false, drag: opts.drag,
    });
  }

  /** Tiny bright glint (stone/ore/gold sparks) - white-hot and short-lived. */
  private emitGlint(x: number, y: number, z: number, vx: number, vy: number, vz: number, tint = 1): void {
    this.add({
      x, y, z, vx, vy, vz,
      life: 0, maxLife: 0.18 + Math.random() * 0.15, size: 0.03 + Math.random() * 0.03,
      u: 0.25, v: 0.25, uvSize: 0.5, tile: T.white,
      r: 1, g: 0.95 * tint, b: 0.75 * tint, gravity: 2, collide: false, fade: true, drag: 0.4,
    });
  }

  /** Dust puff used when soft blocks (dirt/sand/gravel) give way. */
  private emitDust(x: number, y: number, z: number, r: number, g: number, b: number): void {
    this.add({
      x, y, z,
      vx: (Math.random() - 0.5) * 0.8, vy: 0.4 + Math.random() * 0.5, vz: (Math.random() - 0.5) * 0.8,
      life: 0, maxLife: 0.5 + Math.random() * 0.3, size: 0.09 + Math.random() * 0.06,
      u: 0.25, v: 0.25, uvSize: 0.5, tile: T.white, r: r, g: g, b: b,
      gravity: -0.3, collide: false, fade: true, drag: 1.6,
    });
  }

  /** Chips knocked off the exact face being mined, every time the tool bites. */
  blockHitFx(x: number, y: number, z: number, nx: number, ny: number, nz: number, blockId: number): void {
    const def = BLOCKS[blockId];
    if (!def) return;
    const st = ParticleSystem.styleForBlock(blockId);
    const face = ParticleSystem.faceTile(def, nx, ny, nz);
    const n = Math.max(1, Math.min(4, Math.round(st.count / 8)));
    for (let i = 0; i < n; i++) {
      const tanX = nz !== 0 ? 1 : 0, tanY = nx !== 0 ? 1 : 0, tanZ = ny !== 0 ? 1 : 0;
      const px = x + 0.5 + nx * 0.5 + (Math.random() - 0.5) * (nx ? 0.3 : 0.9);
      const py = y + 0.5 + ny * 0.5 + (Math.random() - 0.5) * (ny ? 0.3 : 0.9);
      const pz = z + 0.5 + nz * 0.5 + (Math.random() - 0.5) * (nz ? 0.3 : 0.9);
      const sp = st.speed * (0.55 + Math.random() * 0.7);
      const jx = (Math.random() - 0.5) * 1.2 * (tanX || 1) + (nx ? 0 : (Math.random() - 0.5) * 1.1);
      const jy = (Math.random() - 0.5) * 1.2 * (tanY || 1) + 0.4 + Math.random() * 0.8;
      const jz = (Math.random() - 0.5) * 1.2 * (tanZ || 1) + (nz ? 0 : (Math.random() - 0.5) * 1.1);
      this.emitChip(blockId, face, px, py, pz, nx * sp + jx, ny * sp + jy, nz * sp + jz, {
        size: st.sizeMin + Math.random() * (st.sizeMax - st.sizeMin) * 0.7,
        life: st.lifeMin * 0.6 + Math.random() * st.lifeMax * 0.5,
        gravity: st.gravity, drag: st.drag, shade: 0.8 + Math.random() * 0.35,
      });
    }
    if (st.spark > 0 && Math.random() < st.spark) {
      this.emitGlint(x + 0.5 + nx * 0.5, y + 0.5 + ny * 0.5, z + 0.5 + nz * 0.5, nx * 1.8 + (Math.random() - 0.5), ny * 1.8 + Math.random(), nz * 1.8 + (Math.random() - 0.5));
    }
  }

  /** The satisfying final-break burst: a full textured cube-burst plus glints and a soft dust ring. */
  blockBreakFx(x: number, y: number, z: number, blockId: number): void {
    const def = BLOCKS[blockId];
    if (!def) return;
    const st = ParticleSystem.styleForBlock(blockId);
    const n = Math.max(10, Math.round(st.count * (this.quality === 1 ? 0.6 : 1)));
    for (let i = 0; i < n; i++) {
      const tile = ParticleSystem.randomTile(def, i % 5 === 0);
      const px = x + 0.1 + Math.random() * 0.8, py = y + 0.1 + Math.random() * 0.8, pz = z + 0.1 + Math.random() * 0.8;
      const a = Math.random() * Math.PI * 2, el = (Math.random() - 0.3) * Math.PI * 0.9;
      const sp = st.speed * (0.5 + Math.random() * 0.9);
      const vx = Math.cos(a) * Math.cos(el) * sp;
      const vy = Math.sin(el) * sp + 1.2 + Math.random() * 1.6;
      const vz = Math.sin(a) * Math.cos(el) * sp;
      this.emitChip(blockId, tile, px, py, pz, vx, vy, vz, {
        size: st.sizeMin + Math.random() * (st.sizeMax - st.sizeMin),
        life: st.lifeMin + Math.random() * st.lifeMax,
        gravity: st.gravity, drag: st.drag, shade: 0.75 + Math.random() * 0.45,
      });
    }
    if (st.spark > 0) {
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 2.5;
        this.emitGlint(x + 0.5, y + 0.5, z + 0.5, Math.cos(a) * sp, 1 + Math.random() * 2, Math.sin(a) * sp);
      }
    }
    // soft blocks leave a brief dust haze
    const name = def.name;
    if (name.includes('sand') || name.includes('dirt') || name.includes('gravel') || name.includes('clay') || name.includes('grass') || name.includes('farmland')) {
      const c = getAtlas().tileColor(def.tiles[2]);
      for (let i = 0; i < 3; i++) this.emitDust(x + 0.3 + Math.random() * 0.4, y + 0.3 + Math.random() * 0.4, z + 0.3 + Math.random() * 0.4, c[0] * 0.8, c[1] * 0.8, c[2] * 0.8);
    }
  }

  smoke(x: number, y: number, z: number, count = 1, dark = false): void {
    for (let i = 0; i < count; i++) {
      const s = (dark ? 0.2 : 0.55) + Math.random() * 0.15;
      this.add({
        x: x + (Math.random() - 0.5) * 0.4, y, z: z + (Math.random() - 0.5) * 0.4,
        vx: (Math.random() - 0.5) * 0.3, vy: 0.6 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 0.3,
        life: 0, maxLife: 1 + Math.random(), size: 0.12 + Math.random() * 0.08, u: 0.25, v: 0.25, uvSize: 0.5, tile: T.white, r: s, g: s, b: s,
        gravity: -0.4, collide: false, fade: true, drag: 0.5,
      });
    }
  }

  flame(x: number, y: number, z: number, count = 1): void {
    for (let i = 0; i < count; i++) {
      this.add({
        x: x + (Math.random() - 0.5) * 0.5, y, z: z + (Math.random() - 0.5) * 0.5,
        vx: 0, vy: 0.4 + Math.random() * 0.5, vz: 0,
        life: 0, maxLife: 0.5 + Math.random() * 0.4, size: 0.08, u: 0.25, v: 0.25, uvSize: 0.5, tile: T.white, r: 1, g: 0.6 + Math.random() * 0.3, b: 0.1,
        gravity: 0, collide: false, fade: true, drag: 0,
      });
    }
  }

  splash(x: number, y: number, z: number, count = 8): void {
    for (let i = 0; i < count; i++) {
      this.add({
        x: x + (Math.random() - 0.5) * 0.6, y, z: z + (Math.random() - 0.5) * 0.6,
        vx: (Math.random() - 0.5) * 2.5, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 2.5,
        life: 0, maxLife: 0.5 + Math.random() * 0.4, size: 0.07, u: 0.25, v: 0.25, uvSize: 0.5, tile: T.white, r: 0.5, g: 0.65, b: 1,
        gravity: 14, collide: false, fade: true, drag: 1,
      });
    }
  }

  /** Damage particles (red) or critical hit sparks (yellow). */
  hit(x: number, y: number, z: number, crit = false): void {
    const n = crit ? 12 : 5;
    for (let i = 0; i < n; i++) {
      this.add({
        x: x + (Math.random() - 0.5) * 0.6, y: y + Math.random() * 1.2, z: z + (Math.random() - 0.5) * 0.6,
        vx: (Math.random() - 0.5) * 3, vy: Math.random() * 3, vz: (Math.random() - 0.5) * 3,
        life: 0, maxLife: 0.4 + Math.random() * 0.3, size: 0.08, u: 0.25, v: 0.25, uvSize: 0.5, tile: T.white,
        r: crit ? 1 : 0.9, g: crit ? 0.9 : 0.15, b: crit ? 0.3 : 0.15, gravity: crit ? 4 : 10, collide: false, fade: true, drag: 1.5,
      });
    }
  }

  /** Floating coloured sparkles (portals, enchanting, healing...). */
  magic(x: number, y: number, z: number, count = 6, color: [number, number, number] = [0.8, 0.5, 1]): void {
    for (let i = 0; i < count; i++) {
      this.add({
        x: x + (Math.random() - 0.5) * 1.2, y: y + (Math.random() - 0.2) * 1.5, z: z + (Math.random() - 0.5) * 1.2,
        vx: (Math.random() - 0.5) * 0.6, vy: 0.3 + Math.random() * 0.8, vz: (Math.random() - 0.5) * 0.6,
        life: 0, maxLife: 0.8 + Math.random() * 0.7, size: 0.05 + Math.random() * 0.05, u: 0.25, v: 0.25, uvSize: 0.5, tile: T.white,
        r: color[0], g: color[1], b: color[2], gravity: -0.2, collide: false, fade: true, drag: 0.4,
      });
    }
  }

  explosion(x: number, y: number, z: number, radius = 3): void {
    for (let i = 0; i < 60; i++) {
      const dx = Math.random() - 0.5, dy = Math.random() - 0.5, dz = Math.random() - 0.5;
      const l = Math.hypot(dx, dy, dz) || 1;
      const sp = Math.random() * radius * 3;
      const grey = 0.3 + Math.random() * 0.5;
      this.add({
        x, y, z, vx: dx / l * sp, vy: dy / l * sp + 2, vz: dz / l * sp,
        life: 0, maxLife: 0.8 + Math.random() * 0.8, size: 0.2 + Math.random() * 0.3, u: 0.25, v: 0.25, uvSize: 0.5, tile: T.white, r: grey, g: grey, b: grey,
        gravity: 2, collide: false, fade: true, drag: 2,
      });
    }
    for (let i = 0; i < 20; i++) {
      this.add({
        x, y, z, vx: (Math.random() - 0.5) * radius * 4, vy: Math.random() * radius * 3, vz: (Math.random() - 0.5) * radius * 4,
        life: 0, maxLife: 0.4 + Math.random() * 0.4, size: 0.15, u: 0.25, v: 0.25, uvSize: 0.5, tile: T.white, r: 1, g: 0.7, b: 0.2,
        gravity: 6, collide: false, fade: true, drag: 1.5,
      });
    }
  }

  drip(x: number, y: number, z: number, lava: boolean): void {
    this.add({
      x, y, z, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 2, size: 0.06, u: 0.25, v: 0.25, uvSize: 0.5, tile: T.white,
      r: lava ? 1 : 0.4, g: lava ? 0.5 : 0.6, b: lava ? 0.1 : 1, gravity: 12, collide: true, fade: false, drag: 0,
    });
  }

  /**
   * Point sprites are sized in device pixels: `size` is the particle's world-space diameter, so the pixel size is
   * size * (viewportHeight / (2 * tan(fov/2))) / depth. Call this whenever the viewport, pixel ratio or FOV changes.
   */
  setView(heightPx: number, fovDeg: number): void {
    const f = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.mat.uniforms.uScale.value = f;
  }

  update(dt: number): void {
    const ps = this.particles;
    let w = 0;
    const solid = (x: number, y: number, z: number) => { const id = this.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)); return id !== 0 && !!BLOCKS[id]?.solid; };
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life += dt;
      if (p.life >= p.maxLife) continue;
      p.vy -= p.gravity * dt;
      const d = Math.max(0, 1 - dt * p.drag);
      p.vx *= d; p.vz *= d;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      if (p.collide) {
        if (solid(p.x, ny, p.z)) { if (p.vy < 0) { p.vy = 0; p.vx *= 0.6; p.vz *= 0.6; } else p.vy = 0; }
        else p.y = ny;
        if (!solid(nx, p.y, p.z)) p.x = nx; else p.vx = 0;
        if (!solid(p.x, p.y, nz)) p.z = nz; else p.vz = 0;
      } else { p.x = nx; p.y = ny; p.z = nz; }
      ps[w] = p;
      const t = p.life / p.maxLife;
      const size = p.fade ? p.size * (1 - t * 0.7) : p.size;
      const o3 = w * 3;
      this.pos[o3] = p.x; this.pos[o3 + 1] = p.y; this.pos[o3 + 2] = p.z;
      const col = p.tile % ATLAS_COLS, row = Math.floor(p.tile / ATLAS_COLS);
      this.uvs[o3] = (col + p.u) / ATLAS_COLS; this.uvs[o3 + 1] = (row + p.v) / ATLAS_ROWS; this.uvs[o3 + 2] = p.uvSize / ATLAS_COLS;
      const fade = p.fade ? 1 - t * 0.6 : 1;
      this.cols[o3] = p.r * fade; this.cols[o3 + 1] = p.g * fade; this.cols[o3 + 2] = p.b * fade;
      this.sizes[w] = size;
      w++;
    }
    ps.length = w;
    this.geo.setDrawRange(0, w);
    if (w > 0 || this.geo.drawRange.count > 0) {
      (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (this.geo.attributes.aUv as THREE.BufferAttribute).needsUpdate = true;
      (this.geo.attributes.aCol as THREE.BufferAttribute).needsUpdate = true;
      (this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    }
    this.points.visible = w > 0;
  }

  clear(): void {
    this.particles.length = 0;
    this.geo.setDrawRange(0, 0);
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
