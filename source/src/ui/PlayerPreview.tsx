import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useStore } from './store';
import { itemDef } from '../game/items/Items';
import { settings } from '../game/core/Settings';
import { buildSkinFigure, getSkinCanvas, prepareSkinCanvas, activeSkinCanvas, activeSkinSlim, activeSkinKey, type SkinFigureParts } from '../game/core/SkinTexture';
import type { Game } from '../game/core/Game';
import { builtinPortraitPixels, builtinSkinCanvas, type SkinPreset } from '../game/core/Skins';

/**
 * Small live render of the player's voxel figure for the inventory screen. When a skin texture has
 * been uploaded the vanilla player model is drawn with the real skin pixels (head + hat, jacket and
 * sleeves, trousers and their overlays, slim-arm layouts included); otherwise the palette-colour
 * figure is shown. The figure idles (breathing, slight sway), turns to follow the mouse and shows
 * the armour currently worn. It owns a tiny WebGL renderer of its own so it can live inside the
 * React overlay without touching the game scene.
 */
interface PreviewRig { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; parts: FigureParts }
interface FigureParts extends SkinFigureParts { armor: THREE.Mesh[][] }

// One shared WebGL context for every preview (inventory figure + options skin figure): browsers cap
// the number of live contexts and evict the oldest one when the cap is hit, which could be the
// game's own canvas. The rig is rebuilt whenever the skin-relevant settings change; `null` means
// "build on the next call". (An earlier `undefined` sentinel meant a key change disposed the rig
// into `null` where it could never be rebuilt — leaving the preview permanently blank after an
// upload until the page reloaded.)
let rig: (PreviewRig & { skinKey: string }) | null = null;
let rigBusy: Promise<void> | null = null;
function skinKey(): string {
  return activeSkinKey();
}
// Reads go through this accessor so type narrowing never confuses "null because not built yet"
// with the "null after a skin change" case the code below relies on.
function currentRig(): (PreviewRig & { skinKey: string }) | null { return rig; }
async function getRig(width: number, height: number): Promise<PreviewRig | null> {
  const key = skinKey();
  const cur = currentRig();
  if (cur && cur.skinKey !== key) { cur.renderer.dispose(); cur.renderer.forceContextLoss(); rig = null; }
  if (rig) return sizeRig(rig, width, height);
  if (rigBusy) { try { await rigBusy; } catch { /* a failed build leaves rig null; retry below */ } }
  if (rig) return sizeRig(rig, width, height); // a concurrent caller finished the build first
  const want = skinKey();
  if (want !== key) return getRig(width, height); // skin changed while another build was running
  const build = (async () => {
    try {
      // the uploaded skin may still be decoding (settings load before the texture does)
      if (settings.value.skinUrl && !getSkinCanvas(settings.value.skinUrl)) {
        await prepareSkinCanvas(settings.value.skinUrl);
        if (skinKey() !== want) return; // skin changed while decoding; the settings re-run this effect
      }
      const canvas = document.createElement('canvas');
      canvas.className = 'player-figure';
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'low-power' });
      // supersample the preview buffer (>=2x even on 1x screens): the figure stays crisp when the
      // CSS upscales it in fullscreen/1080p instead of showing 1:1 texel mush
      renderer.setPixelRatio(Math.max(2, Math.min(window.devicePixelRatio || 1, 3)));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 20);
      // Frame the whole figure (feet at y=0, hat top ≈ y=2.03) centred with even margins so the
      // preview shows the full skin — head and feet never touch the panel edges while spinning.
      camera.position.set(0, 1.05, 7.0);
      camera.lookAt(0, 1.05, 0);
      scene.add(new THREE.AmbientLight(0xffffff, 0.75));
      const keyL = new THREE.DirectionalLight(0xffffff, 1.4); keyL.position.set(1.5, 3, 2.5); scene.add(keyL);
      const fill = new THREE.DirectionalLight(0x8fb4ff, 0.6); fill.position.set(-2, 1, -2); scene.add(fill);
      const parts = buildFigure();
      scene.add(parts.root);
      rig = { renderer, scene, camera, parts, skinKey: want };
    } catch {
      rig = null;
    }
  })();
  rigBusy = build;
  try { await build; } finally { if (rigBusy === build) rigBusy = null; }
  // If the skin changed while building, `rig` stays null and the effect that observed the change
  // rebuilds it on its next run.
  const made = currentRig();
  return made ? sizeRig(made, width, height) : null;
}

function sizeRig(r: PreviewRig, width: number, height: number): PreviewRig {
  r.renderer.setSize(width, height, false);
  r.camera.aspect = width / height;
  r.camera.updateProjectionMatrix();
  return r;
}

