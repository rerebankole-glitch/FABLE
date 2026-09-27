/**
 * Dimension identity and look.
 *
 * The two dimension ids ('overworld' / 'void') are internal and must not change: they are baked
 * into every existing save key ('o:' / 'v:'). Everything the player actually sees — the name, the
 * fog, the ambient light, the portal copy — is data here so the look and the naming can be
 * retuned in one place.
 */
export type Dim = 'overworld' | 'void';

export interface DimensionDef {
  id: Dim;
  /** Proper name, used on its own ("The Emberdeep"). */
  name: string;
  /** Short tagline shown when arriving. */
  flavour: string;
  /** Horizon / distance fog colour, linear RGB. null = use the biome's own fog. */
  fog: [number, number, number] | null;
  /** Fixed ambient light level, or null to follow the day/night cycle. */
  ambient: number | null;
  /** Fixed sky time, or null to follow the world clock. */
  fixedTime: number | null;
  /** Whether clouds and weather are simulated here. */
  sky: boolean;
  /** Spawn height when arriving without a bed/anchor. */
  spawnY: number;
}

export const DIMENSIONS: Record<Dim, DimensionDef> = {
  overworld: {
    id: 'overworld',
    name: 'The Weald',
    flavour: 'Open sky, running water and honest daylight.',
    fog: null,
    ambient: null,
    fixedTime: null,
    sky: true,
    spawnY: 80,
  },
  void: {
    id: 'void',
    name: 'The Emberdeep',
    flavour: 'A violet dark lit from below. Beware the Wyrm.',
    // Deep violet horizon instead of the old muddy red — it reads as a different world at a
    // glance and throws the orange of the lava seas into relief.
    fog: [0.17, 0.05, 0.24],
    ambient: 0.26,
    fixedTime: 18000,
    sky: false,
    spawnY: 70,
  },
};

export const dimName = (d: Dim): string => DIMENSIONS[d].name;
