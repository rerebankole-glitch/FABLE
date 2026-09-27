import { readFileSync } from "node:fs";
import { decodePng } from "./pngdump.mjs";
const { w, h, px } = decodePng(readFileSync("/home/user/FABLE/ref/icons.png"));
const T = { "ff1313":"R", "ffc8c8":"P", "ffe3e3":"G", "bb1313":"K", "ffffff":"W", "282828":"8", "9e0000":"D", "000000":"B", "ffa1a1":"Q", "dfa1a1":"J", "0a0a0a":"L" };
const map = (c) => { const hx = ((c[0]<<16)|(c[1]<<8)|c[2]).toString(16).padStart(6,"0"); return T[hx] ?? "."; };
for (let y = 0; y < 18; y++) { let s = ""; for (let x = 0; x < 170; x++) s += map(px(x, y)); console.log(s); }