export function PlayerPreview({ game, width = 96, height = 170 }: { game: Game; width?: number; height?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const invVersion = useStore((s) => s.inv);
  const mouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let raf = 0;
    void (async () => {
      const r = await getRig(width, height);
      if (disposed || !el || !r) return;
      el.appendChild(r.renderer.domElement);
      syncArmor(r, game);
      let t = 0; let last = performance.now();
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
        const p = r.parts; const k = Math.min(1, dt * 6);
        // idle: breathing + subtle arm sway; head and body turn toward the pointer
        p.root.rotation.y += ((mouse.current.x * 0.6) - p.root.rotation.y) * k;
        p.head.rotation.x += ((-mouse.current.y * 0.35) - p.head.rotation.x) * k;
        p.head.rotation.y += ((mouse.current.x * 0.35) - p.head.rotation.y) * k;
        p.body.position.y = 18 / 16 + Math.sin(t * 1.6) * 0.008;
        p.arms[0].rotation.x = Math.sin(t * 1.6) * 0.04; p.arms[1].rotation.x = -Math.sin(t * 1.6) * 0.04;
        p.arms[0].rotation.z = 0.05 + Math.sin(t * 1.1) * 0.02; p.arms[1].rotation.z = -0.05 - Math.sin(t * 1.1) * 0.02;
        r.renderer.render(r.scene, r.camera);
      };
      raf = requestAnimationFrame(loop);
    })();
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      const r = rig;
      if (r && r.renderer.domElement.parentNode === el) el.removeChild(r.renderer.domElement);
    };
  }, [width, height, game]);

  // armour overlays follow the inventory
  useEffect(() => {
    const r = rig;
    if (r) syncArmor(r, game);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, invVersion]);

  return (
    <div ref={host} className="player-figure-host" style={{ width, height }}
      onMouseMove={(e) => { const b = e.currentTarget.getBoundingClientRect(); mouse.current = { x: ((e.clientX - b.left) / b.width - 0.5) * 2, y: ((e.clientY - b.top) / b.height - 0.5) * 2 }; }}
      onMouseLeave={() => { mouse.current = { x: 0, y: 0 }; }} />
  );
}

function syncArmor(r: PreviewRig, game: Game): void {
  const armor = game.player.inventory.armor;
  for (let i = 0; i < 4; i++) {
    const s = armor.get(i);
    const def = s ? itemDef(s.id) : undefined;
    const col = def?.icon && 'colors' in def.icon && def.icon.colors ? def.icon.colors.A : null;
    for (const m of r.parts.armor[i]) {
      m.visible = !!col;
      if (col) (m.material as THREE.MeshLambertMaterial).color.set(col);
    }
  }
}

/**
 * Build the player figure: the real skin model when a texture is uploaded, otherwise the palette
 * figure (skin/hair/shirt/pants colour pickers). Armour overlays are attached afterwards so both
 * paths share the same silhouettes.
 */
function buildFigure(): FigureParts {
  const cv = activeSkinCanvas(); // uploaded file OR built-in preset sheet (same code path)
  const slim = activeSkinSlim();
  const parts: FigureParts = cv
    ? { ...buildSkinFigure(cv, slim), armor: [] }
    : buildPaletteFigure(slim);
  attachArmor(parts, slim);
  return parts;
}

