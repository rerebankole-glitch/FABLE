/**
 * World discovery — the "explorer's journal". The world is full of places and finds worth
 * celebrating exactly once: the first time you set foot in a biome, open the loot of a
 * generated structure, strike a rare ore or fell the boss. Each first is rewarded with a
 * toast, a soft chime and a little XP, so exploring pays and progression keeps flowing.
 *
 * State is a flat set of keys saved with the world ("b:12" biome id, "l:dungeon" loot table,
 * "r:wyrm" rare first), each stamped with the dimension it was earned in ("o:"/"v:") the same
 * way chunk-visit keys are (see Game.buildSave / createWorld). Loading restores the set
 * silently — no re-celebrations on re-entering a world.
 */

export const LOOT_LABELS: Record<string, string> = {
  village: 'a village home',
  temple: 'a Desert Temple',
  tower: 'a Ruined Tower',
  ruins: 'Ancient Ruins',
  shipwreck: 'a Shipwreck',
  dungeon: 'a Buried Dungeon',
  void: 'a Void Vault',
};

export interface DiscoveryFeed {
  message(text: string): void;
  addXp(n: number): void;
  chime(big: boolean): void;
}

export class Discovery {
  private seen = new Set<string>();
  /** while true the feed stays quiet (restoring a save must not replay every toast) */
  private silent = false;

  constructor(private feed: DiscoveryFeed) {}

  get count(): number { return this.seen.size; }
  has(key: string): boolean { return this.seen.has(key); }

  /** First entry into a biome. @returns true when it was new (and was celebrated). */
  biome(id: number, name: string, xp = 5): boolean {
    return this.claim(`b:${id}`, `Discovered: ${name}`, xp, false);
  }

  /** First loot taken from a generated structure. @returns true when it was new. */
  loot(table: string, xp = 10): boolean {
    const what = LOOT_LABELS[table] ?? 'hidden treasure';
    return this.claim(`l:${table}`, `You discovered ${what}!`, xp, true);
  }

  /** Any other one-of-a-kind find (rare ores, boss kills, secret places). */
  rare(key: string, label: string, xp: number): boolean {
    return this.claim(`r:${key}`, `You discovered ${label}!`, xp, true);
  }

  private claim(key: string, toast: string, xp: number, big: boolean): boolean {
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    if (!this.silent) {
      this.feed.message(`${toast}${xp > 0 ? `  (+${xp} XP)` : ''}`);
      this.feed.chime(big);
      if (xp > 0) this.feed.addXp(xp);
    }
    return true;
  }

  /** Prefixed keys are stamped by the caller (Game adds the "o:"/"v:" dimension prefix at save time). */
  serialize(): string[] { return [...this.seen].sort(); }

  /** Restore from a save: Game has already stripped the dimension prefix from each entry. */
  load(entries: string[]): void {
    this.silent = true;
    for (const e of entries) if (/^[blr]:/.test(e)) this.seen.add(e);
    this.silent = false;
  }
}
