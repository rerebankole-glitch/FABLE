import { B } from '../blocks/Blocks';
import { Emitter, clamp, type Difficulty, type GameMode, type PlayerSave } from '../core/types';
import { PlayerInventory } from '../inventory/Inventory';
import { canAutoJump, hasSupport, makeBody, moveBody, type BlockGetter, type Body } from './Physics';

export interface PlayerInput {
  forward: boolean; back: boolean; left: boolean; right: boolean;
  jump: boolean; sprint: boolean; sneak: boolean;
  moveX: number; moveZ: number; // analog (mobile)
}

type PlayerEvents = {
  hurt: [number, string];
  death: [string];
  levelup: [number];
  land: [number];
  sound: [string, number];
};

/**
 * Sprint exhaustion per unit of horizontal distance, by difficulty. 4 exhaustion = 1 saturation or
 * hunger point. Hard keeps the original 0.1; easy/normal are tuned down so a normal-difficulty
 * player is not forced to eat constantly just for moving.
 */
const SPRINT_EXHAUSTION: Record<string, number> = { peaceful: 0.06, easy: 0.06, normal: 0.075, hard: 0.1 };
/**
 * Gravity and the jump impulse.
 *
 * Gravity was 28 b/s^2 against vanilla's 32, which made the player floaty: a jump hung ~10% longer
 * and reached 1.39 blocks instead of 1.25, so every sprint-jump carried further than it should and
 * traversal felt faster than the (correct) 5.62 b/s sprint speed implies. The impulse is re-solved
 * so the jump still clears exactly one block.
 *
 * The impulse is solved EMPIRICALLY against the real integrator rather than from the closed-form
 * v = sqrt(2*g*h): moveBody's discrete stepping and ground-contact handling do not reproduce the
 * analytic arc (sqrt gave 1.33 blocks, not 1.25), so the value is the one the physics harness
 * actually measures at the target height.
 */
const GRAVITY = 32;
const JUMP_VELOCITY = 8.67; // solved empirically against the real integrator: a 1.25-block apex // ~8.94: a 1.25-block apex, like vanilla

/** Jump exhaustion (walking jump; a sprint jump costs 4x this), same scaling. */
const JUMP_EXHAUSTION: Record<string, number> = { peaceful: 0.03, easy: 0.03, normal: 0.04, hard: 0.05 };
/** Real seconds per idle hunger point on hard/hardcore (~1 point per 2.5 minutes). */
const IDLE_DRAIN_SECONDS = 150;

export type DamageSource = 'fall' | 'mob' | 'lava' | 'fire' | 'drown' | 'starve' | 'suffocate' | 'cactus' | 'arrow' | 'void' | 'explosion';

