import * as MobSkins from '../src/game/entities/MobSkins';
import { KEEPER_PROFESSIONS } from '../src/game/entities/MobSkins';
export { boxTexture } from '../src/game/entities/MobArt';

const keeper = KEEPER_PROFESSIONS[0];
const { robe: robe0, hat: hat0 } = MobSkins.keeperSkins(keeper);

export const SKINS = [
  { label: 'keeper head', skin: MobSkins.KEEPER_HEAD_SKIN, color: 0xc8a078 },
  { label: 'keeper nose', skin: MobSkins.KEEPER_NOSE_SKIN, color: 0xc8a078 },
  { label: 'keeper robe front (farmer)', skin: robe0, color: keeper.robe },
  { label: 'keeper hat (farmer straw)', skin: hat0, color: keeper.hatColor },
  { label: 'keeper folded arms', skin: MobSkins.KEEPER_ARMS_SKIN, color: keeper.robe },
  { label: 'keeper leg', skin: MobSkins.KEEPER_LEG_SKIN, color: keeper.pants },
];
