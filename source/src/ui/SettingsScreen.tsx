import React, { useEffect, useRef, useState } from 'react';
import { fullscreenSupported, isFullscreen, onFullscreenChange, toggleFullscreen } from './fullscreen';
import { Btn, Slider, Toggle, Cycle } from './components';
import { store, useStore } from './store';
import { settings, t, keyName, KEY_LABELS, DEFAULT_KEYS, LANGUAGES, type Settings, type QualityPreset } from '../game/core/Settings';
import { audio } from '../game/audio/Audio';
import { loadResourcePack, clearResourcePack } from '../game/core/ResourcePacks';
import { currentGame } from './session';
import { loadSkinFile, getSkinCanvas, prepareSkinCanvas, activeSkinCanvas, activeSkinKey } from '../game/core/SkinTexture';
import { FigureView } from './PlayerPreview';
import { PresetFigure } from './SkinFigure';
import { SKIN_PRESETS, presetById, type SkinPreset } from '../game/core/Skins';
import type { Difficulty } from '../game/core/types';

const pct = (v: number) => Math.round(v * 100) + '%';
type Page = 'main' | 'video' | 'shaders' | 'audio' | 'controls' | 'language' | 'accessibility' | 'interface' | 'skins' | 'packs';
const DIFFS: Difficulty[] = ['peaceful', 'easy', 'normal', 'hard'];

/**
 * Options screen laid out like the classic one: a hub page with FOV / Difficulty on top and a
 * two-column grid of sub-screen buttons, each sub-screen being its own two-column list with a Done button.
 */