/** Steve-free original figure when no texture is uploaded: rounded-off skin tones, tunic and trousers. */
function buildPaletteFigure(slim: boolean): FigureParts {
  const root = new THREE.Group();
  const sk = settings.value.skin ?? { skin: '#d8a878', hair: '#5a3a22', shirt: '#3f6f9f', pants: '#3b3b5a' };
  const hx = (h: string): number => (h.startsWith('#') ? parseInt(h.slice(1), 16) : Number(h));
  const shade = (c: number, f: number): number => {
    const r = Math.min(255, Math.max(0, Math.round(((c >> 16) & 255) * f))), g = Math.min(255, Math.max(0, Math.round(((c >> 8) & 255) * f))), b = Math.min(255, Math.max(0, Math.round((c & 255) * f)));
    return (r << 16) | (g << 8) | b;
  };
  const SKIN = hx(sk.skin), TUNIC = hx(sk.shirt), TROUSER = hx(sk.pants), HAIR = hx(sk.hair);
  const mat = (c: number) => new THREE.MeshLambertMaterial({ color: c });
  const box = (w: number, h: number, d: number, c: number, x: number, y: number, z: number, pivotTop = false) => {
    const g = new THREE.BoxGeometry(w / 16, h / 16, d / 16);
    if (pivotTop) g.translate(0, -h / 32, 0);
    const m = new THREE.Mesh(g, mat(c)); m.position.set(x / 16, y / 16, z / 16); return m;
  };
  const aw = slim ? 3 : 4;
  const legs = [box(3.9, 12, 4, TROUSER, -2, 12, 0, true), box(3.9, 12, 4, TROUSER, 2, 12, 0, true)];
  const body = box(8, 12, 4, TUNIC, 0, 18, 0);
  const arms = [box(aw, 12, 4, TUNIC, -(4 + aw / 2), 24, 0, true), box(aw, 12, 4, TUNIC, (4 + aw / 2), 24, 0, true)];
  // hands: the arm geometry is pivoted at its top, so the hand sits at the bottom 3 px
  for (const a of arms) { const hand = box(aw + 0.02, 3, 4.02, SKIN, 0, 0, 0); hand.position.y = -(12 - 1.5) / 16; a.add(hand); }
  const head = new THREE.Group(); head.position.set(0, 24 / 16, 0);
  head.add(box(8, 8, 8, SKIN, 0, 4, 0));
  head.add(box(8.4, 3, 8.4, HAIR, 0, 6.6, 0)); // hair cap
  head.add(box(8.4, 1.5, 0.4, HAIR, 0, 5.4, 4.2)); // fringe
  head.add(box(2, 1, 0.3, 0x202020, -2, 3.5, 4.1), box(2, 1, 0.3, 0x202020, 2, 3.5, 4.1)); // eyes
  head.add(box(1, 1, 0.3, 0xffffff, -2.5, 3.5, 4.15), box(1, 1, 0.3, 0xffffff, 1.5, 3.5, 4.15)); // eye highlights
  head.add(box(2, 0.8, 0.3, 0xb07850, 0, 1.6, 4.1)); // mouth
  root.add(...legs, body, ...arms, head);
  return { root, head, body, arms, legs, armor: [], materials: [] };
}

/** Attach the armour overlay boxes (hidden unless worn): helmet, chestplate, leggings, boots. */
function attachArmor(parts: FigureParts, slim: boolean): void {
  const root = parts.root, head = parts.head, arms = parts.arms, legs = parts.legs;
  const mat = () => new THREE.MeshLambertMaterial({ color: 0xffffff });
  const ov = (w: number, h: number, d: number, x: number, y: number, z: number, parent: THREE.Object3D, pivotTop = false) => {
    const g = new THREE.BoxGeometry(w / 16, h / 16, d / 16);
    if (pivotTop) g.translate(0, -h / 32, 0);
    const m = new THREE.Mesh(g, mat()); m.position.set(x / 16, y / 16, z / 16); m.visible = false; parent.add(m); return m;
  };
  // open-faced helmet: cap, back plate and cheek plates so the face stays visible
  const helmet = [ov(9, 3.6, 9, 0, 6.8, 0, head), ov(9, 6, 1, 0, 2.6, -4.1, head), ov(1, 6, 9, -4.1, 2.6, 0, head), ov(1, 6, 9, 4.1, 2.6, 0, head)];
  const ax = slim ? 3.5 : 5;
  const chest = [ov(9, 12.6, 5, 0, 18, 0, root), ov(ax, 12.4, 5, 0, 0, 0, arms[0], true), ov(ax, 12.4, 5, 0, 0, 0, arms[1], true)];
  const legsA = [ov(4.8, 12.2, 4.8, 0, 0, 0, legs[0], true), ov(4.8, 12.2, 4.8, 0, 0, 0, legs[1], true), ov(8.6, 4, 4.6, 0, 13, 0, root)];
  const boots = [ov(5, 5, 5, 0, 0, 0, legs[0]), ov(5, 5, 5, 0, 0, 0, legs[1])];
  for (const m of boots) m.position.y = -9.5 / 16; // bottom of the (top-pivoted) leg
  parts.armor = [helmet, chest, legsA, boots];
}

// ------------------------------------------------------------------ preset portraits
// Static 2D front-view portraits of the built-in skins for the picker grid. Drawn from the same
// palette records the voxel figure uses, so the card preview always matches the 3D skin exactly.

