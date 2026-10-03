import * as THREE from 'three';

export interface HeadwearItem {
  id: string;
  name: string;
  desc: string;
  cost: number; // 0 = free, >0 = Fable Coins
  category: 'hat' | 'helm' | 'accessory' | 'costume';
  accentColor: string;
}

export const HEADWEAR_ITEMS: HeadwearItem[] = [
  { id: 'none', name: 'None', desc: 'No headwear equipped', cost: 0, category: 'accessory', accentColor: '#888888' },
  { id: 'crown', name: 'Royal Crown', desc: 'Golden circlet with velvet lining, ruby and sapphire gemstones', cost: 25, category: 'hat', accentColor: '#ffd700' },
  { id: 'miner', name: "Miner's Hardhat", desc: 'Sturdy underground safety helmet with bright carbide front lamp', cost: 10, category: 'helm', accentColor: '#ffcc00' },
  { id: 'straw', name: "Farmer's Straw Hat", desc: 'Wide-brim woven sun hat with a rustic forest green ribbon', cost: 0, category: 'hat', accentColor: '#d4b26f' },
  { id: 'wizard', name: 'Mage Pointy Hat', desc: 'Mystic indigo pointed hat with an embroidered golden star buckle', cost: 20, category: 'hat', accentColor: '#4b3ca7' },
  { id: 'knight', name: "Knight's Visor", desc: 'Heavy forged steel combat visor with narrow view slit', cost: 20, category: 'helm', accentColor: '#9fa8b0' },
  { id: 'bandana', name: 'Adventurer Bandana', desc: 'Crimson forehead wrap tied securely at the temple', cost: 0, category: 'accessory', accentColor: '#cf3232' },
  { id: 'goggles', name: 'Aviator Goggles', desc: 'Brass-rimmed steampunk aviator goggles resting on the brow', cost: 12, category: 'accessory', accentColor: '#bfa054' },
  { id: 'bunny', name: 'Bunny Ears', desc: 'Soft pastel bunny ears perched playfully atop your head', cost: 15, category: 'costume', accentColor: '#f7c5d5' },
  { id: 'wreath', name: 'Blossom Wreath', desc: 'Woven wild ivy garland dotted with fresh spring blossoms', cost: 15, category: 'accessory', accentColor: '#52b788' },
  { id: 'antlers', name: 'Forest Antlers', desc: 'Branching wooden antlers carved from sturdy ancient oak', cost: 25, category: 'costume', accentColor: '#6f4e37' },
  { id: 'beret', name: 'Scout Beret', desc: 'Woodland green beret adorned with a golden quill feather', cost: 0, category: 'hat', accentColor: '#2d6a4f' },
];

export function getHeadwearById(id: string): HeadwearItem {
  return HEADWEAR_ITEMS.find((h) => h.id === id) ?? HEADWEAR_ITEMS[0];
}

/**
 * Paint pixel-art headwear onto the HAT overlay region of a 64x64 skin sheet buffer.
 * In the modern 64x64 skin net:
 *   HAT Top:    cols 40..47, rows 0..7
 *   HAT Left:   cols 32..39, rows 8..15
 *   HAT Front:  cols 40..47, rows 8..15
 *   HAT Right:  cols 48..55, rows 8..15
 *   HAT Back:   cols 56..63, rows 8..15
 */
