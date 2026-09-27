import React, { useEffect, useRef, useState } from 'react';
import { SKIN_PRESETS, builtinSkinCanvas, type SkinPreset } from '../game/core/Skins';
import { settings } from '../game/core/Settings';
import { market, type MarketplaceTheme } from '../game/core/Marketplace';
import { PresetFigureView, PresetPortrait } from './PlayerPreview';
import { Btn } from './components';
import { StoreIcon } from './StoreIcon';
import { SaveManager, type WorldSummary } from '../game/save/SaveManager';
import { loadSkinFile } from '../game/core/SkinTexture';
import { store } from './store';

type Category = 'skins' | 'packs' | 'worlds' | 'themes';
type Filter = 'all' | 'classic' | 'slim';
const heroImage = new URL('../../site/assets/shot-overworld.png', import.meta.url).href;
const featureImages = [
  new URL('../../site/assets/shot-night.png', import.meta.url).href,
  new URL('../../site/assets/shot-sunset.png', import.meta.url).href,
  new URL('../../site/assets/shot-creative.png', import.meta.url).href,
  new URL('../../site/assets/shot-mining.png', import.meta.url).href,
];
const skinCost = (p: SkinPreset) => p.id === 'stargazer' || p.id === 'tinkerer' ? 12 : 0;