function hexToRgb(h: string): [number, number, number] {
  const v = parseInt(h.startsWith('#') ? h.slice(1) : h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function shade(c: [number, number, number], f: number): string {
  return `rgb(${Math.round(c[0] * f)},${Math.round(c[1] * f)},${Math.round(c[2] * f)})`;
}

/** Paint a 16x32-grid front portrait of the palette figure (head + hair, tunic, arms, trousers). */
export function drawSkinPortrait(cv: HTMLCanvasElement, preset: SkinPreset, sc: number): void {
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  cv.width = 16 * sc; cv.height = 32 * sc;
  ctx.clearRect(0, 0, cv.width, cv.height);
  const px = (x: number, y: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x * sc, y * sc, sc, sc); };
  const rect = (x0: number, y0: number, x1: number, y1: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x0 * sc, y0 * sc, (x1 - x0 + 1) * sc, (y1 - y0 + 1) * sc); };
  const skinC = hexToRgb(preset.skin), shirtC = hexToRgb(preset.shirt), pantsC = hexToRgb(preset.pants), hairC = hexToRgb(preset.hair);
  const SKIN = preset.skin, SKIN_D = shade(skinC, 0.72), SKIN_L = shade(skinC, 1.12);
  const SHIRT = preset.shirt, SHIRT_D = shade(shirtC, 0.72), SHIRT_L = shade(shirtC, 1.12);
  const PANTS = preset.pants, PANTS_D = shade(pantsC, 0.72);
  const HAIR = preset.hair, HAIR_D = shade(hairC, 0.65);
  const EYE = '#26262e', MOUTH = '#8a5a3a';
  const slim = !!preset.slim;
  // head (8 wide) + hair
  rect(4, 2, 11, 9, SKIN);
  rect(4, 2, 11, 3, HAIR);            // hair cap
  px(4, 4, HAIR); px(5, 4, HAIR); px(10, 4, HAIR); px(11, 4, HAIR); // fringe dips
  px(4, 5, HAIR); px(4, 6, HAIR); px(11, 5, HAIR); px(11, 6, HAIR); // sideburns
  px(5, 4, HAIR_D); px(6, 3, HAIR_D); px(7, 3, HAIR_D); px(8, 3, HAIR_D); px(9, 3, HAIR_D); px(10, 3, HAIR_D);
  // face: shading under the fringe + cheek light
  rect(4, 8, 11, 9, SKIN);
  rect(5, 5, 10, 6, SKIN_L);
  rect(6, 7, 7, 7, EYE); rect(9, 7, 10, 7, EYE);  // eyes (dark) — 1px eye whites not needed at this size
  rect(7, 8, 8, 8, MOUTH);
  px(11, 6, SKIN_D); px(11, 7, SKIN_D); px(11, 8, SKIN_D); // head shade edge
  // arms + hands: 2px arms hang beside the torso (slim arms sit one column closer in)
  const al0 = slim ? 3 : 2, ar0 = slim ? 12 : 13;
  rect(al0, 10, al0 + 1, 19, SHIRT);          // left sleeve
  rect(ar0, 10, ar0 + 1, 19, SHIRT);          // right sleeve
  rect(al0, 20, al0 + 1, 22, SKIN);           // left hand
  rect(ar0, 20, ar0 + 1, 22, SKIN);           // right hand
  px(al0, 20, SKIN_L); px(ar0, 20, SKIN_L);   // hand highlight
  // torso
  rect(4, 10, 11, 21, SHIRT);
  rect(4, 10, 11, 12, SHIRT_L);               // shoulder highlight
  rect(5, 20, 10, 21, SHIRT_D);               // hem shadow
  px(4, 10, SHIRT_D); px(11, 10, SHIRT_D);
  // legs
  rect(4, 22, 7, 31, PANTS); rect(8, 22, 11, 31, PANTS);
  rect(4, 29, 7, 31, PANTS_D); rect(8, 29, 11, 31, PANTS_D); // boot tops
  rect(4, 30, 11, 31, shade(pantsC, 0.45));   // shoes
}

/** Small static portrait card image for the built-in-skin picker. */
export function PresetPortrait({ preset, size = 64 }: { preset: SkinPreset; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    // The portrait is composed from the preset's own sheet (real hair/hat/outfit pixels), then
    // drawn once, nearest-neighbour, at the panel's true device resolution: one resample from the
    // 16x32 art to the physical pixels, so the card stays sharp on a 1080p screen instead of being
    // stretched by the compositor. The palette portrait remains the fallback if 2D is unavailable.
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const dw = Math.round(size * dpr), dh = Math.round(size * 2 * dpr);
    cv.width = dw; cv.height = dh;
    const g = cv.getContext('2d');
    const tmp = document.createElement('canvas');
    tmp.width = 16; tmp.height = 32;
    const tg = tmp.getContext('2d');
    if (g && tg) {
      const img = g.createImageData(16, 32);
      img.data.set(builtinPortraitPixels(preset));
      tg.putImageData(img, 0, 0);
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, dw, dh);
      g.drawImage(tmp, 0, 0, dw, dh);
    } else {
      drawSkinPortrait(cv, preset, Math.max(2, Math.round(size / 16)));
    }
  }, [preset, size]);
  const w = size, h = size * 2;
  return <canvas ref={ref} className="skin-portrait" style={{ width: w, height: h }} aria-label={`${preset.name} skin preview`} />;
}