export function paintHeadwearSheet(buf: Uint8ClampedArray, id: string): void {
  if (!id || id === 'none') return;

  const setP = (x: number, y: number, r: number, g: number, b: number, a = 255) => {
    if (x < 0 || y < 0 || x >= 64 || y >= 64) return;
    const idx = (y * 64 + x) * 4;
    buf[idx] = r;
    buf[idx + 1] = g;
    buf[idx + 2] = b;
    buf[idx + 3] = a;
  };

  const rect = (x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number, a = 255) => {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) setP(x, y, r, g, b, a);
    }
  };

  // Placement rules, matching the 3D accessories in attachHeadwear3D below:
  //   * the HAT TOP face (cols 40..47, rows 0..7) is the crown of the head — domes, ears, antlers
  //     and the top plate of a circlet live there, and the oblique store preview shows that face;
  //   * the side faces (cols 32..63, rows 8..15) carry the band/casing, which sits on the BROW
  //     (rows 8..11). Row 12 is the eye row and rows 13..15 are the mouth/chin: headwear never
  //     paints there, so a face always reads through whatever is worn.
  const BROW_TOP = 8, BROW_BOTTOM = 12; // rows 8..11 inclusive
  const sides = [32, 40, 48, 56];

  switch (id) {
    case 'crown': {
      const gold = [245, 192, 34] as const, goldLight = [255, 225, 107] as const, goldDark = [179, 136, 16] as const;
      rect(40, 0, 48, 8, ...gold);                       // top plate
      for (const x of sides) {
        rect(x, BROW_TOP, x + 8, BROW_TOP + 2, ...gold);         // band
        rect(x, BROW_TOP + 2, x + 8, BROW_BOTTOM, ...goldDark);  // lining just above the eyes
      }
      // spires rising from the front edge of the plate
      for (const x of [40, 42, 45, 47]) setP(x, 7, ...goldLight);
      setP(43, 9, 217, 30, 54);   // ruby
      setP(44, 9, 30, 96, 217);   // sapphire
      break;
    }

    case 'miner': {
      const shell = [235, 186, 38] as const, rim = [196, 150, 21] as const;
      rect(40, 0, 48, 8, ...shell);                      // dome
      for (const x of sides) {
        rect(x, BROW_TOP, x + 8, BROW_TOP + 3, ...shell);
        rect(x, BROW_TOP + 3, x + 8, BROW_BOTTOM, ...rim);
      }
      rect(43, 8, 45, 11, 60, 60, 65);                   // lamp casing
      setP(43, 9, 255, 255, 200); setP(44, 9, 255, 255, 200); // glowing lens
      break;
    }

    case 'straw': {
      const straw = [216, 190, 117] as const, ribbon = [46, 110, 60] as const, shade = [191, 164, 86] as const;
      rect(40, 0, 48, 8, ...straw);                      // woven crown
      for (const x of sides) {
        rect(x, BROW_TOP, x + 8, BROW_TOP + 2, ...straw);
        rect(x, BROW_TOP + 2, x + 8, BROW_TOP + 3, ...ribbon);
        rect(x, BROW_TOP + 3, x + 8, BROW_BOTTOM, ...shade);
      }
      break;
    }

    case 'wizard': {
      const cloth = [53, 45, 106] as const, dark = [32, 26, 66] as const;
      rect(40, 0, 48, 8, ...cloth);                      // stepped cone seen from above
      for (const x of sides) {
        rect(x, BROW_TOP, x + 8, BROW_TOP + 2, ...cloth);
        rect(x, BROW_TOP + 2, x + 8, BROW_BOTTOM, ...dark); // brim
      }
      setP(43, 8, 247, 207, 62); setP(44, 8, 255, 235, 130); // star buckle
      break;
    }

    case 'knight': {
      const steel = [158, 165, 173] as const, plate = [142, 149, 157] as const, shade = [110, 116, 122] as const;
      rect(40, 0, 48, 8, ...steel);                      // helm dome
      for (const x of sides) {
        rect(x, BROW_TOP, x + 8, BROW_TOP + 2, ...plate);
        rect(x, BROW_TOP + 2, x + 8, BROW_BOTTOM, ...shade);
      }
      rect(41, 10, 47, 12, 24, 25, 28);                  // brow slit, clear of the eyes
      break;
    }

    case 'bandana': {
      const red = [194, 41, 41] as const, dark = [150, 25, 25] as const;
      for (const x of sides) rect(x, BROW_TOP + 1, x + 8, BROW_TOP + 3, ...red);
      setP(33, 11, ...dark); setP(33, 12, ...dark); setP(34, 12, ...dark); // tied tails at the temple
      break;
    }

    case 'goggles': {
      const leather = [60, 38, 25] as const, brass = [201, 150, 48] as const, glass = [109, 224, 232] as const;
      for (const x of sides) rect(x, BROW_TOP + 1, x + 8, BROW_TOP + 3, ...leather);
      rect(41, BROW_TOP, 44, BROW_TOP + 3, ...brass);    // left casing
      rect(44, BROW_TOP, 47, BROW_TOP + 3, ...brass);    // right casing
      setP(42, BROW_TOP + 1, ...glass); setP(45, BROW_TOP + 1, ...glass);
      break;
    }

    case 'bunny': {
      const fur = [250, 250, 250] as const, inner = [247, 168, 184] as const;
      rect(41, 1, 43, 7, ...fur);                        // ears on the top plane
      rect(45, 1, 47, 7, ...fur);
      rect(41, BROW_TOP, 43, BROW_TOP + 2, ...fur);      // bases against the brow
      rect(45, BROW_TOP, 47, BROW_TOP + 2, ...fur);
      setP(42, 2, ...inner); setP(46, 2, ...inner);
      break;
    }

    case 'wreath': {
      const vine = [52, 138, 72] as const;
      for (const x of sides) rect(x, BROW_TOP, x + 8, BROW_TOP + 2, ...vine);
      setP(41, 8, 255, 107, 157);  // pink blossom
      setP(43, 9, 255, 224, 67);   // yellow
      setP(45, 8, 255, 255, 255);  // white
      setP(47, 9, 180, 123, 238);  // violet
      break;
    }

    case 'antlers': {
      const wood = [176, 122, 74] as const, tip = [214, 172, 122] as const, base = [140, 96, 58] as const;
      rect(40, 1, 42, 7, ...wood);                       // branching rack on the top plane
      rect(46, 1, 48, 7, ...wood);
      setP(41, 2, ...tip); setP(47, 2, ...tip);          // budding branch tips
      rect(41, BROW_TOP, 42, BROW_TOP + 2, ...base);     // bases above the brow
      rect(46, BROW_TOP, 47, BROW_TOP + 2, ...base);
      break;
    }

    case 'beret': {
      const green = [45, 106, 60] as const, dark = [37, 84, 52] as const;
      rect(40, 0, 48, 8, ...green);                      // flat beret top
      for (const x of sides) rect(x, BROW_TOP, x + 8, BROW_TOP + 2, ...dark);
      setP(41, 8, 237, 210, 64); setP(41, 9, 237, 210, 64); // gold feather quill
      break;
    }
  }
}

