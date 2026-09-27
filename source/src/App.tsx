import React, { useEffect, useState } from 'react';
import { store, useStore } from './ui/store';
import { MainMenu, SinglePlayer, CreateWorld, Multiplayer, LanguageScreen, CreditsScreen } from './ui/Menus';
import { SkinMarketplace } from './ui/SkinMarketplace';
import { SettingsScreen } from './ui/SettingsScreen';
import { HUD, PauseMenu, DeathScreen, LoadingScreen } from './ui/HUD';
import { InventoryScreen } from './ui/InventoryScreen';
import { MobileControls } from './ui/Mobile';
import { MenuBackground } from './ui/MenuBackground';
import { CANVAS_ID, currentGame, onGameChange, quitToTitle } from './ui/session';
import { settings } from './game/core/Settings';
import { installFullscreenHotkey } from './ui/fullscreen';
import type { Game } from './game/core/Game';

function useGame(): Game | null {
  const [g, setG] = useState<Game | null>(currentGame());
  useEffect(() => onGameChange(setG), []);
  return g;
}

function useSettingsVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => settings.subscribe(() => setV((n) => n + 1)), []);
  return v;
}

/** Everything drawn on top of the 3D canvas while a world is active. */
function GameLayer({ game }: { game: Game }) {
  const overlay = useStore((s) => s.overlay);
  const paused = useStore((s) => s.paused);
  const dead = useStore((s) => s.dead);
  const mobile = useStore((s) => s.mobile);
  const screen = useStore((s) => s.screen);
  const quit = () => { quitToTitle(); };
  // Release the pointer whenever a UI layer needs the mouse.
  useEffect(() => {
    if ((dead || paused || overlay || screen !== 'game') && document.pointerLockElement) document.exitPointerLock();
  }, [dead, paused, overlay, screen]);
  if (screen !== 'game') return null;
  return (
    <>
      <HUD game={game} />
      {mobile && !dead && <MobileControls game={game} />}
      {overlay && !dead && <InventoryScreen game={game} />}
      {paused && !dead && <PauseMenu game={game} onQuit={quit} />}
      {dead && <DeathScreen game={game} onQuit={quit} />}
    </>
  );
}

export default function App() {
  const screen = useStore((s) => s.screen);
  const session = useStore((s) => s.session);
  const game = useGame();
  useSettingsVersion();
  const inWorld = screen === 'game' || screen === 'loading' || (screen === 'settings' && !!game);
  const showMenuBg = !inWorld && !game;

  useEffect(() => installFullscreenHotkey(), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(settings.value.uiScale));
    document.documentElement.style.setProperty('--text-scale', String(settings.value.textScale));
    document.documentElement.classList.toggle('reduced-flashing', settings.value.reducedFlashing);
    document.documentElement.lang = settings.value.language;
  });

  // Block the browser context menu & pinch-zoom while a world is open.
  useEffect(() => {
    const prevent = (e: Event) => { if (store.state.screen === 'game') e.preventDefault(); };
    document.addEventListener('contextmenu', prevent);
    document.addEventListener('gesturestart', prevent);
    return () => { document.removeEventListener('contextmenu', prevent); document.removeEventListener('gesturestart', prevent); };
  }, []);

  return (
    <div className="app" data-screen={screen}>
      {/* The WebGL canvas is kept mounted for the whole session so the renderer context survives screen changes. */}
      <canvas key={session} id={CANVAS_ID} data-session={session} className="game-canvas" style={{ visibility: game && screen !== 'loading' ? 'visible' : 'hidden' }} />
      {showMenuBg && <MenuBackground />}

      {screen === 'menu' && <MainMenu />}
      {screen === 'singleplayer' && <SinglePlayer />}
      {screen === 'create' && <CreateWorld />}
      {screen === 'multiplayer' && <Multiplayer />}
      {screen === 'language' && <LanguageScreen />}
      {screen === 'credits' && <CreditsScreen />}
      {screen === 'settings' && <SettingsScreen />}
      {screen === 'marketplace' && <SkinMarketplace />}
      {screen === 'loading' && <LoadingScreen />}
      {game && <GameLayer game={game} />}
    </div>
  );
}
