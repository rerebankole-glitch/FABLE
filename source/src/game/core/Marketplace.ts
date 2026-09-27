/** Local, cosmetic-only unlocks. Never represents real money or server-owned entitlements. */
const KEY = 'fable-marketplace-v1';
export type MarketplaceTheme = 'default' | 'copper' | 'midnight';
interface Profile { coins: number; unlocked: string[]; theme: MarketplaceTheme }
const DEFAULT: Profile = { coins: 0, unlocked: [], theme: 'default' };
const listeners = new Set<() => void>();
function read(): Profile {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || typeof raw !== 'object') return { ...DEFAULT, unlocked: [] };
    return {
      coins: Number.isSafeInteger(raw.coins) ? Math.max(0, Math.min(100000, raw.coins)) : 0,
      unlocked: Array.isArray(raw.unlocked) ? raw.unlocked.filter((v: unknown): v is string => typeof v === 'string').slice(0, 100) : [],
      theme: raw.theme === 'copper' || raw.theme === 'midnight' ? raw.theme : 'default',
    };
  } catch { return { ...DEFAULT, unlocked: [] }; }
}
let profile = read();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch { /* session still works when storage is unavailable */ }
  for (const listener of listeners) listener();
}
export const market = {
  get value(): Readonly<Profile> { return profile; },
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  /** Award only on actual survival ore harvests (the game calls this, not UI). */
  earn(amount: number) {
    if (!Number.isSafeInteger(amount) || amount <= 0) return;
    profile = { ...profile, coins: Math.min(100000, profile.coins + amount) }; save();
  },
  owns(id: string) { return profile.unlocked.includes(id); },
  buy(id: string, cost: number): boolean {
    if (!/^skin:[a-z]+$|^theme:(copper|midnight)$/.test(id) || !Number.isSafeInteger(cost) || cost <= 0 || profile.unlocked.includes(id) || profile.coins < cost) return false;
    profile = { ...profile, coins: profile.coins - cost, unlocked: [...profile.unlocked, id] }; save();
    return true;
  },
  setTheme(theme: MarketplaceTheme) {
    if (theme !== 'default' && !this.owns('theme:' + theme)) return false;
    profile = { ...profile, theme }; save(); return true;
  },
};
