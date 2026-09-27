import { settings } from '../core/Settings';

type Bus = 'music' | 'env' | 'weather' | 'mobs' | 'blocks' | 'ui' | 'player';
/** Sound kinds that belong to the player's own actions (routed to the 'player' mixer bus). */
const PLAYER_CUES = new Set(['hurt', 'death', 'eat', 'levelup', 'orb', 'pickup', 'drop', 'select', 'inv', 'jump', 'land', 'swing', 'splash', 'swim', 'shield', 'bow']);

interface PlayOpts { pos?: [number, number, number]; volume?: number; pitch?: number; bus?: Bus }

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private buses!: Record<Bus, GainNode>;
  private noiseBuf!: AudioBuffer;
  private reverb!: ConvolverNode;
  private rainGain: GainNode | null = null;
  private rainSrc: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private waterGain: GainNode | null = null;
  private waterLfo: OscillatorNode | null = null;
  private musicTimer = 0;
  private musicPlaying = false;
  private musicEndsAt = 0;
  private nextMusic = 20;
  // File-backed soundtrack: the deployed game ships music/*.mp3 next to index.html.
  // Tracks play back-to-back (with a gap, like Minecraft) and the generative pieces
  // in playMusicPiece() remain as the fallback whenever files are unavailable.
  private static TRACKS = ['FABLE', 'FABLE (1)', 'FABLE (2)', 'Driftwood Valleys', 'Driftwood Valleys (1)'];
  private static FILE_VOLUME = 0.5; // mastered tracks are louder than the generative pads
  private fileEl: HTMLAudioElement | null = null;
  private fileReady = false;
  private fileFailAt = 0;
  private fileDead = false; // a file attempt failed: use generative pieces for the rest of this session
  private trackI = -1;
  private caveTimer = 10;
  private windPhase = 0;
  private duckLevel = 1;

  /** Duck the block/mob buses (used underwater); UI and music are unaffected. */
  private duck(level: number): void {
    if (level === this.duckLevel || !this.ctx) return;
    this.duckLevel = level;
    const s = settings.value;
    this.buses.blocks.gain.setTargetAtTime(s.blockVolume * level, this.ctx.currentTime, 0.25);
    this.buses.mobs.gain.setTargetAtTime(s.mobVolume * level, this.ctx.currentTime, 0.25);
  }
  listenerPos: [number, number, number] = [0, 0, 0];
  mood: 'day' | 'night' | 'cave' | 'void' = 'day';
  enabled = false;

  init(): void {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.buses = { music: ctx.createGain(), env: ctx.createGain(), weather: ctx.createGain(), mobs: ctx.createGain(), blocks: ctx.createGain(), ui: ctx.createGain(), player: ctx.createGain() };
    for (const b of Object.values(this.buses)) b.connect(this.master);
    // noise buffer
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // reverb impulse
    const len = ctx.sampleRate * 2.5;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    const rg = ctx.createGain(); rg.gain.value = 0.35;
    this.reverb.connect(rg); rg.connect(this.buses.music);
    this.applyVolumes();
    this.enabled = true;
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    const s = settings.value;
    this.master.gain.value = s.masterVolume;
    this.buses.music.gain.value = s.musicVolume;
    this.buses.env.gain.value = s.envVolume;
    this.buses.weather.gain.value = s.weatherVolume * s.envVolume;
    this.buses.mobs.gain.value = s.mobVolume * this.duckLevel;
    this.buses.blocks.gain.value = s.blockVolume * this.duckLevel;
    this.buses.ui.gain.value = s.uiVolume;
    this.buses.player.gain.value = s.playerVolume * this.duckLevel;
    if (this.fileEl) this.fileEl.volume = AudioEngine.FILE_VOLUME * s.musicVolume * s.masterVolume;
  }

  setListener(x: number, y: number, z: number, fx: number, fy: number, fz: number): void {
    if (!this.ctx) return;
    this.listenerPos = [x, y, z];
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = x; l.positionY.value = y; l.positionZ.value = z;
      l.forwardX.value = fx; l.forwardY.value = fy; l.forwardZ.value = fz;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      (l as any).setPosition(x, y, z);
      (l as any).setOrientation(fx, fy, fz, 0, 1, 0);
    }
  }

  private out(opts: PlayOpts, bus: Bus): AudioNode | null {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = opts.volume ?? 1;
    if (opts.pos) {
      const dx = opts.pos[0] - this.listenerPos[0], dy = opts.pos[1] - this.listenerPos[1], dz = opts.pos[2] - this.listenerPos[2];
      if (dx * dx + dy * dy + dz * dz > 40 * 40) return null; // out of earshot: caller skips synthesis
      const p = ctx.createPanner();
      p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 3; p.maxDistance = 40; p.rolloffFactor = 1.2;
      if (p.positionX) { p.positionX.value = opts.pos[0]; p.positionY.value = opts.pos[1]; p.positionZ.value = opts.pos[2]; }
      else (p as any).setPosition(opts.pos[0], opts.pos[1], opts.pos[2]);
      g.connect(p); p.connect(this.buses[opts.bus ?? bus]);
    } else g.connect(this.buses[opts.bus ?? bus]);
    return g;
  }

  private noise(dest: AudioNode, t: number, dur: number, type: BiquadFilterType, freq: number, q: number, gain: number, attack = 0.005, freqEnd?: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t); src.stop(t + dur + 0.05);
  }

  private tone(dest: AudioNode, t: number, dur: number, type: OscillatorType, f0: number, f1: number, gain: number, attack = 0.005): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  play(name: string, opts: PlayOpts = {}): void {
    if (!this.ctx || !this.enabled) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t = this.ctx.currentTime;
    const p = opts.pitch ?? 1;
    const [kind, mat] = name.split('.');
    // player action cues get their own mixer channel; weather loops (rain/wind) hang off the weather bus
    const bus: Bus = kind === 'ui' || kind === 'click' ? 'ui' : kind === 'mob' ? 'mobs' : kind === 'env' ? 'env'
      : PLAYER_CUES.has(kind) ? 'player' : 'blocks';
    const d = this.out(opts, bus);
    if (!d) return;
    const r = () => 0.9 + Math.random() * 0.2;
    switch (kind) {
      case 'step': this.stepSound(d, t, mat, p * r()); break;
      case 'dig': this.digSound(d, t, mat, p * r(), 0.5); break;
      case 'break': this.digSound(d, t, mat, p * r() * 0.8, 1.2); this.noise(d, t, 0.25, 'lowpass', 900 * p, 0.7, 0.5); break;
      case 'place': this.digSound(d, t, mat, p * r() * 0.9, 0.9); break;
      case 'ui': this.tone(d, t, 0.06, 'square', 900, 700, 0.12); this.tone(d, t + 0.03, 0.05, 'square', 1200, 1000, 0.08); break;
      case 'click': this.noise(d, t, 0.035, 'bandpass', 2400, 1.4, 0.2, 0.001); this.tone(d, t, 0.045, 'square', 1000, 760, 0.05, 0.001); break;
      case 'inv': this.noise(d, t, 0.05, 'bandpass', 2200, 2, 0.12, 0.002); this.tone(d, t, 0.04, 'triangle', 600, 500, 0.06); break;
      case 'jump': this.noise(d, t, 0.06, 'bandpass', 900 * p, 1, 0.1, 0.003); break;
      case 'land': this.noise(d, t, 0.14, 'lowpass', 500 * p, 0.8, 0.5, 0.002, 120); this.tone(d, t, 0.1, 'sine', 90, 50, 0.3, 0.002); break;
      case 'select': this.tone(d, t, 0.03, 'square', 1500, 1400, 0.05, 0.001); break;
      case 'drop': this.noise(d, t, 0.06, 'bandpass', 1200, 1, 0.12, 0.003); this.tone(d, t, 0.05, 'triangle', 500, 350, 0.06); break;
      case 'pickup': this.tone(d, t, 0.08, 'sine', 700 * p, 1400 * p, 0.25); this.tone(d, t + 0.06, 0.1, 'sine', 1000 * p, 1900 * p, 0.2); break;
      case 'hurt': this.tone(d, t, 0.18, 'sawtooth', 320 * p, 180 * p, 0.35); this.noise(d, t, 0.15, 'bandpass', 800, 1, 0.3); break;
      case 'death': this.tone(d, t, 0.5, 'sawtooth', 300, 80, 0.4); this.noise(d, t, 0.5, 'lowpass', 600, 1, 0.3); break;
      case 'eat': for (let i = 0; i < 3; i++) this.noise(d, t + i * 0.14, 0.09, 'bandpass', 900 + Math.random() * 500, 2, 0.35); break;
      case 'levelup': [523, 659, 784, 1047].forEach((f, i) => this.tone(d, t + i * 0.09, 0.4, 'triangle', f, f, 0.22)); break;
      case 'discover': this.tone(d, t, 0.28, 'triangle', 660 * p, 660 * p, 0.16); this.tone(d, t + 0.11, 0.42, 'triangle', 990 * p, 990 * p, 0.18); break;
      case 'orb': this.tone(d, t, 0.1, 'sine', 1200 * r(), 2000, 0.15); break;
      case 'splash': this.noise(d, t, 0.35, 'lowpass', 1800, 0.5, 0.6, 0.01, 400); break;
      case 'swim': this.noise(d, t, 0.25, 'lowpass', 1200, 0.5, 0.2, 0.05, 500); break;
      case 'bow': this.noise(d, t, 0.2, 'bandpass', 1400, 1.5, 0.35, 0.005, 400); this.tone(d, t, 0.12, 'triangle', 500, 200, 0.2); break;
      case 'arrowhit': this.tone(d, t, 0.06, 'square', 900, 400, 0.2); this.noise(d, t, 0.08, 'highpass', 2000, 1, 0.3); break;
      case 'hit': this.noise(d, t, 0.1, 'lowpass', 900, 1, 0.5); this.tone(d, t, 0.08, 'triangle', 240 * p, 120, 0.3); break;
      case 'shield': this.tone(d, t, 0.14, 'triangle', 180 * p, 90, 0.4, 0.002); this.noise(d, t, 0.08, 'lowpass', 1400, 1, 0.35); this.tone(d, t + 0.02, 0.1, 'square', 520 * p, 300, 0.08); break;
      case 'crit': this.noise(d, t, 0.12, 'bandpass', 2400, 2, 0.4); this.tone(d, t, 0.15, 'square', 800, 1600, 0.15); break;
      case 'swing': this.noise(d, t, 0.12, 'bandpass', 700, 1, 0.12, 0.02, 1800); break;
      case 'explosion': this.noise(d, t, 1.2, 'lowpass', 400, 0.5, 1.2, 0.01, 60); this.tone(d, t, 0.6, 'sine', 90, 30, 0.8); break;
      case 'thunder': this.noise(d, t + Math.random() * 0.5, 2.5, 'lowpass', 300 + Math.random() * 200, 0.5, 0.9, 0.05, 60); this.noise(d, t, 0.3, 'lowpass', 1200, 0.5, 0.6); break;
      case 'door': this.noise(d, t, 0.12, 'bandpass', 500, 2, 0.35); this.tone(d, t, 0.1, 'square', 180, 220, 0.12); break;
      case 'chest': this.noise(d, t, 0.2, 'lowpass', 700, 1, 0.3); this.tone(d, t + 0.05, 0.15, 'triangle', 200, 260, 0.12); break;
      case 'craft': this.noise(d, t, 0.1, 'bandpass', 1200, 1.5, 0.3); this.noise(d, t + 0.1, 0.1, 'bandpass', 900, 1.5, 0.3); break;
      case 'furnace': this.noise(d, t, 0.3, 'bandpass', 500 + Math.random() * 1500, 4, 0.12); break;
      case 'fire': this.noise(d, t, 0.4, 'bandpass', 800 + Math.random() * 2000, 3, 0.1); break;
      case 'lava': this.noise(d, t, 0.6, 'lowpass', 250, 1, 0.3, 0.1, 80); break;
      case 'portal': this.tone(d, t, 1.2, 'sine', 120 * p, 480 * p, 0.25, 0.3); this.tone(d, t, 1.2, 'sine', 180 * p, 90, 0.2, 0.3); break;
      // Hammer on an iron faceplate: a bright strike with a short metallic ring after it.
      case 'anvil':
        this.noise(d, t, 0.09, 'bandpass', 3000, 2.5, 0.42);
        this.tone(d, t, 0.12, 'square', 320 * p, 180 * p, 0.3);
        this.tone(d, t + 0.01, 0.7, 'triangle', 900 * p, 860 * p, 0.12, 0.004);
        this.tone(d, t + 0.02, 0.5, 'sine', 1500 * p, 1440 * p, 0.06, 0.01);
        break;
      // A greatsword driven into stone: a low thud of displaced rock, a metallic clang, and a
      // long ringing tail as the blade settles. Heavy, not flashy.
      case 'bladeimpact':
        this.noise(d, t, 0.5, 'lowpass', 260, 0.7, 0.85, 0.002, 70);
        this.tone(d, t, 0.3, 'sine', 110, 42, 0.55);
        this.noise(d, t + 0.01, 0.16, 'bandpass', 2600, 2.5, 0.4);
        this.tone(d, t + 0.01, 1.5, 'triangle', 740 * p, 700 * p, 0.14, 0.004);
        this.tone(d, t + 0.02, 1.9, 'sine', 1180 * p, 1120 * p, 0.09, 0.01);
        break;
      // Drawing it back out: the ring without the rock.
      case 'bladepull':
        this.noise(d, t, 0.28, 'bandpass', 1900, 1.6, 0.3, 0.004, 3200);
        this.tone(d, t, 1.1, 'triangle', 620 * p, 940 * p, 0.13, 0.006);
        this.tone(d, t + 0.03, 1.3, 'sine', 1320 * p, 1500 * p, 0.07, 0.02);
        break;
      case 'enchant': [880, 1320, 1760, 2200].forEach((f, i) => this.tone(d, t + i * 0.05, 0.6, 'sine', f * r(), f, 0.15)); break;
      case 'mob': this.mobSound(d, t, mat, p); break;
      case 'env': this.envSound(d, t, mat); break;
      default: this.tone(d, t, 0.1, 'square', 440, 440, 0.1);
    }
  }

  private stepSound(d: AudioNode, t: number, mat: string, p: number): void {
    switch (mat) {
      case 'grass': case 'plant': this.noise(d, t, 0.12, 'bandpass', 700 * p, 0.8, 0.28, 0.01); this.noise(d, t + 0.02, 0.08, 'highpass', 2500, 1, 0.08); break;
      case 'stone': this.noise(d, t, 0.08, 'bandpass', 1500 * p, 1.2, 0.3, 0.003); this.tone(d, t, 0.05, 'triangle', 300 * p, 200, 0.1); break;
      case 'wood': this.tone(d, t, 0.09, 'triangle', 220 * p, 150, 0.3, 0.003); this.noise(d, t, 0.07, 'lowpass', 900, 1, 0.2); break;
      case 'sand': this.noise(d, t, 0.16, 'lowpass', 1400 * p, 0.7, 0.25, 0.02); break;
      case 'gravel': this.noise(d, t, 0.14, 'bandpass', 1000 * p, 0.6, 0.35, 0.005); this.noise(d, t + 0.04, 0.08, 'bandpass', 1800, 1, 0.15); break;
      case 'snow': this.noise(d, t, 0.15, 'lowpass', 800 * p, 0.8, 0.25, 0.02); break;
      case 'cloth': this.noise(d, t, 0.12, 'lowpass', 500 * p, 0.8, 0.2, 0.02); break;
      case 'glass': this.tone(d, t, 0.08, 'sine', 1800 * p, 1500, 0.12); this.noise(d, t, 0.06, 'highpass', 3000, 1, 0.1); break;
      case 'liquid': this.noise(d, t, 0.2, 'lowpass', 1000 * p, 0.7, 0.2, 0.03, 300); break;
      case 'metal': this.tone(d, t, 0.12, 'triangle', 1100 * p, 900, 0.14, 0.002); this.tone(d, t, 0.08, 'sine', 2600 * p, 2400, 0.05, 0.002); this.noise(d, t, 0.05, 'highpass', 2500, 1, 0.12); break;
      case 'leaves': this.noise(d, t, 0.14, 'bandpass', 1500 * p, 0.6, 0.2, 0.01); this.noise(d, t + 0.03, 0.1, 'highpass', 3500, 1, 0.08); break;
      default: this.noise(d, t, 0.1, 'bandpass', 1000 * p, 1, 0.25);
    }
  }

  private digSound(d: AudioNode, t: number, mat: string, p: number, amp: number): void {
    switch (mat) {
      case 'stone': this.noise(d, t, 0.1, 'bandpass', 1800 * p, 1.5, 0.35 * amp, 0.002); this.tone(d, t, 0.06, 'square', 420 * p, 200, 0.08 * amp); break;
      case 'wood': this.tone(d, t, 0.12, 'triangle', 260 * p, 120, 0.4 * amp, 0.002); this.noise(d, t, 0.08, 'lowpass', 1200, 1, 0.25 * amp); break;
      case 'grass': case 'plant': this.noise(d, t, 0.13, 'bandpass', 600 * p, 0.8, 0.35 * amp, 0.005); break;
      case 'sand': case 'snow': this.noise(d, t, 0.15, 'lowpass', 1200 * p, 0.7, 0.35 * amp, 0.01); break;
      case 'gravel': this.noise(d, t, 0.14, 'bandpass', 900 * p, 0.7, 0.4 * amp, 0.003); break;
      case 'glass': this.noise(d, t, 0.2, 'highpass', 2500 * p, 1, 0.4 * amp, 0.002); this.tone(d, t, 0.1, 'sine', 2200 * p, 1800, 0.15 * amp); break;
      case 'cloth': this.noise(d, t, 0.12, 'lowpass', 500 * p, 0.8, 0.3 * amp, 0.01); break;
      case 'liquid': this.noise(d, t, 0.25, 'lowpass', 900, 0.7, 0.3 * amp, 0.03, 300); break;
      case 'metal': this.tone(d, t, 0.18, 'triangle', 900 * p, 700, 0.25 * amp, 0.002); this.tone(d, t, 0.25, 'sine', 2200 * p, 2100, 0.08 * amp, 0.002); this.noise(d, t, 0.06, 'highpass', 2000, 1, 0.2 * amp); break;
      case 'leaves': this.noise(d, t, 0.16, 'bandpass', 1300 * p, 0.6, 0.3 * amp, 0.01); this.noise(d, t + 0.04, 0.12, 'highpass', 3000, 1, 0.1 * amp); break;
      default: this.noise(d, t, 0.1, 'bandpass', 1200 * p, 1, 0.3 * amp);
    }
  }

  private mobSound(d: AudioNode, t: number, mat: string, p: number): void {
    const ctx = this.ctx!;
    const vib = (o: OscillatorNode, rate: number, depth: number, dur: number) => {
      const l = ctx.createOscillator(); l.frequency.value = rate;
      const lg = ctx.createGain(); lg.gain.value = depth;
      l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur);
    };
    const voice = (type: OscillatorType, f0: number, f1: number, dur: number, gain: number, vRate = 0, vDepth = 0, filterF = 1200) => {
      const o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0 * p, t); o.frequency.exponentialRampToValueAtTime(f1 * p, t + dur);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterF;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.04); g.gain.setValueAtTime(gain, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      if (vRate) vib(o, vRate, vDepth, dur);
      o.connect(f); f.connect(g); g.connect(d); o.start(t); o.stop(t + dur + 0.05);
    };
    switch (mat) {
      case 'bovin': voice('sawtooth', 120, 90, 0.7, 0.35, 5, 6, 700); voice('sawtooth', 181, 135, 0.7, 0.15, 5, 6, 700); break;
      case 'bovin_hurt': voice('sawtooth', 170, 100, 0.35, 0.4, 0, 0, 900); break;
      case 'woolly': voice('sawtooth', 260, 220, 0.6, 0.3, 14, 25, 1500); break;
      case 'woolly_hurt': voice('sawtooth', 320, 200, 0.3, 0.35, 20, 30, 1500); break;
      case 'snouter': voice('sawtooth', 200, 140, 0.25, 0.35, 30, 40, 900); voice('square', 100, 80, 0.25, 0.1); break;
      case 'snouter_hurt': voice('sawtooth', 400, 200, 0.3, 0.4, 30, 50, 1200); break;
      case 'clucker': voice('square', 900, 700, 0.08, 0.15, 0, 0, 2500); voice('square', 1100, 800, 0.1, 0.12, 0, 0, 2500); break;
      case 'clucker_hurt': voice('square', 1400, 600, 0.25, 0.2, 40, 100, 3000); break;
      case 'night_stalker': voice('sawtooth', 110, 70, 1.1, 0.3, 3, 4, 500); this.noise(d, t, 1.0, 'lowpass', 400, 1, 0.15, 0.2); break;
      case 'night_stalker_hurt': voice('sawtooth', 160, 90, 0.4, 0.4, 0, 0, 700); break;
      case 'cave_crawler': this.noise(d, t, 0.5, 'bandpass', 2200, 3, 0.3, 0.05); voice('square', 60, 40, 0.4, 0.08); break;
      case 'cave_crawler_hurt': this.noise(d, t, 0.3, 'highpass', 3000, 1, 0.4, 0.01); break;
      case 'void_archer': voice('triangle', 300, 200, 0.5, 0.2, 8, 10, 900); voice('triangle', 450, 300, 0.5, 0.1, 8, 10, 900); break;
      case 'void_archer_hurt': voice('triangle', 400, 250, 0.3, 0.3, 0, 0, 1200); break;
      case 'shadow_flyer': voice('sine', 700, 1400, 0.4, 0.15, 30, 60, 3000); this.noise(d, t, 0.3, 'bandpass', 1500, 2, 0.1); break;
      case 'shadow_flyer_hurt': voice('sine', 1200, 500, 0.3, 0.25, 40, 100, 3000); break;
      case 'stone_guardian': voice('sawtooth', 55, 40, 1.2, 0.5, 2, 3, 300); this.noise(d, t, 0.8, 'lowpass', 200, 1, 0.4, 0.1); break;
      case 'stone_guardian_hurt': this.noise(d, t, 0.3, 'bandpass', 800, 1, 0.5); voice('sawtooth', 80, 50, 0.4, 0.4, 0, 0, 400); break;
      case 'keeper': voice('triangle', 240, 200, 0.35, 0.25, 6, 8, 1500); voice('triangle', 300, 280, 0.3, 0.15, 6, 8, 1500); break;
      case 'keeper_hurt': voice('triangle', 300, 180, 0.3, 0.3, 0, 0, 1500); break;
      case 'boss': voice('sawtooth', 70, 45, 2, 0.6, 2, 5, 400); voice('sawtooth', 105, 68, 2, 0.3, 3, 5, 400); this.noise(d, t, 1.5, 'lowpass', 300, 1, 0.4, 0.3); break;
      default: voice('triangle', 300, 200, 0.3, 0.2);
    }
  }

  private envSound(d: AudioNode, t: number, mat: string): void {
    switch (mat) {
      case 'cave': this.tone(d, t, 3, 'sine', 80 + Math.random() * 60, 50, 0.25, 1.0); this.tone(d, t + 0.5, 2.5, 'sine', 400 + Math.random() * 300, 200, 0.05, 1.0); break;
      case 'wind': this.noise(d, t, 4, 'bandpass', 300 + Math.random() * 300, 0.5, 0.15, 1.5, 200); break;
      case 'bird': for (let i = 0; i < 3; i++) this.tone(d, t + i * 0.18 + Math.random() * 0.05, 0.12, 'sine', 2400 + Math.random() * 800, 3200, 0.06, 0.02); break;
      case 'cricket': for (let i = 0; i < 6; i++) this.tone(d, t + i * 0.09, 0.05, 'square', 4200, 4300, 0.02, 0.01); break;
      case 'owl': this.tone(d, t, 0.25, 'sine', 420, 380, 0.08, 0.05); this.tone(d, t + 0.35, 0.4, 'sine', 400, 340, 0.08, 0.05); break;
      case 'gust': this.noise(d, t, 2.5, 'bandpass', 500 + Math.random() * 300, 0.6, 0.3, 0.8, 250); break;
      case 'drip': this.tone(d, t, 0.12, 'sine', 1800 + Math.random() * 600, 900, 0.1, 0.002); this.tone(d, t + 0.02, 0.3, 'sine', 700, 500, 0.03, 0.01); break;
    }
  }

  /** Per-frame update: ambience loops & music scheduling */
  /**
   * Per-frame ambience. `wind` 0..1 (storm strength / altitude), `underwater` toggles the muffled water loop.
   * All loops are created once and only their gains are automated, so this is allocation-free after warm-up.
   */
  update(dt: number, rainIntensity: number, underground: boolean, night: boolean, inVoid: boolean, wind = 0, underwater = false): void {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    // wind bed: filtered noise whose cutoff wanders slowly; silent underground, swells with storms
    if (!this.windGain) {
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true; src.playbackRate.value = 0.5;
      this.windFilter = ctx.createBiquadFilter(); this.windFilter.type = 'bandpass'; this.windFilter.Q.value = 0.7; this.windFilter.frequency.value = 350;
      this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
      src.connect(this.windFilter); this.windFilter.connect(this.windGain); this.windGain.connect(this.buses.weather);
      src.start();
    }
    const windTarget = underground || inVoid || underwater ? 0 : 0.03 + wind * 0.22 + rainIntensity * 0.06;
    this.windGain.gain.setTargetAtTime(windTarget, ctx.currentTime, 1.2);
    this.windPhase += dt * (0.15 + wind * 0.6);
    this.windFilter!.frequency.setTargetAtTime(300 + Math.sin(this.windPhase) * 120 + wind * 250, ctx.currentTime, 0.5);
    // underwater: low rumble with a slow wobble, everything else ducks
    if (!this.waterGain) {
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true; src.playbackRate.value = 0.25;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
      this.waterGain = ctx.createGain(); this.waterGain.gain.value = 0;
      this.waterLfo = ctx.createOscillator(); this.waterLfo.frequency.value = 0.4;
      const lg = ctx.createGain(); lg.gain.value = 60; this.waterLfo.connect(lg); lg.connect(f.frequency); this.waterLfo.start();
      src.connect(f); f.connect(this.waterGain); this.waterGain.connect(this.buses.env);
      src.start();
    }
    this.waterGain.gain.setTargetAtTime(underwater ? 0.5 : 0, ctx.currentTime, 0.3);
    this.duck(underwater ? 0.35 : 1);
    // rain loop
    if (rainIntensity > 0.02) {
      if (!this.rainSrc) {
        this.rainSrc = ctx.createBufferSource(); this.rainSrc.buffer = this.noiseBuf; this.rainSrc.loop = true;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1500;
        this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
        this.rainSrc.connect(f); f.connect(this.rainGain); this.rainGain.connect(this.buses.weather);
        this.rainSrc.start();
      }
      this.rainGain!.gain.setTargetAtTime(rainIntensity * (underground ? 0.08 : 0.35), ctx.currentTime, 0.5);
    } else if (this.rainSrc) {
      this.rainGain!.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
      const src = this.rainSrc; this.rainSrc = null;
      setTimeout(() => { try { src.stop(); } catch { /* */ } }, 1500);
    }
    // cave / ambient one-shots
    this.caveTimer -= dt;
    if (this.caveTimer <= 0) {
      this.caveTimer = 12 + Math.random() * 25;
      if (underwater) { /* muffled: no surface one-shots */ }
      else if (underground || inVoid) this.play(Math.random() < 0.6 ? 'env.cave' : 'env.drip', { volume: 0.8, bus: 'env' });
      else if (rainIntensity > 0.5 || wind > 0.5) this.play('env.gust', { volume: 0.7, bus: 'env' });
      else if (night) this.play(Math.random() < 0.7 ? 'env.cricket' : 'env.owl', { volume: 0.6, bus: 'env' });
      else if (Math.random() < 0.6) this.play('env.bird', { volume: 0.5, bus: 'env' });
      else this.play('env.wind', { volume: 0.5, bus: 'env' });
      if (underground) this.caveTimer *= 0.7; // caves are busier
    }
    this.mood = inVoid ? 'void' : underground ? 'cave' : night ? 'night' : 'day';
    // music
    // - file track: stalls >8s without 'canplay' mean files are unusable -> generative forever
    if (this.fileEl && !this.fileReady && !this.fileEl.error && ctx.currentTime - this.fileFailAt > 8) this.killFileMusic();
    // - a ready-but-paused file track usually means play() was blocked: retry each frame until allowed
    if (this.fileEl && this.fileReady && this.fileEl.paused && !this.fileEl.ended) { const p = this.fileEl.play(); if (p) p.catch(() => { /* keep retrying */ }); }
    // - generative pieces end on a schedule; file tracks end via their 'ended' event
    if (this.musicPlaying && !this.fileEl && ctx.currentTime >= this.musicEndsAt) { this.musicPlaying = false; this.nextMusic = 120 + Math.random() * 180; }
    this.musicTimer += dt;
    if (!this.musicPlaying && this.musicTimer > this.nextMusic) {
      this.musicTimer = 0;
      this.startMusic();
    }
  }

  /** Abandon the file soundtrack for this session (pause + drop the element). */
  private killFileMusic(): void {
    this.fileDead = true;
    if (this.fileEl) { try { this.fileEl.pause(); } catch { /* ignore */ } this.fileEl = null; }
    this.fileReady = false;
    this.musicPlaying = false;
    this.musicTimer = 999999; // the next update() tick starts the generative fallback right away
  }

  /** Stop whatever is playing (called when leaving a world / quitting to the title). */
  stopMusic(): void {
    if (this.fileEl) { try { this.fileEl.pause(); } catch { /* ignore */ } this.fileEl = null; }
    this.fileReady = false;
    this.musicPlaying = false;
    this.musicTimer = 0;
    this.nextMusic = 20;
    this.trackI = -1;
  }

  /** Start the next piece: repository track when files work, otherwise a generative piece. */
  private startMusic(): void {
    if (!this.fileDead && this.prepareFileTrack()) return; // the file starts itself once playable
    this.playMusicPiece();
  }

  /** Create an <audio> element for the next repository track (returns false when unsupported). */
  private prepareFileTrack(): boolean {
    const ctx = this.ctx!;
    let url: string;
    try {
      this.trackI = (this.trackI + 1) % AudioEngine.TRACKS.length;
      // Relative to the page, so it works wherever the game is deployed next to its music/ folder.
      url = new URL('music/' + encodeURIComponent(AudioEngine.TRACKS[this.trackI]) + '.mp3', document.baseURI).href;
    } catch { this.fileDead = true; return false; }
    let el: HTMLAudioElement;
    try { el = new Audio(url); } catch { this.fileDead = true; return false; }
    el.preload = 'auto';
    const s = settings.value;
    el.volume = AudioEngine.FILE_VOLUME * s.musicVolume * s.masterVolume;
    el.addEventListener('canplay', () => {
      if (this.fileEl !== el) return; // abandoned (failed/stalled while loading)
      this.fileReady = true;
      this.musicPlaying = true;
      const p = el.play();
      if (p) p.catch(() => { this.musicPlaying = false; });
    });
    el.addEventListener('ended', () => {
      if (this.fileEl !== el) return;
      this.fileEl = null; this.fileReady = false; this.musicPlaying = false;
      this.musicTimer = 0; this.nextMusic = 20 + Math.random() * 60; // short silence between tracks
    });
    el.addEventListener('error', () => {
      if (this.fileEl !== el) return;
      this.killFileMusic();
    });
    this.fileEl = el;
    this.fileReady = false;
    this.fileFailAt = ctx.currentTime;
    return true;
  }

  private playMusicPiece(): void {
    const ctx = this.ctx!;
    this.musicPlaying = true;
    const mood = this.mood;
    const scales: Record<string, number[]> = {
      day: [0, 2, 4, 7, 9, 12, 14, 16], night: [0, 3, 5, 7, 10, 12, 15, 17], cave: [0, 2, 3, 7, 8, 12, 14, 15], void: [0, 1, 5, 6, 10, 12, 13, 17],
    };
    const scale = scales[mood];
    const root = mood === 'cave' || mood === 'void' ? 110 : mood === 'night' ? 146.83 : 196;
    const length = 55 + Math.random() * 40;
    const start = ctx.currentTime + 0.5;
    const bus = this.buses.music;
    const freq = (deg: number, oct = 0) => root * Math.pow(2, (scale[((deg % scale.length) + scale.length) % scale.length] + 12 * (oct + Math.floor(deg / scale.length))) / 12);
    // pads: chords every ~8s
    let tt = start;
    while (tt < start + length) {
      const dur = 7 + Math.random() * 4;
      const deg = Math.floor(Math.random() * 4);
      [0, 2, 4].forEach((iv, i) => {
        const o = ctx.createOscillator(); o.type = i === 0 ? 'triangle' : 'sine';
        o.frequency.value = freq(deg + iv, -1) * (1 + (Math.random() - 0.5) * 0.004);
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.045, tt + dur * 0.4); g.gain.linearRampToValueAtTime(0, tt + dur);
        o.connect(f); f.connect(g); g.connect(bus); g.connect(this.reverb);
        o.start(tt); o.stop(tt + dur + 0.1);
      });
      tt += dur * 0.85;
    }
    // melody
    tt = start + 4;
    let deg = 4;
    while (tt < start + length - 6) {
      const step = Math.floor(Math.random() * 5) - 2;
      deg = Math.max(0, Math.min(10, deg + step));
      const dur = [0.8, 1.2, 1.6, 2.4][Math.floor(Math.random() * 4)];
      if (Math.random() < 0.78) {
        const o = ctx.createOscillator(); o.type = mood === 'day' ? 'sine' : 'triangle';
        o.frequency.value = freq(deg, mood === 'cave' ? 0 : 1);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.08, tt + 0.08); g.gain.exponentialRampToValueAtTime(0.001, tt + dur * 1.4);
        o.connect(g); g.connect(bus); g.connect(this.reverb);
        o.start(tt); o.stop(tt + dur * 1.5);
      }
      tt += dur;
    }
    this.musicEndsAt = start + length + 2; // checked against ctx.currentTime in update()
  }
}

export const audio = new AudioEngine();
