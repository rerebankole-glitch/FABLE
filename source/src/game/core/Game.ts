import * as THREE from 'three';
import { B, BLOCKS, BLOCK_BY_NAME, CROP_STAGES, SAPLING_TREE, blockDef, isLog, type BlockDef } from '../blocks/Blocks';
import { getAtlas } from '../blocks/TextureAtlas';
import { T } from '../blocks/Tiles';
import { World, BLOCK_ENTITY_BLOCKS, type BlockEntity } from '../world/World';
import { placeTree } from '../world/Generator';
import { BIOMES, leafTint } from '../world/Biomes';
import { Player, type DamageSource } from '../player/Player';
import { segmentBlocked } from '../player/Physics';
import { GAME_TITLE, GAME_VERSION } from './brand';
import { Discovery } from './Discovery';
import { market } from './Marketplace';
import { EntityManager, ItemEntity, Mob, MOBS, OreCart, Projectile, Skiff, StuckBlade, Vehicle, XpOrb, type EntityContext } from '../entities/Entities';
import { solveShape, TRACK_SHAPES } from '../world/Rails';
import { SKIFF_DRAFT as SKIFF_FLOAT } from '../world/Boating';
import { ParticleSystem } from '../particles/Particles';
import { Environment } from '../renderer/Environment';
import { audio } from '../audio/Audio';
import { settings, shaderFeatures, postFxActive } from './Settings';
import { activeSkinCanvas, activeSkinSlim, activeSkinKey, prepareSkinCanvas, buildSkinArmMesh, paletteArmCanvas } from './SkinTexture';
import { SaveManager } from '../save/SaveManager';
import { ArrayContainer, clickSlot, quickMove, type Container } from '../inventory/Inventory';
import { ITEMS, itemDef, makeStack } from '../items/Items';
import { itemModelMesh } from '../items/ItemModel';
import { PostFX } from '../renderer/PostFX';
import { matchRecipe, recipeResult, consumeGrid, SMELTING } from '../crafting/Recipes';
import { fuse, strip, canFuse, runesOn } from '../crafting/Reforging';
import { generateLoot, makeTrades, type Trade } from '../structures/Loot';
import { NullTransport, type Transport, type RemotePlayer } from '../network/Network';
import { mulberry32, hash2 } from '../world/Noise';
import { CHUNK_HEIGHT, SEA_LEVEL, clamp, seedFromText, type ItemStack, type WorldOptions, type WorldSave } from './types';
import { store } from '../../ui/store';
import { DIMENSIONS, dimName, type Dim } from '../world/Dimensions';
import { propagate, computeField, powerAt, type SignalBlocks } from '../redstone/Signal';
import { BREW_BASE, BREW_SECONDS, draughtFor, DRAUGHT_BY_ID } from '../brewing/Brewing';
import { fill as pailFill, empty as pailEmpty, PAIL_EMPTY, PAIL_WATER, PAIL_LAVA, type PailState } from '../items/Bucket';

/**
 * Which block ids play which role in the Spark circuit engine. The engine itself knows nothing
 * about FABLE's block table -- it just compares the ids handed to it here.
 */
const SIGNAL_BLOCKS: SignalBlocks = {
  air: B.AIR,
  dust: B.SPARK_DUST, torchOn: B.SPARK_TORCH, torchOff: B.SPARK_TORCH_OFF,
  lever: B.SPARK_LEVER, leverOn: B.SPARK_LEVER_ON,
  button: B.SPARK_LEVER, buttonOn: B.SPARK_LEVER_ON,
  plate: B.SPARK_PLATE, plateOn: B.SPARK_PLATE_ON,
  shunt: B.SHUNT, shuntOn: B.SHUNT_ON,
  door: [B.DOOR_LOWER_Z, B.DOOR_UPPER_Z, B.DOOR_LOWER_X, B.DOOR_UPPER_X],
  trapdoor: B.SPARK_PLATE, trapdoorOpen: B.SPARK_PLATE_ON,
};

const PAIL_WORLD_BLOCKS = { air: B.AIR, water: B.WATER, lava: B.LAVA };

/** Every block that takes part in a circuit, for the "did I just change a wire?" check. */
const SIGNAL_PARTS = new Set<number>([
  B.SPARK_DUST, B.SPARK_DUST_ON, B.SPARK_TORCH, B.SPARK_TORCH_OFF,
  B.SPARK_LEVER, B.SPARK_LEVER_ON, B.SPARK_PLATE, B.SPARK_PLATE_ON, B.SHUNT, B.SHUNT_ON,
]);

export interface RaycastHit { x: number; y: number; z: number; nx: number; ny: number; nz: number; dist: number; id: number }


/** Slash commands that are handled by the multiplayer server (everything else runs locally). */
const SERVER_COMMANDS = new Set(['list', 'spawn', 'save', 'time', 'seed', 'help']);

export class Game {
  static instance: Game | null = null;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  world!: World;
  player = new Player();
  entities = new EntityManager();
  particles = new ParticleSystem();
  env = new Environment();
  options: WorldOptions;
  saveId: string;
  created: number;
  playTime = 0;
  dayTime = 1000;
  day = 0;
  weather: { type: 'clear' | 'rain' | 'storm'; timer: number } = { type: 'clear', timer: 600 };
  dimension: Dim = 'overworld';
  dimEdits: Record<Dim, Record<string, number[]>> = { overworld: {}, void: {} };
  transport: Transport = new NullTransport();
  remotePlayers = new Map<string, RemotePlayer & { mob: Mob }>();
  running = false;
  paused = false;
  private raf = 0;
  private lastTime = 0;
  keys = new Set<string>();
  mouse = [false, false, false];
  pointerLocked = false;
  target: RaycastHit | null = null;
  targetEntity: Mob | null = null;
  mineProgress = 0;
  private mineSoundTimer = 0;
  private crackMesh: THREE.Mesh;
  private crackTextures: THREE.CanvasTexture[] = [];
  private crackStage = -1;
  private selection: THREE.LineSegments;
  private preview: THREE.Mesh;
  private hand = new THREE.Group();
  /**
   * The gripping arm while an item is held. It is a SIBLING of `hand`, not a child: the held item
   * carries the vanilla FIRST_PERSON display transform (a -135 degree yaw + 1.7 scale) which would
   * turn an arm parented under it edge-on and giant. Posed with the same vanilla arm chain as the
   * empty hand, nudged so the fist meets the item's handle.
   */
  private handArm = new THREE.Group();
  private handArmContent: THREE.Object3D | null = null;
  /** overlay scene the camera (and thus the hand) belongs to; rendered after the world with cleared depth */
  private handScene = new THREE.Scene();
  private handContent: THREE.Object3D | null = null;
  private handBiome = -1;
  private handTinted = false;
  private handItem = '__none';
  private swingP = 1; // swing progress 0..1 (0 = swing just started, pose at rest; 1 = idle rest)
  private swingRate = 3.333; // progress per second: 300 ms full swing (vanilla 6 ticks); mining chops at 150 ms
  private useHold = 0;
  private eatTimer = 0;
  private bowCharge = -1;
  private placeCooldown = 0;
  private attackCooldown = 0;
  /** Vanilla's 5-tick pause after a block breaks before the next can be started. */
  private breakDelay = 0;
  private hudTimer = 0;
  private autosaveTimer = 0;
  private randomTickTimer = 0;
  private sleepTimer = -1;
  private portalTimer = 0;
  private lightningTimer = 8;
  private fovCurrent = 75;
  private saving = false;
  private lastPosSend = 0;
  private hurtFlash = 0;
  private hurtCause: 'hurt' | 'drown' | 'starve' = 'hurt';
  openContainer: ArrayContainer | null = null;
  openEntity: BlockEntity | null = null;
  craftGrid = new ArrayContainer(9);
  craftOutput: Container;
  altarContainer = new ArrayContainer(2);
  /** Mending Stone: two slots, either two worn tools to fuse or one tool to grind a rune off. */
  mendingContainer = new ArrayContainer(2);
  /** Spark Plates currently held down by the player, keyed "x,y,z". */
  private pressedPlates = new Set<string>();
  /** Doors a circuit currently holds open, mapped to the orientation they rested at. */
  private signalDoors = new Map<string, number>();
  tradeMob: Mob | null = null;
  trades: Trade[] = [];
  debug = false;
  fps = 0;
  private frames = 0;
  private fpsTimer = 0;
  entityCtx!: EntityContext;

  /**
   * Device-pixel ratio the scene is rendered at. This is the panel's real device ratio scaled by the
   * "Render Scale" setting, so Low renders below native (weak GPUs), Medium is exactly native
   * (crisp, correctly-sampled 1080p) and High/Ultra supersample above native so voxel edges stay
   * clean instead of stair-stepping. Capped at 2x (4x the pixels of native) so the heaviest setting
   * stays affordable on integrated graphics.
   */
  private targetPixelRatio(src?: { renderScale: number }): number {
    const s = src ?? settings.value;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const scale = s.renderScale || 1;
    return Math.min(2, Math.max(0.5, dpr * scale));
  }