/** An original Java-GUI-inspired storefront for locally saved cosmetics. */
export function SkinMarketplace() {
  const [category, setCategory] = useState<Category>('skins');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<SkinPreset>(SKIN_PRESETS.find(p => p.id === settings.value.skinPreset) ?? SKIN_PRESETS[0]);
  const [search, setSearch] = useState('');
  const [featured, setFeatured] = useState(SKIN_PRESETS.length - 2);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [carouselPage, setCarouselPage] = useState(2);
  const [uploading, setUploading] = useState(false);
  const [worldShots, setWorldShots] = useState<WorldSummary[]>([]);
  const [uploadError, setUploadError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const [, refresh] = useState(0);
  useEffect(() => settings.subscribe(() => refresh(v => v + 1)), []);
  useEffect(() => market.subscribe(() => refresh(v => v + 1)), []);
  useEffect(() => { let alive = true; void SaveManager.list().then(worlds => { if (alive) setWorldShots(worlds.filter(w => !!w.preview)); }).catch(() => {}); return () => { alive = false; }; }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); if (detailsOpen) setDetailsOpen(false); else store.goto('menu'); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [detailsOpen]);

  // Saved world previews are real in-game captures; bundled screenshots are a first-run fallback.
  const screenshot = (index: number) => (worldShots.length ? worldShots[index % worldShots.length]?.preview : undefined) || featureImages[index % featureImages.length];
  const owned = (p: SkinPreset) => !skinCost(p) || market.owns('skin:' + p.id);
  const equipped = !settings.value.skinUrl && settings.value.skinPreset === selected.id;
  const filtered = SKIN_PRESETS.filter(p => p.name.toLowerCase().includes(search.trim().toLowerCase()) &&
    (filter === 'all' || !!p.slim === (filter === 'slim')));
  const equip = () => {
    if (!owned(selected) && !market.buy('skin:' + selected.id, skinCost(selected))) return;
    settings.set('skinUrl', '');
    settings.set('skinSlim', !!selected.slim);
    settings.set('skinPreset', selected.id);
    settings.set('skin', { skin: selected.skin, hair: selected.hair, shirt: selected.shirt, pants: selected.pants });
  };
  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true); setUploadError('');
    try {
      const result = await loadSkinFile(file);
      if (!result.ok) { setUploadError(result.error); return; }
      settings.set('skinUrl', result.skin.url);
      settings.set('skinSlim', result.skin.slim);
      settings.set('skinPreset', 'custom');
    } catch { setUploadError('Could not import that skin image.'); }
    finally { setUploading(false); }
  };
  const download = () => {
    const canvas = builtinSkinCanvas(selected);
    if (!canvas) return;
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `fable-${selected.id}-skin.png`;
    link.click();
  };

  return <div className="menu-screen dirt-bg java-market" data-theme={market.value.theme}>
    <header className="java-market-header">
      <Btn small onClick={() => store.goto('menu')}><StoreIcon name="back" size={16} /> Back</Btn>
      <h1>Store</h1>
      <span className="java-market-balance" title="Mine ores in Survival to earn shards"><StoreIcon name="shard" size={17} /> Fable Shards: <strong>{market.value.coins}</strong></span>
      <input className="java-market-top-search" aria-label="Search skins" placeholder="Search skins…" value={search} onChange={e => { setSearch(e.target.value); setCategory('skins'); }} />
    </header>
    <nav className="java-market-rail" aria-label="Marketplace quick links">
      <button title="Skins" aria-label="Skins" onClick={() => setCategory('skins')}><StoreIcon name="skin" /></button>
      <button title="Packs" aria-label="Resource Packs" onClick={() => setCategory('packs')}><StoreIcon name="pack" /></button>
      <button title="Themes" aria-label="Themes" onClick={() => setCategory('themes')}><StoreIcon name="theme" /></button>
    </nav>
    <div className="java-market-layout">
      <main className="java-market-main">
        <div className="java-market-promo">FABLE STORE <span>{worldShots.length ? 'Showing recent captures from your saved worlds.' : 'Play a world and press F2 to refresh the local game screenshots.'}</span></div>
        <div className="java-market-showcase">
          <button className="java-market-hero" style={{ backgroundImage: `url(${worldShots[0]?.preview || heroImage})` }} onClick={() => { setCategory('skins'); setSelected(SKIN_PRESETS[featured]); setDetailsOpen(true); }}>
            <span className="java-market-hero-label">FEATURED SKIN</span>
            <PresetPortrait preset={SKIN_PRESETS[featured]} size={96} />
            <strong>{SKIN_PRESETS[featured].name}</strong>
          </button>
          <div className="java-market-feature-grid">{SKIN_PRESETS.slice(-4).map((p, i) => <button key={p.id} className="java-market-feature-card" onClick={() => { setCategory('skins'); setSelected(p); setDetailsOpen(true); }}>
            <img src={screenshot(i)} alt="FABLE gameplay capture" /><span>{p.name}</span><small>{skinCost(p) ? <><StoreIcon name="shard" size={12} /> {skinCost(p)}</> : 'Free'}</small>
          </button>)}</div>
        </div>
        <div className="java-market-feature-controls" aria-label="Featured skins">{SKIN_PRESETS.slice(-3).map((p, i) => <button key={p.id} aria-label={`Feature ${p.name}`} aria-pressed={featured === SKIN_PRESETS.length - 3 + i} onClick={() => setFeatured(SKIN_PRESETS.length - 3 + i)}><span className={featured === SKIN_PRESETS.length - 3 + i ? 'active' : ''} /></button>)}</div>
        <nav className="java-market-tabs" aria-label="Marketplace sections">
          {([['skins', 'Skins'], ['packs', 'Textures'], ['worlds', 'Worlds'], ['themes', 'Themes']] as [Category, string][]).map(([id, label]) =>
            <button key={id} type="button" className={category === id ? 'active' : ''} aria-current={category === id ? 'page' : undefined} onClick={() => setCategory(id)}><StoreIcon name={id === 'skins' ? 'skin' : id === 'packs' ? 'pack' : id === 'worlds' ? 'world' : 'theme'} size={22} /> {label}</button>)}
        </nav>
        <div className="java-market-new-head"><h2>New &amp; Featured</h2><span>{carouselPage + 1}/3</span></div>
        <div className="java-market-carousel">
          <button className="java-market-arrow" aria-label="Previous featured skins" onClick={() => setCarouselPage((carouselPage + 2) % 3)}><StoreIcon name="left" size={26} /></button>
          {SKIN_PRESETS.slice(carouselPage * 4, carouselPage * 4 + 4).map((p, i) => <button key={p.id} className="java-market-carousel-card" onClick={() => { setCategory('skins'); setSelected(p); setDetailsOpen(true); }}>
            <div className="java-market-carousel-art"><img src={screenshot(i)} alt="FABLE gameplay capture" /><PresetPortrait preset={p} size={64} /></div>
            <strong>{p.name}</strong><small>Original FABLE skin</small><span>{skinCost(p) ? <><StoreIcon name="shard" size={12} /> {skinCost(p)}</> : 'Free'}</span>
          </button>)}
          <button className="java-market-arrow" aria-label="Next featured skins" onClick={() => setCarouselPage((carouselPage + 1) % 3)}><StoreIcon name="right" size={26} /></button>
        </div>
        {category === 'skins' && <>
          <div className="java-market-controls">
            <div className="java-market-filters" role="group" aria-label="Arm model">
              {(['all', 'classic', 'slim'] as Filter[]).map(f => <button key={f} className={filter === f ? 'active' : ''} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : f === 'classic' ? 'Classic' : 'Slim'}</button>)}
            </div>
          </div>
          <p className="java-market-heading">SKINS <span>({filtered.length})</span></p>
          <div className="java-market-grid">{filtered.map(p => <button key={p.id} type="button" className={'java-market-card' + (selected.id === p.id ? ' selected' : '')} aria-pressed={selected.id === p.id} onClick={() => { setSelected(p); setDetailsOpen(true); }}>
            <span className="java-market-card-art"><PresetPortrait preset={p} size={96} /></span>
            <strong>{p.name}</strong>
            <span className="java-market-card-meta">{p.slim ? 'Slim' : 'Classic'} · {skinCost(p) ? owned(p) ? 'Owned' : <><StoreIcon name="shard" size={12} /> {skinCost(p)}</> : 'Free'}</span>
            {!settings.value.skinUrl && settings.value.skinPreset === p.id && <span className="java-market-equipped">Equipped</span>}
          </button>)}</div>
          {!filtered.length && <p role="status">No matching skins.</p>}
          <p className="java-market-help">Want a community-made skin? <a href={`https://www.google.com/search?q=${encodeURIComponent('site:planetminecraft.com/resources/skin/ ' + (search.trim() || 'minecraft skins'))}`} target="_blank" rel="noopener noreferrer">Find skins on the web </a> Download from the creator, then import its PNG. External skins are not sold by FABLE.</p>
        </>}
        {category === 'worlds' && <section className="java-market-info"><h2>Worlds</h2><p>Create and play your own worlds in Singleplayer. Downloadable marketplace worlds are not available yet.</p><Btn onClick={() => store.goto('singleplayer')}>Open My Worlds</Btn></section>}
        {category === 'packs' && <section className="java-market-info">
          <h2>Resource Packs</h2>
          <p>Import supported Java texture packs (.zip or .mcpack) from Options → Resource Packs. Missing textures fall back to FABLE art; Java shaders, data packs and Forge/Fabric mods do not run here.</p>
          <Btn onClick={() => store.goto('settings')}>Open Resource Pack Options</Btn>
        </section>}
        {category === 'themes' && <section className="java-market-info">
          <h2>Marketplace Themes</h2>
          <p>Unlock cosmetic colours with Fable Shards earned by mining ores in Survival. No real-money purchases.</p>
          <div className="java-market-theme-grid">{(['default', 'copper', 'midnight'] as MarketplaceTheme[]).map(theme => {
            const cost = theme === 'default' ? 0 : 18;
            const has = !cost || market.owns('theme:' + theme);
            return <button key={theme} className={'java-market-theme ' + theme + (market.value.theme === theme ? ' selected' : '')} disabled={market.value.theme === theme || (!has && market.value.coins < cost)} onClick={() => { if (has || market.buy('theme:' + theme, cost)) market.setTheme(theme); }}>
              <strong>{theme === 'default' ? 'Fable' : theme === 'copper' ? 'Copper' : 'Midnight'}</strong><span>{market.value.theme === theme ? 'Selected' : has ? 'Apply' : `${cost} Shards`}</span>
            </button>;
          })}</div>
        </section>}
      </main>
      {detailsOpen && category === 'skins' && <aside className="java-market-sidebar" aria-label="Character preview and skin details">
        <button className="java-market-close" aria-label="Close item details" onClick={() => setDetailsOpen(false)}><StoreIcon name="close" size={17} /></button>
        <h2>Character Preview</h2>
        <div className="java-market-figure"><PresetFigureView preset={selected} width={200} height={300} /><span>Selected skin · 3D preview</span></div>
        <p className="java-market-resolution">Built-in skins use a 64×64 pixel sheet. Import a 128–512px HD skin for finer details; screen resolution is separate from skin texture resolution.</p>
        {category === 'skins' && <div className="java-market-selection">
          <h3>{selected.name}</h3>
          <span>{selected.slim ? 'Slim arms' : 'Classic arms'} · {skinCost(selected) ? owned(selected) ? 'Owned' : <><StoreIcon name="shard" size={12} /> {skinCost(selected)} Shards</> : 'Free'}</span>
          <div className="java-market-selection-art"><PresetPortrait preset={selected} size={96} /></div>
          <Btn disabled={equipped || (!owned(selected) && market.value.coins < skinCost(selected))} onClick={equip}>{equipped ? 'Equipped' : owned(selected) ? 'Equip Skin' : market.value.coins < skinCost(selected) ? 'Not Enough Shards' : 'Unlock & Equip'}</Btn>
          {owned(selected) && <Btn small onClick={download}>Download PNG</Btn>}
          {settings.value.skinUrl && <div className="java-market-model"><p>Imported skin arms:</p><Btn small disabled={!settings.value.skinSlim} onClick={() => settings.set('skinSlim', false)}>Classic</Btn><Btn small disabled={settings.value.skinSlim} onClick={() => settings.set('skinSlim', true)}>Slim</Btn></div>}
        </div>}
      </aside>}
    </div>
    <footer className="java-market-footer">
      <input ref={fileInput} type="file" accept="image/png,image/jpeg" className="marketplace-file" aria-label="Import skin image" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
      <Btn small disabled={uploading} onClick={() => fileInput.current?.click()}>{uploading ? 'Importing…' : 'Import Skin PNG'}</Btn>
      <span>Original FABLE cosmetics · Local unlocks · No real-money purchases</span>
      {uploadError && <span role="alert" className="java-market-error">{uploadError}</span>}
      <Btn small onClick={() => store.goto('menu')}>Done</Btn>
    </footer>
  </div>;
}
