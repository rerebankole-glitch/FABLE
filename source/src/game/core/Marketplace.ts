/** Local, cosmetic-only unlocks. Never represents real money or server-owned entitlements.
 *  The marketplace currency is "Fable Coins": earned by mining ores in Survival and via the
 *  free in-game claims (welcome gift + daily gift). */
const KEY = 'fable-marketplace-v1';
export type MarketplaceTheme = 'default' | 'copper' | 'midnight';
interface Profile {
  coins: number;
  unlocked: string[];
  theme: MarketplaceTheme;
  /** epoch ms of the last claimed daily gift (0 = never) */
  lastDaily: number;
  /** one-time welcome gift already claimed */
  starter: boolean;
}
const DEFAULT: Profile = { coins: 0, unlocked: [], theme: 'default', lastDaily: 0, starter: false };

/** Daily gift size and cooldown (20h so a once-a-day player never misses a day). */
export const DAILY_COINS = 25;
export const DAILY_COOLDOWN_MS = 20 * 60 * 60 * 1000;
/** One-time welcome gift for new profiles. */
export const STARTER_COINS = 40;

const listeners = new Set<() => void>();
function read(): Profile {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || typeof raw !== 'object') return { ...DEFAULT, unlocked: [] };
    return {
      coins: Number.isSafeInteger(raw.coins) ? Math.max(0, Math.min(100000, raw.coins)) : 0,
      unlocked: Array.isArray(raw.unlocked) ? raw.unlocked.filter((v: unknown): v is string => typeof v === 'string').slice(0, 100) : [],
      theme: raw.theme === 'copper' || raw.theme === 'midnight' ? raw.theme : 'default',
      lastDaily: Number.isSafeInteger(raw.lastDaily) ? Math.max(0, raw.lastDaily) : 0,
      starter: raw.starter === true,
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
  /** One-time welcome gift; returns the coins granted (0 when already claimed). */
  claimStarter(): number {
    if (profile.starter) return 0;
    profile = { ...profile, starter: true, coins: Math.min(100000, profile.coins + STARTER_COINS) }; save();
    return STARTER_COINS;
  },
  /** Free daily gift; returns the coins granted (0 while cooling down). */
  claimDaily(now = Date.now()): number {
    if (now - profile.lastDaily < DAILY_COOLDOWN_MS) return 0;
    profile = { ...profile, lastDaily: now, coins: Math.min(100000, profile.coins + DAILY_COINS) }; save();
    return DAILY_COINS;
  },
  /** ms until the daily gift can be claimed again (0 = ready now). */
  dailyWait(now = Date.now()): number {
    return Math.max(0, DAILY_COOLDOWN_MS - (now - profile.lastDaily));
  },
  reset(coins = 0) {
    profile = { ...profile, coins: Math.max(0, Math.min(100000, coins)) }; save();
  },
  owns(id: string) { return profile.unlocked.includes(id); },
  buy(id: string, cost: number): boolean {
    if (!/^(skin|theme|headwear):[a-z0-9_-]+$/.test(id) || !Number.isSafeInteger(cost) || cost <= 0 || profile.unlocked.includes(id) || profile.coins < cost) return false;
    profile = { ...profile, coins: profile.coins - cost, unlocked: [...profile.unlocked, id] }; save();
    return true;
  },
  setTheme(theme: MarketplaceTheme) {
    if (theme !== 'default' && !this.owns('theme:' + theme)) return false;
    profile = { ...profile, theme }; save(); return true;
  },
};