export class Player {
  body: Body = makeBody(0, 80, 0, 0.3, 1.8);
  yaw = 0;
  pitch = 0;
  input: PlayerInput = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false, moveX: 0, moveZ: 0 };
  mode: GameMode = 'survival';
  flying = false;
  sprinting = false;
  sneaking = false;
  health = 20;
  maxHealth = 20;
  hunger = 20;
  saturation = 5;
  exhaustion = 0;
  idleHungerTimer = 0;
  air = 300;
  xp = 0;
  level = 0;
  xpProgress = 0;
  fireTicks = 0;
  hurtTime = 0;
  fallDistance = 0;
  inventory = new PlayerInventory();
  spawn: [number, number, number] | null = null;
  events = new Emitter<PlayerEvents>();
  dead = false;
  bobPhase = 0;
  bobAmount = 0;
  effects: Record<string, number> = {};
  private regenTimer = 0;
  private starveTimer = 0;
  private lavaTimer = 0;
  private fireTimer = 0;
  private suffocateTimer = 0;
  private cactusTimer = 0;
  private drownTimer = 0;
  private autoJumpTimer = 0;
  /** set by the game from settings; makes the player hop up one-block ledges while walking */
  autoJump = false;
  private lastJumpPress = -1;
  private jumpHeld = false;
  private tickAcc = 0;
  private lastGroundY = 0;
  private stepAcc = 0;
  difficulty: Difficulty = 'normal';
  velocityScale = 1;

  get eyeHeight(): number { return this.sneaking ? 1.27 : 1.62; }
  get eyeY(): number { return this.body.y + this.eyeHeight; }
  /** Survival-like modes: hunger, damage, mobs and hearts apply (Hardcore included). */
  get isSurvival(): boolean { return this.mode === 'survival' || this.mode === 'hardcore'; }
  get noclip(): boolean { return this.mode === 'spectator'; }

  setPosition(x: number, y: number, z: number): void {
    this.body.x = x; this.body.y = y; this.body.z = z;
    this.body.vx = this.body.vy = this.body.vz = 0;
    this.fallDistance = 0;
    this.lastGroundY = y;
  }

  lookDir(): [number, number, number] {
    const cp = Math.cos(this.pitch);
    return [-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp];
  }

  hasEffect(name: string): boolean {
    return (this.effects[name] ?? 0) > 0;
  }

  update(dt: number, world: BlockGetter, dayLight: number): void {
    const b = this.body;
    const inp = this.input;
    if (this.dead) return;
    // Sneaking
    this.sneaking = inp.sneak && !this.flying && this.mode !== 'spectator';
    b.h = this.sneaking ? 1.5 : 1.8;
    b.stepHeight = this.flying ? 0 : 0.6;
    // Flight toggling by double-jump (creative)
    if (inp.jump && !this.jumpHeld) {
      const now = performance.now();
      if (this.mode === 'creative' && now - this.lastJumpPress < 300) { this.flying = !this.flying; this.lastJumpPress = -1; }
      else this.lastJumpPress = now;
    }
    this.jumpHeld = inp.jump;
    if (this.mode === 'spectator') this.flying = true;
    if (this.isSurvival) this.flying = false;

    // Movement intent
    let mx = inp.moveX, mz = inp.moveZ;
    if (inp.forward) mz -= 1;
    if (inp.back) mz += 1;
    if (inp.left) mx -= 1;
    if (inp.right) mx += 1;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const moving = len > 0.01;
    const wantSprint = inp.sprint && moving && mz < -0.3 && (this.hunger > 6 || this.mode === 'creative' || this.mode === 'spectator') && !this.sneaking;
    this.sprinting = wantSprint;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // Heading math: facing yaw => forward is (-sin, -cos) on the ground (same as lookDir, the
    // camera and mob yaw = atan2(-vx, -vz)); strafe right is (cos, -sin). The intent vector
    // (mx, mz) with forward = -z is rotated by -yaw so W/S and A/D follow the view.
    const dirX = mx * cos + mz * sin;
    const dirZ = -mx * sin + mz * cos;

    let speed = 4.317;
    if (this.sprinting) speed *= 1.3;
    if (this.sneaking) speed *= 0.3;
    if (this.hasEffect('speed')) speed *= 1.3;
    if (this.flying) speed *= this.sprinting ? 3.2 : 2.2;
    if (this.mode === 'spectator') speed *= 1.5;
    speed *= this.velocityScale;

    const inWater = b.inWater;
    if (this.flying) {
      const accel = 12;
      const tx = dirX * speed, tz = dirZ * speed;
      b.vx += (tx - b.vx) * Math.min(1, accel * dt);
      b.vz += (tz - b.vz) * Math.min(1, accel * dt);
      let ty = 0;
      if (inp.jump) ty = speed * 0.8;
      if (inp.sneak) ty = -speed * 0.8;
      b.vy += (ty - b.vy) * Math.min(1, accel * dt);
      this.fallDistance = 0;
    } else if (inWater) {
      const swim = speed * 0.45;
      b.vx += (dirX * swim - b.vx) * Math.min(1, 6 * dt);
      b.vz += (dirZ * swim - b.vz) * Math.min(1, 6 * dt);
      const targetVy = inp.jump ? 2.6 : inp.sneak ? -2.6 : -0.6;
      b.vy += (targetVy - b.vy) * Math.min(1, 5 * dt);
      this.fallDistance = 0;
    } else if (b.onLadder) {
      b.vx += (dirX * 2 - b.vx) * Math.min(1, 10 * dt);
      b.vz += (dirZ * 2 - b.vz) * Math.min(1, 10 * dt);
      const climb = inp.jump || inp.forward ? 2.4 : inp.sneak ? 0 : -1.8;
      b.vy = climb;
      this.fallDistance = 0;
    } else {
      const accel = b.onGround ? 14 : 3;
      b.vx += (dirX * speed - b.vx) * Math.min(1, accel * dt);
      b.vz += (dirZ * speed - b.vz) * Math.min(1, accel * dt);
      b.vy -= GRAVITY * dt;
      if (b.vy < -60) b.vy = -60;
      this.autoJumpTimer -= dt;
      const wantJump = inp.jump || (this.autoJump && moving && !this.sneaking && b.collidedH && this.autoJumpTimer <= 0 && canAutoJump(world, b, dirX, dirZ));
      if (wantJump && b.onGround) {
        b.vy = this.hasEffect('jump') ? 11.6 : JUMP_VELOCITY;
        b.onGround = false;
        this.exhaustion += this.sprinting ? JUMP_EXHAUSTION[this.difficulty] * 4 : JUMP_EXHAUSTION[this.difficulty];
        this.autoJumpTimer = 0.35;
        this.events.emit('sound', 'jump', 0.3);
      }
    }
    if (b.inLava && !this.flying) { b.vx *= 0.5; b.vz *= 0.5; b.vy = Math.max(b.vy * 0.6, inp.jump ? 1.5 : -1); }

    const wasOnGround = b.onGround;
    const prevY = b.y, prevX = b.x, prevZ = b.z;
    moveBody(world, b, dt, this.noclip);
    // Sneak edge protection (don't walk off blocks): if the move left us without support, undo the
    // horizontal component axis by axis so the player can still slide along the edge.
    if (this.sneaking && wasOnGround && !b.onGround && !inWater && !hasSupport(world, b, b.x, b.z, prevY)) {
      const nx = b.x, nz = b.z;
      if (hasSupport(world, b, prevX, nz, prevY)) { b.x = prevX; b.vx = 0; }
      else if (hasSupport(world, b, nx, prevZ, prevY)) { b.z = prevZ; b.vz = 0; }
      else { b.x = prevX; b.z = prevZ; b.vx = 0; b.vz = 0; }
      b.y = prevY; b.vy = 0; b.onGround = true;
    }
    // Fall tracking
    if (!b.onGround && !this.flying && !inWater && !b.onLadder) {
      if (b.vy < 0) this.fallDistance += prevY - b.y;
    } else {
      if (!wasOnGround && b.onGround && this.fallDistance > 3.2 && this.isSurvival) {
        const dmg = Math.floor(this.fallDistance - 3);
        this.events.emit('land', this.fallDistance);
        if (dmg > 0) this.damage(dmg, 'fall');
      } else if (!wasOnGround && b.onGround && this.fallDistance > 1) this.events.emit('land', this.fallDistance);
      this.fallDistance = 0;
    }
    // View bobbing
    const hSpeed = Math.hypot(b.vx, b.vz);
    if (b.onGround && hSpeed > 0.5 && !this.flying) {
      this.bobPhase += dt * hSpeed * 2.4;
      this.bobAmount = Math.min(1, this.bobAmount + dt * 6);
      this.stepAcc += hSpeed * dt;
      if (this.stepAcc > 1.9) { this.stepAcc = 0; this.events.emit('sound', 'step', 1); }
    } else this.bobAmount = Math.max(0, this.bobAmount - dt * 6);
    // Sprint exhaustion is difficulty-scaled: the old flat 0.05/step made sprinting the dominant
    // food sink on every difficulty. Hard/hardcore keep the original cost, normal/easy are cheaper.
    if (this.sprinting && moving) this.exhaustion += SPRINT_EXHAUSTION[this.difficulty] * hSpeed * dt;
    else if (moving) this.exhaustion += 0.01 * hSpeed * dt;

    // Survival ticks (20Hz)
    this.tickAcc += dt;
    while (this.tickAcc >= 0.05) {
      this.tickAcc -= 0.05;
      this.survivalTick(world, dayLight);
    }
    for (const k in this.effects) {
      this.effects[k] -= dt;
      if (this.effects[k] <= 0) delete this.effects[k];
    }
    if (this.hurtTime > 0) this.hurtTime -= dt;
  }

  /**
   * The non-locomotion half of update(), for when something else owns the player's position.
   *
   * Riding a vehicle hands movement and collision to the vehicle, but hunger, air, effects and the
   * hurt timer must keep running or a player could sit in a boat and never drown, starve or
   * recover. This runs exactly those parts and nothing that touches the body's velocity.
   */
  survivalOnly(dt: number, world: BlockGetter, dayLight: number): void {
    if (this.dead) return;
    this.tickAcc += dt;
    while (this.tickAcc >= 0.05) {
      this.tickAcc -= 0.05;
      this.survivalTick(world, dayLight);
    }
    for (const k in this.effects) {
      this.effects[k] -= dt;
      if (this.effects[k] <= 0) delete this.effects[k];
    }
    if (this.hurtTime > 0) this.hurtTime -= dt;
  }

  private survivalTick(world: BlockGetter, _dayLight: number): void {
    const b = this.body;
    const T = 0.05;
    if (!this.isSurvival) {
      this.air = 300; this.fireTicks = 0;
      return;
    }
    // Hunger
    if (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else if (this.difficulty !== 'peaceful') this.hunger = Math.max(0, this.hunger - 1);
    }
    // Hard/hardcore also drain slowly while completely idle, so food production has a purpose even
    // for a player who never sprints. IDLE_DRAIN_SECONDS is the real-time cost of one hunger point.
    if (this.difficulty === 'hard') {
      this.idleHungerTimer += T;
      if (this.idleHungerTimer >= IDLE_DRAIN_SECONDS) {
        this.idleHungerTimer -= IDLE_DRAIN_SECONDS;
        if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
        else this.hunger = Math.max(0, this.hunger - 1);
      }
    } else this.idleHungerTimer = 0;
    if (this.difficulty === 'peaceful') {
      this.regenTimer += T;
      if (this.regenTimer > 0.5) { this.regenTimer = 0; this.hunger = Math.min(20, this.hunger + 1); if (this.health < this.maxHealth) this.health = Math.min(this.maxHealth, this.health + 1); }
    } else if (this.hunger >= 18 && this.health < this.maxHealth) {
      this.regenTimer += T;
      const period = this.hunger >= 20 && this.saturation > 0 ? 0.5 : 4;
      if (this.regenTimer >= period) {
        this.regenTimer = 0;
        this.health = Math.min(this.maxHealth, this.health + 1);
        this.exhaustion += period < 1 ? 3 : 6;
      }
    } else if (this.hunger <= 0) {
      this.starveTimer += T;
      if (this.starveTimer >= 4) {
        this.starveTimer = 0;
        const floor = this.difficulty === 'easy' ? 10 : this.difficulty === 'normal' ? 1 : 0;
        if (this.health > floor) this.damage(1, 'starve');
      }
    } else this.regenTimer = 0;
    if (this.hasEffect('regen')) {
      this.regenTimer += T * 3;
    }
    // Air
    const eye = world.getBlock(Math.floor(b.x), Math.floor(this.eyeY), Math.floor(b.z));
    if (eye === B.WATER && !this.hasEffect('water_breathing')) {
      this.air = Math.max(0, this.air - 1);
      if (this.air <= 0) {
        this.drownTimer += T;
        if (this.drownTimer >= 1) { this.drownTimer = 0; this.damage(2, 'drown'); }
      }
    } else {
      this.air = Math.min(300, this.air + 4);
      this.drownTimer = 0;
    }
    // Lava & fire (independent timers so the sources don't reset each other)
    if (b.inLava) {
      this.lavaTimer += T;
      this.fireTicks = 8;
      if (this.lavaTimer >= 0.5) { this.lavaTimer = 0; if (!this.hasEffect('fire_resistance')) this.damage(4, 'lava'); }
    } else {
      this.lavaTimer = 0;
      if (this.fireTicks > 0) {
        this.fireTicks -= T;
        if (b.inWater) this.fireTicks = 0;
        this.fireTimer += T;
        if (this.fireTimer >= 1) { this.fireTimer = 0; if (!this.hasEffect('fire_resistance')) this.damage(1, 'fire'); }
      } else this.fireTimer = 0;
    }
    // Suffocation: only opaque solid blocks at eye level hurt
    const head = world.getBlock(Math.floor(b.x), Math.floor(this.eyeY), Math.floor(b.z));
    if (isSuffocating(head)) {
      this.suffocateTimer += T;
      if (this.suffocateTimer >= 0.5) { this.suffocateTimer = 0; this.damage(1, 'suffocate'); }
    } else this.suffocateTimer = 0;
    // Cactus contact
    let cactusNear = false;
    for (let i = 0; i < 4 && !cactusNear; i++) {
      const dx = CACTUS_PROBES[i][0], dz = CACTUS_PROBES[i][1];
      cactusNear = world.getBlock(Math.floor(b.x + dx), Math.floor(b.y + 0.5), Math.floor(b.z + dz)) === B.CACTUS;
    }
    if (cactusNear) { this.cactusTimer += T; if (this.cactusTimer >= 0.5) { this.cactusTimer = 0; this.damage(1, 'cactus'); } }
    else this.cactusTimer = 0;
    if (b.y < -5) this.damage(4, 'void');
  }

  /** True while a shield is raised: shield in the off-hand and the sneak key held. */
  get blocking(): boolean {
    return this.sneaking && this.inventory.offhandItem?.id === 'shield';
  }

  damage(amount: number, source: DamageSource): boolean {
    if (!this.isSurvival || this.dead) return false;
    if (this.hurtTime > 0 && source !== 'void') return false;
    let dmg = amount;
    // a raised shield soaks most of a melee / projectile / blast hit and takes the damage as durability
    if (this.blocking && (source === 'mob' || source === 'arrow' || source === 'explosion')) {
      const shield = this.inventory.offhandItem!;
      const absorbed = dmg * 0.8;
      dmg -= absorbed;
      if (shield.durability !== undefined) { shield.durability -= Math.max(1, Math.round(absorbed)); if (shield.durability <= 0) this.inventory.offhand.set(0, null); else this.inventory.offhand.set(0, shield); }
      this.events.emit('sound', 'block', 1);
      if (dmg < 0.5) { this.hurtTime = 0.25; return false; }
    }
    if (this.difficulty === 'easy' && (source === 'mob' || source === 'arrow')) dmg = Math.max(1, dmg * 0.6);
    if (this.difficulty === 'hard' && (source === 'mob' || source === 'arrow')) dmg *= 1.4;
    if (source !== 'starve' && source !== 'drown' && source !== 'void' && source !== 'suffocate') {
      let armor = this.inventory.armorValue();
      let prot = 0;
      for (const s of this.inventory.armor.items) if (s?.ench?.protection) prot += s.ench.protection;
      if (this.hasEffect('resistance')) prot += 2;
      dmg *= 1 - Math.min(0.8, armor * 0.04 + prot * 0.04);
      if (armor > 0) this.inventory.damageArmor(1);
    }
    dmg = Math.max(0.5, Math.round(dmg * 2) / 2);
    this.health = Math.max(0, this.health - dmg);
    this.hurtTime = 0.5;
    this.exhaustion += 0.1;
    this.events.emit('hurt', dmg, source);
    if (this.health <= 0) {
      this.dead = true;
      this.events.emit('death', source);
    }
    return true;
  }

  heal(n: number): void {
    this.health = clamp(this.health + n, 0, this.maxHealth);
  }

  eat(hunger: number, saturation: number): void {
    this.hunger = Math.min(20, this.hunger + hunger);
    this.saturation = Math.min(this.hunger, this.saturation + saturation);
  }

  addXp(n: number): void {
    this.xp += n;
    let need = this.xpToNext();
    while (this.xp >= need) {
      this.xp -= need;
      this.level++;
      need = this.xpToNext();
      this.events.emit('levelup', this.level);
    }
    this.xpProgress = this.xp / need;
  }

  xpToNext(): number {
    return 7 + this.level * 3;
  }

  knockback(dx: number, dz: number, strength: number): void {
    const l = Math.hypot(dx, dz) || 1;
    this.body.vx += (dx / l) * strength;
    this.body.vz += (dz / l) * strength;
    this.body.vy = Math.max(this.body.vy, strength * 0.6);
  }

  respawn(): void {
    this.dead = false;
    this.health = this.maxHealth;
    this.hunger = 20; this.saturation = 5; this.exhaustion = 0; this.air = 300; this.fireTicks = 0;
    this.effects = {};
    this.body.vx = this.body.vy = this.body.vz = 0;
    this.fallDistance = 0;
  }

  serialize(): PlayerSave {
    const inv = this.inventory.serialize();
    return {
      pos: [this.body.x, this.body.y, this.body.z], yaw: this.yaw, pitch: this.pitch, health: this.health, hunger: this.hunger,
      saturation: this.saturation, air: this.air, xp: this.xp, level: this.level, inventory: inv.inventory, armor: inv.armor, offhand: inv.offhand, seen: inv.seen,
      spawn: this.spawn, flying: this.flying, selected: this.inventory.selected, mode: this.mode,
    };
  }

  load(s: PlayerSave): void {
    this.setPosition(s.pos[0], s.pos[1], s.pos[2]);
    this.yaw = s.yaw; this.pitch = s.pitch; this.health = s.health; this.hunger = s.hunger; this.saturation = s.saturation;
    this.air = s.air; this.xp = s.xp; this.level = s.level; this.spawn = s.spawn; this.flying = s.flying; this.mode = s.mode;
    this.inventory.load(s.inventory, s.armor, s.offhand ?? null, s.seen);
    this.inventory.selected = s.selected;
    this.xpProgress = this.xp / this.xpToNext();
    this.dead = this.health <= 0;
  }
}

import { BLOCKS } from '../blocks/Blocks';
const CACTUS_PROBES: [number, number][] = [[0.36, 0], [-0.36, 0], [0, 0.36], [0, -0.36]];
function isSuffocating(id: number): boolean {
  if (id === B.AIR) return false;
  const d = BLOCKS[id];
  return !!d && d.opaque && d.solid && !d.box;
}