const ATTACHMENT_NAME = 'fable-headwear-attachment';

/**
 * Creates 3D Three.js geometry accessories and attaches them as child objects to the player's head mesh.
 * Replaces any previously attached headwear cleanly to prevent memory leaks.
 */
export function attachHeadwear3D(head: THREE.Object3D, id: string): THREE.Group | null {
  // Clean up any existing headwear attached to this head
  const prev = head.getObjectByName(ATTACHMENT_NAME);
  if (prev) {
    head.remove(prev);
    prev.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
  }

  if (!id || id === 'none') return null;

  const P = 1 / 16;
  const root = new THREE.Group();
  root.name = ATTACHMENT_NAME;

  // Polygon offset pushes every headwear box slightly toward the camera so it always renders
  // in front of the hat overlay underneath. Without this the hat texture and the accessory
  // share nearly identical depth values and flicker (Z-fight) on the same pixels.
  const mkBox = (w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshBasicMaterial({
      color,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    root.add(mesh);
    return mesh;
  };

  switch (id) {
    case 'crown': {
      const gold = 0xf5c022;
      // Front, back, left, right golden circlet bands at top of head
      mkBox(9 * P, 2 * P, 0.6 * P, gold, 0, 0.48, 0.26);
      mkBox(9 * P, 2 * P, 0.6 * P, gold, 0, 0.48, -0.26);
      mkBox(0.6 * P, 2 * P, 9 * P, gold, -0.26, 0.48, 0);
      mkBox(0.6 * P, 2 * P, 9 * P, gold, 0.26, 0.48, 0);
      // 4 golden corner spires
      mkBox(1.2 * P, 2.2 * P, 1.2 * P, gold, -0.25, 0.58, 0.25);
      mkBox(1.2 * P, 2.2 * P, 1.2 * P, gold, 0.25, 0.58, 0.25);
      mkBox(1.2 * P, 2.2 * P, 1.2 * P, gold, -0.25, 0.58, -0.25);
      mkBox(1.2 * P, 2.2 * P, 1.2 * P, gold, 0.25, 0.58, -0.25);
      // Gemstones
      mkBox(0.8 * P, 0.8 * P, 0.8 * P, 0xd91e36, -0.05, 0.48, 0.28); // Ruby
      mkBox(0.8 * P, 0.8 * P, 0.8 * P, 0x1e60d9, 0.05, 0.48, 0.28);  // Sapphire
      break;
    }

    case 'miner': {
      // Yellow helmet dome
      mkBox(9.2 * P, 2.4 * P, 9.2 * P, 0xebba26, 0, 0.52, 0);
      // Front lamp casing and glowing white/yellow lens
      mkBox(2.2 * P, 2.2 * P, 1.4 * P, 0x444448, 0, 0.44, 0.28);
      mkBox(1.4 * P, 1.4 * P, 0.4 * P, 0xffffcc, 0, 0.44, 0.33);
      break;
    }

    case 'straw': {
      // Wide circular/box straw brim extending outward
      mkBox(13 * P, 0.6 * P, 13 * P, 0xd8be75, 0, 0.46, 0);
      // Ribbon band
      mkBox(9.4 * P, 1.2 * P, 9.4 * P, 0x2e6e3c, 0, 0.50, 0);
      break;
    }

    case 'wizard': {
      // Brim
      mkBox(11 * P, 0.6 * P, 11 * P, 0x2b2456, 0, 0.48, 0);
      // Stepped cones ascending
      mkBox(7 * P, 2.2 * P, 7 * P, 0x352d6a, 0, 0.56, 0);
      mkBox(5 * P, 2.2 * P, 5 * P, 0x352d6a, 0, 0.68, -0.02);
      mkBox(3 * P, 2.2 * P, 3 * P, 0x352d6a, 0, 0.80, -0.05);
      mkBox(1.5 * P, 2 * P, 1.5 * P, 0x352d6a, 0, 0.92, -0.08);
      // Golden star buckle
      mkBox(1.2 * P, 1.2 * P, 0.4 * P, 0xf7cf3e, 0, 0.52, 0.26);
      break;
    }

    case 'knight': {
      // Visor brow plate
      mkBox(9.2 * P, 1.8 * P, 2 * P, 0x9ea5ad, 0, 0.35, 0.22);
      // Chin guard
      mkBox(9.2 * P, 1.6 * P, 1.6 * P, 0x7c838b, 0, 0.12, 0.22);
      break;
    }

    case 'bandana': {
      // Red wrap around brow
      mkBox(9.4 * P, 1.5 * P, 9.4 * P, 0xc22929, 0, 0.36, 0);
      // Tied knot at side/rear
      mkBox(1.4 * P, 2.5 * P, 1.4 * P, 0x9e1a1a, -0.28, 0.32, -0.22);
      break;
    }

    case 'goggles': {
      // Leather strap
      mkBox(9.4 * P, 1.2 * P, 9.4 * P, 0x3b2518, 0, 0.38, 0);
      // Brass frames
      mkBox(2.2 * P, 2.2 * P, 1.4 * P, 0xc99630, -0.11, 0.38, 0.28);
      mkBox(2.2 * P, 2.2 * P, 1.4 * P, 0xc99630, 0.11, 0.38, 0.28);
      // Cyan lenses
      mkBox(1.4 * P, 1.4 * P, 0.4 * P, 0x6de0e8, -0.11, 0.38, 0.33);
      mkBox(1.4 * P, 1.4 * P, 0.4 * P, 0x6de0e8, 0.11, 0.38, 0.33);
      break;
    }

    case 'bunny': {
      // Left and right ears
      mkBox(1.4 * P, 5 * P, 1.2 * P, 0xfcfcfc, -0.13, 0.65, 0);
      mkBox(1.4 * P, 5 * P, 1.2 * P, 0xfcfcfc, 0.13, 0.65, 0);
      // Pink ear inners
      mkBox(0.8 * P, 3.8 * P, 0.4 * P, 0xf7a8b8, -0.13, 0.65, 0.05);
      mkBox(0.8 * P, 3.8 * P, 0.4 * P, 0xf7a8b8, 0.13, 0.65, 0.05);
      break;
    }

    case 'wreath': {
      // Green garland ring
      mkBox(9.4 * P, 1.2 * P, 9.4 * P, 0x348a48, 0, 0.38, 0);
      // Flower studs
      mkBox(0.8 * P, 0.8 * P, 0.6 * P, 0xff6b9d, -0.12, 0.38, 0.28);
      mkBox(0.8 * P, 0.8 * P, 0.6 * P, 0xffe043, 0.0, 0.39, 0.28);
      mkBox(0.8 * P, 0.8 * P, 0.6 * P, 0xffffff, 0.12, 0.38, 0.28);
      break;
    }

    case 'antlers': {
      // Left antler
      mkBox(1.2 * P, 4 * P, 1.2 * P, 0x6f4e37, -0.24, 0.62, 0);
      mkBox(2.2 * P, 1 * P, 1.2 * P, 0x6f4e37, -0.28, 0.70, 0);
      // Right antler
      mkBox(1.2 * P, 4 * P, 1.2 * P, 0x6f4e37, 0.24, 0.62, 0);
      mkBox(2.2 * P, 1 * P, 1.2 * P, 0x6f4e37, 0.28, 0.70, 0);
      break;
    }

    case 'beret': {
      // Tilted cap
      const cap = mkBox(9.6 * P, 1.5 * P, 9.6 * P, 0x255434, 0.04, 0.52, 0);
      cap.rotation.z = -0.15;
      // Gold feather quill
      mkBox(0.6 * P, 3 * P, 0.6 * P, 0xedd240, -0.22, 0.58, 0.12);
      break;
    }
  }

  head.add(root);
  return root;
}
