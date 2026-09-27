import React, { useEffect, useRef, useState } from 'react';
import { SKIN_PRESETS, builtinSkinCanvas, customAvatarSkinCanvas, type SkinPreset } from '../game/core/Skins';
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
import { PresetFigureView, PresetPortrait } from './PlayerPreview';
import { Btn } from './components';
import { StoreIcon } from './StoreIcon';
import { SaveManager, type WorldSummary } from '../game/save/SaveManager';
import { loadSkinFile } from '../game/core/SkinTexture';
import { store } from './store';
import { currentGame } from './session';
import { audio } from '../game/audio/Audio';

type Category = 'skins' | 'dressing' | 'packs' | 'shaders' | 'themes' | 'mods' | 'coins';
type Filter = 'all' | 'classic' | 'slim';

const heroImage = new URL('../../site/assets/shot-overworld.png', import.meta.url).href;
const featureImages = [
  new URL('../../site/assets/shot-night.png', import.meta.url).href,
  new URL('../../site/assets/shot-sunset.png', import.meta.url).href,
  new URL('../../site/assets/shot-creative.png', import.meta.url).href,
  new URL('../../site/assets/shot-mining.png', import.meta.url).href,
];

const skinCost = (p: SkinPreset) => (p.id === 'stargazer' || p.id === 'tinkerer' ? 12 : 0);

// Color swatches for dressing room
const SKIN_TONES = ['#c68e5c', '#e0ac69', '#b07040', '#d8a878', '#f0b060', '#8a6a42', '#d8c8b0', '#f0c8a0', '#b98867', '#6e472a', '#4a754b', '#5c86ad'];
const HAIR_COLORS = ['#5a3a22', '#8a5a30', '#4a3a28', '#6a4a2a', '#5a2a10', '#2f3a1f', '#e8f0f8', '#55202f', '#202847', '#222224', '#bf382a', '#e6c86e'];
const SHIRT_COLORS = ['#3f6f9f', '#2e8f5e', '#9aa0a8', '#cfd6df', '#d8502f', '#3f7f3f', '#4f8fbf', '#c0557f', '#384e9a', '#292b38', '#cf9b34', '#e0e0e0'];
const PANTS_COLORS = ['#3b3b5a', '#5a4632', '#3c4350', '#2a2f3a', '#4a2010', '#4a3a28', '#274060', '#552040', '#27335f', '#1b1d24', '#705436', '#304a3e'];

