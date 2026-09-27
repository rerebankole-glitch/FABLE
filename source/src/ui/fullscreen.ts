/**
 * Fullscreen helpers shared by the title screen, the settings screen and the in-game F11 handler.
 * Uses the standard Fullscreen API with the WebKit fallback older iPads still need; every entry point
 * is a user gesture so the browser allows it. Listeners are notified on any change (including Esc).
 */
const doc = document as Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

/** When the game is embedded in a same-origin page (the FABLE website's play page) fullscreen is driven on the
 *  top document so the outer page, the game and F11 all agree on the state. Cross-origin embeds fall back to
 *  the frame's own document, which browsers allow through allow="fullscreen". */
function hostDoc(): FsDoc {
  try { if (window.top && window.top !== window && window.top.document) return window.top.document as FsDoc; } catch { /* cross-origin */ }
  return doc;
}

export function isFullscreen(): boolean {
  const h = hostDoc();
  return !!(document.fullscreenElement || doc.webkitFullscreenElement || h.fullscreenElement || h.webkitFullscreenElement);
}

export function fullscreenSupported(): boolean {
  return !!(document.fullscreenEnabled || root.requestFullscreen || root.webkitRequestFullscreen);
}

export async function enterFullscreen(): Promise<boolean> {
  try {
    const el = (hostDoc().documentElement ?? root) as FsEl;
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    else return false;
    // Lock to landscape on phones when the platform allows it; failing is fine.
    const orient = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    if (orient?.lock && /Mobi|Android/i.test(navigator.userAgent)) orient.lock('landscape').catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

export async function exitFullscreen(): Promise<void> {
  for (const d of [doc, hostDoc()]) {
    try {
      if (d.fullscreenElement && d.exitFullscreen) await d.exitFullscreen();
      else if (d.webkitFullscreenElement && d.webkitExitFullscreen) await d.webkitExitFullscreen();
    } catch { /* already left */ }
  }
}

export async function toggleFullscreen(): Promise<boolean> {
  if (isFullscreen()) { await exitFullscreen(); return false; }
  return enterFullscreen();
}

export function onFullscreenChange(cb: (on: boolean) => void): () => void {
  const h = () => cb(isFullscreen());
  const docs = hostDoc() === doc ? [doc] : [doc, hostDoc()];
  for (const d of docs) { d.addEventListener('fullscreenchange', h); d.addEventListener('webkitfullscreenchange', h); }
  return () => { for (const d of docs) { d.removeEventListener('fullscreenchange', h); d.removeEventListener('webkitfullscreenchange', h); } };
}

/** Global F11 handler (browsers only toggle their own fullscreen on F11 when the page does not handle it). */
export function installFullscreenHotkey(): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.code !== 'F11' || e.repeat) return;
    e.preventDefault();
    void toggleFullscreen();
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