  constructor(canvas: HTMLCanvasElement, options: WorldOptions, saveId: string, created: number) {
    Game.instance = this;
    this.options = options;
    this.saveId = saveId;
    this.created = created;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.targetPixelRatio());
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.postFx = new PostFX(this.renderer);
    // GPU safety net (external playtest): the shader pack compiles fine on real GPUs but renders
    // broken (magenta patches / washed-out terrain) on software rasterisers (SwiftShader/llvmpipe)
    // and some mobile drivers. Software rendering is detected once here and the pack stays off;
    // anything that still fails to compile at runtime falls back via onShaderFailure below.
    try {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
      if (/swiftshader|llvmpipe|softpipe|software raster|basic render/i.test(gpu) && settings.value.shaders) settings.set('shaders', false);
    } catch { /* renderer info unavailable: the runtime fallback below still covers it */ }
    this.renderer.debug.onShaderError = () => this.onShaderFailure();
    this.camera = new THREE.PerspectiveCamera(settings.value.fov, window.innerWidth / window.innerHeight, 0.05, 600);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.env.group, this.entities.group, this.particles.points);
    this.camera.add(this.hand);
    this.camera.add(this.handArm);
    // The viewmodel lives in its own scene rendered AFTER the world with cleared depth: the hand
    // never fights world geometry (the old depthTest:false hack made the item's own back faces
    // paint over its front faces — held tools looked see-through), while self-occlusion inside
    // the hand (front vs back, arm vs item) now resolves correctly via the depth buffer.
    this.handScene.add(this.camera);
    this.hand.position.copy(Game.SHOULDER_REST);
    const atlas = getAtlas();
    for (let i = 0; i < 10; i++) {
      const c = document.createElement('canvas'); c.width = 16; c.height = 16;
      atlas.drawTile(c.getContext('2d')!, T.crack_0 + i, 0, 0, 16, undefined, 1, true);
      const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.premultiplyAlpha = false;
      this.crackTextures.push(t);
    }
    this.crackMesh = new THREE.Mesh(new THREE.BoxGeometry(1.005, 1.005, 1.005), new THREE.MeshBasicMaterial({ map: this.crackTextures[0], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.crackMesh.visible = false;
    this.selection = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 }));
    this.selection.visible = false;
    this.preview = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false }));
    this.preview.visible = false;
    this.scene.add(this.crackMesh, this.selection, this.preview);
    this.craftOutput = this.makeCraftOutput();
    this.particles.getBlock = (x, y, z) => { const id = this.world?.getBlock(x, y, z) ?? 0; return BLOCKS[id]?.solid ? id : 0; };
    this.player.mode = options.mode;
    this.player.difficulty = options.difficulty;
    // Hardcore rules (locked like Minecraft): Hard difficulty, no keep-inventory, and death is final.
    if (options.mode === 'hardcore') {
      this.options.difficulty = 'hard';
      this.options.keepInventory = false;
      this.player.difficulty = 'hard';
    }
    this.player.events.on('hurt', (dmg, src) => {
      this.hurtFlash = 1;
      // The tint colour tells the player WHY they are losing health: green for poison/starvation,
      // blue for drowning, red for everything physical. Reuses the existing damageTint overlay.
      this.hurtCause = src === 'starve' ? 'starve' : src === 'drown' ? 'drown' : 'hurt';
      audio.play('hurt');
      if (settings.value.cameraShake) this.camShake = 0.3;
      void dmg;
    });
    this.player.events.on('death', (src) => this.onDeath(src));
    this.player.events.on('levelup', () => {
      audio.play('levelup');
      // level-up reward: every level restores one heart — the HUD's heal-pop animation shows it
      if (!this.player.dead) this.player.health = Math.min(this.player.maxHealth, this.player.health + 2);
    });
    this.player.events.on('land', (d) => {
      const id = this.world.getBlock(Math.floor(this.player.body.x), Math.floor(this.player.body.y - 0.1), Math.floor(this.player.body.z));
      audio.play('step.' + blockDef(id).sound, { volume: Math.min(1, d / 4) });
      if (d > 3.5) audio.play('land', { volume: Math.min(1, (d - 3) / 8) }); // heavy thud on long falls
      if (this.player.body.inWater) audio.play('splash');
      // the first-person viewmodel gives a little on landing (bigger the harder the drop) and settles
      this.handLand = Math.min(0.16, 0.02 + d * 0.016);
    });
    this.player.events.on('sound', (n, v) => { if (n === 'step') this.footstep(); else if (n === 'jump') audio.play('jump', { volume: v ?? 0.3 }); else if (n === 'block') { audio.play('shield', { volume: 0.8 }); this.camShake = Math.max(this.camShake, 0.15); } });
    this.player.inventory.onChange = () => store.bump();
    this.bindInput();
  }
  camShake = 0;

  // ------------------------------------------------------------------ lifecycle
  async start(save: WorldSave | null): Promise<void> {
    const setStage = (stage: string, progress: number, detail = '') => store.set({ loading: { stage, progress, detail } });
    setStage('Building textures', 0.01);
    getAtlas();
    await new Promise((r) => setTimeout(r, 0));
    setStage('Starting audio', 0.03);
    audio.init();
    if (save) {
      this.dayTime = save.time; this.day = save.day; this.weather = save.weather; this.playTime = save.playTime ?? 0;
      const ed = save.edits;
      for (const k in ed) { if (k.startsWith('v:')) this.dimEdits.void[k.slice(2)] = ed[k]; else this.dimEdits.overworld[k] = ed[k]; }
      this.dimension = (save.player as any)?.dimension === 'void' ? 'void' : 'overworld';
    }
    this.createWorld(this.dimension, save?.visited ?? [], save?.blockEntities ?? {});
    setStage(save ? 'Restoring world' : 'Generating terrain', 0.08, `Seed ${this.options.seed}`);
    let spawn: [number, number, number];
    if (save?.player) {
      this.player.load(save.player);
      spawn = save.player.pos;
    } else {
      spawn = await this.findSpawn();
      this.player.setPosition(spawn[0], spawn[1], spawn[2]);
      this.player.spawn = [spawn[0], spawn[1], spawn[2]];
      if (this.options.bonusItems) {
        for (const s of [makeStack('wood_axe'), makeStack('wood_pickaxe'), makeStack('bread', 6), makeStack('oak_log', 12), makeStack('torch', 8), makeStack('apple', 4)]) this.player.inventory.add(s);
      }
    }
    setStage('Building terrain', 0.15);
    await this.waitForChunks(spawn[0], spawn[2], 2, (p) => setStage('Building terrain', 0.15 + p * 0.6, `${this.world.stats.loaded} chunks meshed`));
    setStage('Preparing sky and lighting', 0.8);
    this.applySettings();
    await new Promise((r) => setTimeout(r, 50));
    setStage('Spawning creatures', 0.88);
    if (save?.entities) this.entities.load(save.entities);
    await new Promise((r) => setTimeout(r, 50));
    setStage('Entering world', 0.97);
    if (!save?.player) {
      // ensure player stands on ground (or floats on the sea if the fallback spot is ocean)
      const y = Math.max(SEA_LEVEL + 1, this.world.surfaceY(Math.floor(spawn[0]), Math.floor(spawn[2])) + 1);
      this.player.setPosition(spawn[0], y, spawn[2]);
      this.player.spawn = [spawn[0], y, spawn[2]];
    }
    this.running = true;
    this.lastTime = performance.now();
    store.set({ screen: 'game', paused: false, dead: this.player.dead, worldName: this.options.name });
    this.updateHud();
    this.raf = requestAnimationFrame(this.loop);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('pagehide', this.onPageHide);
    document.addEventListener('visibilitychange', this.onVisibility);
    if (!save) this.message(`Welcome to ${this.options.name}! Punch a tree to begin.`);
  }

  /** Save when the tab is closed / navigated away (best-effort: the write may not complete, hence the .bak copy). */
  private onPageHide = (): void => { if (this.running) this.saveWorld(); };
  /** Pause + save when the tab is hidden so a backgrounded game never loses progress or runs blind. */
  private onVisibility = (): void => {
    if (document.visibilityState === 'hidden' && this.running) { this.saveWorld(); if (!this.transport.connected) this.pause(); }
  };

  private createWorld(dim: Dim, visited: string[], blockEntities: Record<string, unknown>): void {
    if (this.world) { this.scene.remove(this.world.group); this.world.dispose(); }
    this.world = new World({ seed: this.options.seed, structures: this.options.structures, worldType: this.options.worldType, dimension: dim }, settings.value.smoothLighting);
    this.world.renderDistance = settings.value.renderDistance;
    this.world.chunkSpeed = settings.value.chunkSpeed;
    this.world.loadEdits(this.dimEdits[dim]);
    for (const v of visited) if (v.startsWith(dim === 'void' ? 'v:' : 'o:')) this.world.visited.add(v.slice(2));
    // hydrate the discovery journal (keys are stored with a dimension stamp; the journal itself is world-wide)
    this.discovery.load(visited.filter((v) => /^[ov]:[blr]:/.test(v)).map((v) => v.slice(2)));
    for (const k in blockEntities) if (k.startsWith(dim === 'void' ? 'v:' : 'o:')) this.world.blockEntities.set(k.slice(2), blockEntities[k] as BlockEntity);
    this.world.events.on('chunkLoaded', (chunk, spawns, loot, first) => {
      if (!first) return;
      for (const l of loot) if (!this.world.getBlockEntity(l.x, l.y, l.z)) this.world.setBlockEntity(l.x, l.y, l.z, { type: 'chest', items: generateLoot(l.table, hash2(this.options.seed, l.x * 31 + l.y, l.z) * 1e9), loot: l.table });
      for (const s of spawns) {
        if (MOBS[s.type]?.hostile && this.options.difficulty === 'peaceful') continue;
        const m = this.entities.spawnMob(s.type, s.x, s.y, s.z);
        if (m && (s.type === 'keeper' || s.type === 'stone_guardian')) m.persistent = true;
      }
      void chunk;
    });
    this.scene.add(this.world.group);
    this.entityCtx = {
      world: this.world, player: this.player, particles: this.particles, daylight: 1, isNight: false, difficulty: this.options.difficulty, dimension: dim, weatherBad: false,
      dropItem: (x, y, z, s, vx = 0, vy = 2, vz = 0) => this.dropItem(x, y, z, s, vx, vy, vz),
      spawnXp: (x, y, z, n) => this.spawnXp(x, y, z, n),
      spawnMob: (t, x, y, z) => this.entities.spawnMob(t, x, y, z),
      spawnProjectile: (p) => this.entities.add(p),
      damagePlayer: (amt, src, fx, fz) => { if (this.player.damage(amt, src as DamageSource)) this.player.knockback(this.player.body.x - fx, this.player.body.z - fz, 5); },
      explode: (x, y, z, r, brk) => this.explode(x, y, z, r, brk),
      message: (t) => this.message(t),
      onBossUpdate: (boss) => store.setHud({ bossName: boss ? boss.def.name : null, bossHp: boss ? boss.health / boss.maxHealth : 0 }),
      discover: (key, label, xp) => { if (this.discovery.rare(key, label, xp)) this.particles.magic(this.player.body.x, this.player.body.y + 1.2, this.player.body.z, 16, [1, 0.85, 0.4]); },
    };
  }

  private async findSpawn(): Promise<[number, number, number]> {
    const seedRng = mulberry32(this.options.seed);
    // Start the search at a seed-scattered point instead of the world origin: anchoring every new
    // world's spawn search at (0,0) dropped every player into the same origin-adjacent area.
    let sx = Math.floor((seedRng() - 0.5) * 4800), sz = Math.floor((seedRng() - 0.5) * 4800);
    for (let attempt = 0; attempt < 20; attempt++) {
      this.world.update(sx, sz);
      await this.waitFor(() => this.world.isLoaded(sx, sz), 8000);
      if (this.dimension === 'void') return [sx + 0.5, 70, sz + 0.5];
      // search loaded area for land
      for (let r = 0; r < 40; r += 4) for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
        const x = Math.floor(sx + Math.cos(a) * r), z = Math.floor(sz + Math.sin(a) * r);
        if (!this.world.isLoaded(x, z)) continue;
        const y = this.world.surfaceY(x, z);
        const id = this.world.getBlock(x, y, z);
        if (y > SEA_LEVEL && id !== B.WATER && id !== B.LAVA && BLOCKS[id].solid && this.world.getBlock(x, y + 1, z) === B.AIR && this.world.getBlock(x, y + 2, z) === B.AIR) return [x + 0.5, y + 1, z + 0.5];
      }
      sx += Math.floor((seedRng() - 0.5) * 560); sz += Math.floor((seedRng() - 0.5) * 560);
    }
    // No dry land found after all attempts: park above the surface (never inside the seabed).
    return [sx + 0.5, Math.max(SEA_LEVEL + 1, this.world.surfaceY(sx, sz) + 1), sz + 0.5];
  }

  private waitFor(cond: () => boolean, timeout: number): Promise<void> {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const tick = () => { if (cond() || performance.now() - t0 > timeout) resolve(); else setTimeout(tick, 30); };
      tick();
    });
  }

  private async waitForChunks(x: number, z: number, r: number, onProgress: (p: number) => void): Promise<void> {
    const t0 = performance.now();
    while (performance.now() - t0 < 30000) {
      this.world.update(x, z);
      const p = this.world.readiness(x, z, r);
      onProgress(p);
      if (p >= 1) return;
      await new Promise((res) => setTimeout(res, 40));
    }
  }

  applySettings(): void {
    const s = settings.value;
    this.world.renderDistance = s.renderDistance;
    this.world.chunkSpeed = s.chunkSpeed;
    this.particles.quality = s.particles;
    this.player.autoJump = s.autoJump;
    this.entities.renderDistance = s.entityDistance;
    this.camera.far = s.renderDistance * 16 + 200;
    this.camera.updateProjectionMatrix();
    this.frameInterval = s.maxFps > 0 && s.maxFps < 240 ? 1000 / s.maxFps : 0;
    const pr = this.targetPixelRatio(s);
    if (Math.abs(this.renderer.getPixelRatio() - pr) > 1e-3) { this.renderer.setPixelRatio(pr); this.renderer.setSize(window.innerWidth, window.innerHeight, false); }
    // shader pack: chunk-shader features are #defines (recompiled only when the set changes); bloom / vignette
    // / colour temperature are a post pass that is skipped entirely when off
    this.world.setShaderFeatures(shaderFeatures(s));
    this.postFx.enabled = postFxActive(s); // same predicate drives shaderFeatures().linearOut
    this.env.setLinearOut(this.postFx.enabled); // sky must match the terrain's colour space
    this.postFx.bloom = s.shaderBloom;
    this.postFx.vignette = s.shaderVignette;
    this.postFx.colorTemp = s.shaderColorTemp;
    this.env.skyGlow = s.shaders ? 1 : 0;
    this.world.setBrightness(s.brightness);
    this.env.cloudHeight = s.cloudHeight;
    this.hand.visible = s.showHand && !!this.handContent;
    this.handArm.visible = s.showHand && s.heldArm && !!this.handArmContent;
    // "Arm Holds Items" toggled on mid-game: the arm is built on the next hand rebuild
    if (s.heldArm && !this.handArmContent) this.handItem = '__dirty';
    this.handSide = s.mainHand === 'left' ? -1 : 1;
    audio.applyVolumes();
  }
  private postFx!: PostFX;
  private shaderFallbackDone = false;
  /** A shader program failed to compile: switch the pack off (persisted) and rebuild plain. */
  private onShaderFailure(): void {
    if (this.shaderFallbackDone || !settings.value.shaders) return;
    this.shaderFallbackDone = true;
    settings.set('shaders', false);
    this.applySettings();
    try { this.message('Shader Pack disabled: your GPU could not compile it.'); } catch { /* not in a world yet */ }
  }
  /** +1 right-handed, -1 left-handed (mirrors the first-person hand) */
  private handSide = 1;
  private frameInterval = 0;
  private frameAcc = 0;
  /** Smoothed CPU time per frame in ms (debug overlay). */
  frameMs = 0;

  setSmoothLighting(v: boolean): void { this.world.setSmooth(v); }

  stop(): void {
    this.running = false;
    audio.stopMusic(); // repository tracks are per-session: silence them when leaving a world
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pagehide', this.onPageHide);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.unbindInput();
    this.transport.close();
    if (document.pointerLockElement) document.exitPointerLock();
    this.world.dispose();
    this.entities.clear();
    this.postFx.dispose();
    this.renderer.dispose();
    Game.instance = null;
  }

  private onResize = (): void => {
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  };

  // ------------------------------------------------------------------ input
  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.running) return;
    const st = store.state;
    if (st.chatOpen) return;
    const k = settings.value.keys;
    if (e.code === 'Escape') {
      e.preventDefault();
      if (st.overlay) this.closeOverlay();
      else if (st.paused) this.resume();
      else this.pause();
      return;
    }
    if (st.dead || st.paused) return;
    if (e.code === 'F2' && !e.repeat) { e.preventDefault(); this.downloadScreenshot(); return; }
    if (st.overlay) {
      if (e.code === k.inventory) this.closeOverlay();
      return;
    }
    if (e.code === k.inventory) { this.openOverlay({ kind: 'inventory' }); return; }
    if (e.code === k.chat || (e.key === '/' && !st.chatOpen)) { e.preventDefault(); store.set({ chatOpen: true }); document.exitPointerLock(); return; }
    if (e.code === k.drop) { if (e.ctrlKey) e.preventDefault(); this.dropHeld(e.ctrlKey); return; }
    if (e.code === k.fly && this.player.mode === 'creative') { this.player.flying = !this.player.flying; return; }
    if (e.code === k.debug) { e.preventDefault(); this.debug = !this.debug; if (!this.debug) store.set({ debug: null }); return; }
    for (let i = 1; i <= 9; i++) if (e.code === k['slot' + i]) { this.selectSlot(i - 1); return; }
    if (e.code === k.sneak && settings.value.sneakToggle && !e.repeat) this.sneakLatched = !this.sneakLatched;
    if (e.code === k.sneak && !e.repeat) this.sprintLatched = false; // sneaking cancels sprinting (like Minecraft)
    // double-tap forward (W) starts sprinting, like Minecraft; it lasts while forward is held
    if (e.code === k.forward && !e.repeat) {
      const now = performance.now();
      if (!this.keys.has(k.forward) && now - this.lastForwardTap < 280) this.sprintLatched = true;
      this.lastForwardTap = now;
    }
    if (e.code === k.back && !e.repeat) this.sprintLatched = false; // walking backwards cancels sprint
    this.keys.add(e.code);
    // sprint is Ctrl now (Java scheme): stop Ctrl+W/A/S/D/Space from firing browser shortcuts
    if (e.code === 'Space' || e.code === 'Tab' || (e.ctrlKey && (e.code === k.forward || e.code === k.back || e.code === k.left || e.code === k.right || e.code === k.jump))) e.preventDefault();
  };
  /** state of the sneak toggle (Controls > Sneak: Toggle) */
  private sneakLatched = false;
  /** double-tap-forward sprint latch: active until forward is released (or sneak is pressed) */
  private sprintLatched = false;
  private lastForwardTap = 0;
  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === settings.value.keys.forward) this.sprintLatched = false; // releasing forward ends a double-tap sprint
    this.keys.delete(e.code);
  };
  private onMouseDown = (e: MouseEvent): void => {
    if (!this.running || store.state.overlay || store.state.paused || store.state.dead || store.state.chatOpen) return;
    if (!this.pointerLocked && !store.state.mobile) { this.requestLock(); return; }
    this.mouse[e.button] = true;
    if (e.button === 0) { this.mineProgress = 0; this.attack(); }
    if (e.button === 2) { this.useHold = 0; this.use(true); }
  };
  private onMouseUp = (e: MouseEvent): void => {
    this.mouse[e.button] = false;
    if (e.button === 2) { this.releaseUse(); }
    if (e.button === 0) this.mineProgress = 0;
  };
  private onMouseMove = (e: MouseEvent): void => {
    if (!this.pointerLocked || store.state.overlay || store.state.paused) return;
    this.look(e.movementX, e.movementY);
  };
  private onWheel = (e: WheelEvent): void => {
    if (!this.running || store.state.overlay || store.state.paused) return;
    const d = e.deltaY > 0 ? 1 : -1;
    this.selectSlot((this.player.inventory.selected + d + 9) % 9);
  };
  private onLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    if (!this.pointerLocked && this.running && !store.state.overlay && !store.state.dead && !store.state.chatOpen && !store.state.mobile && !this.lockGrace) this.pause();
  };
  private lockGrace = false;
  private onContext = (e: Event) => e.preventDefault();
  private onBlur = () => { this.keys.clear(); this.mouse = [false, false, false]; };

  look(dx: number, dy: number): void {
    const s = settings.value.sensitivity * 0.004 + 0.0005;
    this.player.yaw -= dx * s;
    this.player.pitch -= dy * s * (settings.value.invertMouse ? -1 : 1);
    this.player.pitch = clamp(this.player.pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
  }

  private bindInput(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    const c = this.renderer.domElement;
    c.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('wheel', this.onWheel, { passive: true });
    document.addEventListener('pointerlockchange', this.onLockChange);
    c.addEventListener('contextmenu', this.onContext);
    window.addEventListener('blur', this.onBlur);
  }
  private unbindInput(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    const c = this.renderer.domElement;
    c.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    c.removeEventListener('contextmenu', this.onContext);
    window.removeEventListener('blur', this.onBlur);
  }

  requestLock(): void {
    const st = store.state;
    // never grab the pointer while a UI layer needs the mouse (e.g. `/kill` from chat opens the death screen)
    if (st.mobile || st.dead || st.paused || st.overlay || st.chatOpen || st.screen !== 'game') return;
    try { this.renderer.domElement.requestPointerLock(); } catch { /* ignore */ }
  }

  selectSlot(i: number): void {
    if (i !== this.player.inventory.selected) audio.play('select', { volume: 0.5 });
    this.player.inventory.selected = i;
    this.bowCharge = -1; this.eatTimer = 0;
    store.setHud({ selected: i });
  }

  // mobile input hooks
  setMobileMove(x: number, z: number): void { this.player.input.moveX = x; this.player.input.moveZ = z; }
  mobileAction(action: 'jump' | 'sneak' | 'sprint' | 'mine' | 'use', down: boolean): void {
    if (action === 'jump') this.player.input.jump = down;
    else if (action === 'sneak') this.player.input.sneak = down;
    else if (action === 'sprint') this.player.input.sprint = down;
    else if (action === 'mine') { this.mouse[0] = down; if (down) { this.mineProgress = 0; this.attack(); } }
    else if (action === 'use') { this.mouse[2] = down; if (down) { this.useHold = 0; this.use(true); } else this.releaseUse(); }
  }

  pause(): void {
    if (!this.running || store.state.dead) return;
    this.paused = true;
    store.set({ paused: true });
    if (document.pointerLockElement) document.exitPointerLock();
  }
  resume(): void {
    if (this.fatalError) return;
    this.paused = false;
    store.set({ paused: false });
    this.lockGrace = true; setTimeout(() => (this.lockGrace = false), 300);
    this.requestLock();
  }

  openOverlay(o: NonNullable<typeof store.state.overlay>): void {
    store.set({ overlay: o });
    this.keys.clear();
    this.player.input.forward = this.player.input.back = this.player.input.left = this.player.input.right = false;
    this.mouse = [false, false, false];
    if (document.pointerLockElement) { this.lockGrace = true; document.exitPointerLock(); setTimeout(() => (this.lockGrace = false), 300); }
    audio.play('ui');
  }

  closeOverlay(): void {
    const o = store.state.overlay;
    if (!o) return;
    // return crafting grid items & cursor
    for (let i = 0; i < 9; i++) { const s = this.craftGrid.get(i); if (s) { if (this.player.inventory.add(s) > 0) this.dropItem(this.player.body.x, this.player.eyeY, this.player.body.z, s, 0, 1, 0); this.craftGrid.set(i, null); } }
    for (let i = 0; i < 2; i++) { const s = this.altarContainer.get(i); if (s) { this.player.inventory.add(s); this.altarContainer.set(i, null); } }
    for (let i = 0; i < 2; i++) { const s = this.mendingContainer.get(i); if (s) { this.player.inventory.add(s); this.mendingContainer.set(i, null); } }
    if (this.player.inventory.cursor) { const c = this.player.inventory.cursor; if (this.player.inventory.add(c) > 0) this.dropHeldStack(c); this.player.inventory.cursor = null; }
    if (o.kind === 'chest') audio.play('chest', { pitch: 0.8 });
    this.openContainer = null; this.openEntity = null; this.tradeMob = null;
    store.set({ overlay: null, tooltipItem: null });
    this.lockGrace = true; setTimeout(() => (this.lockGrace = false), 300);
    this.requestLock();
  }

  // ------------------------------------------------------------------ main loop
  private loop = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const elapsed = now - this.lastTime;
    if (this.frameInterval > 0) {
      // FPS limit: accumulate display frames until the interval has elapsed (carry the remainder so the average rate is exact)
      this.frameAcc += elapsed;
      this.lastTime = now;
      if (this.frameAcc < this.frameInterval - 0.5) return;
      const dt = Math.min(0.1, this.frameAcc / 1000);
      this.frameAcc = Math.min(this.frameAcc - this.frameInterval, this.frameInterval);
      this.safeStepFrame(dt);
      return;
    }
    this.lastTime = now;
    this.safeStepFrame(Math.min(0.1, elapsed / 1000));
  };

  fatalError = false;

  /** Stop a failing frame rather than throwing on every animation frame forever. */
  private safeStepFrame(dt: number): void {
    try { this.stepFrame(dt); }
    catch (error) {
      console.error('Game frame failed', error);
      this.running = false;
      this.fatalError = true;
      cancelAnimationFrame(this.raf);
      this.paused = true;
      store.set({ paused: true });
      store.message('The world paused after an error. Return to the title screen to save and reload.');
    }
  }

  private stepFrame(dt: number): void {
    const t0 = performance.now();
    this.frames++; this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) { this.fps = Math.round(this.frames / this.fpsTimer); this.frames = 0; this.fpsTimer = 0; }
    if (!this.paused || this.transport.connected) this.update(dt);
    this.render(dt);
    this.frameMs = this.frameMs * 0.9 + (performance.now() - t0) * 0.1;
  }

  private update(dt: number): void {
    const p = this.player;
    this.playTime += dt;
    // time
    this.dayTime += dt * 20 * settings.value.timeSpeed;
    if (this.dayTime >= 24000) { this.dayTime -= 24000; this.day++; }
    // input → player
    const k = settings.value.keys;
    const st = store.state;
    const blocked = !!st.overlay || st.dead || st.chatOpen;
    if (!st.mobile) {
      p.input.forward = !blocked && this.keys.has(k.forward);
      p.input.back = !blocked && this.keys.has(k.back);
      p.input.left = !blocked && this.keys.has(k.left);
      p.input.right = !blocked && this.keys.has(k.right);
      p.input.jump = !blocked && this.keys.has(k.jump);
      p.input.sneak = !blocked && (settings.value.sneakToggle ? this.sneakLatched : this.keys.has(k.sneak));
      p.input.sprint = !blocked && (this.keys.has(k.sprint) || (settings.value.toggleSprint && p.sprinting && p.input.forward) || (this.sprintLatched && p.input.forward));
    } else if (blocked) { p.input.jump = false; }
    if (this.dimension === 'void') p.velocityScale = 1;
    // While riding, the vehicle owns the player's position: running the player's own movement and
    // collision would fight the vehicle for control and jitter the camera. Survival ticks still run
    // (hunger, air, effects) -- only the locomotion is handed over.
    const riding = this.ridingVehicle();
    if (riding) p.survivalOnly(dt, this.world, this.env.daylight);
    else p.update(dt, this.world, this.env.daylight);
    // world streaming (chunks in front of the camera are generated/meshed first)
    this.world.viewDirX = -Math.sin(p.yaw);
    this.world.viewDirZ = -Math.cos(p.yaw);
    this.world.update(p.body.x, p.body.z);
    this.world.setTime(this.playTime);
    // environment
    const biome = BIOMES[this.world.getBiome(Math.floor(p.body.x), Math.floor(p.body.z))];
    const biomeRain = biome.rain;
    this.env.cold = biome.temperature < 0.2;
    const dimDef = DIMENSIONS[this.dimension];
    this.env.weather = !dimDef.sky ? 'clear' : biomeRain ? this.weather.type : 'clear';
    this.env.renderPrecipitation = settings.value.weather;
    this.env.biomeFog = dimDef.fog ?? biome.fog ?? null;
    const eyeId = this.world.getBlock(Math.floor(p.body.x), Math.floor(p.eyeY), Math.floor(p.body.z));
    this.env.underwater = eyeId === B.WATER;
    this.weatherTick(dt);
    this.env.update(dt, dimDef.fixedTime ?? this.dayTime, this.camera.position, (x, z) => this.world.getTop(x, z), settings.value.clouds && dimDef.sky);
    const [near, far] = this.env.fogRange(settings.value.renderDistance);
    // sun strength: only while the sun is up and not hidden by weather (drives the shader-pack sun highlight / glitter / fog glow)
    const sunUp = !dimDef.sky ? 0 : Math.max(0, Math.min(1, (this.env.sunDir.y + 0.05) / 0.25)) * (1 - this.env.weatherIntensity * 0.85);
    const wind = this.env.weatherIntensity * (this.weather.type === 'storm' ? 1 : 0.5);
    this.world.setLighting(dimDef.ambient ?? this.env.daylight, this.env.fogColor, settings.value.fog ? near : far * 4, settings.value.fog ? far : far * 5, this.env.sunTint, this.env.sunDir, sunUp, wind);
    this.scene.background = null;
    // entities
    this.entityCtx.daylight = dimDef.ambient ?? this.env.daylight;
    this.entityCtx.isNight = this.isNight();
    this.entityCtx.weatherBad = this.dimension === 'overworld' && this.weather.type !== 'clear';
    this.discoveryTick(dt);
    this.entities.update(dt, this.entityCtx);
    for (const rp of this.remotePlayers.values()) {
      rp.x += (rp.tx - rp.x) * Math.min(1, dt * 10); rp.y += (rp.ty - rp.y) * Math.min(1, dt * 10); rp.z += (rp.tz - rp.z) * Math.min(1, dt * 10);
      rp.mob.body.x = rp.x; rp.mob.body.y = rp.y; rp.mob.body.z = rp.z; rp.mob.yaw = rp.yaw; rp.mob.syncObj();
    }
    this.particles.setView(this.renderer.domElement.height, this.camera.fov);
    this.particles.update(dt);
    // interaction
    if (!blocked) this.interactionTick(dt);
    else { this.target = null; this.targetEntity = null; this.selection.visible = false; this.crackMesh.visible = false; this.preview.visible = false; }
    this.tickBlocks(dt);
    this.tickPlates();
    this.tickPortal(dt);
    // sleeping
    if (this.sleepTimer >= 0) {
      this.sleepTimer += dt;
      store.setHud({ sleeping: Math.min(1, this.sleepTimer / 1.5) });
      if (this.sleepTimer > 2.5) { this.dayTime = 0; this.day++; this.sleepTimer = -1; store.setHud({ sleeping: 0 }); this.message('Good morning!'); if (this.weather.type !== 'clear') { this.weather = { type: 'clear', timer: 400 + Math.random() * 600 }; } }
    }
    // audio listener & ambience
    const dir = p.lookDir();
    audio.setListener(p.body.x, p.eyeY, p.body.z, dir[0], dir[1], dir[2]);
    const underground = p.body.y < this.world.getTop(Math.floor(p.body.x), Math.floor(p.body.z)) - 4 && this.world.getLight(Math.floor(p.body.x), Math.floor(p.body.y + 1), Math.floor(p.body.z))[0] < 4;
    const windAmt = Math.min(1, (this.env.weather === 'storm' ? 0.8 : 0) * this.env.weatherIntensity + Math.max(0, (p.body.y - 90) / 60));
    audio.update(dt, this.env.weatherIntensity, underground, this.isNight(), this.dimension === 'void', windAmt, this.env.underwater);
    // hud
    this.hudTimer += dt;
    if (this.hudTimer > 0.1) { this.hudTimer = 0; this.updateHud(); }
    if (this.damagePopups.length || store.state.popups.length) store.set({ popups: this.projectPopups(dt) });
    this.autosaveTimer += dt;
    if (this.autosaveTimer > 90) { this.autosaveTimer = 0; this.saveWorld(); }
    if (this.hurtFlash > 0) this.hurtFlash -= dt * 2;
    if (this.camShake > 0) this.camShake -= dt;
    // network
    if (this.transport.connected && this.playTime - this.lastPosSend > 0.1) {
      this.lastPosSend = this.playTime;
      this.transport.send({ t: 'pos', x: p.body.x, y: p.body.y, z: p.body.z, yaw: p.yaw, pitch: p.pitch });
    }
    if (this.debug) {
      const bx = Math.floor(p.body.x), by = Math.floor(p.body.y), bz = Math.floor(p.body.z);
      const [sky, blk] = this.world.getLight(bx, by, bz);
      const yawDeg = ((-p.yaw * 180 / Math.PI) % 360 + 360) % 360;
      const facing = yawDeg < 45 || yawDeg >= 315 ? 'north (-z)' : yawDeg < 135 ? 'east (+x)' : yawDeg < 225 ? 'south (+z)' : 'west (-x)';
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
      const memLine = mem ? `Mem ${(mem.usedJSHeapSize / 1048576).toFixed(0)} / ${(mem.jsHeapSizeLimit / 1048576).toFixed(0)} MB` : 'Mem n/a';
      const tgt = this.target ? `${BLOCKS[this.target.id].name} @ ${this.target.x} ${this.target.y} ${this.target.z}` : this.targetEntity ? this.targetEntity.def.name : '-';
      store.set({ debug: [
        `${GAME_TITLE} ${GAME_VERSION} | ${this.fps} fps | ${this.frameMs.toFixed(1)} ms/frame${this.frameInterval ? ` (cap ${Math.round(1000 / this.frameInterval)})` : ''}`,
        `XYZ ${p.body.x.toFixed(2)} / ${p.body.y.toFixed(2)} / ${p.body.z.toFixed(2)} | Block ${bx} ${by} ${bz} | Chunk ${bx & 15} ${by & 15} ${bz & 15} in ${Math.floor(bx / 16)} ${Math.floor(bz / 16)}`,
        `Facing ${facing} (${yawDeg.toFixed(1)} / ${(p.pitch * 180 / Math.PI).toFixed(1)}) | Biome ${biome.name} | Light sky ${sky} block ${blk}`,
        `Time ${Math.floor(this.dayTime)} day ${this.day} | Weather ${this.weather.type} | Dim ${this.dimension} | Seed ${this.options.seed}`,
        `Chunks ${this.world.stats.loaded} loaded, ${this.world.stats.pendingGen} pending | Entities ${this.entities.entities.length} | Particles ${this.particles.count} | ${memLine}`,
        `Looking at ${tgt} | Mode ${p.mode} | ${p.body.onGround ? 'on ground' : p.flying ? 'flying' : 'airborne'}${p.body.inWater ? ', in water' : ''}${p.sneaking ? ', sneaking' : ''}${p.sprinting ? ', sprinting' : ''}`,
      ].join('\n') });
    }
  }

  isNight(): boolean { return this.dayTime > 12800 && this.dayTime < 23200; }

  private render(dt: number): void {
    const p = this.player;
    const bob = settings.value.viewBobbing ? p.bobAmount : 0;
    const bx = Math.sin(p.bobPhase) * 0.035 * bob, by = Math.abs(Math.cos(p.bobPhase)) * 0.05 * bob;
    const shake = this.camShake > 0 && settings.value.cameraShake ? this.camShake * 0.05 : 0;
    this.camera.position.set(p.body.x + Math.cos(p.yaw) * bx + (Math.random() - 0.5) * shake, p.eyeY + by + (Math.random() - 0.5) * shake, p.body.z - Math.sin(p.yaw) * bx);
    this.camera.rotation.set(p.pitch, p.yaw, Math.sin(p.bobPhase) * 0.01 * bob);
    // "Motion Effects" (accessibility) disables the sprint FOV zoom, bow zoom and portal/water distortions
    const motion = settings.value.motionEffects;
    const targetFov = settings.value.fov * (settings.value.sprintFov && !motion && p.sprinting ? 1.12 : 1) * (motion && this.bowCharge > 0.3 ? 0.85 : 1);
    this.fovCurrent += (targetFov - this.fovCurrent) * Math.min(1, dt * 10);
    if (Math.abs(this.camera.fov - this.fovCurrent) > 0.01) { this.camera.fov = this.fovCurrent; this.camera.updateProjectionMatrix(); }
    this.updateHand(dt);
    if (this.postFx.enabled) this.postFx.render(this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
    // first-person viewmodel pass: always over the world, correct internal occlusion
    const r = this.renderer;
    const prevClear = r.autoClear;
    r.autoClear = false;
    r.clearDepth();
    r.render(this.handScene, this.camera);
    r.autoClear = prevClear;
  }

  /** Swing progress 0..1 where 0 = a swing just started (pose at rest) and 1 = rest; `swingRate` sets the swing/chop speed. */

  private handSway = { x: 0, y: 0 };
  private lastYaw = 0;
  private lastPitch = 0;
  private handEquip = 0;
  /** impact accent: set to 1 when a melee hit connects, eases out — shoves the viewmodel into the hit */
  private handKick = 0;
  /** true while the fast mining re-chops (not a full attack swing) are driving the viewmodel */
  private miningSwing = false;
  /** vertical viewmodel give: rises while airborne, dips on landing, settles back with a spring */
  private handLand = 0;
  private handVert = 0;
  private handLightTimer = 0;
  private handMats: THREE.MeshBasicMaterial[] = [];
  private handHeld: 'hand' | 'block' | 'tool' | 'item' = 'hand';
  /**
   * First-person arm rig (camera space, right-handed). The arm is a column along its local +y from the shoulder
   * to the fist; at rest it enters from the bottom-right corner and the fist sits in the lower-right quadrant,
   * on a strike the shoulder pushes forward and the arm swings so the fist lands just below the crosshair.
   */
  private static readonly SHOULDER_REST = new THREE.Vector3(1.5, -0.95, -1.0);
  // Fist-tip rest point: with FOV 75 / 16:9 this lands at ~63% screen width / ~64% height, the
  // classic Java idle hand spot, with the forearm running down to the bottom-right corner.
  private static readonly FIST_REST = new THREE.Vector3(0.443, -0.269, -1.25);
  private static readonly FIST_STRIKE = new THREE.Vector3(0.02, -0.2, -1.15);
  private static readonly DIR_STRIKE = new THREE.Vector3(-0.78, 0.5, -0.38).normalize();
  private armLen = 1;
  private shoulderStrike = new THREE.Vector3();
  private qRest = new THREE.Quaternion();
  private qStrike = new THREE.Quaternion();
  private qTmp = new THREE.Quaternion();
  private qRoll = new THREE.Quaternion();
  // Java 1.8 ItemRenderer.func_178095_a chain scratch state (empty-hand arm)
  private qHand = new THREE.Quaternion();
  private mvChain = new THREE.Matrix4();
  private mvChainTmp = new THREE.Matrix4();
  private mvChainTmp2 = new THREE.Matrix4();
  private mvChainMain = new THREE.Matrix4().makeTranslation(0.64000005, -0.6, -0.71999997);
  private mvChainItemBase = new THREE.Matrix4().makeTranslation(0.56, -0.52, -0.71999997);
  private mvChainY45 = new THREE.Matrix4().makeRotationY(Math.PI / 4);
  private handPosTmp = new THREE.Vector3();
  /** camera-space position of the posed arm's fist — the anchor the held item is gripped at */
  private handScaleTmp = new THREE.Vector3();
  private mvChainNeg = new THREE.Matrix4().makeTranslation(-1, 3.6, 3.5);
  private mvChainBase = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(0, 0, 1).normalize(), 120 * Math.PI / 180)
    .multiply(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), 200 * Math.PI / 180))
    .multiply(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(0, 1, 0), -135 * Math.PI / 180))
    .multiply(new THREE.Matrix4().makeTranslation(5.6, 0, 0));

  /**
   * Java 1.8 ItemRenderer.func_178095_a: the first-person empty-hand transform chain, exactly as
   * the decompiled client issues it (bob translate, main translate, RY45, swing RY/RZ, the fixed
   * -1/3.6/3.5 translate + RZ120/RX200/RY-135 orientation and the 5.6 model-offset translate), with
   * `swing` the 1.8 swingProgress (0 = resting/just started, 1 = swing done, back to rest) and
   * `equip` the viewmodel drop factor (1 - equippedProgress: 0 at rest, eases to 1 while the held
   * slot is changing). The arm model (ModelBiped right arm: x -8..-4, y 0..12, z -2..2 in skin px)
   * is drawn through this matrix at 1/16 px scale. Side -1 mirrors the whole chain across the
   * camera x axis (left hand).
   */
  private buildHandChain(swing: number, side: number, equip: number): void {
    const sq = Math.sqrt(Math.max(0, Math.min(1, swing)));
    const f = -0.3 * Math.sin(sq * Math.PI);
    const f1 = 0.4 * Math.sin(sq * Math.PI * 2.0);
    const f2 = -0.4 * Math.sin(swing * Math.PI);
    const f3 = Math.sin(swing * swing * Math.PI);
    const f4 = Math.sin(sq * Math.PI);
    const mv = this.mvChain;
    mv.identity();
    mv.multiply(this.mvChainTmp.makeTranslation(f, f1, f2));
    mv.multiply(this.mvChainMain);
    mv.multiply(this.mvChainTmp.makeTranslation(0, equip * -0.6, 0)); // func_178095_a: (1-equipProgress) drop
    mv.multiply(this.mvChainY45);
    mv.multiply(this.mvChainTmp.makeRotationAxis(AXIS_Y, f4 * 70 * Math.PI / 180));
    mv.multiply(this.mvChainTmp2.makeRotationAxis(AXIS_Z, f3 * -20 * Math.PI / 180));
    mv.multiply(this.mvChainNeg);
    mv.multiply(this.mvChainBase); // RZ120 * RX200 * RY-135 * T(5.6)
    if (side < 0) {
      // true mirror: Sx * M * Sx (renders as the left arm on the left side of the screen)
      this.mvChainTmp.makeScale(-1, 1, 1);
      mv.premultiply(this.mvChainTmp);
      mv.multiply(this.mvChainTmp);
    }
  }

  /**
   * Java 1.8 ItemRenderer.renderItemInFirstPerson for the item in hand, exactly as the decompiled
   * client issues it. Stack order replicates the GL call order: `performDrinking` (eat) or
   * `doItemUsedTransformations` (idle swing) first, then `transformFirstPersonItem`
   * (T(0.56,-0.52,-0.72) * equip drop * RY45 * swing RY/RZ/RX * scale 0.4), then `doBowTransformations`
   * while drawing a bow, then the item model's own FIRST_PERSON display transform for flat items
   * (translation [0,4,2] -> (0,0.25,0.125), rotation [0,-135,25], scale 1.7 in every 1.8.9 item json).
   * `sp` is the code's swing progress (0 = rest/just started, 1 = swing done = rest, matching the
   * 1.8 swingProgress envelope), `equip` the viewmodel drop (handEquip eases 1 -> 0 while switching),
   * `eatProg` the fraction of the eating animation that has elapsed, `bowP` the draw fraction.
   * `style` shapes the swing rotations per tool (vanilla amounts by default) and `chop` scales
   * them down for the fast mining re-chops. Side -1 mirrors the whole chain across the camera x axis.
   */
  private buildItemChain(sp: number, equip: number, eatProg: number, bowP: number, _flat: boolean, side: number,
    style: { ry: number; rz: number; rx: number; px: number; py: number; pz: number } = VANILLA_SWING, chop = false,
    displayScale = HELD_DISPLAY_SCALE, skipDisplay = false, isBlock = false, poseItemId: string | null = null): void {
    const D = Math.PI / 180;
    const sq = Math.sqrt(Math.max(0, Math.min(1, sp)));
    const mv = this.mvChain;
    mv.identity();
    if (eatProg > 0) {
      // performDrinking: the food lifts to the mouth over the eat; the last quarter sips with a wobble
      const f = Math.max(0, (1 - eatProg) * 32) + 1; // remaining use ticks, like the vanilla 32-tick food
      const f2 = Math.abs(Math.cos(f / 4 * Math.PI)) * 0.1;
      const f3 = 1 - Math.pow(eatProg, 27);
      mv.multiply(this.mvChainTmp.makeTranslation(0, f2, 0));
      mv.multiply(this.mvChainTmp.makeTranslation(f3 * 0.6, f3 * -0.5, 0));
      mv.multiply(this.mvChainTmp.makeRotationAxis(AXIS_Y, f3 * 90 * D));
      mv.multiply(this.mvChainTmp.makeRotationAxis(AXIS_X, f3 * 10 * D));
      mv.multiply(this.mvChainTmp.makeRotationAxis(AXIS_Z, f3 * 30 * D));
    } else {
      // doItemUsedTransformations (zero at rest)
      mv.multiply(this.mvChainTmp.makeTranslation(-0.4 * Math.sin(sq * Math.PI), 0.2 * Math.sin(sq * Math.PI * 2), -0.2 * Math.sin(sp * Math.PI)));
    }
    mv.multiply(this.mvChainItemBase);
    // equip settle: the drop eases out (smoothstep — quick lift, soft landing) and the item tilts up
    // into the grip with a tiny scale pop instead of riding a flat linear elevator (the empty-hand
    // arm keeps the vanilla straight line)
    const eq = equip * equip * (3 - 2 * equip);
    mv.multiply(this.mvChainTmp.makeTranslation(0, eq * -0.6, 0));
    if (equip > 0.001) mv.multiply(this.mvChainTmp.makeRotationAxis(AXIS_X, eq * 16 * D));
    mv.multiply(this.mvChainY45);
    if (eatProg <= 0 && bowP <= 0) {
      const amp = chop ? 0.55 : 1; // mining re-chops are short and quick, not full swings
      mv.multiply(this.mvChainTmp.makeRotationAxis(AXIS_Y, Math.sin(sp * sp * Math.PI) * style.ry * D * amp));
      mv.multiply(this.mvChainTmp.makeRotationAxis(AXIS_Z, Math.sin(sq * Math.PI) * style.rz * D * amp));
      mv.multiply(this.mvChainTmp.makeRotationAxis(AXIS_X, Math.sin(sq * Math.PI) * style.rx * D * amp));
      if (style.px || style.py || style.pz) {
        mv.multiply(this.mvChainTmp.makeTranslation(
          Math.sin(sq * Math.PI) * style.px * amp,
          Math.sin(sp * Math.PI) * style.py * amp,
          Math.sin(sq * Math.PI) * style.pz * amp,
        ));
      }
      // melee impact accent: on a connected hit the viewmodel digs in for a beat, then springs back
      if (this.handKick > 0.01) {
        mv.multiply(this.mvChainTmp.makeTranslation(0, 0, -0.16 * this.handKick));
        mv.multiply(this.mvChainTmp.makeRotationAxis(AXIS_X, this.handKick * -9 * D));
      }
    }
    const sc = 0.4 * (1 + 0.08 * eq); // equip scale pop
    mv.multiply(this.mvChainTmp.makeScale(sc, sc, sc));
    if (bowP > 0) {
      // doBowTransformations (appended after transformFirstPersonItem in the Java source)
      mv.multiply(this.mvChainTmp.makeRotationAxis(AXIS_Z, -18 * D));
      mv.multiply(this.mvChainTmp.makeRotationAxis(AXIS_Y, -12 * D));
      mv.multiply(this.mvChainTmp.makeRotationAxis(AXIS_X, -8 * D));
      mv.multiply(this.mvChainTmp.makeTranslation(-0.9, 0.2, 0));
      mv.multiply(this.mvChainTmp.makeTranslation(0, 0, bowP * 0.1));
      mv.multiply(this.mvChainTmp.makeScale(1, 1, 1 + bowP * 0.2));
    }
    // The item model's own FIRST_PERSON display transform, applied HERE so that it sits inside the
    // mirror below. Mirroring the finished matrix once -- Sx * (chain * display) * Sx -- is
    // provably correct; conjugating the display transform term by term after the mirror is easy to
    // get subtly wrong, and getting it wrong threw the left-hand item clean off the screen.
    //
    // This transform is the whole reason a held tool reads as held: the yaw turns the extruded
    // sprite so the camera looks along its THICKNESS instead of at its face, and the roll lays the
    // haft down toward the lower-right corner. The exact angles come from the item's CATEGORY (see
    // HELD_POSES): a pickaxe rides higher and rolled back, a sword sits blade-up, a torch is
    // gripped near-vertical, food is lifted toward the mouth, and a block keeps a gentle 45 degree
    // yaw because a cube pushed through the flat-item angles tips onto a corner.
    if (!skipDisplay) {
      const pose = heldPoseFor(poseItemId, isBlock);
      mv.multiply(this.mvChainTmp.makeTranslation(pose.t.x, pose.t.y, pose.t.z));
      mv.multiply(this.mvChainTmp.makeRotationAxis(AXIS_Y, pose.r.y));
      mv.multiply(this.mvChainTmp.makeRotationAxis(AXIS_X, pose.r.x));
      mv.multiply(this.mvChainTmp.makeRotationAxis(AXIS_Z, pose.r.z));
      // the caller's scale already folds in the equip pop; the pose supplies the base size
      mv.multiply(this.mvChainTmp.makeScale(displayScale, displayScale, displayScale));
      // renderItem centres the 0..1 model on its own origin
      mv.multiply(this.mvChainTmp.makeTranslation(-0.5, -0.5, -0.5));
    }
    if (side < 0) {
      // true mirror: Sx * M * Sx (renders as the left hand on the left side of the screen)
      this.mvChainTmp.makeScale(-1, 1, 1);
      mv.premultiply(this.mvChainTmp);
      mv.multiply(this.mvChainTmp);
    }
  }

  /** Signature of the uploaded skin (or avatar palette) the empty-hand arm was built from. */
  private handSkinKey = '';
  /** chestplate id the empty-hand arm was last dressed with ('' = none) */
  private handArmorKey = '';

  private updateHand(dt: number): void {
    const p = this.player;
    const held = p.inventory.held;
    const id = p.mode === 'spectator' ? '__none' : held?.id ?? '__hand';
    // tinted blocks (grass, leaves, tall grass) follow the biome the player is standing in, like the world mesh does
    const biomeId = this.world ? this.world.getBiome(Math.floor(p.body.x), Math.floor(p.body.z)) : -1;
    // the empty-hand arm re-builds when the uploaded skin changes (or finishes decoding): the arm
    // then carries the skin's own sleeve/hand art instead of the flat fallback
    const skinKey = activeSkinKey();
    // a chestplate change re-dresses the empty-hand arm (armour bracer layer below)
    const armorKey = p.inventory.armor.items[1]?.id ?? '';
    if (id !== this.handItem || this.handSkinKey !== skinKey || this.handArmorKey !== armorKey || (biomeId !== this.handBiome && this.handTinted)) {
      this.handItem = id;
      this.handSkinKey = skinKey;
      this.handArmorKey = armorKey;
      this.handBiome = biomeId;
      if (this.handContent) { this.hand.remove(this.handContent); disposeObject(this.handContent); }
      this.handMats = [];
      this.handContent = this.buildHandContent(id);
      if (this.handContent) {
        // The viewmodel is rendered in its own depth-cleared pass (see render()), so it always
        // draws over the world while keeping correct self-occlusion — no depth-test hacks.
        this.hand.add(this.handContent);
      }
      // the gripping arm is a separate object posed by its own vanilla arm chain (see handArm)
      if (this.handArmContent) { this.handArm.remove(this.handArmContent); disposeObject(this.handArmContent); this.handArmContent = null; }
      if (this.handHeld !== 'hand' && id !== '__none') {
        this.handArmContent = this.buildHandArm();
        this.handArm.add(this.handArmContent);
      }
      this.handEquip = 1; // item drops in from below when switched
      this.handLightTimer = 0;
    }
    if (this.swingP < 1) {
      this.swingP = Math.min(1, this.swingP + dt * this.swingRate);
      if (this.swingP >= 1) { this.swingRate = 3.333; this.miningSwing = false; }
    }
    this.handEquip = Math.max(0, this.handEquip - dt * 5);
    // melee impact accent decays quickly (a short "thunk", not a wobble)
    this.handKick *= Math.exp(-dt * 9);
    // Vertical body motion, the way a hand-held viewmodel reads naturally: the model lags the body
    // while rising/falling (so a jump lifts it) and the landing impulse dips it before it springs
    // back. Both are small (max ~0.16 blocks) so it never turns into a roller-coaster.
    const vy = this.player.body.vy;
    const lag = Math.max(-0.09, Math.min(0.09, -vy * 0.012));
    this.handVert += (lag - this.handVert) * Math.min(1, dt * 10);
    this.handLand *= Math.exp(-dt * 6.5);
    // the hand is lit like the block the player's head is in (dark in caves, warm next to torches)
    this.handLightTimer -= dt;
    if (this.handLightTimer <= 0 && this.world) {
      this.handLightTimer = 0.2;
      const [sky, blk] = this.world.getLight(Math.floor(p.body.x), Math.floor(p.eyeY), Math.floor(p.body.z));
      const day = DIMENSIONS[this.dimension].ambient ?? this.env.daylight;
      const skyL = Math.pow(sky / 15, 1.3) * day, blkL = Math.pow(blk / 15, 1.2);
      const lum = 0.18 + 0.82 * Math.max(skyL, blkL);
      const warm = Math.max(0, blkL - skyL);
      // Textured materials (skin maps, item art) are white-based: the color is a pure light
      // multiplier. Flat/palette materials remember their painted colour in userData.baseColor and
      // are multiplied by the same light so they stay coloured in daylight and dim in caves.
      const lr = lum, lg = lum * (1 - warm * 0.12), lb = lum * (1 - warm * 0.3);
      for (const m of this.handMats) {
        const bc = m.userData?.baseColor as number | undefined;
        if (bc !== undefined) m.color.setRGB(((bc >> 16) & 255) / 255 * lr, ((bc >> 8) & 255) / 255 * lg, (bc & 255) / 255 * lb);
        else m.color.setRGB(lr, lg, lb);
      }
    }
    // Swing envelope - the actual curves Minecraft Java uses (decompiled 1.8.x ItemRenderer):
    // over swing progress sp the strike amount is sin(pi*sqrt(sp)) (peaks at sp=0.25, returns to
    // 0 at sp=1 = rest) and the wrist roll sin(pi*sp^2) peaks later on the return stroke.
    const sp = this.swingP;
    const s = Math.sin(Math.PI * Math.sqrt(sp));
    const rollEnv = Math.sin(Math.PI * sp * sp);
    const eat = this.eatTimer > 0 ? Math.min(1, this.eatTimer * 6) : 0;
    const chew = eat > 0 ? Math.sin(this.eatTimer * 22) * 0.03 : 0;
    const bow = this.bowCharge > 0 ? Math.min(1, this.bowCharge) : 0;
    // walk bob + look sway (the hand lags a little behind the camera)
    const bobAmt = settings.value.viewBobbing ? p.bobAmount : 0;
    const bobX = Math.sin(p.bobPhase) * 0.03 * bobAmt, bobY = -Math.abs(Math.cos(p.bobPhase)) * 0.03 * bobAmt;
    const dyaw = p.yaw - this.lastYaw, dpitch = p.pitch - this.lastPitch;
    this.lastYaw = p.yaw; this.lastPitch = p.pitch;
    const k = Math.min(1, dt * 12);
    this.handSway.x += (Math.max(-0.08, Math.min(0.08, dyaw * 0.6)) - this.handSway.x) * k;
    this.handSway.y += (Math.max(-0.08, Math.min(0.08, -dpitch * 0.6)) - this.handSway.y) * k;
    const side = this.handSide;
    if (this.handHeld === 'hand') {
      // Empty-hand arm: Java 1.8 ItemRenderer.func_178095_a rendered through the hand pass, whose
      // projection is a fixed vertical FOV of 70 no matter the world FOV setting. The world camera
      // here runs at fovCurrent, so the whole arm (pose and size) is scaled by
      // tan(35)/tan(fov/2) around the eye to reproduce exactly what Java draws on screen.
      const fovK = Math.tan(Math.PI * 35 / 180) / Math.tan(this.fovCurrent * Math.PI / 360);
      // the arm's swing envelope in Java: swingProgress runs 0 (rest/just started) -> ~5/6 over the
      // swing and snaps back; our sp runs 0 -> 1 = rest, so the chain is evaluated at sp directly
      // (same rest poses at both ends, Java's own sin curves in between).
      this.buildHandChain(sp, side, this.handEquip);
      const mv = this.mvChain;
      this.hand.position.setFromMatrixPosition(mv).multiplyScalar(fovK);
      this.hand.position.x += bobX + this.handSway.x;
      this.hand.position.y += bobY + this.handSway.y + this.handVert - this.handLand;
      this.qHand.setFromRotationMatrix(mv);
      this.hand.quaternion.copy(this.qHand);
      this.hand.scale.setScalar(fovK * 0.0625); // arm model px -> world, vanilla render(0.0625F)
    } else {
      // Held items are GRIPPED BY THE FIST, not floating next to it. The arm is posed first with
      // the vanilla arm chain; the fist point of that posed arm is then computed in camera space
      // and the item is anchored exactly there, so the two can never drift apart (they share the
      // same swing, bob, sway and equip motion because they are derived from the same matrix).
      const fovK = Math.tan(Math.PI * 35 / 180) / Math.tan(this.fovCurrent * Math.PI / 360);
      const eating = eat > 0;
      const eatProg = eating ? Math.max(0, Math.min(1, 1 - this.eatTimer / 1.6)) : 0;
      // per-tool swing character: the held item's tool kind picks the swing shape (vanilla for
      // everything that is not one of the five tools); mining re-chops use a shorter amplitude
      const heldKind = held && itemDef(held.id)?.tool?.kind || '';
      const style = TOOL_SWING[heldKind] ?? VANILLA_SWING;
      // --- 1. pose the arm with the vanilla chain
      this.buildHandChain(sp, side, this.handEquip);
      const amv = this.mvChain;
      const dx = bobX + this.handSway.x + side * HELD_ARM_OFFSET.x * fovK;
      const dy = chew + bobY + this.handSway.y + this.handVert - this.handLand + HELD_ARM_OFFSET.y * fovK;
      const dz = HELD_ARM_OFFSET.z * fovK;
      this.handArm.position.setFromMatrixPosition(amv).multiplyScalar(fovK);
      this.handArm.position.x += dx;
      this.handArm.position.y += dy;
      this.handArm.position.z += dz;
      this.qHand.setFromRotationMatrix(amv);
      this.handArm.quaternion.copy(this.qHand);
      this.handArm.scale.setScalar(fovK * 0.0625);
      // --- 2. pose the item with its own vanilla chain, in the same camera space as the arm.
      // Both are driven by the same swing/bob/sway/equip inputs, so they move together without the
      // item having to be parented to the fist.
      const eq = this.handEquip * this.handEquip * (3 - 2 * this.handEquip);
      // The item is posed by the FULL vanilla chain -- position, rotation AND scale taken from one
      // matrix -- rather than being anchored at the fist with only a rotation layered on top.
      //
      // The old fist-anchored approach is what made tools look wrong: decomposing the chain and
      // keeping just its rotation threw away the item model's own FIRST_PERSON display transform,
      // so the sprite ended up small, nearly face-on and floating up by the crosshair instead of
      // lying edge-on across the lower-right of the screen the way a held tool actually does.
      // Feeding the display transform through intact restores the real grip: the tool is seen
      // along its own thickness, big in frame, with the haft running down into the fist.
      // the base scale now comes from the item's own hold pose, not one shared constant
      const heldId = held?.id ?? null;
      const ds = heldPoseFor(heldId, this.handHeld === 'block').s * (1 + 0.06 * eq);
      this.buildItemChain(sp, this.handEquip, eatProg, eating ? 0 : bow, false, side, style, this.miningSwing, ds, false, this.handHeld === 'block', heldId);
      this.mvChain.decompose(this.hand.position, this.hand.quaternion, this.hand.scale);
      // the whole viewmodel lives in the fixed 70-degree hand projection, so it scales with fovK
      // exactly like the arm does
      this.hand.position.multiplyScalar(fovK);
      // the item's own nudge, plus the shared bob / sway / equip motion so it stays locked to the arm
      this.hand.position.x += bobX + this.handSway.x + side * HELD_ITEM_NUDGE.x * fovK;
      this.hand.position.y += chew + bobY + this.handSway.y + this.handVert - this.handLand + (HELD_ITEM_NUDGE.y - eq * 0.5) * fovK;
      this.hand.position.z += HELD_ITEM_NUDGE.z * fovK;
      this.hand.scale.multiplyScalar(fovK);
    }
    this.hand.visible = !!this.handContent && settings.value.showHand;
    this.handArm.visible = !!this.handArmContent && this.handHeld !== 'hand' && settings.value.showHand && settings.value.heldArm;
  }

  /**
   * First-person content: a big blocky forearm (sleeve, cuff, skin, fist with knuckles + thumb) plus the held
   * item — blocks as a textured cube in the palm, tools as a voxel-extruded icon gripped by the handle with the
   * head pointing up towards the crosshair, other items held upright in front of the fist.
   *
   * Local frame of the returned group: +y runs shoulder -> fist, +z faces the camera, +x is "up-right" on screen.
   */
  /** Flat-shaded face material set for armour/bracer boxes (see buildHandContent's `mat`). */
  private armFaceMats(main: number, side: number, top: number, dark: number): THREE.MeshBasicMaterial[] {
    const face = (color: number): THREE.MeshBasicMaterial => {
      const m = new THREE.MeshBasicMaterial({ color });
      m.userData.baseColor = color;
      this.handMats.push(m);
      return m;
    };
    // face order +x, -x, +y, -y, +z, -z (main tone faces the camera)
    return [face(side), face(side), face(top), face(dark), face(main), face(main)];
  }

  /**
   * Build the first-person arm (uploaded skin net or palette art) with the chestplate armour
   * layer, and add it to `g`. Used by the empty-hand pose and — smaller and angled — when an
   * item is held, so the player sees their arm actually gripping the tool (the "hold in hands" look).
   */
  private addArmModel(g: THREE.Group): void {
    const sk = settings.value.skin ?? { skin: '#d8a878', hair: '#5a3a22', shirt: '#3f6f9f', pants: '#3b3b5a' };
    const hx = (h: string): number => (h.startsWith('#') ? parseInt(h.slice(1), 16) : Number(h));
    let armCv: HTMLCanvasElement | null = null;
    const slim = activeSkinSlim();
    const texCv = activeSkinCanvas();
    if (texCv) {
      armCv = texCv; // uploaded skin OR built-in preset sheet: buildSkinArmMesh composites the right-arm net
    } else {
      if (settings.value.skinUrl) prepareSkinCanvas(settings.value.skinUrl); // uploaded decode in flight
      armCv = paletteArmCanvas(hx(sk.shirt), hx(sk.skin), slim);
    }
    if (!armCv) return;
    const { mesh, canvas } = buildSkinArmMesh(armCv, slim);
    // equipped chestplate shows on the player: a vanilla-style armour layer (0.5 px inflate)
    // over the forearm half of the held arm, tinted by tier (leather / iron / gold / crystal)
    const chest = this.player.inventory.armor.items[1]?.id;
    if (chest) {
      const col = chest.startsWith('leather') ? 0x9a6a3e : chest.startsWith('gold') ? 0xf2d243 : chest.startsWith('crystal') ? 0x74e6dc : 0xdadada;
      const dk = (f: number) => new THREE.Color(col).multiplyScalar(f).getHex();
      const dx = slim ? 3 : 4, x0 = slim ? -7 : -8;
      const bracer = new THREE.Mesh(new THREE.BoxGeometry(dx + 1, 6.5, 5), this.armFaceMats(col, dk(0.78), dk(1.18), dk(0.55)));
      bracer.position.set(x0 + dx / 2, 9, 0);
      mesh.add(bracer);
    }
    const tex = new THREE.CanvasTexture(canvas ?? armCv);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    // Cut-out (alphaTest) not alpha blending: arm pixels are fully there or cleanly gone.
    // Vanilla renders the first-person arm with face culling disabled (func_178095_a), so the
    // arm never disappears at grazing angles; DoubleSide mirrors that.
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
    mesh.material = m;
    this.handMats.push(m);
    g.add(mesh);
    // Note: no extra "fist" cube is bolted onto the wrist any more. The skin arm net already draws
    // the hand on the last pixel rows of the model, so the old cube only produced a mismatched,
    // oversized lump poking out of the sleeve (and it ignored the slim-arm width).
  }

  private buildHandContent(id: string): THREE.Object3D | null {
    if (id === '__none') return null;
    const g = new THREE.Group();
    // orientation quaternions: local +y -> arm direction, local +z as camera-facing as possible
    const dirRest = Game.FIST_REST.clone().sub(Game.SHOULDER_REST);
    this.armLen = dirRest.length();
    dirRest.normalize();
    this.shoulderStrike.copy(Game.FIST_STRIKE).addScaledVector(Game.DIR_STRIKE, -this.armLen);
    const basis = (dir: THREE.Vector3, q: THREE.Quaternion) => {
      const y = dir.clone().normalize();
      const x = new THREE.Vector3().crossVectors(y, AXIS_Z).normalize();
      const z = new THREE.Vector3().crossVectors(x, y).normalize();
      q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    };
    basis(dirRest, this.qRest);
    basis(Game.DIR_STRIKE, this.qStrike);
    const L = this.armLen;
    const mat = (color: number): THREE.MeshBasicMaterial => {
      const m = new THREE.MeshBasicMaterial({ color });
      // Untextured (flat/palette) materials carry their painted colour here so the dynamic hand
      // lighting can multiply it instead of replacing it (replacing turned the arm white at day).
      m.userData.baseColor = color;
      this.handMats.push(m);
      return m;
    };
    // face order +x, -x, +y, -y, +z, -z: main tone faces the camera, the outer side (+x) is the
    // darker side tone and +y the lighter top tone — the vanilla 3-face flat shading look
    const faceMats = (main: number, side: number, top: number, dark: number): THREE.MeshBasicMaterial[] =>
      [mat(side), mat(side), mat(top), mat(dark), mat(main), mat(main)];
    // ---- the empty-hand arm: drawn only when nothing is held; held items float on their own, like
    // the shipped held-item view. The arm always matches the player's avatar:
    //  - a skin is uploaded  -> the arm is textured with that skin's own right-arm net art (base +
    //    sleeve overlay), exactly like the figure shown in the previews;
    //  - no skin uploaded    -> flat tunic/skin colours taken from the avatar palette, matching the
    //    palette figure (tunic-coloured sleeve down to the wrist, skin-tone hand at the fist).
    // The mesh is Java's own held-arm model in model px; updateHand drives it through Java 1.8's
    // func_178095_a first-person chain, so what the camera sees matches Java (outer side + front of
    // the sleeve and fist, drawn with culling off, scaled to Java's fixed 70-degree hand FOV).
    if (id === '__hand') {
      this.addArmModel(g);
      this.handHeld = 'hand';
      return g;
    }
    const def = itemDef(id);
    if (!def) { this.handHeld = 'hand'; return g; }
    this.handTinted = def.block !== undefined && BLOCKS[def.block].tint;
    const bdef = def.block !== undefined ? BLOCKS[def.block] : undefined;
    // thin blocks (torches, ladders, plants) are held flat like items; real cubes are held as cubes
    const flatBlock = !!bdef && (bdef.shape === 'cross' || bdef.shape === 'liquid' || (bdef.shape === 'box' && !!bdef.box && (bdef.box[3] - bdef.box[0] < 0.5 || bdef.box[5] - bdef.box[2] < 0.5)));
    if (bdef && !flatBlock) {
      this.handHeld = 'block';
      // Java renders the block's item model: the full 1x1x1 cube with the world's six face tiles,
      // anchored at its (0,0,0) corner. transformFirstPersonItem + RY45 put that cube exactly where
      // Minecraft holds it, so the mesh carries no extra rotation of its own.
      const b = bdef;
      const atlas = getAtlas();
      const biome = BIOMES[this.handBiome] ?? BIOMES[3];
      const tint: [number, number, number] | undefined = b.tint ? (b.name.endsWith('leaves') ? leafTint(b.name, biome.foliage) : biome.grass) : undefined;
      // BoxGeometry material order: +x,-x,+y,-y,+z,-z. Block tile order: 0 top, 1 bottom, 2 +z, 3 -z,
      // 4 +x, 5 -x (same order the chunk mesher paints), lit with the world's per-face shades.
      const shades = [0.65, 0.65, 1, 0.5, 0.8, 0.8];
      const mats = [4, 5, 0, 1, 2, 3].map((f, i) => {
        const c = document.createElement('canvas'); c.width = 16; c.height = 16;
        atlas.drawTile(c.getContext('2d')!, b.tiles[f], 0, 0, 16, tint, shades[i]); // the atlas marks tintable pixels (alpha < 200), so this is per-pixel safe
        const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
        const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.5 });
        this.handMats.push(m);
        return m;
      });
      // centred on the grip point: updateHand anchors this group at the fist, so the cube must
      // straddle the origin rather than hang off one corner
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mats);
      g.add(m);
      return g;
    }
    this.handHeld = 'item';
    // Java flat item models (tools, food, plants): the generated model is the icon trimmed to a 1x1
    // plate spanning the whole 0..1 block in x/y and sitting at z 7.5..8.5 (in 1/16 units). The
    // voxel extrusion is built in that same 0..1 frame (icon up -> +y, bottom-left at the origin),
    // so the FIRST_PERSON display transform in buildItemChain poses it exactly like vanilla.
    const item = itemModelMesh(id);
    this.handMats.push(item.material as THREE.MeshBasicMaterial);
    // The model spans the 0..1 unit square with its plate on z=0, which is exactly the frame the
    // FIRST_PERSON display transform expects. updateHand applies that transform (including its own
    // -0.5 centring), so the mesh is added untouched here -- pre-shifting it by a grip point would
    // double-offset the item and is what used to drag tools away from the hand.
    g.add(item);
    return g;
  }

  /**
   * Build the gripping arm shown next to a held item. It is posed independently of the item (see
   * `handArm`) with the vanilla arm chain, so the forearm always enters from the bottom corner of
   * the screen at a natural angle, with the fist just under the item's handle.
   */
  private buildHandArm(): THREE.Object3D {
    const g = new THREE.Group();
    this.addArmModel(g);
    return g;
  }

  // ------------------------------------------------------------------ raycast
  raycast(maxDist: number): RaycastHit | null {
    const p = this.player;
    const [dx, dy, dz] = p.lookDir();
    const ox = p.body.x, oy = p.eyeY, oz = p.body.z;
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const stepX = Math.sign(dx), stepY = Math.sign(dy), stepZ = Math.sign(dz);
    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity, tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity, tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tMaxX = dx > 0 ? (x + 1 - ox) * tDeltaX : dx < 0 ? (ox - x) * tDeltaX : Infinity;
    let tMaxY = dy > 0 ? (y + 1 - oy) * tDeltaY : dy < 0 ? (oy - y) * tDeltaY : Infinity;
    let tMaxZ = dz > 0 ? (z + 1 - oz) * tDeltaZ : dz < 0 ? (oz - z) * tDeltaZ : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let i = 0; i < 200; i++) {
      const id = this.world.getBlock(x, y, z);
      if (id !== B.AIR) {
        const def = BLOCKS[id];
        if (def.shape !== 'liquid' && def.shape !== 'none') {
          if (def.box || def.shape === 'cross') {
            const bx = def.box ?? [0.1, 0, 0.1, 0.9, 0.8, 0.9];
            const hit = rayBox(ox, oy, oz, dx, dy, dz, x + bx[0], y + bx[1], z + bx[2], x + bx[3], y + bx[4], z + bx[5]);
            if (hit && hit[0] <= maxDist) return { x, y, z, nx: hit[1], ny: hit[2], nz: hit[3], dist: hit[0], id };
          } else return { x, y, z, nx, ny, nz, dist: t, id };
        }
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) { x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0; }
      else if (tMaxY < tMaxZ) { y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0; }
      else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ; }
      if (t > maxDist) break;
      if (y < 0 || y >= CHUNK_HEIGHT) break;
    }
    return null;
  }

  private raycastEntity(maxDist: number): { mob: Mob; dist: number } | null {
    const p = this.player;
    const [dx, dy, dz] = p.lookDir();
    let best: { mob: Mob; dist: number } | null = null;
    for (const m of this.entities.mobs()) {
      if (Math.abs(m.x - p.body.x) > maxDist + 2 || Math.abs(m.z - p.body.z) > maxDist + 2) continue;
      const w = m.body.w + 0.1;
      const hit = rayBox(p.body.x, p.eyeY, p.body.z, dx, dy, dz, m.x - w, m.y, m.z - w, m.x + w, m.y + m.body.h, m.z + w);
      if (!hit || hit[0] > maxDist || (best && hit[0] >= best.dist)) continue;
      // never target a mob through a wall: the eye -> hit point segment must be free of solid blocks
      if (segmentBlocked(this.world, p.body.x, p.eyeY, p.body.z, p.body.x + dx * hit[0], p.eyeY + dy * hit[0], p.body.z + dz * hit[0])) continue;
      best = { mob: m, dist: hit[0] };
    }
    return best;
  }

  // ------------------------------------------------------------------ interaction
  /** How far the player can target blocks. */
  blockReach(): number { return this.player.mode === 'creative' ? 5.5 : 4.5; }
  /** How far the player can hit / interact with entities (shorter than block reach, like most voxel games). */
  entityReach(): number { return this.player.mode === 'creative' ? 5 : 3; }

  private interactionTick(dt: number): void {
    const p = this.player;
    if (p.mode === 'spectator') { this.selection.visible = false; this.crackMesh.visible = false; this.preview.visible = false; return; }
    const reach = this.blockReach();
    const hit = this.raycast(reach);
    const ent = this.raycastEntity(this.entityReach());
    if (ent && (!hit || ent.dist < hit.dist)) { this.targetEntity = ent.mob; this.target = null; }
    else { this.targetEntity = null; if (!hit || !this.target || hit.x !== this.target.x || hit.y !== this.target.y || hit.z !== this.target.z) this.mineProgress = 0; this.target = hit; }
    if (this.target) {
      const def = BLOCKS[this.target.id];
      const bx = def.box ?? (def.shape === 'cross' ? [0.1, 0, 0.1, 0.9, 0.8, 0.9] : [0, 0, 0, 1, 1, 1]);
      this.selection.visible = true;
      const selMat = this.selection.material as THREE.LineBasicMaterial;
      if (settings.value.highContrastOutline) { selMat.color.setHex(0xffffff); selMat.opacity = 0.95; } else { selMat.color.setHex(0x000000); selMat.opacity = 0.55; }
      this.selection.position.set(this.target.x + (bx[0] + bx[3]) / 2, this.target.y + (bx[1] + bx[4]) / 2, this.target.z + (bx[2] + bx[5]) / 2);
      this.selection.scale.set(bx[3] - bx[0], bx[4] - bx[1], bx[5] - bx[2]);
    } else this.selection.visible = false;
    // Minecraft-Java look: no ghost preview of the would-be block. The thin black outline around the
    // block you are facing (set above) is the only aiming cue.
    this.preview.visible = false;
    // continuous mining
    this.attackCooldown -= dt;
    this.placeCooldown -= dt;
    if (this.breakDelay > 0) this.breakDelay -= dt;
    if (this.mouse[0] && this.target && !this.targetEntity) this.mineTick(dt);
    else { this.crackMesh.visible = false; if (!this.mouse[0]) this.mineProgress = 0; }
    if (this.mouse[0] && this.targetEntity && this.attackCooldown <= 0) this.attack();
    // continuous use (hold right click)
    if (this.mouse[2]) {
      this.useHold += dt;
      if (this.eatTimer > 0) {
        this.eatTimer += dt;
        if (Math.floor(this.eatTimer * 6) !== Math.floor((this.eatTimer - dt) * 6)) audio.play('eat', { volume: 0.5 });
        if (this.eatTimer > 1.6) this.finishEating();
      } else if (this.bowCharge >= 0) {
        this.bowCharge += dt;
      } else if (this.placeCooldown <= 0 && this.useHold > 0.25) this.use(false);
    }
  }

  private mineTick(dt: number): void {
    const t = this.target!;
    const def = BLOCKS[t.id];
    const p = this.player;
    if (p.mode === 'creative') {
      if (this.placeCooldown > 0) return;
      if (this.world.getBlock(t.x, t.y, t.z) !== t.id) return;
      this.breakBlock(t.x, t.y, t.z, false);
      this.placeCooldown = 0.2;
      this.startSwing();
      return;
    }
    if (def.hardness < 0) { this.crackMesh.visible = false; return; }
    // the post-break pause: no progress accrues until it elapses
    if (this.breakDelay > 0) { this.crackMesh.visible = false; return; }
    const time = this.mineTime(def);
    this.mineProgress += dt / time;
    // mining: Java re-swings every 3 ticks (150 ms), once the previous swing is half over
    // (EntityLivingBase.swingItem gate: swingProgressInt >= getArmSwingAnimationEnd()/2), giving
    // held-mining its fast short chops rather than full 300 ms swings
    this.swingRate = 6.6667;
    this.miningSwing = true;
    if (this.swingP >= 0.99) {
      this.swingP = 0;
      // every tool bite kicks a couple of real material chips off the face being mined
      this.particles.blockHitFx(t.x, t.y, t.z, t.nx, t.ny, t.nz, t.id);
    }
    this.mineSoundTimer -= dt;
    if (this.mineSoundTimer <= 0) {
      this.mineSoundTimer = 0.25;
      audio.play('dig.' + def.sound, { pos: [t.x + 0.5, t.y + 0.5, t.z + 0.5], volume: 0.5 });
    }
    const stage = Math.min(9, Math.floor(this.mineProgress * 10));
    // Minecraft consistency: the block never moves while being mined - only the 10 destroy-stage
    // cracks progress over it - so the overlay stays centred on the block and no chips spray out.
    if (stage !== this.crackStage) this.crackStage = stage;
    this.crackMesh.visible = true;
    // Cracks sit on the block's OWN box, not a full cube: a half-mined slab, bed or plant shows its
    // damage overlay exactly over its visible faces instead of floating in the empty half.
    const cb = def.box ?? (def.shape === 'cross' ? [0.1, 0, 0.1, 0.9, 0.8, 0.9] : [0, 0, 0, 1, 1, 1]);
    this.crackMesh.position.set(t.x + (cb[0] + cb[3]) / 2, t.y + (cb[1] + cb[4]) / 2, t.z + (cb[2] + cb[5]) / 2);
    this.crackMesh.scale.set(cb[3] - cb[0] || 1, cb[4] - cb[1] || 1, cb[5] - cb[2] || 1);
    const crackMat = this.crackMesh.material as THREE.MeshBasicMaterial;
    if (crackMat.map !== this.crackTextures[stage]) { crackMat.map = this.crackTextures[stage]; crackMat.needsUpdate = true; }
    if (this.mineProgress >= 1) {
      this.mineProgress = 0;
      // the world may have changed under the cursor (falling block, explosion, multiplayer edit): re-validate
      if (this.world.getBlock(t.x, t.y, t.z) !== t.id || t.dist > this.blockReach() + 0.01) { this.crackMesh.visible = false; return; }
      const held = p.inventory.held;
      const tool = held ? itemDef(held.id)?.tool : undefined;
      const harvest = def.tier === 0 || (tool && tool.kind === def.tool && tool.tier >= def.tier);
      this.breakBlock(t.x, t.y, t.z, !!harvest);
      if (held && tool && held.durability !== undefined) this.damageItem(held, def.hardness > 0 ? 1 : 0);
      p.exhaustion += 0.005;
      this.crackMesh.visible = false;
      // Vanilla waits 5 ticks (0.25s) after a block breaks before the next one can start. FABLE had
      // no such pause, so holding the mouse chewed straight through a wall with zero gap between
      // blocks -- each block took its correct time, but the RUN of blocks came out far faster than
      // it should, which is what reads as "breaking is too fast".
      this.breakDelay = BREAK_DELAY;
    }
  }

  mineTime(def: BlockDef): number {
    const held = this.player.inventory.held;
    const tool = held ? itemDef(held.id)?.tool : undefined;
    const matches = tool && tool.kind === def.tool;
    const canHarvest = def.tier === 0 || (matches && tool!.tier >= def.tier);
    let mult = matches ? tool!.speed : 1;
    if (matches && held?.ench?.swiftness) mult += held.ench.swiftness * held.ench.swiftness + 1;
    if (def.tool === 'sword' || (tool?.kind === 'sword' && def.shape === 'cross')) mult = 1.5;
    let time = (def.hardness * (canHarvest ? 1.5 : 5)) / mult;
    if (this.env.underwater) time *= 5;
    if (!this.player.body.onGround && !this.player.flying && !this.player.body.inWater) time *= 5;
    if (this.player.hasEffect('haste')) time *= 0.7;
    return Math.max(0.05, time);
  }

  damageItem(stack: ItemStack, amount: number): void {
    if (this.player.mode === 'creative' || stack.durability === undefined || amount <= 0) return;
    const unb = stack.ench?.endurance ?? 0;
    if (unb > 0 && Math.random() < unb / (unb + 1)) return;
    stack.durability -= amount;
    if (stack.durability <= 0) {
      audio.play('break.glass', { volume: 0.6 });
      this.player.inventory.setHeld(null);
    }
    store.bump();
  }

  breakBlock(x: number, y: number, z: number, drops: boolean, silent = false): void {
    const id = this.world.getBlock(x, y, z);
    if (id === B.AIR) return;
    const def = BLOCKS[id];
    if (def.hardness < 0 && this.player.mode !== 'creative') return;
    // container contents
    const be = this.world.getBlockEntity(x, y, z);
    if (be) for (const s of be.items) if (s) this.dropItem(x + 0.5, y + 0.5, z + 0.5, s, (Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2);
    this.world.setBlock(x, y, z, B.AIR);
    if (this.transport.connected) this.transport.send({ t: 'block', x, y, z, id: B.AIR });
    // breaking a wire (or its neighbour) re-settles the circuit
    if (SIGNAL_PARTS.has(id) || this.nearSignal(x, y, z)) this.updateSignal(x, y, z);
    // lifting a piece of track lets its neighbours straighten out again
    if (id >= B.TRACK_NS && id <= B.TRACK_ASC_W) this.updateTrack(x, y, z);
    if (!silent) {
      audio.play('break.' + def.sound, { pos: [x + 0.5, y + 0.5, z + 0.5] });
      this.particles.blockBreakFx(x, y, z, id);
    }
    if (drops && this.player.mode !== 'creative') {
      const list = def.drops ?? [{ item: def.name, min: 1, max: 1, chance: 1 }];
      const fortune = this.player.inventory.held?.ench?.fortune ?? 0;
      for (const d of list) {
        if (Math.random() > d.chance) continue;
        let n = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
        if (fortune && d.item !== def.name && def.tool === 'pickaxe') n += Math.floor(Math.random() * (fortune + 1));
        if (n > 0 && ITEMS.has(d.item)) this.dropItem(x + 0.5, y + 0.3, z + 0.5, makeStack(d.item, n), (Math.random() - 0.5) * 1.5, 2, (Math.random() - 0.5) * 1.5);
      }
      const xp: Record<number, number> = { [B.COAL_ORE]: 1, [B.COPPER_ORE]: 1, [B.IRON_ORE]: 1, [B.GOLD_ORE]: 2, [B.EMBER_ORE]: 3, [B.CRYSTAL_ORE]: 6, [B.LUMEN]: 1 };
      if (xp[id]) this.spawnXp(x + 0.5, y + 0.5, z + 0.5, xp[id]);
      // Cosmetic-only tokens for ore harvested by a nearby survival player (not explosions,
      // chain breaks, creative mode or remote edits). Local rewards are not real currency.
      if (!silent && xp[id] && !this.transport.connected &&
          Math.abs(this.player.body.x - x) < 6 && Math.abs(this.player.body.y - y) < 6 && Math.abs(this.player.body.z - z) < 6)
        market.earn(xp[id]);
      // first strike of each rare ore is journaled and rewarded
      if (id === B.CRYSTAL_ORE) this.discovery.rare('crystal_ore', 'Crystal Ore', 4);
      else if (id === B.EMBER_ORE) this.discovery.rare('ember_ore', 'Ember Ore', 3);
      else if (id === B.GOLD_ORE) this.discovery.rare('gold_ore', 'Gold Ore', 3);
    }
    // doors: remove other half
    if (id === B.DOOR_LOWER_Z || id === B.DOOR_LOWER_X) this.world.setBlock(x, y + 1, z, B.AIR);
    if (id === B.DOOR_UPPER_Z || id === B.DOOR_UPPER_X) this.world.setBlock(x, y - 1, z, B.AIR);
    // support cascade
    const above = this.world.getBlock(x, y + 1, z);
    if (above !== B.AIR && BLOCKS[above].needsSupport) this.breakBlock(x, y + 1, z, true);
    // gravity blocks fall
    if ((above === B.SAND || above === B.GRAVEL || above === B.RED_SAND) && !BLOCKS[this.world.getBlock(x, y, z)].solid) this.fallBlock(x, y + 1, z);
  }

  private fallBlock(x: number, y: number, z: number): void {
    const id = this.world.getBlock(x, y, z);
    let ny = y;
    while (ny > 1 && !BLOCKS[this.world.getBlock(x, ny - 1, z)].solid && this.world.getBlock(x, ny - 1, z) !== B.LAVA) ny--;
    if (ny === y) return;
    this.world.setBlock(x, y, z, B.AIR);
    this.world.setBlock(x, ny, z, id);
    const above = this.world.getBlock(x, y + 1, z);
    if (above === B.SAND || above === B.GRAVEL || above === B.RED_SAND) this.fallBlock(x, y + 1, z);
  }

  private placePos(hit: RaycastHit): [number, number, number] | null {
    const def = BLOCKS[hit.id];
    if (def.replaceable) return [hit.x, hit.y, hit.z];
    const x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
    if (y < 0 || y >= CHUNK_HEIGHT) return null;
    const cur = this.world.getBlock(x, y, z);
    if (cur !== B.AIR && !BLOCKS[cur].replaceable) return null;
    return [x, y, z];
  }

  /** Start a first-person arm swing (Java only restarts a swing once the current one is half over). */
  private startSwing(): void {
    if (this.swingP >= 0.5 || this.swingP >= 1) { this.swingP = 0; this.swingRate = 3.333; }
  }

  attack(): void {
    const p = this.player;
    if (p.mode === 'spectator' || this.attackCooldown > 0) return;
    this.startSwing();
    if (this.targetEntity) {
      const m = this.targetEntity;
      const held = p.inventory.held;
      const tool = held ? itemDef(held.id)?.tool : undefined;
      let dmg = tool ? tool.damage : 1;
      if (held?.ench?.sharpness) dmg += held.ench.sharpness * 1.25;
      if (p.hasEffect('strength')) dmg += 3;
      const crit = !p.body.onGround && p.body.vy < 0 && !p.body.inWater && !p.flying;
      if (crit) dmg *= 1.5;
      if (p.mode === 'creative' && !tool) dmg = 4;
      if (m.def.trader && this.player.mode === 'survival') { /* keepers can be hurt too */ }
      // the entity must still be in reach and in line of sight at the moment of the swing
      if (m.dead || m.distTo(p.body.x, p.eyeY, p.body.z) > this.entityReach() + m.body.w + 0.5) { audio.play('swing', { volume: 0.3 }); this.attackCooldown = 0.25; return; }
      m.damage(dmg, p.body.x, p.body.z, true, this.entityCtx, held?.ench?.knockback ? 1.6 : 1);
      this.handKick = 1; // viewmodel digs into the connected hit
      audio.play(crit ? 'crit' : 'hit', { pos: [m.x, m.y + 1, m.z] });
      if (crit) this.particles.hit(m.x, m.y + 1, m.z, true);
      this.damagePopups.push({ x: m.x, y: m.y + m.body.h + 0.3, z: m.z, text: (crit ? '*' : '') + (Math.round(dmg * 10) / 10), t: 0 });
      if (held && tool) this.damageItem(held, tool.kind === 'sword' ? 1 : 2);
      this.attackCooldown = tool?.kind === 'sword' ? 0.55 : tool?.kind === 'axe' ? 0.9 : 0.45;
      if (settings.value.cameraShake) this.camShake = Math.max(this.camShake, crit ? 0.12 : 0.05);
      p.exhaustion += 0.1;
    } else {
      audio.play('swing', { volume: 0.3 });
      this.attackCooldown = 0.25;
    }
  }

  /** Right click / use. `initial` is true on the first press. */
  use(initial: boolean): void {
    const p = this.player;
    if (p.mode === 'spectator') return;
    const held = p.inventory.held;
    const hdef = held ? itemDef(held.id) : undefined;
    // entity interactions
    if (this.targetEntity && initial) {
      const m = this.targetEntity;
      if (m.def.trader) { this.openTrade(m); return; }
      if (held && m.def.food?.includes(held.id) && !m.baby && m.breedCooldown <= 0 && m.love <= 0) {
        m.love = 30;
        if (p.mode !== 'creative') { held.count--; if (held.count <= 0) p.inventory.setHeld(null); store.bump(); }
        audio.play('mob.' + m.def.sound, { pos: [m.x, m.y, m.z] });
        this.particles.magic(m.x, m.y + 1, m.z, 8, [1, 0.3, 0.4]);
        this.startSwing();
        return;
      }
      if (held && m.def.food?.includes(held.id) && m.baby) { m.growTimer -= 20; if (p.mode !== 'creative') { held.count--; if (held.count <= 0) p.inventory.setHeld(null); store.bump(); } return; }
    }
    // ---- riding: step out of whatever we are in, or climb into whatever is beside us
    if (initial && !p.sneaking) {
      const riding = this.ridingVehicle();
      if (riding) { riding.dismount(); audio.play('step.wood', { volume: 0.4 }); this.startSwing(); return; }
      const v = this.vehicleNear();
      if (v) { v.mount(p); audio.play('step.wood', { volume: 0.4 }); this.startSwing(); return; }
    }
    // ---- a planted Ancient Blade within arm's reach: pull it free (empty hand or not)
    if (initial && !p.sneaking) {
      const blade = this.nearestBlade();
      if (blade && blade.distTo(p.body.x, p.body.y, p.body.z) < 2.2) { this.pullBlade(blade); this.startSwing(); return; }
    }
    // block interactions (not sneaking)
    if (this.target && !p.sneaking && initial) {
      if (this.interactBlock(this.target)) { this.startSwing(); return; }
    }
    if (!held || !hdef) return;
    // ---- Ore Cart: dropped onto a piece of Trackway, it becomes a rideable cart.
    if (initial && held.id === 'ore_cart' && this.target) {
      const t = this.target;
      const onTrack = t.id >= B.TRACK_NS && t.id <= B.TRACK_ASC_W;
      if (onTrack) {
        this.entities.add(new OreCart(t.x + 0.5, t.y + 0.06, t.z + 0.5));
        audio.play('place.metal', { pos: [t.x, t.y, t.z] });
        if (p.mode !== 'creative') { held.count--; if (held.count <= 0) p.inventory.setHeld(null); store.bump(); }
        this.startSwing(); this.placeCooldown = 0.3;
        return;
      }
    }
    // ---- Skiff: dropped onto water, it floats.
    if (initial && held.id === 'skiff' && this.target) {
      const t = this.target;
      if (t.id === B.WATER || this.world.getBlock(t.x, t.y + 1, t.z) === B.AIR) {
        const sy = t.id === B.WATER ? t.y + 1 - SKIFF_FLOAT : t.y + 1;
        this.entities.add(new Skiff(t.x + 0.5, sy, t.z + 0.5));
        audio.play('splash', { pos: [t.x, t.y, t.z], volume: 0.6 });
        if (p.mode !== 'creative') { held.count--; if (held.count <= 0) p.inventory.setHeld(null); store.bump(); }
        this.startSwing(); this.placeCooldown = 0.3;
        return;
      }
    }
    // ---- Ancient Blade: used on the top face of a block, it drives in and becomes a world object.
    if (initial && held.id === 'ancient_blade' && this.target && this.target.ny === 1) {
      if (this.driveBlade(this.target.x, this.target.y, this.target.z)) {
        if (p.mode !== 'creative') { held.count--; if (held.count <= 0) p.inventory.setHeld(null); store.bump(); }
        this.startSwing(); this.placeCooldown = 0.4;
        return;
      }
    }
    // ---- Pail: fill from a fluid the player is looking at, or pour into the empty space in
    // front of it. Fluids here are static sources, so this is a straight pick-up/put-down.
    if (initial && (held.id === PAIL_EMPTY || held.id === PAIL_WATER || held.id === PAIL_LAVA)) {
      if (this.usePail(held)) { this.startSwing(); this.placeCooldown = 0.25; return; }
    }
    // ---- Draughts: drink on use, applying the brewed effect.
    if (initial && DRAUGHT_BY_ID.has(held.id)) {
      const d = DRAUGHT_BY_ID.get(held.id)!;
      if (d.heal) p.heal(d.heal);
      p.effects[d.effect] = Math.max(p.effects[d.effect] ?? 0, d.seconds);
      if (p.mode !== 'creative') {
        held.count--; if (held.count <= 0) p.inventory.setHeld(null);
        // the glass comes back, the way an emptied flask should
        p.inventory.add(makeStack(BREW_BASE, 1));
      }
      audio.play('eat', { volume: 0.7 });
      this.particles.magic(p.body.x, p.body.y + 1, p.body.z, 14, [0.4, 1, 0.9]);
      this.message(`${d.name}`);
      store.bump();
      this.startSwing();
      return;
    }
    // food
    if (hdef.food && initial) {
      if (p.hunger < 20 || p.mode === 'creative' || hdef.food.effect) { this.eatTimer = 0.001; }
      return;
    }
    if (hdef.type === 'bow' && initial) {
      if (p.mode === 'creative' || p.inventory.main.count('arrow') > 0) this.bowCharge = 0;
      return;
    }
    if (!this.target) return;
    const t = this.target;
    const tid = t.id;
    // tools on blocks
    if (hdef.tool?.kind === 'hoe' && (tid === B.GRASS || tid === B.DIRT || tid === B.SNOW_GRASS) && this.world.getBlock(t.x, t.y + 1, t.z) === B.AIR) {
      this.world.setBlock(t.x, t.y, t.z, B.FARMLAND); audio.play('dig.grass', { pos: [t.x, t.y, t.z] }); this.damageItem(held, 1); this.startSwing(); this.placeCooldown = 0.25; return;
    }
    if (hdef.tool?.kind === 'axe' && isLog(tid) && tid !== B.STRIPPED_LOG) {
      this.world.setBlock(t.x, t.y, t.z, B.STRIPPED_LOG); audio.play('dig.wood', { pos: [t.x, t.y, t.z] }); this.damageItem(held, 1); this.startSwing(); this.placeCooldown = 0.25; return;
    }
    if (hdef.tool?.kind === 'shovel' && (tid === B.GRASS || tid === B.SNOW_GRASS)) {
      this.world.setBlock(t.x, t.y, t.z, B.DIRT); audio.play('dig.grass', { pos: [t.x, t.y, t.z] }); this.damageItem(held, 1); this.startSwing(); this.placeCooldown = 0.25; return;
    }
    if (held.id === 'fire_striker' && tid === B.VOIDSTONE) {
      if (this.tryLightPortal(t)) { this.damageItem(held, 1); this.startSwing(); this.placeCooldown = 0.5; audio.play('portal'); }
      return;
    }
    // seeds / crops
    const seedBlock: Record<string, number> = { wheat_seeds: B.WHEAT_0, carrot: B.CARROT_0, potato: B.POTATO_0 };
    if (seedBlock[held.id] !== undefined && tid === B.FARMLAND && t.ny === 1 && this.world.getBlock(t.x, t.y + 1, t.z) === B.AIR) {
      this.world.setBlock(t.x, t.y + 1, t.z, seedBlock[held.id]);
      audio.play('place.plant', { pos: [t.x, t.y, t.z] });
      if (p.mode !== 'creative') { held.count--; if (held.count <= 0) p.inventory.setHeld(null); store.bump(); }
      this.startSwing(); this.placeCooldown = 0.25; return;
    }
    // block placement
    if (hdef.block !== undefined) this.placeBlock(held, hdef.block, t);
  }

  private releaseUse(): void {
    if (this.bowCharge >= 0) {
      const charge = Math.min(1, this.bowCharge / 1.0);
      this.bowCharge = -1;
      if (charge < 0.15) return;
      const p = this.player;
      const held = p.inventory.held;
      if (p.mode !== 'creative') { if (p.inventory.main.remove('arrow', 1) < 1) return; store.bump(); }
      const [dx, dy, dz] = p.lookDir();
      const sp = 12 + charge * 30;
      const dmg = Math.round((2 + charge * 7 + (held?.ench?.power ?? 0) * 1.5) * 2) / 2;
      const a = new Projectile('arrow', p.body.x + dx * 0.5, p.eyeY - 0.1, p.body.z + dz * 0.5, dx * sp, dy * sp, dz * sp, true, dmg);
      this.entities.add(a);
      audio.play('bow', { volume: 0.7 });
      if (held) this.damageItem(held, 1);
      this.startSwing();
    }
    this.eatTimer = 0;
  }

  private finishEating(): void {
    const p = this.player;
    const held = p.inventory.held;
    const def = held ? itemDef(held.id) : undefined;
    this.eatTimer = 0;
    if (!held || !def?.food) return;
    p.eat(def.food.hunger, def.food.saturation);
    if (def.food.effect === 'regen') { p.effects.regen = 15; p.effects.resistance = 60; }
    if (def.food.effect === 'speed') p.effects.speed = 60;
    if (def.food.effect === 'strength') p.effects.strength = 60;
    audio.play('eat', { volume: 0.7, pitch: 0.8 });
    if (p.mode !== 'creative') { held.count--; if (held.count <= 0) p.inventory.setHeld(null); store.bump(); }
    if (held?.id === 'mushroom_stew' && p.mode !== 'creative') { /* bowl not modelled */ }
  }

  /** True when a solid block of `blockId` at (x,y,z) would not intersect the player, a mob or a remote player. */
  placementFree(blockId: number, x: number, y: number, z: number): boolean {
    const def = BLOCKS[blockId];
    if (!def.solid) return true;
    const bx = def.box ?? FULL_BOX;
    const x0 = x + bx[0], y0 = y + bx[1], z0 = z + bx[2], x1 = x + bx[3], y1 = y + bx[4], z1 = z + bx[5];
    const E = 1e-3;
    const overlap = (ex: number, ey: number, ez: number, w: number, h: number) => x1 > ex - w + E && x0 < ex + w - E && y1 > ey + E && y0 < ey + h - E && z1 > ez - w + E && z0 < ez + w - E;
    const b = this.player.body;
    if (this.player.mode !== 'spectator' && overlap(b.x, b.y, b.z, b.w, b.h)) return false;
    for (const m of this.entities.mobs()) if (overlap(m.x, m.y, m.z, m.body.w, m.body.h)) return false;
    for (const rp of this.remotePlayers.values()) if (overlap(rp.x, rp.y, rp.z, 0.3, 1.8)) return false;
    return true;
  }

  private placeBlock(held: ItemStack, blockId: number, t: RaycastHit): void {
    const p = this.player;
    const pos = this.placePos(t);
    if (!pos) return;
    const [x, y, z] = pos;
    const def = BLOCKS[blockId];
    // support requirements
    const below = this.world.getBlock(x, y - 1, z);
    if (def.needsSupport) {
      const isCrop = blockId >= B.WHEAT_0 && blockId <= B.POTATO_2;
      if (isCrop && below !== B.FARMLAND) return;
      if (!isCrop && def.shape === 'cross' && ![B.GRASS, B.DIRT, B.SNOW_GRASS, B.FARMLAND, B.MUD, B.SAND, B.RED_SAND].includes(below as any)) { if (blockId !== B.TORCH) return; }
      if (blockId === B.TORCH && !BLOCKS[below].solid && t.ny === 1) return;
      if (blockId === B.TORCH && !BLOCKS[below].solid && !BLOCKS[t.id].solid) return;
      if (blockId === B.CACTUS && below !== B.SAND && below !== B.CACTUS && below !== B.RED_SAND) return;
    }
    // collision with player / mobs / other players
    if (!this.placementFree(blockId, x, y, z)) return;
    let placeId = blockId;
    if (blockId === B.DOOR_LOWER_Z) {
      const facingZ = Math.abs(Math.cos(p.yaw)) > Math.abs(Math.sin(p.yaw));
      placeId = facingZ ? B.DOOR_LOWER_Z : B.DOOR_LOWER_X;
      const upper = this.world.getBlock(x, y + 1, z);
      if (upper !== B.AIR && !BLOCKS[upper].replaceable) return;
      if (!BLOCKS[below].solid) return;
      this.world.setBlock(x, y + 1, z, facingZ ? B.DOOR_UPPER_Z : B.DOOR_UPPER_X);
    }
    this.world.setBlock(x, y, z, placeId);
    if (this.transport.connected) this.transport.send({ t: 'block', x, y, z, id: placeId });
    if (blockId === B.CHEST || blockId === B.BARREL) this.world.setBlockEntity(x, y, z, { type: blockId === B.CHEST ? 'chest' : 'barrel', items: new Array(27).fill(null) });
    if (blockId === B.FURNACE) this.world.setBlockEntity(x, y, z, { type: 'furnace', items: [null, null, null], burn: 0, burnMax: 0, cook: 0 });
    if (blockId === B.BREWING_HEARTH) this.world.setBlockEntity(x, y, z, { type: 'hearth', items: [null, null, null], burn: 0, burnMax: 0, cook: 0 });
    if (blockId === B.SAND || blockId === B.GRAVEL || blockId === B.RED_SAND) this.fallBlock(x, y, z);
    audio.play('place.' + def.sound, { pos: [x + 0.5, y + 0.5, z + 0.5] });
    this.particles.blockHitFx(x, y, z, 0, 1, 0, blockId);
    if (p.mode !== 'creative') { held.count--; if (held.count <= 0) p.inventory.setHeld(null); store.bump(); }
    this.startSwing();
    this.placeCooldown = 0.22;
    // a new circuit part (or any block next to one) can change what the wire sees
    if (SIGNAL_PARTS.has(placeId) || this.nearSignal(x, y, z)) this.updateSignal(x, y, z);
    // track works out its own shape from its neighbours
    if (placeId >= B.TRACK_NS && placeId <= B.TRACK_ASC_W) this.updateTrack(x, y, z);
  }

  /** True when any circuit part sits within one block -- cheap gate before running propagation. */
  private nearSignal(x: number, y: number, z: number): boolean {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      if (SIGNAL_PARTS.has(this.world.getBlock(x + dx, y + dy, z + dz))) return true;
    }
    return false;
  }

  private interactBlock(t: RaycastHit): boolean {
    const id = t.id;
    const { x, y, z } = t;
    switch (id) {
      case B.CRAFTING_TABLE: this.openOverlay({ kind: 'crafting' }); return true;
      case B.CHEST: case B.BARREL: {
        let be = this.world.getBlockEntity(x, y, z);
        if (!be) { be = { type: id === B.CHEST ? 'chest' : 'barrel', items: new Array(27).fill(null) }; this.world.setBlockEntity(x, y, z, be); }
        this.openEntity = be;
        this.openContainer = new ArrayContainer(27, be.items);
        this.openContainer.onChange = () => { be!.items = this.openContainer!.items; store.bump(); };
        if (be.loot) this.discovery.loot(be.loot); // first open of generated loot: journal + reward
        audio.play('chest', { pos: [x, y, z] });
        this.openOverlay({ kind: 'chest', pos: [x, y, z] });
        return true;
      }
      case B.FURNACE: case B.FURNACE_LIT: {
        let be = this.world.getBlockEntity(x, y, z);
        if (!be) { be = { type: 'furnace', items: [null, null, null], burn: 0, burnMax: 0, cook: 0 }; this.world.setBlockEntity(x, y, z, be); }
        this.openEntity = be;
        const c = new ArrayContainer(3, be.items);
        c.accepts = (i, s) => i === 0 ? !!SMELTING[s.id] : i === 1 ? !!itemDef(s.id)?.fuel : false;
        c.onChange = () => { be!.items = c.items; store.bump(); };
        this.openContainer = c;
        this.openOverlay({ kind: 'furnace', pos: [x, y, z] });
        return true;
      }
      case B.RUNE_ALTAR: this.openOverlay({ kind: 'altar', pos: [x, y, z] }); return true;
      case B.MENDING_STONE: this.openOverlay({ kind: 'mending', pos: [x, y, z] }); return true;
      case B.BREWING_HEARTH: {
        let be = this.world.getBlockEntity(x, y, z);
        if (!be) { be = { type: 'hearth', items: [null, null, null], burn: 0, burnMax: 0, cook: 0 }; this.world.setBlockEntity(x, y, z, be); }
        this.openEntity = be;
        const c = new ArrayContainer(3, be.items);
        // slot 0 = flasks, slot 1 = the reagent, slot 2 = the finished draught
        c.accepts = (i, s) => i === 0 ? s.id === BREW_BASE : i === 1 ? !!draughtFor(s.id) : false;
        c.onChange = () => { be!.items = c.items; store.bump(); };
        this.openContainer = c;
        this.openOverlay({ kind: 'hearth', pos: [x, y, z] });
        return true;
      }
      // ---- Spark circuitry: levers latch, buttons and plates are momentary.
      case B.SPARK_LEVER: case B.SPARK_LEVER_ON: {
        const on = id === B.SPARK_LEVER;
        this.world.setBlock(x, y, z, on ? B.SPARK_LEVER_ON : B.SPARK_LEVER);
        audio.play('click', { pos: [x, y, z], pitch: on ? 1.1 : 0.9 });
        this.updateSignal(x, y, z);
        return true;
      }
      // Fence gates and trapdoors toggle between their shut and open block ids, exactly like the
      // doors below: the open variant is a thin, non-solid box the player can walk/climb through.
      case B.OAK_GATE: case B.OAK_GATE_OPEN: {
        this.world.setBlock(x, y, z, id === B.OAK_GATE ? B.OAK_GATE_OPEN : B.OAK_GATE);
        audio.play('door', { pos: [x, y, z] });
        return true;
      }
      case B.OAK_TRAPDOOR: case B.OAK_TRAPDOOR_OPEN: {
        this.world.setBlock(x, y, z, id === B.OAK_TRAPDOOR ? B.OAK_TRAPDOOR_OPEN : B.OAK_TRAPDOOR);
        audio.play('door', { pos: [x, y, z] });
        return true;
      }
      case B.DOOR_LOWER_Z: case B.DOOR_UPPER_Z: case B.DOOR_LOWER_X: case B.DOOR_UPPER_X: {
        const lowerY = id === B.DOOR_UPPER_Z || id === B.DOOR_UPPER_X ? y - 1 : y;
        const isZ = id === B.DOOR_LOWER_Z || id === B.DOOR_UPPER_Z;
        this.world.setBlock(x, lowerY, z, isZ ? B.DOOR_LOWER_X : B.DOOR_LOWER_Z);
        this.world.setBlock(x, lowerY + 1, z, isZ ? B.DOOR_UPPER_X : B.DOOR_UPPER_Z);
        audio.play('door', { pos: [x, y, z] });
        return true;
      }
      case B.BED: {
        this.player.spawn = [x + 0.5, y + 1, z + 0.5];
        if (this.dimension === 'void') { this.message(`You cannot rest in ${dimName('void')}.`); return true; }
        if (this.isNight() || this.weather.type === 'storm') {
          const hostile = this.entities.mobs().some((m) => m.def.hostile && m.distTo(x, y, z) < 10);
          if (hostile) { this.message('You cannot sleep now, there are monsters nearby.'); return true; }
          this.sleepTimer = 0;
          this.message('Sleeping...');
        } else this.message('Spawn point set. You can only sleep at night.');
        return true;
      }
      case B.LUMEN: case B.TORCH: return false;
    }
    return false;
  }

  private tryLightPortal(t: RaycastHit): boolean {
    const [sx, sy, sz] = [t.x + t.nx, t.y + t.ny, t.z + t.nz];
    if (this.world.getBlock(sx, sy, sz) !== B.AIR) return false;
    for (const axis of ['x', 'z'] as const) {
      // find interior bounds along axis and y
      const step = axis === 'x' ? [1, 0] : [0, 1];
      let ax = sx, az = sz;
      while (this.world.getBlock(ax - step[0], sy, az - step[1]) === B.AIR && Math.abs(ax - sx) + Math.abs(az - sz) < 3) { ax -= step[0]; az -= step[1]; }
      let y0 = sy;
      while (this.world.getBlock(ax, y0 - 1, az) === B.AIR && sy - y0 < 4) y0--;
      for (const [w, h] of [[2, 3], [3, 3], [2, 4], [3, 4]]) {
        let ok = true;
        for (let i = 0; i < w && ok; i++) for (let j = 0; j < h; j++) {
          if (this.world.getBlock(ax + step[0] * i, y0 + j, az + step[1] * i) !== B.AIR) { ok = false; break; }
        }
        if (!ok) continue;
        for (let i = -1; i <= w && ok; i++) {
          if (this.world.getBlock(ax + step[0] * i, y0 - 1, az + step[1] * i) !== B.VOIDSTONE) ok = false;
          if (this.world.getBlock(ax + step[0] * i, y0 + h, az + step[1] * i) !== B.VOIDSTONE) ok = false;
        }
        for (let j = 0; j < h && ok; j++) {
          if (this.world.getBlock(ax - step[0], y0 + j, az - step[1]) !== B.VOIDSTONE) ok = false;
          if (this.world.getBlock(ax + step[0] * w, y0 + j, az + step[1] * w) !== B.VOIDSTONE) ok = false;
        }
        if (!ok) continue;
        for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) this.world.setBlock(ax + step[0] * i, y0 + j, az + step[1] * i, axis === 'x' ? B.PORTAL : B.PORTAL_X);
        this.particles.magic(ax + 0.5, y0 + 1, az + 0.5, 30, [0.7, 0.3, 1]);
        this.message(`A portal to ${dimName('void')} opens...`);
        return true;
      }
    }
    return false;
  }

  // ------------------------------------------------------------------ world ticks
  /**
   * Spark Plates: a plate under the player's feet latches on, and releases as soon as they step
   * off. Checked every frame against the player's footprint rather than random-ticked, so the
   * response is immediate the way a trigger has to be.
   */
  private tickPlates(): void {
    const p = this.player;
    const y = Math.floor(p.body.y + 0.05);
    const here = new Set<string>();
    // the player's footprint can straddle up to four blocks
    for (const ox of [-0.3, 0.3]) for (const oz of [-0.3, 0.3]) {
      const x = Math.floor(p.body.x + ox), z = Math.floor(p.body.z + oz);
      const id = this.world.getBlock(x, y, z);
      if (id === B.SPARK_PLATE || id === B.SPARK_PLATE_ON) here.add(`${x},${y},${z}`);
    }
    // press anything newly stood on
    for (const k of here) {
      if (this.pressedPlates.has(k)) continue;
      const [x, py, z] = k.split(',').map(Number);
      this.world.setBlock(x, py, z, B.SPARK_PLATE_ON);
      audio.play('click', { pos: [x, py, z], pitch: 1.2, volume: 0.4 });
      this.updateSignal(x, py, z);
    }
    // release anything stepped off
    for (const k of this.pressedPlates) {
      if (here.has(k)) continue;
      const [x, py, z] = k.split(',').map(Number);
      if (this.world.getBlock(x, py, z) === B.SPARK_PLATE_ON) {
        this.world.setBlock(x, py, z, B.SPARK_PLATE);
        audio.play('click', { pos: [x, py, z], pitch: 0.85, volume: 0.4 });
        this.updateSignal(x, py, z);
      }
    }
    this.pressedPlates = here;
  }

  private tickBlocks(dt: number): void {
    this.randomTickTimer += dt;
    if (this.randomTickTimer < 0.25) return;
    this.randomTickTimer = 0;
    const p = this.player;
    const pcx = Math.floor(p.body.x / 16), pcz = Math.floor(p.body.z / 16);
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      const c = this.world.getChunk(pcx + dx, pcz + dz);
      if (!c) continue;
      for (let n = 0; n < 6; n++) {
        const lx = Math.floor(Math.random() * 16), lz = Math.floor(Math.random() * 16);
        const y = Math.floor(Math.random() * CHUNK_HEIGHT);
        const x = c.cx * 16 + lx, z = c.cz * 16 + lz;
        const id = this.world.getBlock(x, y, z);
        if (id === B.AIR) continue;
        if (CROP_STAGES[id] !== undefined) {
          // crops need light (vanilla rule); on hydrated farmland they grow much faster — the
          // loading-screen tip's promise, now actually true. Off farmland they barely survive.
          const [skyL, blkL] = this.world.getLight(x, y, z);
          if (skyL + blkL >= 8) {
            let chance = 0.05;
            if (this.world.getBlock(x, y - 1, z) === B.FARMLAND) {
              chance = 0.15;
              let wet = false;
              for (let ox = -3; ox <= 3 && !wet; ox++) for (let oz = -3; oz <= 3; oz++) if (this.world.getBlock(x + ox, y - 1, z + oz) === B.WATER) { wet = true; break; }
              if (wet) chance = 0.35;
            }
            if (Math.random() < chance) this.world.setBlock(x, y, z, CROP_STAGES[id]);
          }
        }
        else if (SAPLING_TREE[id]) {
          if (Math.random() < 0.12) {
            this.world.setBlock(x, y, z, B.AIR);
            placeTree(SAPLING_TREE[id] as any, x, y, z, mulberry32(Math.random() * 1e9), (bx, by, bz, bid, force) => {
              const cur = this.world.getBlock(bx, by, bz);
              if (force || cur === B.AIR || BLOCKS[cur].replaceable) this.world.setBlock(bx, by, bz, bid);
            });
          }
        } else if (id === B.DIRT) {
          const above = this.world.getBlock(x, y + 1, z);
          if (above === B.AIR && this.world.getLight(x, y + 1, z)[0] > 8) {
            let grassNear = false;
            for (const [ox, oy, oz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1], [1, -1, 0], [-1, -1, 0], [0, -1, 1], [0, -1, -1]]) {
              const nb = this.world.getBlock(x + ox, y + oy, z + oz);
              if (nb === B.GRASS || nb === B.SNOW_GRASS) { grassNear = true; break; }
            }
            if (grassNear) this.world.setBlock(x, y, z, BIOMES[c.biomes[lx * 16 + lz]].temperature < 0.2 ? B.SNOW_GRASS : B.GRASS);
          }
        } else if (id === B.GRASS || id === B.SNOW_GRASS) {
          const above = this.world.getBlock(x, y + 1, z);
          if (above !== B.AIR && BLOCKS[above].opaque) this.world.setBlock(x, y, z, B.DIRT);
        } else if (id === B.FARMLAND) {
          const above = this.world.getBlock(x, y + 1, z);
          if (above === B.AIR && Math.random() < 0.1) {
            let water = false;
            for (let ox = -3; ox <= 3 && !water; ox++) for (let oz = -3; oz <= 3; oz++) if (this.world.getBlock(x + ox, y, z + oz) === B.WATER) { water = true; break; }
            if (!water) this.world.setBlock(x, y, z, B.DIRT);
          }
        } else if (id === B.LAVA && Math.random() < 0.3) {
          if (this.world.getBlock(x, y + 1, z) === B.AIR && Math.hypot(x - p.body.x, z - p.body.z) < 32) this.particles.flame(x + Math.random(), y + 1, z + Math.random());
        } else if (id === B.TORCH && Math.hypot(x - p.body.x, z - p.body.z) < 24) this.particles.smoke(x + 0.5, y + 0.7, z + 0.5);
        else if (id === B.FURNACE_LIT && Math.hypot(x - p.body.x, z - p.body.z) < 24) { this.particles.smoke(x + 0.5, y + 1.1, z + 0.5); if (Math.random() < 0.3) audio.play('furnace', { pos: [x, y, z], volume: 0.5 }); }
      }
    }
    // furnaces and brewing hearths
    for (const [key, be] of this.world.blockEntities) {
      if (be.type !== 'furnace' && be.type !== 'hearth') continue;
      const [x, y, z] = key.split(',').map(Number);
      if (Math.abs(x - p.body.x) > 80 || Math.abs(z - p.body.z) > 80) continue;
      if (be.type === 'furnace') this.tickFurnace(be, x, y, z, 0.25);
      else this.tickHearth(be, x, y, z, 0.25);
    }
  }

  /**
   * Steep a draught. The hearth mirrors the furnace's shape -- flask in slot 0, reagent in slot 1,
   * result in slot 2 -- so the existing furnace UI and progress arrow can be reused wholesale.
   * The recipe table lives in game/brewing/Brewing.ts and is content-integrity tested.
   */
  private tickHearth(be: BlockEntity, _x: number, _y: number, _z: number, dt: number): void {
    const flask = be.items[0], reagent = be.items[1], output = be.items[2];
    const recipe = reagent ? draughtFor(reagent.id) : undefined;
    be.cook = be.cook ?? 0;
    const canOutput = !!recipe && !!flask && (!output || (output.id === recipe.id && output.count + 1 <= 16));
    if (!canOutput) { if (be.cook > 0) be.cook = Math.max(0, be.cook - dt * 2); return; }
    be.cook += dt;
    if (be.cook < BREW_SECONDS) return;
    be.cook = 0;
    flask!.count--; if (flask!.count <= 0) be.items[0] = null;
    reagent!.count--; if (reagent!.count <= 0) be.items[1] = null;
    if (output) output.count += 1; else be.items[2] = makeStack(recipe!.id, 1);
    audio.play('enchant', { volume: 0.4 });
    store.bump();
  }

  private tickFurnace(be: BlockEntity, x: number, y: number, z: number, dt: number): void {
    const input = be.items[0], fuel = be.items[1], output = be.items[2];
    const recipe = input ? SMELTING[input.id] : undefined;
    const canOutput = recipe && (!output || (output.id === recipe.result && output.count + recipe.count <= 64));
    be.burn = be.burn ?? 0; be.cook = be.cook ?? 0;
    if (be.burn <= 0 && canOutput && fuel) {
      const f = itemDef(fuel.id)?.fuel;
      if (f) {
        be.burn = f; be.burnMax = f;
        fuel.count--; if (fuel.count <= 0) be.items[1] = null;
        store.bump();
      }
    }
    const lit = be.burn > 0;
    const cur = this.world.getBlock(x, y, z);
    if (lit && cur === B.FURNACE) this.world.setBlock(x, y, z, B.FURNACE_LIT);
    if (!lit && cur === B.FURNACE_LIT) this.world.setBlock(x, y, z, B.FURNACE);
    if (lit) {
      be.burn -= dt;
      if (canOutput && recipe && input) {
        be.cook += dt;
        if (be.cook >= recipe.time) {
          be.cook = 0;
          input.count--; if (input.count <= 0) be.items[0] = null;
          if (output) output.count += recipe.count; else be.items[2] = makeStack(recipe.result, recipe.count);
          (be as any).xp = ((be as any).xp ?? 0) + recipe.xp;
          store.bump();
        }
      } else be.cook = 0;
    } else if (be.cook > 0) be.cook = Math.max(0, be.cook - dt * 2);
  }

  private tickPortal(dt: number): void {
    const p = this.player;
    const inPortal = [B.PORTAL, B.PORTAL_X].includes(this.world.getBlock(Math.floor(p.body.x), Math.floor(p.body.y + 0.5), Math.floor(p.body.z)) as any);
    if (inPortal && !this.transport.connected) {
      this.portalTimer += dt;
      store.setHud({ portal: Math.min(1, this.portalTimer / (p.mode === 'creative' ? 0.3 : 3)) });
      if (Math.random() < dt * 20) this.particles.magic(p.body.x, p.body.y, p.body.z, 1, [0.7, 0.3, 1]);
      if (this.portalTimer > (p.mode === 'creative' ? 0.3 : 3)) { this.portalTimer = -5; this.switchDimension(this.dimension === 'overworld' ? 'void' : 'overworld'); }
    } else if (this.portalTimer > 0) { this.portalTimer = 0; store.setHud({ portal: 0 }); }
    else if (this.portalTimer < 0) { this.portalTimer = Math.min(0, this.portalTimer + dt); if (!inPortal) this.portalTimer = 0; }
  }

  async switchDimension(dim: Dim): Promise<void> {
    if (dim === this.dimension) return;
    this.running = false;
    cancelAnimationFrame(this.raf);
    store.set({ screen: 'loading', loading: { stage: dim === 'void' ? `Entering ${dimName('void')}...` : `Returning to ${dimName('overworld')}...`, progress: 0.1 } });
    // persist current dimension state
    this.dimEdits[this.dimension] = this.world.serializeEdits();
    const visited: string[] = [], bes: Record<string, unknown> = {};
    const prefix = this.dimension === 'void' ? 'v:' : 'o:';
    for (const v of this.world.visited) visited.push(prefix + v);
    for (const [k, v] of this.world.blockEntities) bes[prefix + k] = v;
    this.savedVisited = this.savedVisited.filter((v) => !v.startsWith(prefix)).concat(visited);
    for (const k of Object.keys(this.savedBlockEntities)) if (k.startsWith(prefix)) delete this.savedBlockEntities[k];
    Object.assign(this.savedBlockEntities, bes);
    this.entities.clear();
    this.dimension = dim;
    const scale = dim === 'void' ? 1 / 8 : 8;
    const tx = Math.floor(this.player.body.x * scale), tz = Math.floor(this.player.body.z * scale);
    this.createWorld(dim, this.savedVisited, this.savedBlockEntities);
    this.world.update(tx, tz);
    await this.waitFor(() => this.world.isLoaded(tx, tz), 10000);
    await this.waitForChunks(tx, tz, 1, (p) => store.set({ loading: { stage: 'Building portal...', progress: 0.2 + p * 0.6 } }));
    // find / build arrival portal
    let ty = dim === 'void' ? 40 : this.world.surfaceY(tx, tz) + 1;
    if (dim === 'void') { ty = 36; while (ty < 100 && this.world.getBlock(tx, ty, tz) !== B.AIR) ty++; for (let yy = ty; yy < ty + 5; yy++) for (let ox = -2; ox <= 2; ox++) for (let oz = -2; oz <= 3; oz++) this.world.setBlock(tx + ox, yy, tz + oz, B.AIR); }
    // platform
    for (let ox = -2; ox <= 2; ox++) for (let oz = -1; oz <= 2; oz++) this.world.setBlock(tx + ox, ty - 1, tz + oz, B.VOIDSTONE);
    // frame along x at tz+2
    for (let ox = -1; ox <= 2; ox++) { this.world.setBlock(tx + ox, ty - 1, tz + 2, B.VOIDSTONE); this.world.setBlock(tx + ox, ty + 3, tz + 2, B.VOIDSTONE); }
    for (let oy = 0; oy < 3; oy++) { this.world.setBlock(tx - 1, ty + oy, tz + 2, B.VOIDSTONE); this.world.setBlock(tx + 2, ty + oy, tz + 2, B.VOIDSTONE); this.world.setBlock(tx, ty + oy, tz + 2, B.PORTAL); this.world.setBlock(tx + 1, ty + oy, tz + 2, B.PORTAL); }
    this.player.setPosition(tx + 0.5, ty, tz + 0.5);
    this.portalTimer = -4;
    this.running = true;
    this.lastTime = performance.now();
    store.set({ screen: 'game' });
    this.raf = requestAnimationFrame(this.loop);
    this.message(dim === 'void' ? `${dimName('void')}. ${DIMENSIONS.void.flavour.split('. ').pop()}` : `Back in ${dimName('overworld')}.`);
    audio.play('portal');
    this.lockGrace = true; setTimeout(() => (this.lockGrace = false), 500);
    this.requestLock();
  }
  private savedVisited: string[] = [];
  private savedBlockEntities: Record<string, unknown> = {};

  // ------------------------------------------------------------------ discovery journal
  /** Celebrates firsts (biomes, structure loot, rare finds) with a toast, a chime and XP. */
  private discovery = new Discovery({
    message: (t) => this.message(t),
    addXp: (n) => { if (this.player.isSurvival && !this.player.dead) this.player.addXp(n); },
    chime: (big) => audio.play('discover', { volume: big ? 0.9 : 0.55, pitch: big ? 0.9 : 1.3 }),
  });
  private discoveryTimer = 4;
  /** Every couple of seconds, check the biome under the player and journal it if it is new. */
  private discoveryTick(dt: number): void {
    this.discoveryTimer -= dt;
    if (this.discoveryTimer > 0) return;
    this.discoveryTimer = 2;
    if (this.dimension !== 'overworld' || this.player.dead || this.player.mode === 'spectator') return;
    const p = this.player;
    const bx = Math.floor(p.body.x), bz = Math.floor(p.body.z);
    if (!this.world.isLoaded(bx, bz)) return;
    const b = this.world.getBiome(bx, bz);
    if (b && this.discovery.biome(b, BIOMES[b]?.name ?? 'the wilds')) {
      this.particles.magic(p.body.x, p.body.y + 1.2, p.body.z, 10, [0.55, 1, 0.5]);
    }
  }

  private weatherTick(dt: number): void {
    this.weather.timer -= dt;
    if (this.weather.timer <= 0) {
      if (this.weather.type === 'clear') { const storm = Math.random() < 0.3; this.weather = { type: storm ? 'storm' : 'rain', timer: 120 + Math.random() * 240 }; }
      else this.weather = { type: 'clear', timer: 400 + Math.random() * 900 };
    }
    if (this.weather.type === 'storm' && this.env.weather === 'storm') {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = 4 + Math.random() * 12;
        this.env.flashLightning();
        audio.play('thunder', { volume: 0.8 });
        if (Math.random() < 0.25) {
          const p = this.player;
          const x = Math.floor(p.body.x + (Math.random() - 0.5) * 40), z = Math.floor(p.body.z + (Math.random() - 0.5) * 40);
          const y = this.world.surfaceY(x, z);
          for (let i = 0; i < 20; i++) this.particles.flame(x + 0.5, y + 1 + i * 0.5, z + 0.5, 2);
          this.explode(x + 0.5, y + 1, z + 0.5, 1.5, false);
        }
      }
    }
  }

  explode(x: number, y: number, z: number, radius: number, breakBlocks: boolean): void {
    this.particles.explosion(x, y, z);
    audio.play('explosion', { pos: [x, y, z] });
    if (settings.value.cameraShake) this.camShake = 0.5;
    const p = this.player;
    const d = Math.hypot(p.body.x - x, p.body.y + 0.9 - y, p.body.z - z);
    if (d < radius * 2.5) { if (p.damage(Math.round((1 - d / (radius * 2.5)) * radius * 5), 'explosion')) p.knockback(p.body.x - x, p.body.z - z, 6); }
    for (const m of this.entities.mobs()) {
      const md = m.distTo(x, y, z);
      if (md < radius * 2.5) m.damage(Math.round((1 - md / (radius * 2.5)) * radius * 5), x, z, false, this.entityCtx);
    }
    if (breakBlocks) {
      const r = Math.ceil(radius);
      let count = 0;
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dy * dy + dz * dz > radius * radius || count > 60) continue;
        const bx = Math.floor(x) + dx, by = Math.floor(y) + dy, bz = Math.floor(z) + dz;
        const id = this.world.getBlock(bx, by, bz);
        if (id === B.AIR || BLOCKS[id].hardness < 0 || BLOCKS[id].hardness > 20) continue;
        this.world.setBlock(bx, by, bz, B.AIR);
        count++;
      }
    }
  }

  // ------------------------------------------------------------------ items
  dropItem(x: number, y: number, z: number, stack: ItemStack, vx: number, vy: number, vz: number): void {
    const e = new ItemEntity(x, y, z, { ...stack });
    e.body.vx = vx; e.body.vy = vy; e.body.vz = vz;
    this.entities.add(e);
  }
  spawnXp(x: number, y: number, z: number, amount: number): void {
    let left = amount;
    while (left > 0) { const n = Math.min(left, left > 10 ? 7 : 3); left -= n; this.entities.add(new XpOrb(x, y, z, n)); }
  }
  dropHeld(all: boolean): void {
    const held = this.player.inventory.held;
    if (!held) return;
    const n = all ? held.count : 1;
    const s = { ...held, count: n };
    held.count -= n;
    if (held.count <= 0) this.player.inventory.setHeld(null); else store.bump();
    audio.play('drop', { volume: 0.5 });
    this.dropHeldStack(s);
  }
  private dropHeldStack(s: ItemStack): void {
    const p = this.player;
    const [dx, dy, dz] = p.lookDir();
    this.dropItem(p.body.x + dx * 0.5, p.eyeY - 0.3, p.body.z + dz * 0.5, s, dx * 6, dy * 6 + 2, dz * 6);
    const e = this.entities.entities[this.entities.entities.length - 1] as ItemEntity;
    e.pickupDelay = 1.5;
  }
  footstep(): void {
    const p = this.player;
    const id = this.world.getBlock(Math.floor(p.body.x), Math.floor(p.body.y - 0.2), Math.floor(p.body.z));
    if (id === B.AIR) return;
    if (p.body.inWater) { audio.play('swim', { volume: 0.4 }); return; }
    audio.play('step.' + blockDef(id).sound, { volume: p.sneaking ? 0.15 : 0.45 });
  }

  // ------------------------------------------------------------------ containers / crafting UI hooks
  private makeCraftOutput(): Container {
    const self = this;
    return {
      size: 1, outputOnly: true,
      get() { const size = store.state.overlay?.kind === 'crafting' ? 3 : 2; const grid = self.currentGrid(size); const r = matchRecipe(grid, size); return r ? recipeResult(r) : null; },
      set() { /* output only */ },
      onTake() {
        const size = store.state.overlay?.kind === 'crafting' ? 3 : 2;
        const grid = self.currentGrid(size);
        consumeGrid(grid);
        self.writeGrid(grid, size);
        audio.play('craft', { volume: 0.5 });
        store.bump();
      },
    };
  }
  currentGrid(size: number): (ItemStack | null)[] {
    const g: (ItemStack | null)[] = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) g.push(this.craftGrid.get(y * 3 + x));
    return g;
  }
  private writeGrid(grid: (ItemStack | null)[], size: number): void {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) this.craftGrid.items[y * 3 + x] = grid[y * size + x] && grid[y * size + x]!.count > 0 ? grid[y * size + x] : null;
  }
  furnaceOutputContainer(): Container | null {
    const be = this.openEntity;
    if (!be || be.type !== 'furnace' && be.type !== 'hearth') return null;
    const self = this;
    return {
      size: 1, outputOnly: true,
      get() { return be.items[2]; },
      set() { /* */ },
      onTake() { be.items[2] = null; const xp = (be as any).xp ?? 0; if (xp >= 1) { self.spawnXp(self.player.body.x, self.player.body.y + 1, self.player.body.z, Math.floor(xp)); (be as any).xp = xp - Math.floor(xp); } store.bump(); },
    };
  }
  slotClick(c: Container, i: number, button: 0 | 2, shift: boolean): void {
    const inv = this.player.inventory;
    if (c.get(i) || inv.cursor) audio.play('inv', { volume: 0.6 });
    if (shift) {
      const targets: Container[] = [];
      if (c === inv.main) { if (this.openContainer && store.state.overlay?.kind === 'chest') targets.push(this.openContainer); else { const s = inv.main.get(i); if (s && itemDef(s.id)?.armor) targets.push(inv.armor); if (s && itemDef(s.id)?.type === 'shield' && !inv.offhand.get(0)) targets.push(inv.offhand); targets.push(hotbarOrMain(inv.main, i)); } }
      else targets.push(inv.main);
      quickMove(inv, c, i, targets);
    } else clickSlot(inv, c, i, button, this.player.mode === 'creative');
    audio.play('ui', { volume: 0.3 });
    store.bump();
  }
  creativeTake(id: string, button: 0 | 2): void {
    const inv = this.player.inventory;
    if (inv.cursor && inv.cursor.id === id && button === 0) { inv.cursor.count = Math.min(64, inv.cursor.count + 1); }
    else if (!inv.cursor) inv.cursor = makeStack(id, button === 2 ? 1 : 1);
    else inv.cursor = null;
    store.bump();
  }
  dropCursor(): void {
    const inv = this.player.inventory;
    if (!inv.cursor) return;
    this.dropHeldStack(inv.cursor);
    inv.cursor = null;
    store.bump();
  }
  openTrade(m: Mob): void {
    this.tradeMob = m;
    const data = (m as any).tradeData ?? ((m as any).tradeData = { profession: m.id % 3, done: 0 });
    this.trades = (m as any).trades ?? ((m as any).trades = makeTrades(data.profession, data.done >= 3));
    audio.play('mob.keeper', { pos: [m.x, m.y, m.z] });
    this.openOverlay({ kind: 'trade', mobId: m.id });
  }
  doTrade(index: number): boolean {
    const t = this.trades[index];
    const inv = this.player.inventory.main;
    if (!t || t.uses >= t.maxUses) return false;
    if (inv.count(t.cost.id) < t.cost.count || (t.cost2 && inv.count(t.cost2.id) < t.cost2.count)) return false;
    inv.remove(t.cost.id, t.cost.count);
    if (t.cost2) inv.remove(t.cost2.id, t.cost2.count);
    const left = inv.add({ ...t.result });
    if (left > 0) this.dropHeldStack({ ...t.result, count: left });
    t.uses++;
    const m = this.tradeMob as any;
    if (m) { m.tradeData.done++; if (m.tradeData.done === 3) { m.trades = makeTrades(m.tradeData.profession, true); this.trades = m.trades; this.message('The Keeper offers new trades!'); } }
    this.spawnXp(this.player.body.x, this.player.body.y + 1, this.player.body.z, 2);
    audio.play('craft');
    store.bump();
    return true;
  }
  /**
   * Drive doors from the circuit.
   *
   * A FABLE door "opens" by swapping its Z/X orientation, which means it has no intrinsic
   * open/closed bit -- so this remembers the orientation each signal-driven door rested at and
   * swaps it while powered, restoring it when the power dies. That keeps hand-opened doors
   * behaving exactly as before: a door is only tracked once a circuit has actually moved it.
   */
  private updateSignalDoors(ox: number, oy: number, oz: number): void {
    const field = computeField(this.world, SIGNAL_BLOCKS, { x: ox, y: oy, z: oz }, 16);
    const R = 16;
    for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) {
      const x = ox + dx, y = oy + dy, z = oz + dz;
      const id = this.world.getBlock(x, y, z);
      const isLower = id === B.DOOR_LOWER_Z || id === B.DOOR_LOWER_X;
      if (!isLower) continue;
      // a door reads power at either of its two halves
      const powered = powerAt(this.world, SIGNAL_BLOCKS, field, x, y, z) > 0
        || powerAt(this.world, SIGNAL_BLOCKS, field, x, y + 1, z) > 0;
      const key = `${x},${y},${z}`;
      const rest = this.signalDoors.get(key);
      if (powered && rest === undefined) {
        // first time a circuit opens this door: remember how it was sitting, then swing it
        this.signalDoors.set(key, id);
        const isZ = id === B.DOOR_LOWER_Z;
        this.world.setBlock(x, y, z, isZ ? B.DOOR_LOWER_X : B.DOOR_LOWER_Z);
        this.world.setBlock(x, y + 1, z, isZ ? B.DOOR_UPPER_X : B.DOOR_UPPER_Z);
        audio.play('door', { pos: [x, y, z] });
      } else if (!powered && rest !== undefined) {
        // power cut: put it back the way the player left it
        this.signalDoors.delete(key);
        const restZ = rest === B.DOOR_LOWER_Z;
        this.world.setBlock(x, y, z, restZ ? B.DOOR_LOWER_Z : B.DOOR_LOWER_X);
        this.world.setBlock(x, y + 1, z, restZ ? B.DOOR_UPPER_Z : B.DOOR_UPPER_X);
        audio.play('door', { pos: [x, y, z] });
      }
    }
  }

  /**
   * Re-settle the Spark circuit around a position and push the results into the world.
   *
   * The rules live in game/redstone/Signal.ts, which is pure and unit-tested against a plain grid;
   * this method only supplies the world view and turns the returned changes into sound. Called
   * whenever a circuit block is placed, broken or toggled, plus when a Spark Plate is stepped on.
   */
  updateSignal(x: number, y: number, z: number): void {
    const changed = propagate(this.world, SIGNAL_BLOCKS, { x, y, z }, 16);
    this.updateSignalDoors(x, y, z);
    if (!changed.length) return;
    // One sound for the whole batch: a long wire can flip dozens of blocks in a single tick.
    const first = changed[0];
    audio.play('click', { pos: [first.x, first.y, first.z], pitch: 1.3, volume: 0.35 });
    // A Shunt that just extended shoves the block in front of it one space along +Y.
    for (const c of changed) {
      if (this.world.getBlock(c.x, c.y, c.z) !== B.SHUNT_ON) continue;
      const above = this.world.getBlock(c.x, c.y + 1, c.z);
      if (above === B.AIR || !BLOCKS[above]) continue;
      const dest = this.world.getBlock(c.x, c.y + 2, c.z);
      const def = BLOCKS[above];
      // only push a plain, breakable, non-entity cube, and only into empty space
      if (dest !== B.AIR || def.hardness < 0 || BLOCK_ENTITY_BLOCKS.has(above)) continue;
      this.world.setBlock(c.x, c.y + 1, c.z, B.AIR);
      this.world.setBlock(c.x, c.y + 2, c.z, above);
    }
  }

  /**
   * Re-solve the Trackway shape at a position and at each of its neighbours.
   *
   * Track has ten block ids, one per shape, and the player only ever places the generic item: the
   * shape is derived from what is adjacent. Re-solving the neighbours too is what makes an existing
   * straight bend into a curve the moment you extend a line past it.
   */
  updateTrack(x: number, y: number, z: number): void {
    const probe = {
      at: (px: number, py: number, pz: number): boolean => {
        const id = this.world.getBlock(px, py, pz);
        return id >= B.TRACK_NS && id <= B.TRACK_ASC_W;
      },
    };
    const spots: [number, number, number][] = [[x, y, z]];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (const dy of [0, 1, -1]) spots.push([x + dx, y + dy, z + dz]);
    }
    for (const [sx, sy, sz] of spots) {
      if (!probe.at(sx, sy, sz)) continue;
      const shape = solveShape(probe, sx, sy, sz);
      const want = B.TRACK_NS + TRACK_SHAPES.indexOf(shape);
      if (this.world.getBlock(sx, sy, sz) !== want) this.world.setBlock(sx, sy, sz, want);
    }
  }

  /** The vehicle the player is currently riding, if any. */
  ridingVehicle(): Vehicle | null {
    for (const e of this.entities.entities) {
      if (e instanceof Vehicle && e.rider === this.player) return e;
    }
    return null;
  }

  /** The vehicle within arm's reach, for mounting. */
  private vehicleNear(): Vehicle | null {
    let best: Vehicle | null = null, bestD = 2.4;
    for (const e of this.entities.entities) {
      if (!(e instanceof Vehicle) || e.rider) continue;
      const d = e.distTo(this.player.body.x, this.player.body.y, this.player.body.z);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  /**
   * Drive the Ancient Blade into the top of a block.
   *
   * Returns false when the space above is occupied, so the sword can never end up inside geometry.
   * The lean is derived from the player's facing rather than randomised, so the blade tips away
   * from whoever planted it — which is both predictable and what looks right on screen.
   */
  driveBlade(bx: number, by: number, bz: number): boolean {
    if (this.world.getBlock(bx, by + 1, bz) !== B.AIR) return false;
    if (!BLOCKS[this.world.getBlock(bx, by, bz)].solid) return false;
    // already one here?
    if (this.entities.entities.some((e) => e instanceof StuckBlade && e.bx === bx && e.by === by && e.bz === bz)) return false;
    const lean = this.player.yaw + Math.PI;
    const blade = new StuckBlade(bx, by, bz, 0.28, lean, true);
    this.entities.add(blade);
    if (settings.value.cameraShake) this.camShake = Math.max(this.camShake, 0.22);
    return true;
  }

  /** Pull a planted blade back out, returning it to the inventory. */
  private pullBlade(blade: StuckBlade): void {
    blade.onPull(this.entityCtx);
    const stack = makeStack('ancient_blade', 1);
    if (this.player.inventory.add(stack) > 0) this.dropHeldStack(stack);
    if (settings.value.cameraShake) this.camShake = Math.max(this.camShake, 0.12);
    this.message('You pull the Ancient Blade free.');
    store.bump();
  }

  /** The planted blade the player is standing next to, if any (drives the interaction prompt). */
  nearestBlade(): StuckBlade | null {
    let best: StuckBlade | null = null, bestD = Infinity;
    for (const e of this.entities.entities) {
      if (!(e instanceof StuckBlade) || !e.nearPlayer || !e.seated) continue;
      const d = e.distTo(this.player.body.x, this.player.body.y, this.player.body.z);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  /**
   * Fill or empty the held pail. Returns true when it did something, so `use()` can stop there.
   * The fill/empty rules -- including vanilla's infinite-water behaviour -- live in
   * game/items/Bucket.ts and are unit-tested against a plain grid.
   */
  private usePail(held: ItemStack): boolean {
    const p = this.player;
    const t = this.target;
    if (!t) return false;
    const swap = (to: string): void => {
      if (p.mode === 'creative') return;
      held.count--;
      if (held.count <= 0) p.inventory.setHeld(makeStack(to, 1));
      else if (p.inventory.add(makeStack(to, 1)) > 0) this.dropHeldStack(makeStack(to, 1));
      store.bump();
    };
    if (held.id === PAIL_EMPTY) {
      // scoop the block being looked at
      const got = pailFill(this.world, PAIL_WORLD_BLOCKS, t.x, t.y, t.z);
      if (!got) return false;
      swap(got);
      audio.play('splash', { pos: [t.x, t.y, t.z], volume: 0.6 });
      return true;
    }
    // pour into the free space in front of the targeted face
    const [nx, ny, nz] = [t.x + t.nx, t.y + t.ny, t.z + t.nz];
    const placed = pailEmpty(this.world, PAIL_WORLD_BLOCKS, held.id as PailState, nx, ny, nz,
      (id) => id === B.AIR || BLOCKS[id]?.replaceable === true);
    if (!placed) return false;
    swap(PAIL_EMPTY);
    audio.play('splash', { pos: [nx, ny, nz], volume: 0.6 });
    return true;
  }

  /**
   * Fuse the two tools in the Mending Stone into one.
   *
   * The repair itself is free: a player with two worn tools should always be able to make one good
   * one. The rules (durability sum, cap, rune merging) live in crafting/Reforging.ts and are pure,
   * so they are unit-tested away from the UI.
   */
  fuseTools(): boolean {
    const a = this.mendingContainer.get(0);
    const b = this.mendingContainer.get(1);
    if (!a || !b) return false;
    const out = fuse(a, b);
    if (!out) return false;
    this.mendingContainer.set(0, null);
    this.mendingContainer.set(1, null);
    if (this.player.inventory.add(out) > 0) this.dropHeldStack(out);
    audio.play('anvil', { volume: 0.8 });
    this.particles.magic(this.player.body.x, this.player.body.y + 1, this.player.body.z, 10, [0.8, 0.8, 0.9]);
    store.bump();
    return true;
  }

  /** Grind a rune off the tool in the Mending Stone, paying XP levels. */
  stripRune(rune: string): boolean {
    const a = this.mendingContainer.get(0);
    if (!a) return false;
    const creative = this.player.mode === 'creative';
    const res = strip(a, rune, creative ? Infinity : this.player.level);
    if (!res) return false;
    this.mendingContainer.set(0, res.stack);
    if (!creative) {
      this.player.level = res.levels;
      this.player.xpProgress = this.player.xp / this.player.xpToNext();
    }
    audio.play('anvil', { volume: 0.6, pitch: 1.2 });
    store.bump();
    return true;
  }

  enchant(name: string, level: number): boolean {
    const item = this.altarContainer.get(0);
    const dust = this.altarContainer.get(1);
    const cost = level * 3 + (level - 1) * 2;
    const dustCost = level;
    if (!item || (this.player.mode !== 'creative' && (this.player.level < cost || !dust || dust.id !== 'ember_dust' || dust.count < dustCost))) return false;
    item.ench = { ...(item.ench ?? {}), [name]: level };
    if (this.player.mode !== 'creative') {
      this.player.level -= cost; this.player.xpProgress = this.player.xp / this.player.xpToNext();
      dust!.count -= dustCost; if (dust!.count <= 0) this.altarContainer.set(1, null);
    }
    audio.play('enchant');
    this.particles.magic(this.player.body.x, this.player.body.y + 1, this.player.body.z, 20, [0.4, 1, 0.9]);
    store.bump();
    return true;
  }

  // ------------------------------------------------------------------ death / respawn
  private onDeath(src: string): void {
    const p = this.player;
    audio.play('death');
    const msgs: Record<string, string> = { fall: 'You fell from a high place', mob: 'You were slain', lava: 'You tried to swim in lava', fire: 'You burned to death', drown: 'You drowned', starve: 'You starved to death', suffocate: 'You suffocated in a wall', cactus: 'You were pricked to death', arrow: 'You were shot', void: 'You fell out of the world', explosion: 'You were blown up' };
    if (!this.options.keepInventory) {
      for (let i = 0; i < 36; i++) { const s = p.inventory.main.get(i); if (s) { this.dropItem(p.body.x, p.body.y + 0.5, p.body.z, s, (Math.random() - 0.5) * 4, 3, (Math.random() - 0.5) * 4); p.inventory.main.items[i] = null; } }
      for (let i = 0; i < 4; i++) { const s = p.inventory.armor.get(i); if (s) { this.dropItem(p.body.x, p.body.y + 0.5, p.body.z, s, (Math.random() - 0.5) * 4, 3, (Math.random() - 0.5) * 4); p.inventory.armor.items[i] = null; } }
      { const s = p.inventory.offhand.get(0); if (s) { this.dropItem(p.body.x, p.body.y + 0.5, p.body.z, s, (Math.random() - 0.5) * 4, 3, (Math.random() - 0.5) * 4); p.inventory.offhand.items[0] = null; } }
      this.spawnXp(p.body.x, p.body.y + 0.5, p.body.z, Math.min(50, p.level * 5 + Math.floor(p.xp)));
      p.level = 0; p.xp = 0; p.xpProgress = 0;
    }
    store.set({ dead: true, deathMessage: msgs[src] ?? 'You died', overlay: null });
    if (document.pointerLockElement) document.exitPointerLock();
    this.saveWorld();
  }

  async respawn(): Promise<void> {
    const p = this.player;
    if (this.options.mode === 'hardcore') return; // death is final: the death screen only offers deleting the world
    if (this.dimension === 'void') { await this.switchDimension('overworld'); }
    const sp = p.spawn ?? [0.5, 80, 0.5];
    this.world.update(sp[0], sp[2]);
    await this.waitFor(() => this.world.isLoaded(sp[0], sp[2]), 8000);
    let y = sp[1];
    const bx = Math.floor(sp[0]), bz = Math.floor(sp[2]);
    if (this.world.getBlock(bx, Math.floor(y), bz) !== B.AIR || this.world.getBlock(bx, Math.floor(y) - 1, bz) === B.AIR) y = this.world.surfaceY(bx, bz) + 1;
    p.respawn();
    p.setPosition(sp[0], y, sp[2]);
    store.set({ dead: false });
    this.lockGrace = true; setTimeout(() => (this.lockGrace = false), 300);
    this.requestLock();
  }

  // ------------------------------------------------------------------ chat / commands
  chat(text: string): void {
    const t = text.trim();
    store.set({ chatOpen: false });
    if (!t) { this.requestLock(); return; }
    if (t.startsWith('/') && !(this.transport.connected && SERVER_COMMANDS.has(t.slice(1).split(/\s+/)[0]))) this.command(t.slice(1));
    else if (this.transport.connected) this.transport.send({ t: 'chat', text: t });
    else store.addChat(`<${settings.value.playerName}> ${t}`);
    this.lockGrace = true; setTimeout(() => (this.lockGrace = false), 300);
    this.requestLock();
  }

  private command(cmd: string): void {
    const [name, ...args] = cmd.split(/\s+/);
    const p = this.player;
    const say = (s: string) => store.addChat(s);
    if (name === 'help') { say('Commands: /help /seed /time set <day|night|n> /gamemode <survival|creative|spectator> /give <item> [n] /tp <x> <y> <z> /weather <clear|rain|storm> /kill /heal /xp <n> /summon <mob> /difficulty <d> /spawn'); return; }
    if (name === 'seed') { say(`Seed: ${this.options.seed}`); return; }
    if (!this.options.cheats && p.mode !== 'creative') { say('Cheats are not enabled in this world.'); return; }
    switch (name) {
      case 'time': { const v = args[1] ?? args[0]; this.dayTime = v === 'day' ? 1000 : v === 'night' ? 14000 : v === 'noon' ? 6000 : parseInt(v) || 0; say(`Time set to ${Math.floor(this.dayTime)}`); break; }
      case 'gamemode': { const m = args[0]?.[0]; const mode = m === 'c' ? 'creative' : m === 's' && args[0].startsWith('sp') ? 'spectator' : m === 's' ? 'survival' : null; if (!mode) { say('Unknown game mode'); break; } p.mode = mode; if (mode !== 'creative') p.flying = mode === 'spectator'; say(`Game mode set to ${mode}`); break; }
      case 'give': { const id = args[0]; const n = parseInt(args[1]) || 1; if (!ITEMS.has(id)) { say(`Unknown item: ${id}`); break; } const left = p.inventory.add(makeStack(id, n)); if (left) this.dropHeldStack(makeStack(id, left)); say(`Gave ${n} ${id}`); break; }
      case 'tp': { const [x, y, z] = args.map(Number); if ([x, y, z].some((v) => isNaN(v))) { say('Usage: /tp x y z'); break; } p.setPosition(x, y, z); say(`Teleported to ${x} ${y} ${z}`); break; }
      case 'weather': { const w = args[0]; if (w === 'clear' || w === 'rain' || w === 'storm') { this.weather = { type: w, timer: 600 }; say(`Weather set to ${w}`); } else say('Usage: /weather clear|rain|storm'); break; }
      case 'kill': p.damage(1000, 'void'); break;
      case 'heal': p.health = p.maxHealth; p.hunger = 20; p.saturation = 5; say('Healed'); break;
      case 'xp': p.addXp(parseInt(args[0]) || 10); break;
      case 'summon': { const [dx, , dz] = p.lookDir(); const m = this.entities.spawnMob(args[0], p.body.x + dx * 3, p.body.y + 1, p.body.z + dz * 3); say(m ? `Summoned ${args[0]}` : `Unknown mob: ${args[0]}. Mobs: ${Object.keys(MOBS).join(', ')}`); break; }
      case 'difficulty': {
        if (this.options.mode === 'hardcore') { say('Difficulty is locked to Hard for Hardcore worlds.'); break; }
        const d = args[0] as any; if (['peaceful', 'easy', 'normal', 'hard'].includes(d)) { this.options.difficulty = d; p.difficulty = d; this.entityCtx.difficulty = d; say(`Difficulty set to ${d}`); } break;
      }
      case 'spawn': { const s = p.spawn; if (s) p.setPosition(s[0], s[1], s[2]); break; }
      case 'setblock': { const [x, y, z] = args.slice(0, 3).map(Number); const b = BLOCK_BY_NAME.get(args[3]); if (b) this.world.setBlock(x, y, z, b.id); else say('Unknown block'); break; }
      default: say(`Unknown command: /${name}. Try /help`);
    }
  }

  message(text: string): void { store.message(text); }

  // ------------------------------------------------------------------ HUD
  private updateHud(): void {
    const p = this.player;
    const effects = Object.keys(p.effects);
    if (p.fireTicks > 0) effects.push('burning');
    const tm = this.targetEntity;
    const target = tm && !tm.dead ? { name: tm.def.name, hp: Math.max(0, tm.health / tm.maxHealth), hostile: tm.def.hostile } : null;
    const blade = this.nearestBlade();
    store.setHud({
      bladePrompt: blade ? blade.distTo(p.body.x, p.body.y, p.body.z) < 2.2 : false,
      health: p.health, maxHealth: p.maxHealth, hunger: p.hunger, air: p.air, armor: p.inventory.armorValue(), xp: p.xpProgress, level: p.level,
      selected: p.inventory.selected, mode: p.mode, effects, hurt: Math.max(0, this.hurtFlash), hurtCause: this.hurtCause, underwater: this.env.underwater,
      target, mining: this.mineProgress, saving: this.saving, savedAt: this.lastSaveAt,
      coords: settings.value.showCoordinates ? `${Math.floor(p.body.x)} ${Math.floor(p.body.y)} ${Math.floor(p.body.z)}` : '',
      hardcore: this.options.mode === 'hardcore',
    });
  }

  // ------------------------------------------------------------------ saving
  buildSave(): WorldSave {
    const prefix = this.dimension === 'void' ? 'v:' : 'o:';
    const edits: Record<string, number[]> = {};
    this.dimEdits[this.dimension] = this.world.serializeEdits();
    for (const k in this.dimEdits.overworld) edits[k] = this.dimEdits.overworld[k];
    for (const k in this.dimEdits.void) edits['v:' + k] = this.dimEdits.void[k];
    const visited = this.savedVisited.filter((v) => !v.startsWith(prefix));
    for (const v of this.world.visited) visited.push(prefix + v);
    for (const k of this.discovery.serialize()) visited.push(prefix + k);
    const bes: Record<string, unknown> = {};
    for (const k of Object.keys(this.savedBlockEntities)) if (!k.startsWith(prefix)) bes[k] = this.savedBlockEntities[k];
    for (const [k, v] of this.world.blockEntities) bes[prefix + k] = v;
    const player = this.player.serialize() as any;
    player.dimension = this.dimension;
    return {
      id: this.saveId, options: this.options, created: this.created, lastPlayed: Date.now(), time: this.dayTime, day: this.day, weather: this.weather,
      player, edits, blockEntities: bes, entities: this.entities.serialize(), visited, playTime: this.playTime, preview: this.capturePreview(),
    };
  }

  /** Capture the current game renderer at its actual display resolution (F2). */
  private downloadScreenshot(): void {
    try {
      if (this.postFx.enabled) this.postFx.render(this.scene, this.camera);
      else this.renderer.render(this.scene, this.camera);
      const source = this.renderer.domElement;
      const image = document.createElement('canvas');
      image.width = source.width; image.height = source.height;
      const context = image.getContext('2d');
      if (!context) throw new Error('Canvas 2D context unavailable');
      context.drawImage(source, 0, 0);
      image.toBlob((blob) => {
        if (!blob) { store.message('Screenshot could not be saved.'); return; }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = `fable-${Date.now()}.png`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        store.message('Screenshot saved.');
        // Update the local world thumbnail shown in Marketplace as well.
        if (!this.transport.connected) void this.saveWorld();
      }, 'image/png');
    } catch (error) { console.warn('Screenshot failed', error); store.message('Screenshot could not be saved.'); }
  }

  private capturePreview(): string | undefined {
    try {
      if (this.postFx.enabled) this.postFx.render(this.scene, this.camera);
      else this.renderer.render(this.scene, this.camera);
      const c = document.createElement('canvas'); c.width = 640; c.height = 360;
      const context = c.getContext('2d');
      if (!context) return undefined;
      context.drawImage(this.renderer.domElement, 0, 0, 640, 360);
      return c.toDataURL('image/jpeg', 0.72);
    } catch { return undefined; }
  }

  /** performance.now() of the last successful save (0 = not yet saved this session). */
  lastSaveAt = 0;
  /** floating damage numbers (world-space, projected to the screen by the HUD each frame) */
  damagePopups: { x: number; y: number; z: number; text: string; t: number }[] = [];
  private popupVec = new THREE.Vector3();

  /** Advance & project damage popups; returns screen-space entries for the HUD. */
  private projectPopups(dt: number): { x: number; y: number; text: string; a: number }[] {
    const out: { x: number; y: number; text: string; a: number }[] = [];
    for (let i = this.damagePopups.length - 1; i >= 0; i--) {
      const d = this.damagePopups[i];
      d.t += dt;
      if (d.t > 0.9) { this.damagePopups.splice(i, 1); continue; }
      this.popupVec.set(d.x, d.y + d.t * 0.8, d.z).project(this.camera);
      if (this.popupVec.z > 1) continue;
      out.push({ x: (this.popupVec.x * 0.5 + 0.5) * window.innerWidth, y: (-this.popupVec.y * 0.5 + 0.5) * window.innerHeight, text: d.text, a: Math.min(1, (0.9 - d.t) * 3) });
    }
    return out;
  }

  private saveQueued = false;
  async saveWorld(): Promise<void> {
    if (this.transport.connected) return;
    if (this.saving) { this.saveQueued = true; return; } // coalesce: one more save after the current one finishes
    this.saving = true;
    try {
      await SaveManager.put(this.buildSave());
      this.lastSaveAt = performance.now();
    } catch (e) {
      console.error('save failed', e);
      this.message('Could not save the world (storage error)');
    } finally {
      this.saving = false;
      if (this.saveQueued) { this.saveQueued = false; if (this.running) void this.saveWorld(); }
    }
  }
}

function hotbarOrMain(main: ArrayContainer, i: number): Container {
  // moving from hotbar -> main area and vice versa
  const isHotbar = i < 9;
  return {
    size: isHotbar ? 27 : 9,
    get(k) { return main.get(isHotbar ? k + 9 : k); },
    set(k, s) { main.set(isHotbar ? k + 9 : k, s); },
  };
}

const FULL_BOX = [0, 0, 0, 1, 1, 1];

function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): [number, number, number, number] | null {
  let tmin = -Infinity, tmax = Infinity;
  let nx = 0, ny = 0, nz = 0;
  const axes = [[ox, dx, x0, x1], [oy, dy, y0, y1], [oz, dz, z0, z1]];
  for (let a = 0; a < 3; a++) {
    const [o, d, lo, hi] = axes[a];
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return null; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    let n = -Math.sign(d);
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; n = -n; }
    if (t1 > tmin) { tmin = t1; nx = a === 0 ? n : 0; ny = a === 1 ? n : 0; nz = a === 2 ? n : 0; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return [Math.max(0, tmin), nx, ny, nz];
}

// ---------------------------------------------------------------- first-person helpers
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const skinCache = new Map<number, THREE.CanvasTexture>();
/** 4x4 two-tone pixel texture so the arm's flat colours pick up a little cloth / skin grain. */
function pixelSkin(color: number): THREE.CanvasTexture {
  let t = skinCache.get(color);
  if (t) return t;
  const c = document.createElement('canvas'); c.width = 4; c.height = 4;
  const ctx = c.getContext('2d')!;
  const r = (color >> 16) & 255, gg = (color >> 8) & 255, b = color & 255;
  const pat = [1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1];
  for (let i = 0; i < 16; i++) {
    const v = pat[i] ? 1 : 0.92;
    ctx.fillStyle = `rgb(${(r * v) | 0},${(gg * v) | 0},${(b * v) | 0})`;
    ctx.fillRect(i % 4, (i / 4) | 0, 1, 1);
  }
  t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  skinCache.set(color, t);
  return t;
}

/**
 * Per-tool first-person swing shaping, in the same axes as Java's transformFirstPersonItem
 * (RY yaw / RZ roll / RX pitch over the swing envelope, plus a small push). Each tool gets its
 * own character: the sword slashes flat with a thrust, the pickaxe chops overhead, the axe
 * swings heavy and diagonal, the shovel scoops with a wrist twist, the hoe sweeps sideways.
 * Everything else (fists, food, blocks, bows) keeps the exact vanilla amounts.
 */
const TOOL_SWING: Record<string, { ry: number; rz: number; rx: number; px: number; py: number; pz: number }> = {
  sword: { ry: -8, rz: -36, rx: -64, px: 0, py: 0, pz: -0.22 },
  pickaxe: { ry: -10, rz: -12, rx: -106, px: 0, py: -0.2, pz: 0 },
  axe: { ry: -12, rz: -30, rx: -98, px: 0, py: -0.12, pz: -0.1 },
  shovel: { ry: 12, rz: -8, rx: -96, px: 0, py: -0.14, pz: 0 },
  hoe: { ry: -18, rz: -40, rx: -54, px: 0, py: 0, pz: 0 },
};
const VANILLA_SWING = { ry: -20, rz: -20, rx: -80, px: 0, py: 0, pz: 0 };
/** Seconds of pause after breaking a block before mining can start again (vanilla: 5 ticks). */
const BREAK_DELAY = 0.25;
/**
 * Held-item presentation.
 *
 * HELD_FLAT_* place the extruded sprite of a held item (see buildItemChain): a tilted plate in the
 * lower right, not a screen-parallel billboard, so tools keep real perspective and their extruded
 * depth reads. Measured in the fixed-70-degree hand projection at 16:9, the sprite spans roughly
 * 69-91% of the screen width and 66-94% of its height, with the handle end at the fist.
 *
 * HELD_ARM_OFFSET nudges the gripping arm (which is posed by the vanilla empty-hand chain, see
 * `Game.handArm`) towards the item: a little inward (x, mirrored for the left hand), up (y) and
 * forward (z) so the hand closes on the handle instead of drifting behind or through it.
 */
const HELD_ARM_OFFSET = { x: -0.02, y: -0.17, z: -0.06 };
/**
 * Camera-space nudge for the held ITEM, separate from the arm's.
 *
 * The y value was raised from -0.12 after RENDERING the first-person view and looking at it: at
 * -0.12 the tool head sat below the bottom edge of the screen, so the player only ever saw the
 * haft and a sliver of metal. Numeric bounds checks had passed because the model's bounding box
 * technically intersected the viewport -- only an actual picture showed the head was cropped.
 *
 * The item is pulled further inboard than the arm so the tool head clears the right edge of the
 * screen while the haft still runs down into the fist. Sharing one offset with the arm dragged the
 * whole hand inward with it, which looked wrong.
 */
const HELD_ITEM_NUDGE = { x: -0.34, y: 0.18, z: -0.06 };
/**
 * Grip pose of the held item relative to that fist, measured in the fixed-70-degree hand
 * projection at 16:9. The item is centred on the grip point (see buildHandContent), turned to
 * face the camera at a readable three-quarter angle and leaned back like a real grip. With these
 * values the tool spans 51-99% of the screen width and 33-100% of its height in the right hand
 * (47x68%), and stays fully on screen in the mirrored left hand too (35x57%). The earlier pose
 * reached 102% and pushed the tool head off the right edge, which is what sliced the pickaxe in
 * half in first person; the values are solved against both hands so neither clips.
 */
/**
 * The held item's FIRST_PERSON display transform.
 *
 * Every flat ("generated") item model carries this transform, and it is what turns the extruded
 * sprite into a tool held in a fist: the -135 degree yaw swings the plate so the camera looks along
 * its THICKNESS rather than at its face, and the 25 degree roll lays the haft down towards the
 * lower-right corner. Applying it intact -- instead of decomposing the chain and keeping only a
 * rotation -- is what makes the grip read correctly.
 *
 * Translation is in model units (the json values are in 1/16 block units: [0, 4, 2] -> 0.25, 0.125).
 */
const D2R = Math.PI / 180;

/** One first-person hold pose: translation (model units), rotation (radians) and scale. */
export interface HeldPose { t: { x: number; y: number; z: number }; r: { x: number; y: number; z: number }; s: number }

/**
 * Per-category first-person hold poses.
 *
 * A single shared pose made every item sit in the hand identically, which reads wrong: a pickaxe
 * is swung overhead, a sword is carried blade-up, a torch is gripped upright, and food is raised
 * toward the mouth. Each category therefore gets its own translation / rotation / scale, tuned
 * around the flat-item baseline rather than invented from scratch, so the pose that was already
 * measured and verified stays the default for anything unclassified.
 *
 * Axes, in the item model's own frame: +y is up the sprite, the -135 degree yaw turns the plate so
 * the camera looks along its THICKNESS (this is what makes a tool read as held rather than as a
 * decal), and the z roll lays the haft toward the lower-right corner.
 */
const HELD_POSES: Record<string, HeldPose> = {
  // Baseline flat item -- the measured, verified pose. Anything unclassified uses this.
  default:  { t: { x: 0,     y: 0.25,  z: 0.125 }, r: { x: 0,   y: -135 * D2R, z: 25 * D2R }, s: 1.45 },
  // Pickaxe: head carried higher and rolled back, the way a pick is held before an overhead swing.
  pickaxe:  { t: { x: 0.02,  y: 0.30,  z: 0.125 }, r: { x: -6 * D2R,  y: -138 * D2R, z: 32 * D2R }, s: 1.42 },
  // Axe: choked up slightly and rolled further over, so the bit leads.
  axe:      { t: { x: 0.02,  y: 0.27,  z: 0.125 }, r: { x: -4 * D2R,  y: -132 * D2R, z: 34 * D2R }, s: 1.44 },
  // Shovel: carried lower and flatter -- it is scooped, not swung.
  shovel:   { t: { x: 0,     y: 0.20,  z: 0.125 }, r: { x: 4 * D2R,   y: -140 * D2R, z: 18 * D2R }, s: 1.46 },
  // Hoe: held out at a shallow angle, closest to the working position.
  hoe:      { t: { x: 0,     y: 0.22,  z: 0.13  }, r: { x: 6 * D2R,   y: -142 * D2R, z: 14 * D2R }, s: 1.44 },
  // Sword: blade up and rolled toward vertical, the classic ready stance.
  sword:    { t: { x: -0.02, y: 0.30,  z: 0.11  }, r: { x: 0,   y: -128 * D2R, z: 42 * D2R }, s: 1.40 },
  // Bow: angled across the view so the stave reads, not the string edge.
  bow:      { t: { x: 0,     y: 0.24,  z: 0.12  }, r: { x: 0,   y: -118 * D2R, z: 10 * D2R }, s: 1.42 },
  // Torch and other upright held things: gripped near-vertical so the flame sits above the fist.
  torch:    { t: { x: 0.02,  y: 0.16,  z: 0.12  }, r: { x: 0,   y: -150 * D2R, z: 62 * D2R }, s: 1.30 },
  // Food: lifted and turned toward the camera, as if about to be eaten.
  food:     { t: { x: -0.02, y: 0.20,  z: 0.10  }, r: { x: 0,   y: -108 * D2R, z: 16 * D2R }, s: 1.34 },
  // Blocks: a gentle 45 degree yaw showing three faces, no roll -- a cube run through the
  // flat-item angles tips onto a corner and reads as a floating rhombus.
  block:    { t: { x: 0,     y: 0.1,   z: 0     }, r: { x: 0,   y: 45 * D2R,   z: 0 }, s: 0.9 },
};

/**
 * Which hold pose an item uses. Derived from the item's own data (tool kind, food, block, light
 * source) rather than a hand-maintained id list, so new items pick up a sensible pose for free.
 */
export function heldPoseFor(id: string | null, isBlock: boolean): HeldPose {
  if (!id) return HELD_POSES.default;
  if (isBlock) {
    // Thin upright light sources (torches) are gripped like an item, not cradled like a cube.
    // Detect them by GEOMETRY -- a light-emitting block whose box is much narrower than a full
    // cube -- rather than by shape === 'cross': FABLE's torch is a slim 'box', so a shape test
    // silently fell through to the cube pose.
    const bd = itemDef(id)?.block;
    if (bd !== undefined) {
      const def = BLOCKS[bd];
      const box = def?.box;
      const slim = !!box && (box[3] - box[0]) < 0.5 && (box[5] - box[2]) < 0.5;
      if ((def?.light ?? 0) > 0 && slim) return HELD_POSES.torch;
    }
    return HELD_POSES.block;
  }
  const def = itemDef(id);
  if (!def) return HELD_POSES.default;
  if (def.food) return HELD_POSES.food;
  if (def.type === 'bow') return HELD_POSES.bow;
  const kind = def.tool?.kind;
  if (kind && HELD_POSES[kind]) return HELD_POSES[kind];
  return HELD_POSES.default;
}

const HELD_DISPLAY_T = HELD_POSES.default.t;
const HELD_DISPLAY_R = HELD_POSES.default.r;
/**
 * Display scale, solved by measuring the tool's projected box at 16:9 rather than guessed.
 *
 * Vanilla's own value is 1.7, which overflows here because FABLE's extruded sprite fills more of
 * its 0..1 model box than a vanilla item texture does. 1.45 is the largest value that keeps the
 * whole pickaxe (the widest tool) inside the viewport in BOTH hands -- at 1.6 the head is sliced
 * off by the right edge.
 */
const HELD_DISPLAY_SCALE = 1.45;
const HELD_DISPLAY_BLOCK_SCALE = HELD_POSES.block.s;

/** Dispose a hand model: geometries, materials and the per-block face textures (the shared skin textures are cached and kept). */
function disposeObject(o: THREE.Object3D): void {
  const shared = new Set<THREE.Texture>(skinCache.values());
  o.traverse((c) => {
    const mesh = c as THREE.Mesh;
    // cached item-model geometry is shared between the viewmodel and world drops: never dispose it
    if (mesh.geometry && !mesh.userData.sharedGeometry) mesh.geometry.dispose();
    const mm = mesh.material as THREE.Material | THREE.Material[] | undefined;
    const list = Array.isArray(mm) ? mm : mm ? [mm] : [];
    for (const x of list) {
      const t = (x as THREE.MeshBasicMaterial).map;
      if (t && !shared.has(t)) t.dispose();
      x.dispose();
    }
  });
}

// lazy import to avoid circular import cost at module init
export { seedFromText };