/** An authentic Java/Bedrock-inspired marketplace with sidebar navigation, dressing room, and safe JSON shaders. */
export function SkinMarketplace() {
  const [category, setCategory] = useState<Category>('skins');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<SkinPreset>(SKIN_PRESETS.find((p) => p.id === settings.value.skinPreset) ?? SKIN_PRESETS[0]);
  const [search, setSearch] = useState('');
  const [featured, setFeatured] = useState(SKIN_PRESETS.length - 2);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [carouselPage, setCarouselPage] = useState(2);
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

  const screenshot = (index: number) =>
    (worldShots.length ? worldShots[index % worldShots.length]?.preview : undefined) || featureImages[index % featureImages.length];
  const ownedSkin = (p: SkinPreset) => !skinCost(p) || market.owns('skin:' + p.id);
  const ownedHeadwear = (h: HeadwearItem) => h.cost === 0 || market.owns('headwear:' + h.id);
  const equippedSkin = !settings.value.skinUrl && settings.value.skinPreset === selected.id;

  const filtered = SKIN_PRESETS.filter(
    (p) => p.name.toLowerCase().includes(search.trim().toLowerCase()) && (filter === 'all' || !!p.slim === (filter === 'slim'))
  );

  const equipSkin = () => {
    if (!ownedSkin(selected) && !market.buy('skin:' + selected.id, skinCost(selected))) return;
    settings.set('skinUrl', '');
    settings.set('skinSlim', !!selected.slim);
    settings.set('skinPreset', selected.id);
    settings.set('skin', { skin: selected.skin, hair: selected.hair, shirt: selected.shirt, pants: selected.pants });
    showToast(`Equipped ${selected.name}!`);
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
  const dressingCanvas = customAvatarSkinCanvas(drSkin, drHair, drShirt, drPants, drSlim, drHeadwear);

  const saveEquipDressing = () => {
    settings.set('skin', { skin: drSkin, hair: drHair, shirt: drShirt, pants: drPants });
    settings.set('skinSlim', drSlim);
    settings.set('skinUrl', '');
    settings.set('skinPreset', 'custom');
    settings.set('headwear', drHeadwear);
    showToast('Custom avatar saved and equipped!');
  };

  const downloadDressingPng = () => {
    if (!dressingCanvas) return;
    const link = document.createElement('a');
    link.href = dressingCanvas.toDataURL('image/png');
    link.download = `fable-custom-avatar.png`;
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
        showToast('Not enough Fable Coins!');
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

  return (
    <div
      className="menu-screen dirt-bg java-market"
      data-theme={market.value.theme}
      onClick={(e) => {
        // Btn already plays click and stops the event. Raw store buttons do not.
        const el = (e.target as HTMLElement).closest('button, a, .java-market-sidebar-card');
        if (!el) return;
        audio.init();
        audio.play('click', { volume: 0.45 });
      }}
    >
      <header className="java-market-header">
        <Btn small onClick={() => store.goto('menu')}>
          <StoreIcon name="back" size={16} /> Back
        </Btn>
        <h1>Marketplace</h1>
        <button
          type="button"
          className="java-market-balance"
          onClick={() => setCategory('coins')}
          title="Learn how to earn Fable Coins in Survival"
          aria-label="View Fable Coin info"
        >
          <StoreIcon name="coin" size={17} /> Fable Coins: <strong>{market.value.coins}</strong>
          <span className="java-market-balance-plus">+ Free Claims</span>
        </button>
        <input
          className="java-market-top-search"
          aria-label="Search skins"
          placeholder="Search skins…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCategory('skins');
          }}
        />
      </header>

      <div className="java-market-body-wrapper">
        {/* Redesigned Marketplace Navigation Sidebar */}
        <aside className="java-market-nav-sidebar" aria-label="Marketplace Navigation">
          <div className="java-market-sidebar-brand">
            <StoreIcon name="world" size={20} />
            <span>Marketplace</span>
          </div>

          <div
            className="java-market-sidebar-card"
            onClick={() => setCategory('coins')}
            role="button"
            tabIndex={0}
            title="Click to view the Coin earning guide and free claims"
          >
            <div className="java-market-card-coins">
              <StoreIcon name="coin" size={18} />
              <div>
                <small>Available Balance</small>
                <strong>{market.value.coins} Fable Coins</strong>
              </div>
            </div>
            <span className="java-market-card-cta">Free Claims →</span>
          </div>

          <nav className="java-market-sidebar-nav" aria-label="Store Categories">
            <button
              type="button"
              className={category === 'skins' ? 'active' : ''}
              onClick={() => {
                setCategory('skins');
                setDetailsOpen(false);
              }}
            >
              <StoreIcon name="skin" size={20} />
              <span>Skins &amp; Outfits</span>
              <span className="sidebar-count">{SKIN_PRESETS.length}</span>
            </button>
            <button
              type="button"
              className={category === 'dressing' ? 'active' : ''}
              onClick={() => {
                setCategory('dressing');
                setDetailsOpen(false);
              }}
            >
              <StoreIcon name="dressing" size={20} />
              <span>Dressing Room</span>
              <span className="sidebar-badge new">New</span>
            </button>
            <button
              type="button"
              className={category === 'packs' ? 'active' : ''}
              onClick={() => {
                setCategory('packs');
                setDetailsOpen(false);
              }}
            >
              <StoreIcon name="pack" size={20} />
              <span>Resource Packs</span>
              <span className="sidebar-badge new">{FREE_PACKS.length} Free</span>
            </button>
            <button
              type="button"
              className={category === 'shaders' ? 'active' : ''}
              onClick={() => {
                setCategory('shaders');
                setDetailsOpen(false);
              }}
            >
              <StoreIcon name="shader" size={20} />
              <span>Shader Add-ons</span>
              <span className="sidebar-badge json">JSON</span>
            </button>
            <button
              type="button"
              className={category === 'mods' ? 'active' : ''}
              onClick={() => {
                setCategory('mods');
                setDetailsOpen(false);
              }}
            >
              <StoreIcon name="mod" size={20} />
              <span>Client Mods</span>
              <span className="sidebar-badge new">Free</span>
            </button>
            <button
              type="button"
              className={category === 'themes' ? 'active' : ''}
              onClick={() => {
                setCategory('themes');
                setDetailsOpen(false);
              }}
            >
              <StoreIcon name="theme" size={20} />
              <span>Store Themes</span>
            </button>
            <button
              type="button"
              className={category === 'coins' ? 'active' : ''}
              onClick={() => {
                setCategory('coins');
                setDetailsOpen(false);
              }}
            >
              <StoreIcon name="coin" size={20} />
              <span>Get Coins (Free)</span>
            </button>
          </nav>
        </aside>

        {/* Main Content Area */}
        <div className="java-market-layout">
          <main className="java-market-main">
            {toastMsg && <div className="java-market-toast">{toastMsg}</div>}

            {/* SKINS CATEGORY */}
            {category === 'skins' && (
              <>
                <div className="java-market-promo">
                  FABLE STORE{' '}
                  <span>
                    {worldShots.length
                      ? 'Showing recent captures from your saved worlds.'
                      : 'Play a world and press F2 to refresh the local game screenshots.'}
                  </span>
                </div>
                <div className="java-market-showcase">
                  <button
                    className="java-market-hero"
                    style={{ backgroundImage: `url(${worldShots[0]?.preview || heroImage})` }}
                    onClick={() => {
                      setSelected(SKIN_PRESETS[featured]);
                      setDetailsOpen(true);
                    }}
                  >
                    <span className="java-market-hero-label">FEATURED SKIN</span>
                    <PresetPortrait preset={SKIN_PRESETS[featured]} size={96} />
                    <strong>{SKIN_PRESETS[featured].name}</strong>
                  </button>
                  <div className="java-market-feature-grid">
                    {SKIN_PRESETS.slice(-4).map((p, i) => (
                      <button
                        key={p.id}
                        className="java-market-feature-card"
                        onClick={() => {
                          setSelected(p);
                          setDetailsOpen(true);
                        }}
                      >
                        <img src={screenshot(i)} alt="FABLE gameplay capture" />
                        <span>{p.name}</span>
                        <small>
                          {skinCost(p) ? (
                            <>
                              <StoreIcon name="coin" size={12} /> {skinCost(p)}
                            </>
                          ) : (
                            'Free'
                          )}
                        </small>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="java-market-feature-controls" aria-label="Featured skins">
                  {SKIN_PRESETS.slice(-3).map((p, i) => (
                    <button
                      key={p.id}
                      aria-label={`Feature ${p.name}`}
                      aria-pressed={featured === SKIN_PRESETS.length - 3 + i}
                      onClick={() => setFeatured(SKIN_PRESETS.length - 3 + i)}
                    >
                      <span className={featured === SKIN_PRESETS.length - 3 + i ? 'active' : ''} />
                    </button>
                  ))}
                </div>

                <div className="java-market-new-head">
                  <h2>New &amp; Featured</h2>
                  <span>{carouselPage + 1}/3</span>
                </div>
                <div className="java-market-carousel">
                  <button
                    className="java-market-arrow"
                    aria-label="Previous featured skins"
                    onClick={() => setCarouselPage((carouselPage + 2) % 3)}
                  >
                    <StoreIcon name="left" size={26} />
                  </button>
                  {SKIN_PRESETS.slice(carouselPage * 4, carouselPage * 4 + 4).map((p, i) => (
                    <button
                      key={p.id}
                      className="java-market-carousel-card"
                      onClick={() => {
                        setSelected(p);
                        setDetailsOpen(true);
                      }}
                    >
                      <div className="java-market-carousel-art">
                        <img src={screenshot(i)} alt="FABLE gameplay capture" />
                        <PresetPortrait preset={p} size={64} />
                      </div>
                      <strong>{p.name}</strong>
                      <small>Original FABLE skin</small>
                      <span>
                        {skinCost(p) ? (
                          <>
                            <StoreIcon name="coin" size={12} /> {skinCost(p)}
                          </>
                        ) : (
                          'Free'
                        )}
                      </span>
                    </button>
                  ))}
                  <button
                    className="java-market-arrow"
                    aria-label="Next featured skins"
                    onClick={() => setCarouselPage((carouselPage + 1) % 3)}
                  >
                    <StoreIcon name="right" size={26} />
                  </button>
                </div>

                <div className="java-market-controls">
                  <div className="java-market-filters" role="group" aria-label="Arm model">
                    {(['all', 'classic', 'slim'] as Filter[]).map((f) => (
                      <button
                        key={f}
                        className={filter === f ? 'active' : ''}
                        aria-pressed={filter === f}
                        onClick={() => setFilter(f)}
                      >
                        {f === 'all' ? 'All' : f === 'classic' ? 'Classic' : 'Slim'}
                      </button>
                    ))}
                  </div>
                </div>

                <p className="java-market-heading">
                  SKINS <span>({filtered.length})</span>
                </p>
                <div className="java-market-grid">
                  {filtered.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={'java-market-card' + (selected.id === p.id ? ' selected' : '')}
                      aria-pressed={selected.id === p.id}
                      onClick={() => {
                        setSelected(p);
                        setDetailsOpen(true);
                      }}
                    >
                      <span className="java-market-card-art">
                        <PresetPortrait preset={p} size={96} />
                      </span>
                      <strong>{p.name}</strong>
                      <span className="java-market-card-meta">
                        {p.slim ? 'Slim' : 'Classic'} ·{' '}
                        {skinCost(p) ? (
                          ownedSkin(p) ? (
                            'Owned'
                          ) : (
                            <>
                              <StoreIcon name="coin" size={12} /> {skinCost(p)}
                            </>
                          )
                        ) : (
                          'Free'
                        )}
                      </span>
                      {!settings.value.skinUrl && settings.value.skinPreset === p.id && (
                        <span className="java-market-equipped">Equipped</span>
                      )}
                    </button>
                  ))}
                </div>
                {!filtered.length && <p role="status">No matching skins.</p>}
                <p className="java-market-help">
                  Want a community-made skin?{' '}
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(
                      'site:planetminecraft.com/resources/skin/ ' + (search.trim() || 'minecraft skins')
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Find skins on the web
                  </a>
                  . Download from the creator, then import its PNG. External skins are not sold by FABLE.
                </p>
              </>
            )}

            {/* DRESSING ROOM CATEGORY */}
            {category === 'dressing' && (
              <div className="dressing-room-screen">
                <div className="dressing-room-header">
                  <div>
                    <h2>Dressing Room &amp; Character Creator</h2>
                    <p>Customize your avatar’s skin tones, outfit colors, and unique 3D headwear.</p>
                  </div>
                  <div className="dressing-room-actions-top">
                    <Btn small onClick={resetDressingDefaults}>
                      Reset
                    </Btn>
                    <Btn small onClick={downloadDressingPng}>
                      <StoreIcon name="download" size={15} /> Download PNG
                    </Btn>
                    <Btn onClick={saveEquipDressing}>Save &amp; Equip</Btn>
                  </div>
                </div>

                <div className="dressing-room-layout">
                  {/* Left 3D Figure View */}
                  <div className="dressing-room-stage">
                    <div className="dressing-room-preview-box">
                      <PresetFigureView
                        customCanvas={dressingCanvas}
                        headwear={drHeadwear}
                        width={220}
                        height={320}
                      />
                    </div>
                    <div className="dressing-room-stage-meta">
                      <strong>
                        {drHeadwear !== 'none' ? getHeadwearById(drHeadwear).name : 'Classic Outfit'}
                      </strong>
                      <span>{drSlim ? 'Slim (3px) Arms' : 'Classic (4px) Arms'}</span>
                    </div>
                  </div>

                  {/* Right Customization Controls */}
                  <div className="dressing-room-panel">
                    <div className="dressing-room-tabs" role="tablist">
                      <button
                        className={drTab === 'colors' ? 'active' : ''}
                        onClick={() => setDrTab('colors')}
                        role="tab"
                        aria-selected={drTab === 'colors'}
                      >
                        <StoreIcon name="palette" size={15} /> Avatar Colours
                      </button>
                      <button
                        className={drTab === 'headwear' ? 'active' : ''}
                        onClick={() => setDrTab('headwear')}
                        role="tab"
                        aria-selected={drTab === 'headwear'}
                      >
                        <StoreIcon name="crown" size={15} /> Headwear ({HEADWEAR_ITEMS.length})
                      </button>
                      <button
                        className={drTab === 'presets' ? 'active' : ''}
                        onClick={() => setDrTab('presets')}
                        role="tab"
                        aria-selected={drTab === 'presets'}
                      >
                        <StoreIcon name="user" size={15} /> Presets
                      </button>
                    </div>

                    {drTab === 'colors' && (
                      <div className="dressing-section">
                        <div className="dressing-group">
                          <label>Body / Skin Tone</label>
                          <div className="color-swatch-row">
                            {SKIN_TONES.map((c) => (
                              <button
                                key={c}
                                className={'color-swatch' + (drSkin === c ? ' active' : '')}
                                style={{ backgroundColor: c }}
                                onClick={() => setDrSkin(c)}
                                title={c}
                              />
                            ))}
                            <input
                              type="color"
                              className="color-picker-input"
                              value={drSkin}
                              onChange={(e) => setDrSkin(e.target.value)}
                              title="Custom Skin Color"
                            />
                          </div>
                        </div>

                        <div className="dressing-group">
                          <label>Hair Colour</label>
                          <div className="color-swatch-row">
                            {HAIR_COLORS.map((c) => (
                              <button
                                key={c}
                                className={'color-swatch' + (drHair === c ? ' active' : '')}
                                style={{ backgroundColor: c }}
                                onClick={() => setDrHair(c)}
                                title={c}
                              />
                            ))}
                            <input
                              type="color"
                              className="color-picker-input"
                              value={drHair}
                              onChange={(e) => setDrHair(e.target.value)}
                              title="Custom Hair Color"
                            />
                          </div>
                        </div>

                        <div className="dressing-group">
                          <label>Shirt / Top</label>
                          <div className="color-swatch-row">
                            {SHIRT_COLORS.map((c) => (
                              <button
                                key={c}
                                className={'color-swatch' + (drShirt === c ? ' active' : '')}
                                style={{ backgroundColor: c }}
                                onClick={() => setDrShirt(c)}
                                title={c}
                              />
                            ))}
                            <input
                              type="color"
                              className="color-picker-input"
                              value={drShirt}
                              onChange={(e) => setDrShirt(e.target.value)}
                              title="Custom Shirt Color"
                            />
                          </div>
                        </div>

                        <div className="dressing-group">
                          <label>Pants / Bottom</label>
                          <div className="color-swatch-row">
                            {PANTS_COLORS.map((c) => (
                              <button
                                key={c}
                                className={'color-swatch' + (drPants === c ? ' active' : '')}
                                style={{ backgroundColor: c }}
                                onClick={() => setDrPants(c)}
                                title={c}
                              />
                            ))}
                            <input
                              type="color"
                              className="color-picker-input"
                              value={drPants}
                              onChange={(e) => setDrPants(e.target.value)}
                              title="Custom Pants Color"
                            />
                          </div>
                        </div>

                        <div className="dressing-group">
                          <label>Arm Proportions</label>
                          <div className="dressing-arm-toggle">
                            <Btn small disabled={!drSlim} onClick={() => setDrSlim(false)}>
                              Classic (4px)
                            </Btn>
                            <Btn small disabled={drSlim} onClick={() => setDrSlim(true)}>
                              Slim (3px)
                            </Btn>
                          </div>
                        </div>
                      </div>
                    )}

                    {drTab === 'headwear' && (
                      <div className="dressing-section">
                        <div className="headwear-grid">
                          {HEADWEAR_ITEMS.map((h) => {
                            const isOwned = ownedHeadwear(h);
                            const isEquipped = drHeadwear === h.id;
                            return (
                              <div
                                key={h.id}
                                className={
                                  'headwear-card' +
                                  (isEquipped ? ' equipped' : '') +
                                  (isOwned ? ' owned' : '')
                                }
                                onClick={() => buyOrEquipHeadwear(h)}
                                role="button"
                                tabIndex={0}
                              >
                                <div className="headwear-art">
                                  <span
                                    className="headwear-badge-dot"
                                    style={{ backgroundColor: h.accentColor }}
                                  />
                                  <PresetFigureView
                                    preset={SKIN_PRESETS[0]}
                                    headwear={h.id}
                                    width={70}
                                    height={100}
                                  />
                                </div>
                                <div className="headwear-meta">
                                  <strong>{h.name}</strong>
                                  <p>{h.desc}</p>
                                  <div className="headwear-footer">
                                    <span className="headwear-cost">
                                      {h.cost === 0 ? (
                                        'Free'
                                      ) : isOwned ? (
                                        'Owned'
                                      ) : (
                                        <>
                                          <StoreIcon name="coin" size={13} /> {h.cost} Coins
                                        </>
                                      )}
                                    </span>
                                    <button
                                      type="button"
                                      className={'headwear-btn' + (isEquipped ? ' on' : '')}
                                    >
                                      {isEquipped ? 'Equipped' : isOwned ? 'Equip' : 'Unlock'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {drTab === 'presets' && (
                      <div className="dressing-section">
                        <p className="dressing-note">
                          Click any built-in character preset to copy its colors into the Dressing Room as a starting point.
                        </p>
                        <div className="dressing-preset-grid">
                          {SKIN_PRESETS.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              className="dressing-preset-btn"
                              onClick={() => loadPresetIntoDressing(p)}
                            >
                              <PresetPortrait preset={p} size={48} />
                              <span>{p.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* RESOURCE PACKS CATEGORY */}
            {category === 'packs' && (
              <section className="java-market-info">
                <h2>Resource Packs</h2>
                <p>
                  Free FABLE packs below are built in your browser and install instantly. You can also import supported
                  Java texture packs (.zip or .mcpack) from Options → Resource Packs. Missing textures fall back to
                  FABLE art; Java shaders, data packs and Forge/Fabric mods do not run here.
                </p>
                {packMsg && <div className="shader-status success">{packMsg}</div>}
                <div className="market-pack-grid">
                  {FREE_PACKS.map((pack) => {
                    const installed = settings.value.resourcePack === `fable-${pack.id}-pack.zip`;
                    return (
                      <div key={pack.id} className={'market-pack-card' + (installed ? ' installed' : '')}>
                        <div className="market-pack-head" style={{ borderColor: pack.accent }}>
                          <span className="market-pack-icon" style={{ color: pack.accent }}>
                            <StoreIcon name="pack" size={22} />
                          </span>
                          <div>
                            <strong>{pack.name}</strong>
                            <small>{pack.tags.join(' · ')}</small>
                          </div>
                          {installed && <span className="sidebar-badge new">Installed</span>}
                        </div>
                        <p>{pack.desc}</p>
                        <div className="market-pack-actions">
                          <Btn small disabled={!!packBusy} onClick={() => void installPack(pack.id)}>
                            {packBusy === pack.id ? 'Installing…' : installed ? 'Re-install Free' : 'Install Free'}
                          </Btn>
                          <Btn small onClick={() => void downloadPack(pack.id)}>
                            <StoreIcon name="download" size={14} /> Save .zip
                          </Btn>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="market-pack-actions" style={{ marginTop: 12 }}>
                  <Btn onClick={() => store.goto('settings')}>Open Resource Pack Options</Btn>
                </div>
              </section>
            )}

            {/* CLIENT MODS CATEGORY */}
            {category === 'mods' && (
              <section className="java-market-info">
                <h2>Client Mods</h2>
                <p>
                  Small, safe quality-of-life mods that run entirely in your browser tab. They are always free, never
                  touch your saves, and can be uninstalled at any time.
                </p>
                <div className="market-pack-grid">
                  {CLIENT_MODS.map((mod) => {
                    const on = mods.isOn(mod.id);
                    return (
                      <div key={mod.id} className={'market-pack-card' + (on ? ' installed' : '')}>
                        <div className="market-pack-head" style={{ borderColor: mod.accent }}>
                          <span className="market-pack-icon" style={{ color: mod.accent }}>
                            <StoreIcon name="mod" size={22} />
                          </span>
                          <div>
                            <strong>{mod.name}</strong>
                            <small>by {mod.author} · {mod.tag}</small>
                          </div>
                          {on && <span className="sidebar-badge new">Installed</span>}
                        </div>
                        <p>{mod.desc}</p>
                        {on && mod.hint && <p className="market-mod-hint"><StoreIcon name="info" size={13} /> {mod.hint}</p>}
                        <div className="market-pack-actions">
                          <Btn
                            small
                            onClick={() => {
                              const now = mods.toggle(mod.id);
                              showToast(now ? `Installed ${mod.name} (free)!` : `Uninstalled ${mod.name}.`);
                            }}
                          >
                            {on ? 'Uninstall' : 'Install Free'}
                          </Btn>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* SHADER ADD-ONS CATEGORY */}
            {category === 'shaders' && (
              <div className="shader-addon-screen">
                <div className="shader-safety-banner">
                  <div className="safety-icon"><StoreIcon name="shield" size={24} /></div>
                  <div className="safety-text">
                    <strong>Safe JSON Shader Architecture</strong>
                    <p>
                      Raw GLSL shaders can freeze browsers and crash graphics drivers. FABLE executes shaders through a
                      sandboxed JSON specification: all lighting, water ripples, waving vegetation, and bloom values are strictly
                      clamped to verified GPU-safe ranges with zero executable code.
                    </p>
                  </div>
                </div>

                <div className="shader-addon-head">
                  <h2>Shader Pack Presets</h2>
                  <div className="shader-head-actions">
                    <input
                      ref={shaderFileInput}
                      type="file"
                      accept=".json,application/json"
                      style={{ display: 'none' }}
                      onChange={handleShaderFileImport}
                    />
                    <Btn small onClick={() => shaderFileInput.current?.click()}>
                      Import JSON
                    </Btn>
                    <Btn small onClick={handleExportShader}>
                      <StoreIcon name="download" size={15} /> Export JSON
                    </Btn>
                    <Btn onClick={handleApplyShader}>Apply to Game</Btn>
                  </div>
                </div>

                {shaderSuccess && <div className="shader-status success">{shaderSuccess}</div>}
                {shaderErrors.length > 0 && (
                  <div className="shader-status error">
                    <strong>Validation errors:</strong>
                    <ul>
                      {shaderErrors.map((err, idx) => (
                        <li key={idx}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Preset Cards */}
                <div className="shader-preset-grid">
                  {DEFAULT_SHADER_ADDONS.map((addon) => {
                    const isSelected = activeShader.id === addon.id;
                    return (
                      <button
                        key={addon.id}
                        type="button"
                        className={'shader-card' + (isSelected ? ' active' : '')}
                        onClick={() => selectShaderPreset(addon)}
                      >
                        <strong>{addon.name}</strong>
                        <small>By {addon.author}</small>
                        <p>{addon.description}</p>
                        <div className="shader-tags">
                          {addon.features.waving && <span>Waving</span>}
                          {addon.features.water && <span>Water</span>}
                          {addon.features.bloom && <span>Bloom</span>}
                          {addon.features.godrays && <span>Godrays</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Visual Tuning and JSON Editor */}
                <div className="shader-editor-split">
                  <div className="shader-controls-box">
                    <h3>Visual Parameters</h3>
                    <div className="shader-toggle-list">
                      <label>
                        <input
                          type="checkbox"
                          checked={activeShader.features.waving}
                          onChange={(e) => updateActiveShaderField('waving', e.target.checked)}
                        />
                        Waving Foliage &amp; Grass
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={activeShader.features.water}
                          onChange={(e) => updateActiveShaderField('water', e.target.checked)}
                        />
                        Water Reflections &amp; Ripples
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={activeShader.features.grade}
                          onChange={(e) => updateActiveShaderField('grade', e.target.checked)}
                        />
                        Filmic Colour Grading
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={activeShader.features.sunlight}
                          onChange={(e) => updateActiveShaderField('sunlight', e.target.checked)}
                        />
                        Directional Sunlight
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={activeShader.features.godrays}
                          onChange={(e) => updateActiveShaderField('godrays', e.target.checked)}
                        />
                        Sun Rays &amp; Horizon Glow
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={activeShader.features.bloom}
                          onChange={(e) => updateActiveShaderField('bloom', e.target.checked)}
                        />
                        Bloom Brightness Glow
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={activeShader.features.vignette}
                          onChange={(e) => updateActiveShaderField('vignette', e.target.checked)}
                        />
                        Vignette Edge Shading
                      </label>
                    </div>

                    <div className="shader-slider-list">
                      <label>
                        <span>Colour Temperature: {Math.round(activeShader.tuning.colorTemp * 100)}%</span>
                        <input
                          type="range"
                          min="-1"
                          max="1"
                          step="0.05"
                          value={activeShader.tuning.colorTemp}
                          onChange={(e) => updateActiveShaderTuning('colorTemp', parseFloat(e.target.value))}
                        />
                      </label>
                      <label>
                        <span>Bloom Intensity: {Math.round(activeShader.tuning.bloomStrength * 100)}%</span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={activeShader.tuning.bloomStrength}
                          onChange={(e) => updateActiveShaderTuning('bloomStrength', parseFloat(e.target.value))}
                        />
                      </label>
                      <label>
                        <span>Vignette Darkness: {Math.round(activeShader.tuning.vignetteStrength * 100)}%</span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={activeShader.tuning.vignetteStrength}
                          onChange={(e) => updateActiveShaderTuning('vignetteStrength', parseFloat(e.target.value))}
                        />
                      </label>
                      <label>
                        <span>Gamma / Brightness: {Math.round(activeShader.tuning.brightness * 100)}%</span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={activeShader.tuning.brightness}
                          onChange={(e) => updateActiveShaderTuning('brightness', parseFloat(e.target.value))}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="shader-json-box">
                    <div className="shader-json-header">
                      <h3>JSON Specification</h3>
                      <button
                        type="button"
                        className="json-copy-btn"
                        onClick={() => {
                          navigator.clipboard?.writeText(shaderJson);
                          showToast('Copied JSON to clipboard');
                        }}
                      >
                        <StoreIcon name="copy" size={14} /> Copy
                      </button>
                    </div>
                    <textarea
                      className="shader-json-textarea"
                      spellCheck={false}
                      value={shaderJson}
                      onChange={(e) => handleShaderTextChange(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* THEMES CATEGORY */}
            {category === 'themes' && (
              <section className="java-market-info">
                <h2>Marketplace Themes</h2>
                <p>Unlock cosmetic UI colours with Fable Coins earned by mining ores in Survival or claimed free in this store. No real-money purchases.</p>
                <div className="java-market-theme-grid">
                  {(['default', 'copper', 'midnight'] as MarketplaceTheme[]).map((theme) => {
                    const cost = theme === 'default' ? 0 : 18;
                    const has = !cost || market.owns('theme:' + theme);
                    return (
                      <button
                        key={theme}
                        className={'java-market-theme ' + theme + (market.value.theme === theme ? ' selected' : '')}
                        disabled={market.value.theme === theme || (!has && market.value.coins < cost)}
                        onClick={() => {
                          if (has || market.buy('theme:' + theme, cost)) market.setTheme(theme);
                        }}
                      >
                        <strong>{theme === 'default' ? 'Fable' : theme === 'copper' ? 'Copper' : 'Midnight'}</strong>
                        <span>
                          {market.value.theme === theme ? 'Selected' : has ? 'Apply' : `${cost} Coins`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* GET SHARDS INFORMATION SCREEN */}
            {category === 'coins' && (
              <div className="shards-info-screen">
                <div className="shards-notice-banner">
                  <div className="shards-notice-icon"><StoreIcon name="info" size={26} /></div>
                  <div className="shards-notice-content">
                    <h3>Real-Money Purchases Disabled</h3>
                    <p>
                      <strong>FABLE does not collect real money or process payments.</strong> Fable Coins are a free,
                      cosmetic-only currency: earn them by mining ores in Survival or claim the free gifts below.
                    </p>
                    <p>
                      This screen is for information and free claims only. Do not expect or attempt a real checkout.
                    </p>
                  </div>
                </div>

                <div className="shards-overview-card">
                  <div className="shards-overview-balance">
                    <StoreIcon name="coin" size={32} />
                    <div>
                      <h2>Current Balance</h2>
                      <span className="shards-big-number">{market.value.coins} Fable Coins</span>
                    </div>
                  </div>
                </div>

                <div className="coin-claims-card">
                  <h3><StoreIcon name="gift" size={18} /> Free Coin Claims</h3>
                  <div className="coin-claim-row">
                    <div>
                      <strong>Welcome Gift</strong>
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
                      {market.value.starter ? 'Claimed' : `Claim +${STARTER_COINS} Coins`}
                    </Btn>
                  </div>
                  <div className="coin-claim-row">
                    <div>
                      <strong>Daily Gift</strong>
                      <p>
                        {market.dailyWait() === 0
                          ? 'Your daily gift is ready — come back every day for more!'
                          : `Next gift ready in ${fmtWait(market.dailyWait())}.`}
                      </p>
                    </div>
                    <Btn
                      small
                      disabled={market.dailyWait() > 0}
                      onClick={() => {
                        const got = market.claimDaily();
                        showToast(got ? `Claimed +${got} daily coins!` : 'Daily gift is cooling down.');
                      }}
                    >
                      {market.dailyWait() === 0 ? `Claim +${DAILY_COINS} Coins` : <><StoreIcon name="clock" size={14} /> {fmtWait(market.dailyWait())}</>}
                    </Btn>
                  </div>
                </div>

                <div className="shards-guide-card">
                  <h3><StoreIcon name="pick" size={18} /> How to Earn Fable Coins in Survival Mode</h3>
                  <p>
                    Fable Coins are earned naturally through gameplay! Whenever you mine rare ores underground in
                    Survival mode, coins are credited directly to your local profile:
                  </p>
                  <table className="shards-reward-table">
                    <thead>
                      <tr>
                        <th>Ore Block</th>
                        <th>Rarity</th>
                        <th>Coin Reward</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Coal Ore</td>
                        <td>Common</td>
                        <td>+1 Coin</td>
                      </tr>
                      <tr>
                        <td>Copper Ore</td>
                        <td>Common</td>
                        <td>+1 Coin</td>
                      </tr>
                      <tr>
                        <td>Iron Ore</td>
                        <td>Uncommon</td>
                        <td>+1 Coin</td>
                      </tr>
                      <tr>
                        <td>Gold Ore</td>
                        <td>Rare</td>
                        <td>+2 Coins</td>
                      </tr>
                      <tr>
                        <td>Lumen Block</td>
                        <td>Nether / Cavern</td>
                        <td>+1 Coin</td>
                      </tr>
                      <tr>
                        <td>Ember Ore</td>
                        <td>Deep Lava Veins</td>
                        <td>+3 Coins</td>
                      </tr>
                      <tr>
                        <td>Crystal Ore</td>
                        <td>Ultra Rare (Caves &amp; Void)</td>
                        <td>+6 Coins</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="shards-faq-card">
                  <h3>What Are Fable Coins Used For?</h3>
                  <ul>
                    <li>
                      <strong>Exclusive Character Skins:</strong> Unlock special built-in skins such as Stargazer and Tinkerer.
                    </li>
                    <li>
                      <strong>Dressing Room Headwear:</strong> Equip crowns, miner hardhats, wizard hats, aviator goggles, and antlers.
                    </li>
                    <li>
                      <strong>Store Themes:</strong> Customize the marketplace UI colors with Copper and Midnight themes.
                    </li>
                    <li>
                      <strong>Zero Pay-to-Win:</strong> All coin unlocks are 100% cosmetic and client-side. No gameplay advantages or stats.
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </main>

          {/* Skin Details Right Sidebar Inspector */}
          {detailsOpen && category === 'skins' && (
            <aside className="java-market-sidebar" aria-label="Character preview and skin details">
              <button
                className="java-market-close"
                aria-label="Close item details"
                onClick={() => setDetailsOpen(false)}
              >
                <StoreIcon name="close" size={17} />
              </button>
              <h2>Character Preview</h2>
              <div className="java-market-figure">
                <PresetFigureView preset={selected} width={200} height={300} />
                <span>Selected skin · 3D preview</span>
              </div>
              <p className="java-market-resolution">
                Built-in skins use a 64×64 pixel sheet. Import a 128–512px HD skin for finer details; screen resolution is
                separate from skin texture resolution.
              </p>
              <div className="java-market-selection">
                <h3>{selected.name}</h3>
                <span>
                  {selected.slim ? 'Slim arms' : 'Classic arms'} ·{' '}
                  {skinCost(selected) ? (
                    ownedSkin(selected) ? (
                      'Owned'
                    ) : (
                      <>
                        <StoreIcon name="coin" size={12} /> {skinCost(selected)} Coins
                      </>
                    )
                  ) : (
                    'Free'
                  )}
                </span>
                <div className="java-market-selection-art">
                  <PresetPortrait preset={selected} size={96} />
                </div>
                <Btn
                  disabled={
                    equippedSkin || (!ownedSkin(selected) && market.value.coins < skinCost(selected))
                  }
                  onClick={equipSkin}
                >
                  {equippedSkin
                    ? 'Equipped'
                    : ownedSkin(selected)
                    ? 'Equip Skin'
                    : market.value.coins < skinCost(selected)
                    ? 'Not Enough Coins'
                    : 'Unlock & Equip'}
                </Btn>
                {ownedSkin(selected) && (
                  <Btn small onClick={() => downloadSkin(selected)}>
                    Download PNG
                  </Btn>
                )}
                {settings.value.skinUrl && (
                  <div className="java-market-model">
                    <p>Imported skin arms:</p>
                    <Btn
                      small
                      disabled={!settings.value.skinSlim}
                      onClick={() => settings.set('skinSlim', false)}
                    >
                      Classic
                    </Btn>
                    <Btn
                      small
                      disabled={settings.value.skinSlim}
                      onClick={() => settings.set('skinSlim', true)}
                    >
                      Slim
                    </Btn>
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>

      <footer className="java-market-footer">
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg"
          className="marketplace-file"
          aria-label="Import skin image"
          onChange={(e) => {
            void uploadSkin(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <Btn small disabled={uploading} onClick={() => fileInput.current?.click()}>
          {uploading ? 'Importing…' : 'Import Skin PNG'}
        </Btn>
        <span>Original FABLE cosmetics · Local unlocks · No real-money purchases</span>
        {uploadError && (
          <span role="alert" className="java-market-error">
            {uploadError}
          </span>
        )}
        <Btn small onClick={() => store.goto('menu')}>
          Done
        </Btn>
      </footer>
    </div>
  );
}
