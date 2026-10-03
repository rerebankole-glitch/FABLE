import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SKIN_PRESETS, builtinSkinCanvas, customAvatarSkinCanvas, presetById, type SkinPreset } from '../game/core/Skins';
import { HEADWEAR_ITEMS, getHeadwearById, type HeadwearItem } from '../game/core/Headwear';
import {
  DEFAULT_SHADER_ADDONS,
  validateShaderAddon,
  exportShaderAddonJson,
  applyShaderAddon,
  currentSettingsAsAddon,
  type ShaderAddon,
} from '../game/core/ShaderAddons';
import { settings } from '../game/core/Settings';
import { market, DAILY_COINS, STARTER_COINS, type MarketplaceTheme } from '../game/core/Marketplace';
import { CLIENT_MODS, mods } from '../game/core/ClientMods';
import { FREE_PACKS, installFreePack, freePackFile } from '../game/core/FreePacks';
import { PresetFigureView } from './PlayerPreview';
import { AvatarFigure, PresetAvatar, PresetFigure, SkinAvatar } from './SkinFigure';
import { Btn } from './components';
import { StoreIcon } from './StoreIcon';
import { SaveManager, type WorldSummary } from '../game/save/SaveManager';
import { loadSkinFile, getSkinCanvas } from '../game/core/SkinTexture';
import { store } from './store';
import { currentGame } from './session';
import { audio } from '../game/audio/Audio';
import { mt, mn, MARKET_LANGUAGES, marketLang } from './market-i18n';

type Category = 'skins' | 'dressing' | 'packs' | 'shaders' | 'themes' | 'mods' | 'coins';
type Filter = 'all' | 'classic' | 'slim';

const heroImage = new URL('../../site/assets/shot-overworld.webp', import.meta.url).href;
const spotImages = [
  new URL('../../site/assets/shot-night.webp', import.meta.url).href,
  new URL('../../site/assets/shot-sunset.webp', import.meta.url).href,
  new URL('../../site/assets/shot-creative.webp', import.meta.url).href,
  new URL('../../site/assets/shot-mining.webp', import.meta.url).href,
];

const skinCost = (p: SkinPreset) => (p.id === 'stargazer' || p.id === 'tinkerer' ? 12 : 0);
/** Storefront badges. Kept declarative (id -> badge) so new presets are tagged in one place. */
const SKIN_BADGES: Record<string, 'new' | 'popular'> = {
  nightfall: 'new', cinder: 'new', stargazer: 'popular', tinkerer: 'popular',
};

// Dressing-room palettes. Trimmed to twelve well-spaced tones per slot so the swatch rows stay
// scannable instead of wrapping into three rows of near-identical colours.
const SKIN_TONES = ['#f6d3b0', '#e8b98c', '#d8a878', '#c68e5c', '#b07040', '#96613a', '#7a4d2e', '#5c3a22', '#c99163', '#8a6a42', '#4a754b', '#5c86ad'];
const HAIR_COLORS = ['#202847', '#241c28', '#5a3a22', '#6a4a2a', '#8a5a30', '#bf382a', '#e6c86e', '#e8f0f8', '#55202f', '#2f3a1f', '#7a6a5a', '#c0c4cc'];
const SHIRT_COLORS = ['#cfd6df', '#9aa0a8', '#292b38', '#3f6f9f', '#4f8fbf', '#2e8f5e', '#3f7f3f', '#cf9b34', '#d8502f', '#c0557f', '#bf7843', '#8952c8'];
const PANTS_COLORS = ['#1b1d24', '#2a2f3a', '#3c4350', '#3b3b5a', '#27335f', '#274060', '#304a3e', '#4a3a28', '#5a4632', '#4a2010', '#552040', '#705436'];

/** Feature rail pages through the catalogue instead of always showing the last four entries. */
const RAIL_SIZE = 4;

/**
 * FABLE Marketplace — a cosmetic store that never touches real money.
 *
 * The layout is a shell (header + category rail + content) with a card grid, a full-height hero,
 * a featured rail and a details sheet. Every skin is drawn with the flat 2.5D renderer
 * (SkinRender) so cards stay crisp at any size; only the opened details sheet spins up WebGL.
 */
