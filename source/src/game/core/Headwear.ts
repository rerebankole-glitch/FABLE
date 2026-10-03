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

  switch (id) {
    case 'crown': {
      // Golden band across all faces at rows 13..15
      for (const startX of [32, 40, 48, 56]) {
        rect(startX, 13, startX + 8, 15, 245, 192, 34);
        rect(startX, 15, startX + 8, 16, 179, 136, 16); // shadow rim
        // Crown spires on row 12
        setP(startX, 12, 255, 225, 107);
        setP(startX + 2, 12, 255, 225, 107);
        setP(startX + 5, 12, 255, 225, 107);
        setP(startX + 7, 12, 255, 225, 107);
      }
      // Gemstones on front face
      setP(43, 14, 217, 30, 54); // Ruby
      setP(44, 14, 30, 96, 217); // Sapphire
      break;
    }

    case 'miner': {
      // Yellow helmet dome on top face and rows 8..14
      rect(40, 0, 48, 8, 235, 186, 38);
      for (const startX of [32, 40, 48, 56]) {
        rect(startX, 8, startX + 8, 14, 235, 186, 38);
        rect(startX, 14, startX + 8, 15, 196, 150, 21); // rim
      }
      // Headlamp at front center cols 43..44, rows 11..13
      rect(43, 11, 45, 14, 60, 60, 65);
      setP(43, 12, 255, 255, 200);
      setP(44, 12, 255, 255, 200);
      break;
    }

    case 'straw': {
      // Straw hat top & crown
      rect(40, 0, 48, 8, 216, 190, 117);
      for (const startX of [32, 40, 48, 56]) {
        rect(startX, 9, startX + 8, 13, 216, 190, 117);
        rect(startX, 13, startX + 8, 14, 46, 110, 60); // green ribbon
        rect(startX, 14, startX + 8, 16, 191, 164, 86); // straw brim
      }
      break;
    }

    case 'wizard': {
      // Indigo wizard fabric
      rect(40, 0, 48, 8, 43, 36, 86);
      for (const startX of [32, 40, 48, 56]) {
        rect(startX, 8, startX + 8, 14, 53, 45, 106);
        rect(startX, 14, startX + 8, 16, 32, 26, 66); // brim
      }
      // Golden star buckle on front
      setP(43, 13, 247, 207, 62);
      setP(44, 13, 255, 235, 130);
      break;
    }

    case 'knight': {
      // Steel helm top and brow
      rect(40, 0, 48, 8, 158, 165, 173);
      for (const startX of [32, 40, 48, 56]) {
        rect(startX, 8, startX + 8, 12, 142, 149, 157);
        rect(startX, 14, startX + 8, 16, 110, 116, 122);
      }
      // Dark eye slit on front face
      rect(41, 12, 47, 14, 24, 25, 28);
      break;
    }

    case 'bandana': {
      // Crimson band across rows 11..13
      for (const startX of [32, 40, 48, 56]) {
        rect(startX, 11, startX + 8, 14, 194, 41, 41);
      }
      // Tied tails on left face
      setP(33, 14, 150, 25, 25);
      setP(33, 15, 150, 25, 25);
      setP(34, 15, 150, 25, 25);
      break;
    }

    case 'goggles': {
      // Leather strap at row 11 on all sides
      for (const startX of [32, 40, 48, 56]) {
        rect(startX, 11, startX + 8, 12, 60, 38, 25);
      }
      // Brass rim and cyan glass lenses on front brow
      rect(41, 10, 44, 13, 201, 150, 48);
      rect(44, 10, 47, 13, 201, 150, 48);
      setP(42, 11, 109, 224, 232);
      setP(45, 11, 109, 224, 232);
      break;
    }

    case 'bunny': {
      // Bunny ears on top and front
      rect(41, 1, 43, 7, 250, 250, 250);
      rect(45, 1, 47, 7, 250, 250, 250);
      rect(41, 8, 43, 11, 250, 250, 250);
      rect(45, 8, 47, 11, 250, 250, 250);
      setP(42, 9, 247, 168, 184); // pink inner
      setP(46, 9, 247, 168, 184);
      break;
    }

    case 'wreath': {
      // Vine garland around rows 13..14
      for (const startX of [32, 40, 48, 56]) {
        rect(startX, 13, startX + 8, 15, 52, 138, 72);
      }
      // Floral dots on front
      setP(41, 13, 255, 107, 157); // pink
      setP(43, 14, 255, 224, 67);  // yellow
      setP(45, 13, 255, 255, 255); // white
      setP(47, 14, 180, 123, 238); // violet
      break;
    }

    case 'antlers': {
      // Wood branches on top and upper front
      rect(40, 2, 42, 7, 111, 78, 55);
      rect(46, 2, 48, 7, 111, 78, 55);
      setP(40, 8, 90, 56, 30);
      setP(47, 8, 90, 56, 30);
      break;
    }

    case 'beret': {
      // Hunter green beret
      rect(41, 1, 48, 7, 37, 84, 52);
      rect(41, 8, 47, 12, 45, 106, 60);
      // Gold feather quill on front left
      setP(41, 9, 237, 210, 64);
      setP(41, 10, 237, 210, 64);
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