/**
 * Free-standing 3D figure for the skin section of the Options screen: the player model with the
 * current skin texture (or palette colours) turning slowly, exactly as it will appear in the game.
 * It shares the module-wide preview rig with the inventory figure, so opening the inventory never
 * creates a second WebGL context. Re-mounts (and rebuilds) automatically when the skin changes.
 */
export function FigureView({ width = 132, height = 200, className = 'skin-figure', spin = true }: { width?: number; height?: number; className?: string; spin?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  // re-run the effect whenever the skin-relevant settings change (texture, slim, palette colours)
  const key = skinKey();
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let raf = 0;
    void (async () => {
      const r = await getRig(width, height);
      if (disposed || !el || !r) return;
      el.appendChild(r.renderer.domElement);
      let t = 0; let last = performance.now();
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
        const p = r.parts; const k = Math.min(1, dt * 6);
        // turn slowly so every side of the skin is visible; idle breathing + arm sway
        p.root.rotation.y = spin ? t * 0.7 : p.root.rotation.y;
        p.body.position.y = 18 / 16 + Math.sin(t * 1.6) * 0.008;
        p.arms[0].rotation.x = Math.sin(t * 1.6) * 0.04; p.arms[1].rotation.x = -Math.sin(t * 1.6) * 0.04;
        p.arms[0].rotation.z = 0.05 + Math.sin(t * 1.1) * 0.02; p.arms[1].rotation.z = -0.05 - Math.sin(t * 1.1) * 0.02;
        r.renderer.render(r.scene, r.camera);
      };
      raf = requestAnimationFrame(loop);
    })();
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      const r = rig;
      if (r && r.renderer.domElement.parentNode === el) el.removeChild(r.renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, key, spin]);
  return <div ref={host} className={className} aria-label="3D player skin preview" />;
}

/** Dedicated selected-skin preview: shows the candidate before equipping it. One temporary
 * WebGL context, released with its geometry and texture when the detail pane closes. */
export function PresetFigureView({ preset, width = 200, height = 300, headwear, customCanvas }: { preset?: SkinPreset; width?: number; height?: number; headwear?: string; customCanvas?: HTMLCanvasElement | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    const sheet = customCanvas || (preset ? builtinSkinCanvas(preset) : null);
    if (!host || !sheet) return;
    host.textContent = '';
    const canvas = document.createElement('canvas');
    canvas.className = 'java-market-selected-3d';
    host.appendChild(canvas);
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'low-power' }); }
    catch { canvas.remove(); host.textContent = '3D preview unavailable'; return; }
    try {
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(width, height, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, 1.3));
      const light = new THREE.DirectionalLight(0xffffff, 1.5);
      light.position.set(2, 3, 4); scene.add(light);
      const camera = new THREE.PerspectiveCamera(27, width / height, 0.1, 20);
      camera.position.set(0, 1.05, 6.4); camera.lookAt(0, 1.05, 0);
      const figure = buildSkinFigure(sheet, !!preset?.slim, headwear); scene.add(figure.root);
      let frame = 0;
      let stopped = false;
      const contextLost = (e: Event) => { e.preventDefault(); stopped = true; cancelAnimationFrame(frame); };
      canvas.addEventListener('webglcontextlost', contextLost);
      const animate = (now: number) => {
        if (stopped) return;
        try {
          figure.root.rotation.y = Math.sin(now * 0.00055) * 0.35;
          renderer.render(scene, camera);
          frame = requestAnimationFrame(animate);
        } catch (error) { stopped = true; console.warn('Skin preview unavailable', error); }
      };
      frame = requestAnimationFrame(animate);
      return () => {
        stopped = true;
        cancelAnimationFrame(frame);
        canvas.removeEventListener('webglcontextlost', contextLost);
        figure.root.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
        for (const m of figure.materials) m.dispose();
        renderer.dispose();
        // dispose() frees Three.js resources but does not release the browser WebGL context.
        // Selecting many skins would otherwise exhaust the context limit and blank the game.
        renderer.forceContextLoss();
        canvas.remove();
      };
    } catch (error) {
      console.warn('Skin preview unavailable', error);
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      host.textContent = '3D preview unavailable';
      return;
    }
  }, [preset, width, height, headwear, customCanvas]);
  return <div ref={ref} style={{ width, height }} aria-label={`${preset?.name ?? 'Avatar'} 3D skin preview`} />;
}