export function SettingsScreen() {
  const [, force] = useState(0);
  const [page, setPage] = useState<Page>('main');
  const [packMsg, setPackMsg] = useState('');
  const [binding, setBinding] = useState<string | null>(null);
  const [fs, setFs] = useState(isFullscreen());
  const [skinMsg, setSkinMsg] = useState('');
  const skinInput = useRef<HTMLInputElement>(null);
  useEffect(() => onFullscreenChange(setFs), []);
  const prev = useStore((s) => s.prevScreen);
  const inGame = prev === 'game';
  const game = currentGame();
  const s = settings.value;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    settings.set(k, v);
    force((n) => n + 1);
    if (game) {
      game.applySettings();
      if (k === 'smoothLighting') game.setSmoothLighting(v as boolean);
    }
    if (k.endsWith('Volume')) audio.applyVolumes();
  };
  const onSkinFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const r = await loadSkinFile(f);
    if (r.ok) {
      set('skinUrl', r.skin.url);
      set('skinSlim', r.skin.slim);
      set('skinPreset', 'custom');
      setSkinMsg('');
    } else {
      setSkinMsg(r.error);
    }
  };
  const removeSkin = () => { const p = presetById('steve'); set('skinUrl', ''); set('skinSlim', false); set('skinPreset', 'steve'); set('skin', { skin: p.skin, hair: p.hair, shirt: p.shirt, pants: p.pants }); setSkinMsg(''); };
  const pickPreset = (p: SkinPreset) => { set('skinUrl', ''); set('skinSlim', !!p.slim); set('skinPreset', p.id); set('skin', { skin: p.skin, hair: p.hair, shirt: p.shirt, pants: p.pants }); };

  useEffect(() => {
    if (!binding) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (e.code === 'Escape') { setBinding(null); return; }
      settings.setKey(binding, e.code);
      setBinding(null); force((n) => n + 1);
    };
    const onMouse = (e: MouseEvent) => {
      if (e.button === 0) return;
      e.preventDefault();
      settings.setKey(binding, 'Mouse' + e.button);
      setBinding(null); force((n) => n + 1);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onMouse, true);
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('mousedown', onMouse, true); };
  }, [binding]);

  const back = () => {
    game?.applySettings();
    if (inGame) store.set({ screen: 'game', prevScreen: 'menu' });
    else store.goto('menu');
  };
  const done = () => { if (page === 'main') back(); else setPage('main'); };

  // Escape closes the current page (and, in-game, the whole screen) instead of reaching the game's pause handling.
  useEffect(() => {
    if (binding) return;
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); done(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const conflicts = new Set<string>();
  { const seen = new Map<string, string>(); for (const [a, c] of Object.entries(s.keys)) { if (seen.has(c)) { conflicts.add(a); conflicts.add(seen.get(c)!); } seen.set(c, a); } }

  const difficulty = game?.options.difficulty ?? 'normal';
  const canChangeDifficulty = !!game && !game.transport.connected;
  const title = page === 'main' ? t('options').replace('...', '') : page === 'video' ? t('video').replace('...', '') : page === 'audio' ? t('music_sounds').replace('...', '')
    : page === 'controls' ? t('controls_btn').replace('...', '') : page === 'language' ? t('language') : page === 'shaders' ? 'Shader Pack' : page === 'interface' ? 'Interface & Hand' : page === 'skins' ? 'Skins' : page === 'packs' ? 'Resource Packs' : t('accessibility_btn').replace('...', '');

  return (
    <div className={'menu-screen ' + (inGame ? 'menu-dim' : 'dirt-bg')}>
      <div className="menu-header">{title}</div>
      <div className="menu-center settings-scroll">
        {page === 'main' && (
          <>
            <div className="settings-top">
              <Slider label={t('fov')} value={s.fov} min={30} max={110} onChange={(v) => set('fov', v)} format={(v) => v === 70 ? 'Normal' : v === 110 ? 'Quake Pro' : String(v)} />
              <Btn disabled={!canChangeDifficulty} onClick={() => { if (!game) return; const next = DIFFS[(DIFFS.indexOf(difficulty) + 1) % DIFFS.length]; game.chat('/difficulty ' + next); force((n) => n + 1); }}>
                {t('difficulty_label')}: {t(difficulty)}
              </Btn>
            </div>
            <div className="settings-divider" />
            <div className="settings-grid">
              <Btn onClick={() => setPage('audio')}>{t('music_sounds')}</Btn>
              <Btn onClick={() => setPage('video')}>{t('video')}</Btn>
              <Btn onClick={() => setPage('controls')}>{t('controls_btn')}</Btn>
              <Btn onClick={() => setPage('language')}>{t('language_btn')}</Btn>
              <Btn onClick={() => setPage('accessibility')}>{t('accessibility_btn')}</Btn>
              <Btn onClick={() => setPage('shaders')}>Shader Pack... {s.shaders ? '(On)' : '(Off)'}</Btn>
              <Btn onClick={() => setPage('interface')}>Interface & Hand...</Btn>
              <Btn onClick={() => setPage('skins')}>Skins...{s.skinUrl ? ' (File)' : ''}</Btn>
              <Btn onClick={() => setPage('packs')}>Resource Packs...{s.resourcePack ? ' (On)' : ''}</Btn>
              <Btn danger onClick={() => { settings.reset(); force((n) => n + 1); game?.applySettings(); audio.applyVolumes(); }}>{t('reset')}</Btn>
            </div>
          </>
        )}
        {page === 'video' && (
          <div className="settings-grid">
            <Cycle label="Graphics" value={s.quality} options={['low', 'medium', 'high', 'ultra', 'custom'] as const} labels={{ low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra', custom: 'Custom' }}
              onChange={(v: QualityPreset) => { settings.applyPreset(v); force((n) => n + 1); if (game) { game.applySettings(); game.setSmoothLighting(settings.value.smoothLighting); } }} />
            {fullscreenSupported() && <Toggle label="Fullscreen" value={fs} onChange={() => { void toggleFullscreen(); }} on={t('on')} off={t('off')} />}
            <Slider label="Render Distance" value={s.renderDistance} min={2} max={16} onChange={(v) => set('renderDistance', v)} format={(v) => v + ' chunks'} />
            <Slider label="Max Framerate" value={s.maxFps} min={0} max={240} step={10} onChange={(v) => set('maxFps', v)} format={(v) => v === 0 || v >= 240 ? 'Unlimited' : v + ' fps'} />
            <Slider label="Render Scale (× native)" value={s.renderScale} min={0.5} max={2} step={0.25} onChange={(v) => set('renderScale', v)} format={(v) => v === 1 ? '1.00x native' : v.toFixed(2) + 'x'} />
            <Slider label="GUI Scale" value={s.uiScale} min={0.6} max={1.6} step={0.1} onChange={(v) => set('uiScale', v)} format={(v) => v.toFixed(1) + 'x'} />
            <Slider label="Entity Distance" value={s.entityDistance} min={16} max={128} step={16} onChange={(v) => set('entityDistance', v)} format={(v) => v + ' blocks'} />
            <Cycle label="Chunk Loading" value={String(s.chunkSpeed) as '1' | '2' | '3'} options={['1', '2', '3']} labels={{ '1': 'Slow', '2': 'Normal', '3': 'Fast' }} onChange={(v) => set('chunkSpeed', parseInt(v))} />
            <Cycle label="Particles" value={String(s.particles) as '0' | '1' | '2'} options={['2', '1', '0']} labels={{ '0': 'Minimal', '1': 'Decreased', '2': 'All' }} onChange={(v) => set('particles', parseInt(v))} />
            <Toggle label="Smooth Lighting" value={s.smoothLighting} onChange={(v) => set('smoothLighting', v)} on={t('on')} off={t('off')} />
            <Toggle label="View Bobbing" value={s.viewBobbing} onChange={(v) => set('viewBobbing', v)} on={t('on')} off={t('off')} />
            <Toggle label="FOV Effects" value={s.sprintFov} onChange={(v) => set('sprintFov', v)} on={t('on')} off={t('off')} />
            <Cycle label="Day Cycle Speed" value={String(s.timeSpeed) as '0.5' | '1' | '2' | '4'} options={['1', '0.5', '2', '4']} labels={{ '0.5': 'Half', '1': 'Normal', '2': 'Double', '4': 'Quadruple' }} onChange={(v) => set('timeSpeed', parseFloat(v))} />
            <Toggle label="Clouds" value={s.clouds} onChange={(v) => set('clouds', v)} on={t('on')} off={t('off')} />
            <Toggle label="Weather" value={s.weather} onChange={(v) => set('weather', v)} on={t('on')} off={t('off')} />
            <Toggle label="Fog" value={s.fog} onChange={(v) => set('fog', v)} on={t('on')} off={t('off')} />
            <Toggle label="Show Coordinates" value={s.showCoordinates} onChange={(v) => set('showCoordinates', v)} on={t('on')} off={t('off')} />
            <Slider label="Brightness" value={s.brightness} min={0} max={1} step={0.05} onChange={(v) => set('brightness', v)} format={(v) => v <= 0 ? 'Moody' : v >= 1 ? 'Bright' : pct(v)} />
            <Slider label="Cloud Height" value={s.cloudHeight} min={100} max={220} step={4} onChange={(v) => set('cloudHeight', v)} format={(v) => v + ' blocks'} />
            <Toggle label="Shader Pack" value={s.shaders} onChange={(v) => set('shaders', v)} on={t('on')} off={t('off')} />
            <Btn onClick={() => setPage('shaders')}>Shader Pack Settings...</Btn>
          </div>
        )}
        {page === 'shaders' && (
          <>
            <div className="menu-text small settings-note">
              The shader pack layers extra effects over the pixel-art renderer. Each effect can be switched off on its own; the master switch turns them all off at once and costs nothing when off.
            </div>
            <div className="settings-grid">
              <Toggle label="Shader Pack" value={s.shaders} onChange={(v) => set('shaders', v)} on={t('on')} off={t('off')} />
              <Cycle label="Preset" value={shaderPresetOf(s)} options={['off', 'lite', 'full'] as const} labels={{ off: 'Off', lite: 'Lite', full: 'Full', custom: 'Custom' }}
                onChange={(v) => { applyShaderPreset(v, (k, val) => settings.set(k, val)); force((n) => n + 1); game?.applySettings(); }} />
              <Toggle label="Waving Leaves & Plants" value={s.shaderWaving} onChange={(v) => set('shaderWaving', v)} on={t('on')} off={t('off')} />
              <Toggle label="Water Reflections" value={s.shaderWater} onChange={(v) => set('shaderWater', v)} on={t('on')} off={t('off')} />
              <Toggle label="Directional Sunlight" value={s.shaderSunlight} onChange={(v) => set('shaderSunlight', v)} on={t('on')} off={t('off')} />
              <Toggle label="Sun Glow & Rays" value={s.shaderGodrays} onChange={(v) => set('shaderGodrays', v)} on={t('on')} off={t('off')} />
              <Toggle label="Colour Grading" value={s.shaderGrade} onChange={(v) => set('shaderGrade', v)} on={t('on')} off={t('off')} />
              <Toggle label="Bloom" value={s.shaderBloom} onChange={(v) => set('shaderBloom', v)} on={t('on')} off={t('off')} />
              <Toggle label="Vignette" value={s.shaderVignette} onChange={(v) => set('shaderVignette', v)} on={t('on')} off={t('off')} />
              <Slider label="Colour Temperature" value={s.shaderColorTemp} min={-1} max={1} step={0.1} onChange={(v) => set('shaderColorTemp', v)} format={(v) => Math.abs(v) < 0.05 ? 'Neutral' : v < 0 ? 'Cool ' + Math.round(-v * 100) + '%' : 'Warm ' + Math.round(v * 100) + '%'} />
            </div>
          </>
        )}
        {page === 'interface' && (
          <div className="settings-grid">
            <Toggle label="Show Hand" value={s.showHand} onChange={(v) => set('showHand', v)} on={t('on')} off={t('off')} />
            <Toggle label="Arm Holds Items" value={s.heldArm} onChange={(v) => set('heldArm', v)} on={t('on')} off={t('off')} />
            <Toggle label="Main Hand" value={s.mainHand === 'left'} onChange={(v) => set('mainHand', v ? 'left' : 'right')} on="Left" off="Right" />
            <Toggle label="View Bobbing" value={s.viewBobbing} onChange={(v) => set('viewBobbing', v)} on={t('on')} off={t('off')} />
            <Slider label="FOV" value={s.fov} min={30} max={110} onChange={(v) => set('fov', v)} format={(v) => v === 70 ? 'Normal' : v === 110 ? 'Quake Pro' : String(v)} />
            <Cycle label="Crosshair" value={s.crosshairStyle} options={['cross', 'dot', 'circle'] as const} labels={{ cross: 'Cross', dot: 'Dot', circle: 'Circle' }} onChange={(v) => set('crosshairStyle', v)} />
            <Slider label="Crosshair Size" value={s.crosshairSize} min={0.5} max={2} step={0.1} onChange={(v) => set('crosshairSize', v)} format={(v) => v.toFixed(1) + 'x'} />
            <Slider label="Crosshair Opacity" value={s.crosshairOpacity} min={0.2} max={1} step={0.05} onChange={(v) => set('crosshairOpacity', v)} format={pct} />
            <Cycle label="Crosshair Color" value={s.crosshairColor} options={['#ffffff', '#ffff00', '#00ff88', '#ff4444', '#44aaff', '#000000']} labels={{ '#ffffff': 'White', '#ffff00': 'Yellow', '#00ff88': 'Green', '#ff4444': 'Red', '#44aaff': 'Blue', '#000000': 'Black' }} onChange={(v) => set('crosshairColor', v)} />
            <Slider label="HUD Opacity" value={s.hudOpacity} min={0.3} max={1} step={0.05} onChange={(v) => set('hudOpacity', v)} format={pct} />
            <Slider label="HUD Scale" value={s.hudScale} min={0.6} max={1.6} step={0.1} onChange={(v) => set('hudScale', v)} format={(v) => v.toFixed(1) + 'x'} />
            <Slider label="GUI Scale" value={s.uiScale} min={0.6} max={1.6} step={0.1} onChange={(v) => set('uiScale', v)} format={(v) => v.toFixed(1) + 'x'} />
            <Toggle label="Held Item Names" value={s.heldItemTooltips} onChange={(v) => set('heldItemTooltips', v)} on={t('on')} off={t('off')} />
            <Toggle label="Damage Tint" value={s.damageTint} onChange={(v) => set('damageTint', v)} on={t('on')} off={t('off')} />
            <Toggle label="Show Coordinates" value={s.showCoordinates} onChange={(v) => set('showCoordinates', v)} on={t('on')} off={t('off')} />
            <Btn onClick={() => setPage('skins')}>Open Skin Selector...</Btn>
          </div>
        )}
        {page === 'skins' && (
          <>
            <div className="menu-text small settings-note">
              Choose a built-in skin or upload your own. Built-in skins are drawn from the same
              colours as the character figure and apply to the in-game player, the first-person
              arm, and every preview instantly. Your choice is saved automatically.
            </div>
            <div className="skin-preset-grid">
              {SKIN_PRESETS.map((sp) => {
                const on = !s.skinUrl && s.skinPreset === sp.id;
                return (
                  <button key={sp.id} type="button" className={'skin-preset-card' + (on ? ' on' : '')}
                    onClick={() => pickPreset(sp)} aria-pressed={on} title={sp.name}>
                    <PresetFigure preset={sp} height={104} />
                    <span className="skin-preset-name">{sp.name}</span>
                    {on && <span className="skin-preset-check">Equipped</span>}
                  </button>
                );
              })}
            </div>
            <div className="settings-divider" />
            <div className="skin-preview-row">
              <div className="skin-figures">
                <FigureView width={132} height={200} />
                <p className="menu-text small skin-fig-cap">Your skin, 3D</p>
              </div>
              <div className="skin-col">
                <FlatSkinPreview url={s.skinUrl} />
                <p className="menu-text small skin-fig-cap">Full skin sheet</p>
              </div>
              <div className="skin-col">
                <input ref={skinInput} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }}
                  onChange={(e) => { void onSkinFile(e); }} />
                <Btn onClick={() => skinInput.current?.click()}>{s.skinUrl ? 'Replace Skin…' : 'Upload Skin…'}</Btn>
                {!!s.skinUrl && <Btn onClick={removeSkin}>Remove Skin</Btn>}
                <p className="menu-text small skin-fig-cap">{s.skinUrl ? (s.skinSlim ? 'Slim arms detected' : 'Classic (wide) arms') : 'Minecraft-style skin image (PNG/JPEG, 64×64 or 64×32)'}</p>
                {!!skinMsg && <p className="menu-text small" style={{ color: '#ff9a8a' }}>{skinMsg}</p>}
              </div>
            </div>
          </>
        )}
        {page === 'audio' && (
          <div className="settings-grid">
            <Slider label="Master Volume" value={s.masterVolume} min={0} max={1} step={0.05} onChange={(v) => set('masterVolume', v)} format={pct} />
            <Slider label="Music" value={s.musicVolume} min={0} max={1} step={0.05} onChange={(v) => set('musicVolume', v)} format={pct} />
            <Slider label="Ambient" value={s.envVolume} min={0} max={1} step={0.05} onChange={(v) => set('envVolume', v)} format={pct} />
            <Slider label="Weather" value={s.weatherVolume} min={0} max={1} step={0.05} onChange={(v) => set('weatherVolume', v)} format={pct} />
            <Slider label="Friendly & Hostile Creatures" value={s.mobVolume} min={0} max={1} step={0.05} onChange={(v) => set('mobVolume', v)} format={pct} />
            <Slider label="Blocks" value={s.blockVolume} min={0} max={1} step={0.05} onChange={(v) => set('blockVolume', v)} format={pct} />
            <Slider label="Interface" value={s.uiVolume} min={0} max={1} step={0.05} onChange={(v) => { set('uiVolume', v); audio.play('ui'); }} format={pct} />
            <Slider label="Player" value={s.playerVolume} min={0} max={1} step={0.05} onChange={(v) => set('playerVolume', v)} format={pct} />
          </div>
        )}
        {page === 'controls' && (
          <>
            <div className="settings-grid">
              <Slider label="Sensitivity" value={s.sensitivity} min={0.05} max={1} step={0.05} onChange={(v) => set('sensitivity', v)} format={pct} />
              <Toggle label="Invert Mouse" value={s.invertMouse} onChange={(v) => set('invertMouse', v)} on={t('on')} off={t('off')} />
              <Toggle label="Sprint" value={s.toggleSprint} onChange={(v) => set('toggleSprint', v)} on="Toggle" off="Hold" />
              <Toggle label="Sneak" value={s.sneakToggle} onChange={(v) => set('sneakToggle', v)} on="Toggle" off="Hold" />
              <Toggle label="Auto Jump" value={s.autoJump} onChange={(v) => set('autoJump', v)} on={t('on')} off={t('off')} />
              <Toggle label="Camera Shake" value={s.cameraShake} onChange={(v) => set('cameraShake', v)} on={t('on')} off={t('off')} />
            </div>
            <div className="menu-text small settings-note">Minecraft-style: hold Left Ctrl to sprint (or double-tap W), hold Left Shift to sneak. The toggles above switch either to tap-to-toggle.</div>
            <div className="settings-section">Key Binds</div>
            <div className="settings-keys">
              {Object.keys(DEFAULT_KEYS).map((action) => (
                <div key={action} className={'key-row' + (conflicts.has(action) ? ' key-conflict' : '')}>
                  <span className="key-label">{KEY_LABELS[action] ?? action}</span>
                  <Btn small className={binding === action ? 'mc-btn-active' : undefined} onClick={() => setBinding(binding === action ? null : action)}>{binding === action ? '> ??? <' : keyName(s.keys[action])}</Btn>
                  <Btn small onClick={() => { settings.setKey(action, DEFAULT_KEYS[action]); force((n) => n + 1); }} disabled={s.keys[action] === DEFAULT_KEYS[action]}>Reset</Btn>
                </div>
              ))}
              {binding && <div className="menu-text small">Press a key or mouse button for "{KEY_LABELS[binding]}" (Esc to cancel)</div>}
            </div>
          </>
        )}
        {page === 'packs' && (
          <>
            <div className="menu-text small settings-note">
              Load a <b>Minecraft resource pack</b> (.zip or .mcpack — e.g. Faithful) and its textures replace FABLE's built-in art everywhere: blocks in the world, items in the hotbar, inventory and your hand, and mob skins on the creatures around you. Mob-only packs (such as Fresh Animations) work too — they recolour FABLE's creatures. The pack is saved in your browser and re-applies on reload.
            </div>
            <div className="settings-grid">
              <label className="mc-btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <input type="file" accept=".zip,.mcpack,application/zip" style={{ display: 'none' }} onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  setPackMsg('Loading ' + f.name + '...');
                  try {
                    const r = await loadResourcePack(f);
                    const parts = [];
                    if (r.tiles) parts.push(r.tiles + ' block textures');
                    if (r.items) parts.push(r.items + ' item textures');
                    if (r.mobs) parts.push(r.mobs + ' mob skins');
                    setPackMsg(r.name + ': ' + parts.join(', '));
                    force((n) => n + 1);
                  } catch (err) {
                    setPackMsg('Failed: ' + (err instanceof Error ? err.message : 'unreadable file'));
                  }
                  audio.play('ui');
                }} />
                {s.resourcePack ? 'Replace Pack...' : 'Load Pack (.zip / .mcpack)...'}
              </label>
              <Btn disabled={!s.resourcePack} onClick={async () => { await clearResourcePack(); setPackMsg('Pack removed — built-in art restored.'); force((n) => n + 1); }}>Clear Pack</Btn>
            </div>
            <div className={'menu-text small' + (packMsg ? '' : ' muted')}>{packMsg || (s.resourcePack ? 'Loaded: ' + s.resourcePack : 'No pack loaded.')}</div>
          </>
        )}
        {page === 'language' && (
          <div className="lang-list">
            {Object.entries(LANGUAGES).map(([code, l]) => (
              <Btn key={code} className={code === s.language ? 'mc-btn-active' : undefined} onClick={() => { settings.set('language', code); force((n) => n + 1); }}>{l.name}</Btn>
            ))}
          </div>
        )}
        {page === 'accessibility' && (
          <div className="settings-grid">
            <Slider label="Crosshair Size" value={s.crosshairSize} min={0.5} max={2} step={0.1} onChange={(v) => set('crosshairSize', v)} format={(v) => v.toFixed(1) + 'x'} />
            <Slider label="Crosshair Opacity" value={s.crosshairOpacity} min={0.2} max={1} step={0.05} onChange={(v) => set('crosshairOpacity', v)} format={pct} />
            <Cycle label="Crosshair Color" value={s.crosshairColor} options={['#ffffff', '#ffff00', '#00ff88', '#ff4444', '#44aaff', '#000000']} labels={{ '#ffffff': 'White', '#ffff00': 'Yellow', '#00ff88': 'Green', '#ff4444': 'Red', '#44aaff': 'Blue', '#000000': 'Black' }} onChange={(v) => set('crosshairColor', v)} />
            <Toggle label="Motion Effects" value={s.motionEffects} onChange={(v) => set('motionEffects', v)} on={t('on')} off={t('off')} />
            <Toggle label="Camera Shake" value={s.cameraShake} onChange={(v) => set('cameraShake', v)} on={t('on')} off={t('off')} />
            <Toggle label="View Bobbing" value={s.viewBobbing} onChange={(v) => set('viewBobbing', v)} on={t('on')} off={t('off')} />
            <Toggle label="Reduced Flashing" value={s.reducedFlashing} onChange={(v) => set('reducedFlashing', v)} on={t('on')} off={t('off')} />
            <Toggle label="Block Outline" value={s.highContrastOutline} onChange={(v) => set('highContrastOutline', v)} on="White" off="Black" />
            <Slider label="GUI Scale" value={s.uiScale} min={0.6} max={1.6} step={0.1} onChange={(v) => set('uiScale', v)} format={(v) => v.toFixed(1) + 'x'} />
            <Slider label="Text Size" value={s.textScale} min={0.8} max={1.5} step={0.1} onChange={(v) => set('textScale', v)} format={(v) => v.toFixed(1) + 'x'} />
            <label className="mc-input-wrap"><span className="mc-input-label">Player Name</span>
              <input className="mc-input" value={s.playerName} maxLength={16} onChange={(e) => set('playerName', e.target.value)} onKeyDown={(e) => e.stopPropagation()} onKeyUp={(e) => e.stopPropagation()} />
            </label>
          </div>
        )}
      </div>
      <div className="menu-bottom">
        <div className="menu-row"><Btn onClick={done}>{t('done')}</Btn></div>
      </div>
    </div>
  );
}

