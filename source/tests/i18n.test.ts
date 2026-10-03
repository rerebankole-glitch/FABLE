// Store/interface localisation: every shipped language must define every key, keep the `{n}`
// placeholder intact and fall back to English (never to a raw key) when something is missing.
import { settings } from '../src/game/core/Settings';
import { MARKET_LANGUAGES, MARKET_LANGUAGE_CODES, marketLang, mt, mn, type Dict } from '../src/ui/market-i18n';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = '') => {
  console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : ''));
  c ? pass++ : fail++;
};

const en = MARKET_LANGUAGES.en.dict;
const enKeys = Object.keys(en);

ok('languages: more than twenty interface languages ship', MARKET_LANGUAGE_CODES.length >= 20, `${MARKET_LANGUAGE_CODES.length}`);
ok('languages: codes are unique', new Set(MARKET_LANGUAGE_CODES).size === MARKET_LANGUAGE_CODES.length);
ok('languages: english is present and complete', MARKET_LANGUAGE_CODES.includes('en') && enKeys.length > 40, `${enKeys.length} keys`);

const missing: string[] = [];
const blanks: string[] = [];
const placeholders: string[] = [];
for (const code of MARKET_LANGUAGE_CODES) {
  const dict: Dict = MARKET_LANGUAGES[code].dict;
  for (const key of enKeys) {
    const value = dict[key];
    if (value === undefined) missing.push(`${code}.${key}`);
    else if (!value.trim()) blanks.push(`${code}.${key}`);
    else if (/\{n\}/.test(en[key]) !== /\{n\}/.test(value)) placeholders.push(`${code}.${key}`);
    if (/[A-Za-z]{3,}\{[a-z]+\}/.test(value || '')) placeholders.push(`${code}.${key}`);
  }
  if (!MARKET_LANGUAGES[code].native.trim()) blanks.push(`${code}.native`);
}
ok('languages: every key is defined everywhere', missing.length === 0, missing.slice(0, 6).join(', '));
ok('languages: no blank labels', blanks.length === 0, blanks.slice(0, 6).join(', '));
ok('languages: {n} placeholders survive translation', placeholders.length === 0, placeholders.slice(0, 6).join(', '));

// mt()/mn() — active language, interpolation and English fallback
settings.set('language', 'en');
ok('mt: english by default', mt('marketplace') === 'Marketplace' && mt('nav_skins') === 'Skins & Outfits');
ok('mt: interpolates the coin amount', mt('claim', { n: 40 }) === 'Claim +40 Coins');
settings.set('language', 'de');
ok('mt: follows the active language', marketLang() === 'de' && mt('marketplace') === 'Marktplatz' && mt('free') === 'Gratis');
ok('mt: numbers use the active language', mn(1234567) === new Intl.NumberFormat('de').format(1234567));
ok('mt: unknown keys return the key instead of blank', mt('does_not_exist') === 'does_not_exist');
settings.set('language', 'klingon');
ok('mt: unsupported codes clamp to english', marketLang() === 'en' && mt('marketplace') === 'Marketplace');
settings.set('language', 'en');

for (const code of MARKET_LANGUAGE_CODES) {
  if (code === 'en') continue;
  settings.set('language', code);
  ok(`mt ${code}: marketplace + a price label translate`, mt('marketplace') !== 'Marketplace' && mt('free') !== 'Free');
}
settings.set('language', 'en');

if (fail > 0) process.exit(1);
console.log(`\n${pass} passed, ${fail} failed`);