export function SkinMarketplace() {
  const [category, setCategory] = useState<Category>('skins');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<SkinPreset>(SKIN_PRESETS.find((p) => p.id === settings.value.skinPreset) ?? SKIN_PRESETS[0]);
  const [search, setSearch] = useState('');
  const [featured, setFeatured] = useState(() => Math.max(0, SKIN_PRESETS.findIndex((p) => p.id === 'stargazer')));
  const [railStart, setRailStart] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [worldShots, setWorldShots] = useState<WorldSummary[]>([]);
  const [uploadError, setUploadError] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  // Dressing room state
  const curSkin = settings.value.skin ?? { skin: '#c68e5c', hair: '#5a3a22', shirt: '#3f6f9f', pants: '#3b3b5a' };
  const [drSkin, setDrSkin] = useState(curSkin.skin);
  const [drHair, setDrHair] = useState(curSkin.hair);
  const [drShirt, setDrShirt] = useState(curSkin.shirt);
  const [drPants, setDrPants] = useState(curSkin.pants);
  const [drSlim, setDrSlim] = useState(!!settings.value.skinSlim);
  const [drHeadwear, setDrHeadwear] = useState(settings.value.headwear || 'none');
  const [drTab, setDrTab] = useState<'colors' | 'headwear' | 'presets'>('colors');

  // Shader add-on state
  const [activeShader, setActiveShader] = useState<ShaderAddon>(() => DEFAULT_SHADER_ADDONS[0]);
  const [shaderJson, setShaderJson] = useState<string>(() => exportShaderAddonJson(DEFAULT_SHADER_ADDONS[0]));
  const [shaderErrors, setShaderErrors] = useState<string[]>([]);
  const [shaderSuccess, setShaderSuccess] = useState<string>('');
  const shaderFileInput = useRef<HTMLInputElement>(null);

  // Free resource packs / client mods
  const [packBusy, setPackBusy] = useState('');
  const [packMsg, setPackMsg] = useState('');
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000); // refresh the daily-gift countdown
    return () => clearInterval(t);
  }, []);
  useEffect(() => mods.subscribe(() => refresh((v) => v + 1)), []);

  const [, refresh] = useState(0);
  useEffect(() => settings.subscribe(() => refresh((v) => v + 1)), []);
  useEffect(() => market.subscribe(() => refresh((v) => v + 1)), []);
  useEffect(() => {
    let alive = true;
    void SaveManager.list()
      .then((worlds) => {
        if (alive) setWorldShots(worlds.filter((w) => !!w.preview));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (detailsOpen) setDetailsOpen(false);
        else store.goto('menu');
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [detailsOpen]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const installPack = async (id: string) => {
    const pack = FREE_PACKS.find((p) => p.id === id);
    if (!pack || packBusy) return;
    setPackBusy(id);
    setPackMsg('');
    try {
      const res = await installFreePack(pack);
      setPackMsg(`Installed ${res.name} — ${res.tiles} block + ${res.items} item textures applied live.`);
      showToast(`Installed ${pack.name}!`);
    } catch (e) {
      setPackMsg(e instanceof Error ? e.message : 'Could not install that pack.');
    } finally {
      setPackBusy('');
    }
  };

  const downloadPack = async (id: string) => {
    const pack = FREE_PACKS.find((p) => p.id === id);
    if (!pack) return;
    const file = await freePackFile(pack);
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`Saved ${file.name}`);
  };

  const fmtWait = (ms: number) => {
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  // world captures decorate the hero only — card art is always the skin itself
  const shot = (index: number) =>
    (worldShots.length ? worldShots[index % worldShots.length]?.preview : undefined) || spotImages[index % spotImages.length];
  const ownedSkin = (p: SkinPreset) => !skinCost(p) || market.owns('skin:' + p.id);
  const ownedHeadwear = (h: HeadwearItem) => h.cost === 0 || market.owns('headwear:' + h.id);
  const equippedSkin = !settings.value.skinUrl && settings.value.skinPreset === selected.id;

  const filtered = useMemo(
    () =>
      SKIN_PRESETS.filter(
        (p) => p.name.toLowerCase().includes(search.trim().toLowerCase()) && (filter === 'all' || !!p.slim === (filter === 'slim'))
      ),
    [search, filter]
  );

  const featuredPreset = SKIN_PRESETS[featured % SKIN_PRESETS.length];
  const rail = useMemo(
    () => Array.from({ length: RAIL_SIZE }, (_, i) => SKIN_PRESETS[(railStart + i) % SKIN_PRESETS.length]),
    [railStart]
  );

  // header avatar: the skin that is actually equipped right now (uploaded sheet or preset)
  const equippedSheet = useMemo(() => {
    if (settings.value.skinUrl) {
      const uploaded = getSkinCanvas(settings.value.skinUrl);
      if (uploaded) return { sheet: uploaded as CanvasImageSource, key: settings.value.skinUrl.slice(-32) };
    }
    const p = presetById(settings.value.skinPreset);
    return { sheet: builtinSkinCanvas(p) as CanvasImageSource | null, key: p.id };
    // re-evaluated whenever settings change: the component re-renders on every settings update
  }, [settings.value.skinUrl, settings.value.skinPreset]);

  const equipSkin = (preset: SkinPreset = selected) => {
    if (!ownedSkin(preset) && !market.buy('skin:' + preset.id, skinCost(preset))) {
      showToast(mt('not_enough_coins'));
      return;
    }
    settings.set('skinUrl', '');
    settings.set('skinSlim', !!preset.slim);
    settings.set('skinPreset', preset.id);
    settings.set('skin', { skin: preset.skin, hair: preset.hair, shirt: preset.shirt, pants: preset.pants });
    showToast(`${mt('equipped')}: ${preset.name}`);
  };

  const openDetails = (preset: SkinPreset) => {
    setSelected(preset);
    setDetailsOpen(true);
  };

  const uploadSkin = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const result = await loadSkinFile(file);
      if (!result.ok) {
        setUploadError(result.error);
        return;
      }
      settings.set('skinUrl', result.skin.url);
      settings.set('skinSlim', result.skin.slim);
      settings.set('skinPreset', 'custom');
      showToast('Custom skin imported!');
    } catch {
      setUploadError('Could not import that skin image.');
    } finally {
      setUploading(false);
    }
  };

  const downloadSkin = (preset: SkinPreset) => {
    const canvas = builtinSkinCanvas(preset);
    if (!canvas) return;
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `fable-${preset.id}-skin.png`;
    link.click();
  };

  // Dressing room actions
  const dressingColors = { skin: drSkin, hair: drHair, shirt: drShirt, pants: drPants };

  const saveEquipDressing = () => {
    settings.set('skin', { skin: drSkin, hair: drHair, shirt: drShirt, pants: drPants });
    settings.set('skinSlim', drSlim);
    settings.set('skinUrl', '');
    settings.set('skinPreset', 'custom');
    settings.set('headwear', drHeadwear);
    showToast('Custom avatar saved and equipped!');
  };

  const downloadDressingPng = () => {
    const canvas = customAvatarSkinCanvas(drSkin, drHair, drShirt, drPants, drSlim, drHeadwear);
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = 'fable-custom-avatar.png';
    link.click();
  };

  const resetDressingDefaults = () => {
    const s = SKIN_PRESETS[0];
    setDrSkin(s.skin);
    setDrHair(s.hair);
    setDrShirt(s.shirt);
    setDrPants(s.pants);
    setDrSlim(false);
    setDrHeadwear('none');
    showToast('Reset to Classic avatar');
  };

  const randomizeDressing = () => {
    const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
    setDrSkin(pick(SKIN_TONES));
    setDrHair(pick(HAIR_COLORS));
    setDrShirt(pick(SHIRT_COLORS));
    setDrPants(pick(PANTS_COLORS));
    setDrSlim(Math.random() < 0.35);
  };

  const loadPresetIntoDressing = (p: SkinPreset) => {
    setDrSkin(p.skin);
    setDrHair(p.hair);
    setDrShirt(p.shirt);
    setDrPants(p.pants);
    setDrSlim(!!p.slim);
    showToast(`Loaded ${p.name} palette`);
  };

  const buyOrEquipHeadwear = (h: HeadwearItem) => {
    if (!ownedHeadwear(h)) {
      if (!market.buy('headwear:' + h.id, h.cost)) {
        showToast(mt('not_enough_coins'));
        return;
      }
      showToast(`Unlocked ${h.name}!`);
    }
    setDrHeadwear(h.id);
  };

  // Shader actions
  const selectShaderPreset = (addon: ShaderAddon) => {
    setActiveShader(addon);
    setShaderJson(exportShaderAddonJson(addon));
    setShaderErrors([]);
    setShaderSuccess('');
  };

  const handleApplyShader = () => {
    const validated = validateShaderAddon(JSON.parse(shaderJson));
    if (!validated.ok) {
      setShaderErrors(validated.errors);
      setShaderSuccess('');
      return;
    }
    setShaderErrors([]);
    applyShaderAddon(validated.addon, currentGame());
    setShaderSuccess(`Applied "${validated.addon.name}" to game!`);
    showToast(`Applied ${validated.addon.name}!`);
  };

  const handleShaderTextChange = (text: string) => {
    setShaderJson(text);
    try {
      const parsed = JSON.parse(text);
      const res = validateShaderAddon(parsed);
      if (res.ok) {
        setActiveShader(res.addon);
        setShaderErrors([]);
      } else {
        setShaderErrors(res.errors);
      }
    } catch (e) {
      setShaderErrors(['Syntax error: ' + (e instanceof Error ? e.message : String(e))]);
    }
  };

  const handleShaderFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        handleShaderTextChange(reader.result);
      }
    };
    reader.readAsText(f);
  };

  const handleExportShader = () => {
    const blob = new Blob([shaderJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeShader.id || 'shader'}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const updateActiveShaderField = <K extends keyof ShaderAddon['features']>(key: K, val: boolean) => {
    const updated: ShaderAddon = {
      ...activeShader,
      features: { ...activeShader.features, [key]: val },
    };
    setActiveShader(updated);
    setShaderJson(exportShaderAddonJson(updated));
    setShaderErrors([]);
  };

  const updateActiveShaderTuning = <K extends keyof ShaderAddon['tuning']>(key: K, val: number) => {
    const updated: ShaderAddon = {
      ...activeShader,
      tuning: { ...activeShader.tuning, [key]: val },
    };
    setActiveShader(updated);
    setShaderJson(exportShaderAddonJson(updated));
    setShaderErrors([]);
  };

  const priceOf = (p: SkinPreset) =>
    skinCost(p) ? (
      <>
        <StoreIcon name="coin" size={14} /> {mn(skinCost(p))}
      </>
    ) : (
      mt('free')
    );

  const stateChip = (p: SkinPreset) =>
    !settings.value.skinUrl && settings.value.skinPreset === p.id ? mt('equipped') : ownedSkin(p) && skinCost(p) ? mt('owned') : null;

  const navItems: { id: Category; icon: React.ComponentProps<typeof StoreIcon>['name']; label: string; badge?: string; badgeKind?: string }[] = [
    { id: 'skins', icon: 'skin', label: mt('nav_skins'), badge: String(SKIN_PRESETS.length) },
    { id: 'dressing', icon: 'dressing', label: mt('nav_dressing'), badge: mt('new'), badgeKind: 'warm' },
    { id: 'packs', icon: 'pack', label: mt('nav_packs'), badge: `${FREE_PACKS.length} ${mt('free')}`, badgeKind: 'cool' },
    { id: 'shaders', icon: 'shader', label: mt('nav_shaders'), badge: 'JSON' },
    { id: 'mods', icon: 'mod', label: mt('nav_mods'), badge: mt('free'), badgeKind: 'cool' },
    { id: 'themes', icon: 'theme', label: mt('nav_themes') },
    { id: 'coins', icon: 'coin', label: mt('nav_coins') },
  ];

  return (
    <div
      className="menu-screen mk"
      data-theme={market.value.theme}
      onClick={(e) => {
        // Btn already plays click and stops the event. Raw store buttons do not.
        const el = (e.target as HTMLElement).closest('button, a, .mk-spot');
        if (!el) return;
        audio.init();
        audio.play('click', { volume: 0.45 });
      }}
    >
      <header className="mk-top">
        <button type="button" className="mk-icon-btn" onClick={() => store.goto('menu')} aria-label={mt('back')} title={mt('back')}>
          <StoreIcon name="back" size={18} />
        </button>
        <div className="mk-brand">
          <span className="mk-brand-mark" aria-hidden="true">F</span>
          <span className="mk-brand-text">
            <strong>{mt('marketplace')}</strong>
            <small>FABLE</small>
          </span>
        </div>

        <label className="mk-search">
          <StoreIcon name="search" size={16} />
          <input
            aria-label={mt('search_placeholder')}
            placeholder={mt('search_placeholder')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCategory('skins');
            }}
          />
          {!!search && (
            <button type="button" className="mk-search-clear" onClick={() => setSearch('')} aria-label="Clear search">
              <StoreIcon name="close" size={14} />
            </button>
          )}
        </label>

        <div className="mk-top-right">
          <button
            type="button"
            className="mk-coins"
            onClick={() => {
              setCategory('coins');
              setDetailsOpen(false);
            }}
            title={mt('nav_coins')}
          >
            {equippedSheet.sheet && <SkinAvatar sheet={equippedSheet.sheet} cacheKey={equippedSheet.key} size={26} className="mk-coins-avatar" />}
            <span className="mk-coins-value">{mn(market.value.coins)}</span>
            <span className="mk-coins-label">{mt('fable_coins')}</span>
            <span className="mk-coins-plus">{mt('free_claims')}</span>
          </button>
          <Btn small className="mk-done" onClick={() => store.goto('menu')}>{mt('done')}</Btn>
        </div>
      </header>

      <div className="mk-body">
        <aside className="mk-rail" aria-label={mt('marketplace')}>
          <nav className="mk-nav">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={'mk-nav-item' + (category === item.id ? ' active' : '')}
                aria-current={category === item.id}
                onClick={() => {
                  setCategory(item.id);
                  setDetailsOpen(false);
                }}
              >
                <span className="mk-nav-icon"><StoreIcon name={item.icon} size={19} /></span>
                <span className="mk-nav-label">{item.label}</span>
                {item.badge && <span className={'mk-badge' + (item.badgeKind ? ' ' + item.badgeKind : '')}>{item.badge}</span>}
              </button>
            ))}
          </nav>

          <div className="mk-rail-foot">
            <div className="mk-balance-card">
              <div className="mk-balance-head">
                <StoreIcon name="coin" size={18} />
                <span>{mt('available_balance')}</span>
              </div>
              <strong>{mn(market.value.coins)}</strong>
              <button
                type="button"
                className="mk-balance-cta"
                onClick={() => {
                  setCategory('coins');
                  setDetailsOpen(false);
                }}
              >
                {mt('free_claims')} →
              </button>
            </div>
            <button type="button" className="mk-lang-btn" onClick={() => store.goto('language')} title={mt('language')}>
              <StoreIcon name="world" size={15} />
              <span>{MARKET_LANGUAGES[marketLang()]?.native ?? 'English'}</span>
              <StoreIcon name="right" size={13} />
            </button>
            <p className="mk-credits">Original FABLE cosmetics · Local unlocks · No real-money purchases</p>
          </div>
        </aside>

        <main className="mk-main">
          {toastMsg && <div className="mk-toast">{toastMsg}</div>}

          {/* ---------------------------------------------------------------- SKINS */}
          {category === 'skins' && (
            <>
              <section className="mk-hero-row">
                <article
                  className="mk-hero"
                  style={{ backgroundImage: `linear-gradient(90deg, rgba(9,10,14,0.92) 8%, rgba(9,10,14,0.45) 52%, rgba(9,10,14,0.86)), url(${worldShots[0]?.preview || heroImage})` }}
                >
                  <div className="mk-hero-copy">
                    <span className="mk-tag warm">{mt('featured')}</span>
                    <h1>{featuredPreset.name}</h1>
                    <p>{mt('original_skin')}</p>
                    <div className="mk-hero-buy">
                      <span className="mk-price">{priceOf(featuredPreset)}</span>
                      <Btn small onClick={() => equipSkin(featuredPreset)}>
                        {ownedSkin(featuredPreset) ? mt('equip') : mt('unlock_equip')}
                      </Btn>
                      <button type="button" className="mk-ghost-btn" onClick={() => openDetails(featuredPreset)}>
                        View 3D →
                      </button>
                    </div>
                  </div>
                  <div className="mk-hero-figure">
                    <PresetFigure preset={featuredPreset} height={252} label={`${featuredPreset.name} preview`} />
                  </div>
                  <div className="mk-hero-dots" role="group" aria-label={mt('featured')}>
                    {SKIN_PRESETS.map((p, i) => (
                      <button
                        key={p.id}
                        type="button"
                        className={featured % SKIN_PRESETS.length === i ? 'active' : ''}
                        aria-label={p.name}
                        onClick={() => setFeatured(i)}
                      />
                    ))}
                  </div>
                </article>

                <div className="mk-spot-column">
                  <div className="mk-spot-head">
                    <span>{mt('new_and_featured')}</span>
                    <div className="mk-spot-arrows">
                      <button type="button" aria-label="Previous" onClick={() => setFeatured((f) => (f + SKIN_PRESETS.length - 1) % SKIN_PRESETS.length)}>
                        <StoreIcon name="left" size={16} />
                      </button>
                      <button type="button" aria-label="Next" onClick={() => setFeatured((f) => (f + 1) % SKIN_PRESETS.length)}>
                        <StoreIcon name="right" size={16} />
                      </button>
                    </div>
                  </div>
                  {[1, 2, 3].map((offset) => {
                    const p = SKIN_PRESETS[(featured + offset) % SKIN_PRESETS.length];
                    return (
                      <button key={p.id} type="button" className="mk-spot" onClick={() => openDetails(p)}>
                        <span className="mk-spot-art" style={{ backgroundImage: `url(${shot(offset - 1)})` }}>
                          <PresetAvatar preset={p} size={44} />
                        </span>
                        <span className="mk-spot-copy">
                          <strong>{p.name}</strong>
                          <small>{mt('original_skin')}</small>
                        </span>
                        <span className="mk-spot-price">{priceOf(p)}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="mk-section">
                <header className="mk-section-head">
                  <h2>{mt('new_and_featured')}</h2>
                  <div className="mk-section-actions">
                    <span className="mk-counter">
                      {`${mn((railStart % SKIN_PRESETS.length) + 1)}–${mn(((railStart + RAIL_SIZE - 1) % SKIN_PRESETS.length) + 1)} / ${mn(SKIN_PRESETS.length)}`}
                    </span>
                    <button type="button" className="mk-round-btn" aria-label="Previous" onClick={() => setRailStart((r) => (r + SKIN_PRESETS.length - 1) % SKIN_PRESETS.length)}>
                      <StoreIcon name="left" size={16} />
                    </button>
                    <button type="button" className="mk-round-btn" aria-label="Next" onClick={() => setRailStart((r) => (r + 1) % SKIN_PRESETS.length)}>
                      <StoreIcon name="right" size={16} />
                    </button>
                  </div>
                </header>
                <div className="mk-rail-cards">
                  {rail.map((p) => (
                    <button key={p.id} type="button" className="mk-rail-card" onClick={() => openDetails(p)}>
                      <span className="mk-rail-art" style={{ backgroundImage: `url(${shot(SKIN_PRESETS.indexOf(p))})` }}>
                        <PresetFigure preset={p} height={126} />
                      </span>
                      <strong>{p.name}</strong>
                      <span className="mk-rail-meta">
                        <small>{p.slim ? mt('slim') : mt('classic')}</small>
                        <span className="mk-price">{priceOf(p)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="mk-section">
                <div className="mk-toolbar">
                  <div className="mk-filters" role="group" aria-label={mt('skins')}>
                    {(['all', 'classic', 'slim'] as Filter[]).map((f) => (
                      <button key={f} type="button" className={filter === f ? 'active' : ''} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                        {mt(f)}
                      </button>
                    ))}
                  </div>
                  <span className="mk-count">{mn(filtered.length)} {mt('skins')}</span>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/png,image/jpeg"
                    className="mk-file"
                    aria-label={mt('import_skin')}
                    onChange={(e) => {
                      void uploadSkin(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                  <Btn small className="mk-import" disabled={uploading} onClick={() => fileInput.current?.click()}>
                    <StoreIcon name="upload" size={15} /> {uploading ? '…' : mt('import_skin')}
                  </Btn>
                </div>

                <div className="mk-grid">
                  {filtered.map((p) => {
                    const chip = stateChip(p);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={'mk-card' + (selected.id === p.id ? ' selected' : '')}
                        aria-pressed={selected.id === p.id}
                        onClick={() => openDetails(p)}
                      >
                        <span className="mk-card-art">
                          <PresetFigure preset={p} height={156} label={`${p.name} preview`} />
                          {chip
                            ? <span className="mk-card-chip">{chip}</span>
                            : SKIN_BADGES[p.id] && <span className={'mk-card-badge ' + SKIN_BADGES[p.id]}>{SKIN_BADGES[p.id] === 'new' ? mt('new') : mt('popular')}</span>}
                        </span>
                        <span className="mk-card-body">
                          <strong>{p.name}</strong>
                          <small>{p.slim ? mt('slim') : mt('classic')}</small>
                        </span>
                        <span className="mk-card-foot">
                          <span className="mk-price">{priceOf(p)}</span>
                          <span className="mk-card-arrow"><StoreIcon name="right" size={14} /></span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {!filtered.length && <p className="mk-empty" role="status">{mt('no_results')}</p>}

                <p className="mk-help">
                  Want a community-made skin?{' '}
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent('site:planetminecraft.com/resources/skin/ ' + (search.trim() || 'minecraft skins'))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Find skins on the web
                  </a>
                  . Download the PNG from its creator, then import it. External skins are not sold by FABLE.
                </p>
              </section>
            </>
          )}

          {/* ------------------------------------------------------------ DRESSING */}
          {category === 'dressing' && (
            <section className="mk-section mk-dressing">
              <header className="mk-section-head">
                <h2>{mt('dressing_title')}</h2>
                <div className="mk-section-actions">
                  <button type="button" className="mk-ghost-btn" onClick={randomizeDressing}>Randomize</button>
                  <Btn small onClick={resetDressingDefaults}>{mt('reset')}</Btn>
                  <Btn small onClick={downloadDressingPng}><StoreIcon name="download" size={15} /> {mt('download_png')}</Btn>
                  <Btn small className="mk-primary" onClick={saveEquipDressing}>{mt('save_equip')}</Btn>
                </div>
              </header>

              <div className="mk-dressing-body">
                <div className="mk-stage">
                  <div className="mk-stage-figure">
                    <AvatarFigure colors={dressingColors} slim={drSlim} headwear={drHeadwear} height={300} />
                  </div>
                  <div className="mk-stage-meta">
                    <strong>{drHeadwear !== 'none' ? getHeadwearById(drHeadwear).name : 'Classic Outfit'}</strong>
                    <span>{drSlim ? `${mt('slim')} (3px)` : `${mt('classic')} (4px)`}</span>
                  </div>
                </div>

                <div className="mk-controls">
                  <div className="mk-tabs" role="tablist">
                    <button className={drTab === 'colors' ? 'active' : ''} onClick={() => setDrTab('colors')} role="tab" aria-selected={drTab === 'colors'}>
                      <StoreIcon name="palette" size={15} /> {mt('avatar_colours')}
                    </button>
                    <button className={drTab === 'headwear' ? 'active' : ''} onClick={() => setDrTab('headwear')} role="tab" aria-selected={drTab === 'headwear'}>
                      <StoreIcon name="crown" size={15} /> {mt('headwear')} <span className="mk-tab-count">{HEADWEAR_ITEMS.length}</span>
                    </button>
                    <button className={drTab === 'presets' ? 'active' : ''} onClick={() => setDrTab('presets')} role="tab" aria-selected={drTab === 'presets'}>
                      <StoreIcon name="user" size={15} /> {mt('presets')}
                    </button>
                  </div>

                  {drTab === 'colors' && (
                    <div className="mk-panel-scroll">
                      {([
                        [mt('body_tone'), SKIN_TONES, drSkin, setDrSkin],
                        [mt('hair_colour'), HAIR_COLORS, drHair, setDrHair],
                        [mt('shirt_top'), SHIRT_COLORS, drShirt, setDrShirt],
                        [mt('pants_bottom'), PANTS_COLORS, drPants, setDrPants],
                      ] as [string, string[], string, (v: string) => void][]).map(([label, list, value, set]) => (
                        <div className="mk-swatches" key={label}>
                          <label>{label}</label>
                          <div className="mk-swatch-row">
                            {list.map((c) => (
                              <button
                                key={c}
                                type="button"
                                className={'mk-swatch' + (value === c ? ' active' : '')}
                                style={{ background: c }}
                                onClick={() => set(c)}
                                title={c}
                                aria-label={`${label} ${c}`}
                              />
                            ))}
                            <label
                              className={'mk-swatch custom' + (list.includes(value) ? '' : ' active')}
                              style={{ background: value }}
                              title={`${label} — ${value}`}
                            >
                              <input type="color" value={value} onChange={(e) => set(e.target.value)} aria-label={label} />
                            </label>
                          </div>
                        </div>
                      ))}
                      <div className="mk-swatches">
                        <label>{mt('arm_proportions')}</label>
                        <div className="mk-segmented">
                          <button type="button" className={!drSlim ? 'active' : ''} onClick={() => setDrSlim(false)}>{mt('classic')} (4px)</button>
                          <button type="button" className={drSlim ? 'active' : ''} onClick={() => setDrSlim(true)}>{mt('slim')} (3px)</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {drTab === 'headwear' && (
                    <div className="mk-panel-scroll">
                      <div className="mk-headwear-grid">
                        {HEADWEAR_ITEMS.filter((h) => h.id !== 'none').map((h) => {
                          const isOwned = ownedHeadwear(h);
                          const isEquipped = drHeadwear === h.id;
                          return (
                            <button
                              key={h.id}
                              type="button"
                              className={'mk-headwear-card' + (isEquipped ? ' equipped' : '') + (isOwned ? ' owned' : '')}
                              onClick={() => buyOrEquipHeadwear(h)}
                            >
                              <span className="mk-headwear-art">
                                <span className="mk-headwear-dot" style={{ background: h.accentColor }} />
                                <AvatarFigure colors={dressingColors} slim={drSlim} headwear={h.id} height={104} />
                              </span>
                              <strong>{h.name}</strong>
                              <small>{h.desc}</small>
                              <span className="mk-headwear-foot">
                                <span className="mk-price">
                                  {h.cost === 0 ? mt('free') : isOwned ? mt('owned') : <><StoreIcon name="coin" size={13} /> {mn(h.cost)}</>}
                                </span>
                                <span className={'mk-pill' + (isEquipped ? ' on' : '')}>
                                  {isEquipped ? mt('equipped') : isOwned ? mt('equip') : mt('unlock_equip')}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {drTab === 'presets' && (
                    <div className="mk-panel-scroll">
                      <p className="mk-note">Click a preset to copy its palette into the dressing room, then fine-tune every colour above.</p>
                      <div className="mk-preset-grid">
                        {SKIN_PRESETS.map((p) => (
                          <button key={p.id} type="button" className="mk-preset-btn" onClick={() => loadPresetIntoDressing(p)}>
                            <PresetFigure preset={p} height={112} />
                            <span>{p.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* --------------------------------------------------------------- PACKS */}
          {category === 'packs' && (
            <section className="mk-section">
              <header className="mk-section-head">
                <h2>{mt('nav_packs')}</h2>
                <Btn small onClick={() => store.goto('settings')}>Open Resource Pack Options</Btn>
              </header>
              <p className="mk-lede">
                Free FABLE packs are built in your browser and install instantly. You can also import supported Java
                texture packs (.zip or .mcpack). Missing textures fall back to FABLE art; Java shaders, data packs and
                Forge/Fabric mods do not run here.
              </p>
              {packMsg && <div className="mk-status success">{packMsg}</div>}
              <div className="mk-card-grid">
                {FREE_PACKS.map((pack) => {
                  const installed = settings.value.resourcePack === `fable-${pack.id}-pack.zip`;
                  return (
                    <article key={pack.id} className={'mk-tile' + (installed ? ' installed' : '')}>
                      <header className="mk-tile-head">
                        <span className="mk-tile-icon" style={{ color: pack.accent, background: `${pack.accent}1f` }}>
                          <StoreIcon name="pack" size={22} />
                        </span>
                        <span className="mk-tile-titles">
                          <strong>{pack.name}</strong>
                          <small>{pack.tags.join(' · ')}</small>
                        </span>
                        {installed && <span className="mk-badge cool">{mt('installed')}</span>}
                      </header>
                      <p>{pack.desc}</p>
                      <div className="mk-tile-actions">
                        <Btn small className="mk-primary" disabled={!!packBusy} onClick={() => void installPack(pack.id)}>
                          {packBusy === pack.id ? 'Installing…' : installed ? mt('install_free') : mt('install_free')}
                        </Btn>
                        <Btn small onClick={() => void downloadPack(pack.id)}>
                          <StoreIcon name="download" size={14} /> {mt('save_zip')}
                        </Btn>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {/* --------------------------------------------------------------- MODS */}
          {category === 'mods' && (
            <section className="mk-section">
              <header className="mk-section-head">
                <h2>{mt('nav_mods')}</h2>
              </header>
              <p className="mk-lede">
                Small, safe quality-of-life mods that run entirely in your browser tab. They are always free, never touch
                your saves, and can be uninstalled at any time.
              </p>
              <div className="mk-card-grid">
                {CLIENT_MODS.map((mod) => {
                  const on = mods.isOn(mod.id);
                  return (
                    <article key={mod.id} className={'mk-tile' + (on ? ' installed' : '')}>
                      <header className="mk-tile-head">
                        <span className="mk-tile-icon" style={{ color: mod.accent, background: `${mod.accent}1f` }}>
                          <StoreIcon name="mod" size={22} />
                        </span>
                        <span className="mk-tile-titles">
                          <strong>{mod.name}</strong>
                          <small>by {mod.author} · {mod.tag}</small>
                        </span>
                        {on && <span className="mk-badge cool">{mt('installed')}</span>}
                      </header>
                      <p>{mod.desc}</p>
                      {on && mod.hint && <p className="mk-tile-hint"><StoreIcon name="info" size={13} /> {mod.hint}</p>}
                      <div className="mk-tile-actions">
                        <Btn
                          small
                          className={on ? undefined : 'mk-primary'}
                          onClick={() => {
                            const now = mods.toggle(mod.id);
                            showToast(now ? `Installed ${mod.name} (free)!` : `Uninstalled ${mod.name}.`);
                          }}
                        >
                          {on ? mt('uninstall') : mt('install_free')}
                        </Btn>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {/* ------------------------------------------------------------ SHADERS */}
          {category === 'shaders' && (
            <section className="mk-section">
              <header className="mk-section-head">
                <h2>{mt('nav_shaders')}</h2>
                <div className="mk-section-actions">
                  <input ref={shaderFileInput} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={handleShaderFileImport} />
                  <Btn small onClick={() => shaderFileInput.current?.click()}>Import JSON</Btn>
                  <Btn small onClick={handleExportShader}><StoreIcon name="download" size={15} /> Export JSON</Btn>
                  <Btn small className="mk-primary" onClick={handleApplyShader}>Apply to Game</Btn>
                </div>
              </header>

              <div className="mk-notice">
                <span className="mk-notice-icon"><StoreIcon name="shield" size={22} /></span>
                <div>
                  <strong>Safe JSON shader architecture</strong>
                  <p>
                    Raw GLSL can freeze browsers and crash graphics drivers, so FABLE executes shaders through a sandboxed
                    JSON specification: lighting, water ripples, waving foliage and bloom values are strictly clamped to
                    verified GPU-safe ranges with zero executable code.
                  </p>
                </div>
              </div>

              {shaderSuccess && <div className="mk-status success">{shaderSuccess}</div>}
              {shaderErrors.length > 0 && (
                <div className="mk-status error">
                  <strong>Validation errors:</strong>
                  <ul>
                    {shaderErrors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mk-preset-grid shader">
                {DEFAULT_SHADER_ADDONS.map((addon) => {
                  const isSelected = activeShader.id === addon.id;
                  return (
                    <button key={addon.id} type="button" className={'mk-shader-card' + (isSelected ? ' active' : '')} onClick={() => selectShaderPreset(addon)}>
                      <strong>{addon.name}</strong>
                      <small>By {addon.author}</small>
                      <p>{addon.description}</p>
                      <span className="mk-tags">
                        {addon.features.waving && <span>Waving</span>}
                        {addon.features.water && <span>Water</span>}
                        {addon.features.bloom && <span>Bloom</span>}
                        {addon.features.godrays && <span>Godrays</span>}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mk-shader-split">
                <div className="mk-panel">
                  <h3>Visual Parameters</h3>
                  <div className="mk-toggle-list">
                    {([
                      ['waving', 'Waving foliage & grass'],
                      ['water', 'Water reflections & ripples'],
                      ['grade', 'Filmic colour grading'],
                      ['sunlight', 'Directional sunlight'],
                      ['godrays', 'Sun rays & horizon glow'],
                      ['bloom', 'Bloom brightness glow'],
                      ['vignette', 'Vignette edge shading'],
                    ] as [keyof ShaderAddon['features'], string][]).map(([key, label]) => (
                      <label key={key}>
                        <input type="checkbox" checked={activeShader.features[key]} onChange={(e) => updateActiveShaderField(key, e.target.checked)} />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div className="mk-slider-list">
                    {([
                      ['colorTemp', 'Colour temperature', -1, 1],
                      ['bloomStrength', 'Bloom intensity', 0, 1],
                      ['vignetteStrength', 'Vignette darkness', 0, 1],
                      ['brightness', 'Gamma / brightness', 0, 1],
                    ] as [keyof ShaderAddon['tuning'], string, number, number][]).map(([key, label, min, max]) => (
                      <label key={key}>
                        <span>{label}: {Math.round(activeShader.tuning[key] * 100)}%</span>
                        <input
                          type="range"
                          min={min}
                          max={max}
                          step={0.05}
                          value={activeShader.tuning[key]}
                          onChange={(e) => updateActiveShaderTuning(key, parseFloat(e.target.value))}
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <div className="mk-panel">
                  <div className="mk-panel-head">
                    <h3>JSON Specification</h3>
                    <button
                      type="button"
                      className="mk-ghost-btn"
                      onClick={() => {
                        navigator.clipboard?.writeText(shaderJson);
                        showToast('Copied JSON to clipboard');
                      }}
                    >
                      <StoreIcon name="copy" size={14} /> Copy
                    </button>
                  </div>
                  <textarea className="mk-json" spellCheck={false} value={shaderJson} onChange={(e) => handleShaderTextChange(e.target.value)} />
                </div>
              </div>
            </section>
          )}

          {/* ------------------------------------------------------------- THEMES */}
          {category === 'themes' && (
            <section className="mk-section">
              <header className="mk-section-head">
                <h2>{mt('nav_themes')}</h2>
              </header>
              <p className="mk-lede">
                Cosmetic storefront colours, unlocked with Fable Coins earned in Survival or claimed free here. No
                real-money purchases, ever.
              </p>
              <div className="mk-theme-grid">
                {(['default', 'copper', 'midnight'] as MarketplaceTheme[]).map((theme) => {
                  const cost = theme === 'default' ? 0 : 18;
                  const has = !cost || market.owns('theme:' + theme);
                  const active = market.value.theme === theme;
                  const name = theme === 'default' ? 'Fable' : theme === 'copper' ? 'Copper' : 'Midnight';
                  return (
                    <button
                      key={theme}
                      type="button"
                      className={'mk-theme' + (active ? ' active' : '')}
                      disabled={active || (!has && market.value.coins < cost)}
                      onClick={() => {
                        if (has || market.buy('theme:' + theme, cost)) market.setTheme(theme);
                      }}
                    >
                      <span className="mk-theme-preview" data-preview={theme}>
                        <span className="mk-theme-preview-rail" />
                        <span className="mk-theme-preview-card" />
                        <span className="mk-theme-preview-card" />
                        <span className="mk-theme-preview-card" />
                      </span>
                      <span className="mk-theme-meta">
                        <strong>{name}</strong>
                        <span className="mk-price">
                          {active ? mt('equipped') : has ? mt('equip') : <><StoreIcon name="coin" size={13} /> {mn(cost)}</>}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* -------------------------------------------------------------- COINS */}
          {category === 'coins' && (
            <section className="mk-section mk-coins-page">
              <div className="mk-notice gold">
                <span className="mk-notice-icon"><StoreIcon name="info" size={22} /></span>
                <div>
                  <strong>Real-money purchases are disabled</strong>
                  <p>
                    FABLE never collects money or processes payments. Fable Coins are a free, cosmetic-only currency:
                    earn them by mining ores in Survival or claim the free gifts below.
                  </p>
                </div>
              </div>

              <div className="mk-balance-panel">
                <div>
                  <small>{mt('current_balance')}</small>
                  <strong>{mn(market.value.coins)}</strong>
                  <span>{mt('fable_coins')}</span>
                </div>
                {equippedSheet.sheet
                  ? <SkinAvatar sheet={equippedSheet.sheet} cacheKey={equippedSheet.key} size={76} className="mk-balance-avatar" />
                  : <PresetAvatar preset={presetById(settings.value.skinPreset)} size={76} className="mk-balance-avatar" />}
              </div>

              <div className="mk-panel">
                <h3><StoreIcon name="gift" size={18} /> {mt('free_claims')}</h3>
                <div className="mk-claim-row">
                  <div>
                    <strong>{mt('welcome_gift')}</strong>
                    <p>A one-time thank-you for visiting the Marketplace. Every profile gets it once.</p>
                  </div>
                  <Btn
                    small
                    disabled={market.value.starter}
                    onClick={() => {
                      const got = market.claimStarter();
                      showToast(got ? `Claimed +${got} welcome coins!` : 'Welcome gift already claimed.');
                    }}
                  >
                    {market.value.starter ? mt('claimed') : mt('claim', { n: STARTER_COINS })}
                  </Btn>
                </div>
                <div className="mk-claim-row">
                  <div>
                    <strong>{mt('daily_gift')}</strong>
                    <p>
                      {market.dailyWait() === 0
                        ? 'Your daily gift is ready — come back every day for more!'
                        : `Next gift ready in ${fmtWait(market.dailyWait())}.`}
                    </p>
                  </div>
                  <Btn
                    small
                    className={market.dailyWait() === 0 ? 'mk-primary' : undefined}
                    disabled={market.dailyWait() > 0}
                    onClick={() => {
                      const got = market.claimDaily();
                      showToast(got ? `Claimed +${got} daily coins!` : 'Daily gift is cooling down.');
                    }}
                  >
                    {market.dailyWait() === 0 ? mt('claim', { n: DAILY_COINS }) : <><StoreIcon name="clock" size={14} /> {fmtWait(market.dailyWait())}</>}
                  </Btn>
                </div>
              </div>

              <div className="mk-panel">
                <h3><StoreIcon name="pick" size={18} /> {mt('how_to_earn')}</h3>
                <p className="mk-note">
                  Coins are credited to your local profile the moment you mine a rare ore in Survival mode. The deeper
                  and rarer the block, the more it pays.
                </p>
                <table className="mk-table">
                  <thead>
                    <tr>
                      <th>{mt('ore_block')}</th>
                      <th>{mt('rarity')}</th>
                      <th>{mt('coin_reward')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>Coal Ore</td><td>Common</td><td>+1 Coin</td></tr>
                    <tr><td>Copper Ore</td><td>Common</td><td>+1 Coin</td></tr>
                    <tr><td>Iron Ore</td><td>Uncommon</td><td>+1 Coin</td></tr>
                    <tr><td>Gold Ore</td><td>Rare</td><td>+2 Coins</td></tr>
                    <tr><td>Lumen Block</td><td>Nether / cavern</td><td>+1 Coin</td></tr>
                    <tr><td>Ember Ore</td><td>Deep lava veins</td><td>+3 Coins</td></tr>
                    <tr><td>Crystal Ore</td><td>Ultra rare (caves &amp; void)</td><td>+6 Coins</td></tr>
                  </tbody>
                </table>
              </div>

              <div className="mk-panel">
                <h3>What Fable Coins are used for</h3>
                <ul className="mk-list">
                  <li><strong>Character skins:</strong> unlock built-in skins such as Stargazer and Tinkerer.</li>
                  <li><strong>Headwear:</strong> crowns, hardhats, wizard hats, aviator goggles and antlers.</li>
                  <li><strong>Store themes:</strong> recolour this marketplace with Copper or Midnight.</li>
                  <li><strong>Never pay-to-win:</strong> every unlock is cosmetic and stored on this device.</li>
                </ul>
              </div>
            </section>
          )}
        </main>
      </div>

      {/* ----------------------------------------------------------- DETAILS SHEET */}
      {detailsOpen && (
        <div className="mk-modal" role="dialog" aria-modal="true" aria-label={selected.name} onClick={() => setDetailsOpen(false)}>
          <div className="mk-sheet" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="mk-sheet-close" onClick={() => setDetailsOpen(false)} aria-label={mt('back')}>
              <StoreIcon name="close" size={16} />
            </button>
            <div className="mk-sheet-stage">
              <PresetFigureView preset={selected} width={220} height={300} />
              <span className="mk-sheet-stage-note">Live 3D preview · {selected.slim ? mt('slim') : mt('classic')}</span>
            </div>
            <div className="mk-sheet-info">
              <span className="mk-tag">{selected.slim ? mt('slim') : mt('classic')}</span>
              <h2>{selected.name}</h2>
              <p>{mt('original_skin')}</p>
              <div className="mk-sheet-price">
                <span className="mk-price big">{priceOf(selected)}</span>
                {stateChip(selected) && <span className="mk-pill on">{stateChip(selected)}</span>}
              </div>
              <Btn
                className="mk-primary mk-block"
                disabled={equippedSkin || (!ownedSkin(selected) && market.value.coins < skinCost(selected))}
                onClick={() => equipSkin(selected)}
              >
                {equippedSkin
                  ? mt('equipped')
                  : ownedSkin(selected)
                  ? mt('equip')
                  : market.value.coins < skinCost(selected)
                  ? mt('not_enough_coins')
                  : mt('unlock_equip')}
              </Btn>
              <div className="mk-sheet-actions">
                {ownedSkin(selected) && (
                  <Btn small onClick={() => downloadSkin(selected)}><StoreIcon name="download" size={14} /> {mt('download_png')}</Btn>
                )}
                <Btn small onClick={() => fileInput.current?.click()}><StoreIcon name="upload" size={14} /> {mt('import_skin')}</Btn>
              </div>
              {settings.value.skinUrl && (
                <div className="mk-sheet-note">
                  <p>Imported skin arms</p>
                  <div className="mk-segmented">
                    <button type="button" className={!settings.value.skinSlim ? 'active' : ''} onClick={() => settings.set('skinSlim', false)}>{mt('classic')}</button>
                    <button type="button" className={settings.value.skinSlim ? 'active' : ''} onClick={() => settings.set('skinSlim', true)}>{mt('slim')}</button>
                  </div>
                </div>
              )}
              <ul className="mk-feature-list">
                <li><StoreIcon name="check" size={14} /> 64×64 vanilla sheet — drops straight into the game</li>
                <li><StoreIcon name="check" size={14} /> Applies to the player, the first-person arm and every preview</li>
                <li><StoreIcon name="check" size={14} /> Stored on this device; no account, no real money</li>
              </ul>
              <p className="mk-sheet-fine">
                Want finer detail? Import your own 128–512px skin PNG from the toolbar above — external skins are never
                sold here.
              </p>
            </div>
          </div>
        </div>
      )}

      {!!uploadError && (
        <div className="mk-error-toast" role="alert">
          <StoreIcon name="info" size={15} /> {uploadError}
        </div>
      )}
    </div>
  );
}