type ShaderPreset = 'off' | 'lite' | 'full' | 'custom';
const SHADER_KEYS = ['shaderWaving', 'shaderWater', 'shaderGrade', 'shaderSunlight', 'shaderGodrays', 'shaderBloom', 'shaderVignette'] as const;
const LITE: Record<(typeof SHADER_KEYS)[number], boolean> = { shaderWaving: true, shaderWater: true, shaderGrade: false, shaderSunlight: true, shaderGodrays: false, shaderBloom: false, shaderVignette: false };

function shaderPresetOf(s: Settings): ShaderPreset {
  if (!s.shaders) return 'off';
  if (SHADER_KEYS.every((k) => s[k])) return 'full';
  if (SHADER_KEYS.every((k) => s[k] === LITE[k])) return 'lite';
  return 'custom';
}

function applyShaderPreset(p: ShaderPreset, set: <K extends keyof Settings>(k: K, v: Settings[K]) => void): void {
  if (p === 'off') { set('shaders', false); return; }
  set('shaders', true);
  if (p === 'full') for (const k of SHADER_KEYS) set(k, true);
  else if (p === 'lite') for (const k of SHADER_KEYS) set(k, LITE[k]);
}

/** The player's full 64x64 skin sheet, painted pixel-exact on a checkerboard so transparency shows.
 * Shows the uploaded file, or the built-in preset's own sheet when one is equipped. */
function FlatSkinPreview({ url }: { url: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    let dead = false;
    void prepareSkinCanvas(url).then(() => {
      if (dead) return;
      // Render at the panel's real device resolution (128 CSS px x dpr) and scale once with
      // smoothing off, so the 64x64 sheet is pixel-exact at 1080p rather than compositor-stretched.
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const px = Math.round(128 * dpr);
      cv.width = px; cv.height = px;
      const g = cv.getContext('2d');
      if (!g) return;
      const block = px / 8; // 8 CSS px of checkerboard
      for (let y = 0; y < px; y += block) for (let x = 0; x < px; x += block) {
        g.fillStyle = ((x / block + y / block) % 2 === 0) ? '#c8cede' : '#8d97ab';
        g.fillRect(x, y, block, block);
      }
      const baked = url ? getSkinCanvas(url) : activeSkinCanvas();
      if (baked) {
        g.imageSmoothingEnabled = false;
        g.drawImage(baked, 0, 0, px, px);
      }
    });
    return () => { dead = true; };
  }, [url, activeSkinKey()]);
  return <canvas ref={ref} width={128} height={128} className="skin-flat" aria-label="full skin sheet preview" />;
}
