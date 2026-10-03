import React, { useEffect, useState } from 'react';
import { DIMENSIONS } from '../game/world/Dimensions';
import { Btn, TextInput, Cycle, Toggle, Confirm } from './components';
import { store, useStore } from './store';
import { SaveManager, type WorldSummary } from '../game/save/SaveManager';
import { t, LANGUAGES, settings } from '../game/core/Settings';
import { MARKET_LANGUAGES, MARKET_LANGUAGE_CODES, mt } from './market-i18n';
import type { Difficulty, GameMode, WorldType } from '../game/core/types';
import { createWorld, joinServer, loadWorld } from './session';
import { Logo } from './Logo';
import { GAME_TITLE, GAME_VERSION, GAME_TAGLINE } from '../game/core/brand';
import { fullscreenSupported, isFullscreen, onFullscreenChange, toggleFullscreen } from './fullscreen';

export const GAME_NAME = GAME_TITLE;
export const VERSION = `${GAME_TITLE} ${GAME_VERSION}`;

export function MainMenu() {
  const splash = useStore((s) => s.splash);
  const error = useStore((s) => s.error);
  const [fs, setFs] = useState(isFullscreen());
  useEffect(() => onFullscreenChange(setFs), []);
  return (
    <div className="menu-screen">
      <div className="menu-center main-menu">
        <div className="logo-wrap">
          <Logo text="FABLE" className="logo" animated />
          <div className="logo-sub">{GAME_TAGLINE}</div>
          <span className="splash">{splash}</span>
        </div>
        {error && <div className="menu-error" onClick={() => store.set({ error: null })}>{error}</div>}
        <div className="menu-list">
          <Btn onClick={() => store.goto('singleplayer')}>{t('singleplayer')}</Btn>
          <Btn onClick={() => store.goto('multiplayer')}>{t('multiplayer')}</Btn>
          <Btn onClick={() => store.goto('marketplace')}>{mt('marketplace')}</Btn>
          <Btn onClick={() => store.goto('credits')}>{t('credits')}</Btn>
          <div className="menu-gap" />
          <div className="menu-row">
            <Btn className="mc-btn-icon" onClick={() => store.goto('language')} aria-label={t('language')} title={t('language')}>
              <GlobeIcon />
            </Btn>
            <Btn onClick={() => store.goto('settings')}>{t('options')}</Btn>
            <Btn onClick={quitGame}>{t('quit')}</Btn>
            {fullscreenSupported() && (
              <Btn className="mc-btn-icon" onClick={() => { void toggleFullscreen(); }} aria-label={fs ? 'Exit fullscreen' : 'Fullscreen'} title={fs ? 'Exit fullscreen (F11)' : 'Fullscreen (F11)'}>
                <FullscreenIcon exit={fs} />
              </Btn>
            )}
          </div>
        </div>
        <div className="menu-footer">
          <span>{VERSION}</span>
          <span>{fullscreenSupported() ? 'F11 fullscreen. Runs entirely in your browser.' : 'Runs entirely in your browser.'}</span>
        </div>
      </div>
    </div>
  );
}

/** Browsers only let a page close itself if it opened the tab; otherwise tell the player how to leave. */
function quitGame(): void {
  window.close();
  setTimeout(() => { if (!window.closed) store.set({ error: 'Close this browser tab to quit the game.' }); }, 150);
}

/** 16x16 pixel globe, like the language button on the title screen. */
function GlobeIcon() {
  const rows = [
    '.....XXXXXX.....', '...XXggggggXX...', '..XgggbbgggggX..', '.XggbbbbbggggbX.', '.XgbbbbbbgggbbX.', 'XggbbbbbggggbbbX', 'XgggbbbggggbbbbX', 'XggggggggggbbggX',
    'XgggggggbbbbgggX', 'XggggggbbbbbbggX', 'XgggggbbbbbbgggX', '.XggggbbbbbgggX.', '.XgggggbbbggggX.', '..XgggggggggXX..', '...XXggggggXX...', '.....XXXXXX.....',
  ];
  const col: Record<string, string> = { X: '#1b1b1b', g: '#3fa34d', b: '#3c7bd8' };
  const rects: string[] = [];
  rows.forEach((r, y) => { for (let x = 0; x < 16; x++) if (col[r[x]]) rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${col[r[x]]}"/>`); });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${rects.join('')}</svg>`;
  return <img alt="" draggable={false} width={20} height={20} src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} />;
}

function FullscreenIcon({ exit }: { exit: boolean }) {
  // four corner brackets pointing out (enter) or in (exit); drawn on the same 16-px grid as the globe
  const rows = exit
    ? ['................', '.XXXXX....XXXXX.', '.X..X......X..X.', '.X.XX......XX.X.', '.XXX........XXX.', '................', '................', '................', '................', '................', '................', '.XXX........XXX.', '.X.XX......XX.X.', '.X..X......X..X.', '.XXXXX....XXXXX.', '................']
    : ['................', '.XXXXX....XXXXX.', '.XXX........XXX.', '.X.XX......XX.X.', '.X..X......X..X.', '.X............X.', '................', '................', '................', '................', '.X............X.', '.X..X......X..X.', '.X.XX......XX.X.', '.XXX........XXX.', '.XXXXX....XXXXX.', '................'];
  const rects: string[] = [];
  rows.forEach((r, y) => { for (let x = 0; x < 16; x++) if (r[x] === 'X') rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="#e8e8e8"/><rect x="${x + 0.5}" y="${y + 0.5}" width="1" height="1" fill="#1b1b1b" opacity="0.6"/>`); });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${rects.join('')}</svg>`;
  return <img alt="" draggable={false} width={20} height={20} src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} />;
}

function fmtPlayTime(s: number): string {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function SinglePlayer() {
  const [worlds, setWorlds] = useState<WorldSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  // worlds arrive sorted newest-first; pre-select the most recent so "Play Selected World" is ready
  const refresh = () => SaveManager.list().then((list) => { setWorlds(list); setSelected((cur) => cur ?? list[0]?.id ?? null); });
  useEffect(() => { refresh(); }, []);
  const sel = worlds?.find((w) => w.id === selected);

  const play = async (id: string) => { if (busy) return; setBusy(true); await loadWorld(id); setBusy(false); };

  if (confirmDelete && sel) {
    return <Confirm title={`${t('delete')} '${sel.name}'?`} text="This world will be lost forever! (A long time!)" yes={t('delete')} no={t('cancel')}
      onYes={async () => { await SaveManager.delete(sel.id); setConfirmDelete(false); setSelected(null); refresh(); }} onNo={() => setConfirmDelete(false)} />;
  }

  return (
    <div className="menu-screen dirt-bg list-screen">
      <div className="menu-header">{t('select_world')}</div>
      <div className="world-list-wrap">
      <div className="world-list">
        {worlds === null && <div className="menu-text muted">{t('loading')}</div>}
        {worlds?.length === 0 && <div className="menu-text muted">{t('no_worlds')}</div>}
        {worlds?.map((w) => (
          <div key={w.id} className={'world-entry' + (selected === w.id ? ' world-selected' : '')} onClick={() => setSelected(w.id)} onDoubleClick={() => play(w.id)}>
            <div className="world-icon">{w.preview ? <img src={w.preview} alt="" draggable={false} /> : <div className="world-icon-blank" />}</div>
            <div className="world-info">
              <div className={'world-name' + (w.mode === 'hardcore' ? ' hc' : '')}>{w.name}</div>
              <div className="world-meta">{t('last_played')}: {new Date(w.lastPlayed).toLocaleString()} · {t(w.mode)} · {t(w.difficulty)}</div>
              <div className="world-meta muted">{t('seed')}: {w.seedText} · Day {w.day + 1} · {fmtPlayTime(w.playTime)} · {w.worldType}</div>
            </div>
          </div>
        ))}
      </div>
      </div>
      {renaming && sel && (
        <div className="menu-row" style={{ justifyContent: 'center' }}>
          <TextInput value={newName} onChange={setNewName} autoFocus maxLength={32} onEnter={async () => { await SaveManager.rename(sel.id, newName.trim() || sel.name); setRenaming(false); refresh(); }} />
          <Btn small onClick={async () => { await SaveManager.rename(sel.id, newName.trim() || sel.name); setRenaming(false); refresh(); }}>{t('done')}</Btn>
          <Btn small onClick={() => setRenaming(false)}>{t('cancel')}</Btn>
        </div>
      )}
      <div className="menu-bottom">
        <div className="menu-row">
          <Btn disabled={!sel || busy} onClick={() => sel && play(sel.id)}>{t('play_selected')}</Btn>
          <Btn onClick={() => store.goto('create')}>{t('create_world')}</Btn>
        </div>
        <div className="menu-row">
          <Btn small disabled={!sel} onClick={() => { if (sel) { setNewName(sel.name); setRenaming(true); } }}>{t('rename')}</Btn>
          <Btn small disabled={!sel} onClick={() => setConfirmDelete(true)} danger>{t('delete')}</Btn>
          <Btn small disabled={!sel} onClick={async () => {
            if (!sel) return; const json = await SaveManager.exportWorld(sel.id); if (!json) return;
            const blob = new Blob([json], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${sel.name.replace(/[^a-z0-9_-]+/gi, '_')}.mcwe.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          }}>Export</Btn>
          <Btn small onClick={() => {
            const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
            inp.onchange = async () => { const f = inp.files?.[0]; if (!f) return; const w = await SaveManager.importWorld(await f.text()); if (!w) store.set({ error: `Not a valid ${GAME_TITLE} world file.` }); refresh(); };
            inp.click();
          }}>Import</Btn>
          <Btn small onClick={() => store.goto('menu')}>{t('cancel')}</Btn>
        </div>
      </div>
    </div>
  );
}

const MODES: GameMode[] = ['survival', 'creative', 'hardcore', 'spectator'];
const DIFFS: Difficulty[] = ['peaceful', 'easy', 'normal', 'hard'];
const TYPES: WorldType[] = ['default', 'flat', 'amplified', 'islands'];
const MODE_DESC: Record<GameMode, string> = {
  survival: 'Gather resources, craft, fight monsters and manage hunger.',
  creative: 'Unlimited blocks, flight, and no damage. Build freely.',
  hardcore: 'One life only: death deletes the world. Locked to Hard difficulty.',
  spectator: 'Fly through the world without interacting with it.',
};
const TYPE_LABELS: Record<WorldType, string> = { default: 'Default', flat: 'Superflat', amplified: 'Amplified', islands: 'Islands' };

export function CreateWorld() {
  const [name, setName] = useState(t('new_world'));
  const [seed, setSeed] = useState('');
  const [mode, setMode] = useState<GameMode>('survival');
  const [diff, setDiff] = useState<Difficulty>('normal');
  const [type, setType] = useState<WorldType>('default');
  const [structures, setStructures] = useState(true);
  const [cheats, setCheats] = useState(false);
  const [bonus, setBonus] = useState(false);
  const [keepInv, setKeepInv] = useState(false);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  // Remember what the player had chosen before switching to Hardcore, so leaving
  // Hardcore restores it (difficulty gets locked to Hard while in Hardcore mode).
  const [prevDiff, setPrevDiff] = useState<Difficulty>('normal');
  const [prevKeep, setPrevKeep] = useState(false);
  const [prevCheats, setPrevCheats] = useState(false);

  const pickMode = (m: GameMode) => {
    if (m === 'hardcore' && mode !== 'hardcore') { setPrevDiff(diff); setPrevKeep(keepInv); setPrevCheats(cheats); setDiff('hard'); setKeepInv(false); setCheats(false); }
    if (mode === 'hardcore' && m !== 'hardcore') { setDiff(prevDiff); setKeepInv(prevKeep); setCheats(prevCheats); }
    setMode(m);
  };

  const create = async () => {
    if (busy) return;
    setBusy(true);
    await createWorld({ name, seedText: seed, mode, difficulty: diff, worldType: type, structures, bonusItems: bonus, keepInventory: keepInv, cheats });
    setBusy(false);
  };

  return (
    <div className="menu-screen dirt-bg">
      <div className="menu-header">{t('create_world')}</div>
      <div className="menu-center menu-scroll">
        <div className="menu-list">
          <TextInput label={t('world_name')} value={name} onChange={setName} maxLength={32} autoFocus />
          <Cycle label={t('game_mode')} value={mode} options={MODES} labels={{ survival: t('survival'), creative: t('creative'), hardcore: t('hardcore'), spectator: t('spectator') }} onChange={pickMode} />
          <div className="menu-text small muted">{MODE_DESC[mode]}</div>
          {mode === 'hardcore'
            ? <Btn disabled onClick={() => undefined}>{t('difficulty')}: {t('hard')} <span className="hardcore-lock">(locked)</span></Btn>
            : <Cycle label={t('difficulty')} value={diff} options={DIFFS} labels={{ peaceful: t('peaceful'), easy: t('easy'), normal: t('normal'), hard: t('hard') }} onChange={setDiff} />}
          {!more && <Btn onClick={() => setMore(true)}>{t('more_options')}</Btn>}
          {more && (
            <>
              <TextInput label={t('seed')} value={seed} onChange={setSeed} placeholder={`${t('random')} – leave blank`} maxLength={64} />
              <Cycle label={t('world_type')} value={type} options={TYPES} labels={TYPE_LABELS} onChange={setType} />
              <Toggle label={t('structures')} value={structures} onChange={setStructures} on={t('on')} off={t('off')} />
              <Toggle label={t('bonus_items')} value={bonus} onChange={setBonus} on={t('on')} off={t('off')} />
              {mode !== 'hardcore' && <Toggle label={t('keep_inventory')} value={keepInv} onChange={setKeepInv} on={t('on')} off={t('off')} />}
              {mode !== 'hardcore' && <Toggle label={t('cheats')} value={cheats} onChange={setCheats} on={t('on')} off={t('off')} />}
            </>
          )}
        </div>
      </div>
      <div className="menu-bottom">
        <div className="menu-row">
          <Btn onClick={create} disabled={busy}>{t('generate')}</Btn>
          <Btn onClick={() => store.goto('singleplayer')}>{t('cancel')}</Btn>
        </div>
      </div>
    </div>
  );
}

export function Multiplayer() {
  const [addr, setAddr] = useState(() => localStorage.getItem('fable.lastServer') ?? '');
  const [name, setName] = useState(settings.value.playerName);
  const [busy, setBusy] = useState(false);
  const error = useStore((s) => s.error);
  const connect = async () => {
    const a = addr.trim();
    if (!a || busy) return;
    settings.set('playerName', name.trim() || 'Player');
    localStorage.setItem('fable.lastServer', a);
    setBusy(true);
    await joinServer(a);
    setBusy(false);
  };
  return (
    <div className="menu-screen dirt-bg">
      <div className="menu-header">{t('multiplayer')}</div>
      <div className="menu-center">
        <div className="menu-list">
          <TextInput label="Player Name" value={name} onChange={setName} maxLength={16} />
          <TextInput label={t('server_address')} value={addr} onChange={setAddr} placeholder="ws://host:port" onEnter={connect} autoFocus />
          {error && <div className="menu-error" onClick={() => store.set({ error: null })}>{error}</div>}
          <div className="menu-text small muted">
            <b>Self-hosted only</b> — there is no matchmaking or public server list. Run your own {GAME_TITLE} server (npm run server) or a friend's, then enter its address. The server is authoritative for blocks, time and other players.
          </div>
        </div>
      </div>
      <div className="menu-bottom">
        <div className="menu-row">
          <Btn onClick={connect} disabled={!addr.trim() || busy}>{busy ? 'Connecting...' : t('direct_connect')}</Btn>
          <Btn onClick={() => { store.set({ error: null }); store.goto('menu'); }}>{t('back')}</Btn>
        </div>
      </div>
    </div>
  );
}

/** Force a re-render after mutating the settings store (used by the language picker). */
function useForce(_initial: number): [number, () => void] {
  const [v, setV] = useState(0);
  return [v, () => setV((n) => n + 1)];
}

export function LanguageScreen() {
  const [, force] = useForce(0);
  const cur = settings.value.language;
  const full = Object.keys(LANGUAGES);
  const extra = MARKET_LANGUAGE_CODES.filter((c) => !full.includes(c));
  const pick = (code: string) => {
    settings.set('language', code);
    force();
  };
  return (
    <div className="menu-screen dirt-bg">
      <div className="menu-header">{t('language')}</div>
      <div className="menu-center menu-scroll">
        <div className="lang-list">
          {full.map((code) => (
            <Btn key={code} className={code === cur ? 'mc-btn-active' : undefined} onClick={() => pick(code)}>{MARKET_LANGUAGES[code]?.native ?? LANGUAGES[code].name}</Btn>
          ))}
        </div>
        <p className="menu-text small muted lang-note">
          More interface languages — the store, cosmetics and options labels are translated; the world menus fall back to
          English until a full dictionary lands.
        </p>
        <div className="lang-list lang-list-extra">
          {extra.map((code) => (
            <Btn key={code} className={code === cur ? 'mc-btn-active' : undefined} onClick={() => pick(code)}>
              <span className="lang-native">{MARKET_LANGUAGES[code].native}</span>
              <span className="lang-tag">UI</span>
            </Btn>
          ))}
        </div>
      </div>
      <div className="menu-bottom">
        <div className="menu-row"><Btn onClick={() => store.back()}>{t('done')}</Btn></div>
      </div>
    </div>
  );
}

export function CreditsScreen() {
  return (
    <div className="menu-screen dirt-bg">
      <div className="menu-header">{t('credits')}</div>
      <div className="menu-center credits">
        <div className="credits-scroll">
          <h2>{GAME_NAME}</h2>
          <p>A voxel sandbox that runs entirely in your browser.</p>
          <p className="muted">An original open-source voxel game. Every texture, sound, font and model is generated or drawn for this project.</p>
          <h3>Engine</h3>
          <p>TypeScript · three.js · React · Vite</p>
          <p>Procedural textures, sounds, terrain, structures and items — no external assets.</p>
          <h3>World</h3>
          <p>Simplex-noise continents, rivers, 20 biomes, caves, ores, villages, temples, towers, shipwrecks and dungeons.</p>
          <p>{DIMENSIONS.overworld.name} above, {DIMENSIONS.void.name} beyond the portal. Beware the Wyrm.</p>
          <h3>Controls</h3>
          <p>WASD move · Space jump · Ctrl sprint (or double-tap W) · Shift sneak · E inventory · Q drop · T chat · F3 debug · Esc pause</p>
          <p>Double-tap Space to fly in Creative.</p>
          <h3>Typeface</h3>
          <p>Fable Pixel, an original 8-px pixel font made for this game (SIL Open Font License 1.1).</p>
          <h3>Thanks for playing!</h3>
        </div>
      </div>
      <div className="menu-bottom">
        <div className="menu-row"><Btn onClick={() => store.goto('menu')}>{t('back')}</Btn></div>
      </div>
    </div>
  );
}
