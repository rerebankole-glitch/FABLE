#!/usr/bin/env python3
"""
Builds the FABLE pixel typeface ("Fable Pixel") from the bitmap glyphs defined below and writes
  src/ui/assets/font.css          (@font-face with the WOFF2 embedded as base64)
  src/ui/assets/FablePixel.ttf    (the raw TrueType file, for reference / other tools)

Design notes
  * 8-px grid: capitals are 5x7, lowercase x-height is 5 rows, descenders go 2 rows below the baseline.
  * Proportional: every glyph is as wide as it needs to be plus one pixel of right-side spacing.
  * 1 em = 8 px, so `font-size: 16px` renders the font at an exact 2x pixel scale.
  * Every glyph is an original drawing made for this project (no third-party font data is used).

Run:  python3 tools/build-font.py
"""
from __future__ import annotations

import base64
import io
import os
import sys

try:
    from fontTools.fontBuilder import FontBuilder
    from fontTools.pens.ttGlyphPen import TTGlyphPen
except ImportError:  # pragma: no cover
    sys.exit("fontTools is required: pip install fonttools brotli")

PX = 128                      # font units per pixel (unitsPerEm = 8 px = 1024)
UPEM = 8 * PX
ASCENT_PX = 9                 # 7 cap rows + 2 rows for accents above capitals
DESCENT_PX = 2
FAMILY = "Fable Pixel"

# ------------------------------------------------------------------------------------------------
# Glyph bitmaps.  Rows are listed top to bottom; row 0 is the top of a capital letter, row 6 sits on
# the baseline, rows 7-8 are descender rows.  '#' = pixel.  All rows of a glyph must share one width.
# ------------------------------------------------------------------------------------------------
G: dict[str, list[str]] = {}

def g(ch: str, *rows: str) -> None:
    w = len(rows[0])
    assert all(len(r) == w for r in rows), ch
    assert 7 <= len(rows) <= 9, ch
    G[ch] = list(rows)

# --- capitals --------------------------------------------------------------------------------------
g('A', '.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#')
g('B', '####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.')
g('C', '.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.')
g('D', '###..', '#..#.', '#...#', '#...#', '#...#', '#..#.', '###..')
g('E', '#####', '#....', '#....', '####.', '#....', '#....', '#####')
g('F', '#####', '#....', '#....', '####.', '#....', '#....', '#....')
g('G', '.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####')
g('H', '#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#')
g('I', '###', '.#.', '.#.', '.#.', '.#.', '.#.', '###')
g('J', '....#', '....#', '....#', '....#', '....#', '#...#', '.###.')
g('K', '#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#')
g('L', '#....', '#....', '#....', '#....', '#....', '#....', '#####')
g('M', '#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#')
g('N', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#')
g('O', '.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.')
g('P', '####.', '#...#', '#...#', '####.', '#....', '#....', '#....')
g('Q', '.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#')
g('R', '####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#')
g('S', '.####', '#....', '#....', '.###.', '....#', '....#', '####.')
g('T', '#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..')
g('U', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.')
g('V', '#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..')
g('W', '#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#')
g('X', '#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#')
g('Y', '#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..')
g('Z', '#####', '....#', '...#.', '..#..', '.#...', '#....', '#####')
# --- lowercase -------------------------------------------------------------------------------------
g('a', '.....', '.....', '.###.', '....#', '.####', '#...#', '.####')
g('b', '#....', '#....', '####.', '#...#', '#...#', '#...#', '####.')
g('c', '....', '....', '.###', '#...', '#...', '#...', '.###')
g('d', '....#', '....#', '.####', '#...#', '#...#', '#...#', '.####')
g('e', '.....', '.....', '.###.', '#...#', '#####', '#....', '.###.')
g('f', '..##', '.#..', '###.', '.#..', '.#..', '.#..', '.#..')
g('g', '.....', '.....', '.####', '#...#', '#...#', '#...#', '.####', '....#', '.###.')
g('h', '#....', '#....', '####.', '#...#', '#...#', '#...#', '#...#')
g('i', '#', '.', '#', '#', '#', '#', '#')
g('j', '...#', '....', '...#', '...#', '...#', '...#', '...#', '#..#', '.##.')
g('k', '#...', '#...', '#..#', '#.#.', '##..', '#.#.', '#..#')
g('l', '#.', '#.', '#.', '#.', '#.', '#.', '.#')
g('m', '.....', '.....', '##.#.', '#.#.#', '#.#.#', '#.#.#', '#...#')
g('n', '.....', '.....', '####.', '#...#', '#...#', '#...#', '#...#')
g('o', '.....', '.....', '.###.', '#...#', '#...#', '#...#', '.###.')
g('p', '.....', '.....', '####.', '#...#', '#...#', '#...#', '####.', '#....', '#....')
g('q', '.....', '.....', '.####', '#...#', '#...#', '#...#', '.####', '....#', '....#')
g('r', '....', '....', '#.##', '##..', '#...', '#...', '#...')
g('s', '.....', '.....', '.####', '#....', '.###.', '....#', '####.')
g('t', '.#..', '.#..', '###.', '.#..', '.#..', '.#..', '..##')
g('u', '.....', '.....', '#...#', '#...#', '#...#', '#..##', '.##.#')
g('v', '.....', '.....', '#...#', '#...#', '#...#', '.#.#.', '..#..')
g('w', '.....', '.....', '#...#', '#...#', '#.#.#', '#.#.#', '.#.#.')
g('x', '.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#')
g('y', '.....', '.....', '#...#', '#...#', '#...#', '#...#', '.####', '....#', '.###.')
g('z', '.....', '.....', '#####', '...#.', '..#..', '.#...', '#####')
# --- digits ----------------------------------------------------------------------------------------
g('0', '.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.')
g('1', '.#.', '##.', '.#.', '.#.', '.#.', '.#.', '###')
g('2', '.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####')
g('3', '.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.')
g('4', '...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.')
g('5', '#####', '#....', '####.', '....#', '....#', '#...#', '.###.')
g('6', '..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.')
g('7', '#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...')
g('8', '.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.')
g('9', '.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..')
# --- punctuation -----------------------------------------------------------------------------------
g(' ', '...', '...', '...', '...', '...', '...', '...')
g('!', '#', '#', '#', '#', '#', '.', '#')
g('"', '#.#', '#.#', '...', '...', '...', '...', '...')
g('#', '.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.')
g('$', '..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..')
g('%', '##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##')
g('&', '.##..', '#..#.', '#..#.', '.##..', '#.#.#', '#..#.', '.##.#')
g("'", '#', '#', '.', '.', '.', '.', '.')
g('(', '..#', '.#.', '#..', '#..', '#..', '.#.', '..#')
g(')', '#..', '.#.', '..#', '..#', '..#', '.#.', '#..')
g('*', '.....', '..#..', '#.#.#', '.###.', '#.#.#', '..#..', '.....')
g('+', '.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....')
g(',', '..', '..', '..', '..', '..', '..', '.#', '#.')
g('-', '....', '....', '....', '####', '....', '....', '....')
g('.', '.', '.', '.', '.', '.', '.', '#')
g('/', '....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....')
g(':', '.', '.', '#', '.', '.', '.', '#')
g(';', '..', '..', '.#', '..', '..', '..', '.#', '#.')
g('<', '...#', '..#.', '.#..', '#...', '.#..', '..#.', '...#')
g('=', '.....', '.....', '#####', '.....', '#####', '.....', '.....')
g('>', '#...', '.#..', '..#.', '...#', '..#.', '.#..', '#...')
g('?', '.###.', '#...#', '....#', '..##.', '..#..', '.....', '..#..')
g('@', '.###.', '#...#', '#.###', '#.#.#', '#.###', '#....', '.###.')
g('[', '###', '#..', '#..', '#..', '#..', '#..', '###')
g('\\', '#....', '.#...', '.#...', '..#..', '...#.', '...#.', '....#')
g(']', '###', '..#', '..#', '..#', '..#', '..#', '###')
g('^', '..#..', '.#.#.', '#...#', '.....', '.....', '.....', '.....')
g('_', '.....', '.....', '.....', '.....', '.....', '.....', '.....', '#####')
g('`', '#.', '.#', '..', '..', '..', '..', '..')
g('{', '..##', '.#..', '.#..', '##..', '.#..', '.#..', '..##')
g('|', '#', '#', '#', '#', '#', '#', '#')
g('}', '##..', '..#.', '..#.', '..##', '..#.', '..#.', '##..')
g('~', '.....', '.....', '.#..#', '#.#.#', '#..#.', '.....', '.....')
# --- extra symbols ---------------------------------------------------------------------------------
g('¡', '#', '.', '#', '#', '#', '#', '#')
g('¿', '..#..', '.....', '..#..', '.#...', '#....', '#...#', '.###.')
g('·', '.', '.', '.', '#', '.', '.', '.')
g('•', '..', '..', '..', '##', '##', '..', '..')
g('–', '.....', '.....', '.....', '#####', '.....', '.....', '.....')
g('—', '.......', '.......', '.......', '#######', '.......', '.......', '.......')
g('…', '.....', '.....', '.....', '.....', '.....', '.....', '#.#.#')
g('°', '.#.', '#.#', '.#.', '...', '...', '...', '...')
g('×', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '.....')
g('÷', '.....', '..#..', '.....', '#####', '.....', '..#..', '.....')
g('«', '.....', '..#.#', '.#.#.', '#.#..', '.#.#.', '..#.#', '.....')
g('»', '.....', '#.#..', '.#.#.', '..#.#', '.#.#.', '#.#..', '.....')
g('‘', '.#', '#.', '#.', '..', '..', '..', '..')
g('’', '.#', '.#', '#.', '..', '..', '..', '..')
g('“', '.#.#', '#.#.', '#.#.', '....', '....', '....', '....')
g('”', '.#.#', '.#.#', '#.#.', '....', '....', '....', '....')
g('€', '..###', '.#...', '####.', '.#...', '####.', '.#...', '..###')
g('£', '..##.', '.#..#', '.#...', '####.', '.#...', '.#...', '#####')
g('→', '.....', '..#..', '...#.', '#####', '...#.', '..#..', '.....')
g('←', '.....', '..#..', '.#...', '#####', '.#...', '..#..', '.....')
g('↑', '..#..', '.###.', '#.#.#', '..#..', '..#..', '..#..', '.....')
g('↓', '.....', '..#..', '..#..', '..#..', '#.#.#', '.###.', '..#..')
g('▲', '.....', '..#..', '.###.', '#####', '.....', '.....', '.....')
g('▼', '.....', '.....', '#####', '.###.', '..#..', '.....', '.....')
g('◄', '...', '..#', '.##', '###', '.##', '..#', '...')
g('►', '...', '#..', '##.', '###', '##.', '#..', '...')
g('✓', '.....', '.....', '....#', '...#.', '#.#..', '.#...', '.....')
g('✕', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '.....')
g('♥', '.....', '.#.#.', '#####', '#####', '.###.', '..#..', '.....')
g('★', '..#..', '..#..', '#####', '.###.', '.###.', '#.#.#', '.....')
g('©', '.###.', '#...#', '#.###', '#.#..', '#.###', '#...#', '.###.')
g('ß', '.##..', '#..#.', '#..#.', '#.##.', '#...#', '#...#', '#.##.')
g('æ', '.....', '.....', '.####', '..#.#', '.####', '#.#..', '.####')
g('Æ', '.####', '#.#..', '#.#..', '#.###', '###..', '#.#..', '#.###')
g('ø', '.....', '.....', '.###.', '#..##', '#.#.#', '##..#', '.###.')
g('Ø', '.###.', '#..##', '#.#.#', '#.#.#', '#.#.#', '##..#', '.###.')
g('œ', '.....', '.....', '.####', '#.#.#', '#.###', '#.#..', '.####')
g('ç', '....', '....', '.###', '#...', '#...', '#...', '.###', '..#.', '.##.')
g('Ç', '.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.', '..#..', '.##..')

# --- composed accents ------------------------------------------------------------------------------
# Accent rows are placed above the base glyph.  Capitals get 2 rows above row 0 (using the extra
# ascent), lowercase letters get rows 0..1 (their body starts at row 2).
ACCENTS = {
    'grave': ['.#...', '..#..'], 'acute': ['...#.', '..#..'], 'circ': ['..#..', '.#.#.'],
    'tilde': ['.##.#', '#.##.'], 'diaer': ['.....', '.#.#.'],
}
def accent_rows(kind: str, width: int) -> list[str]:
    rows = ACCENTS[kind]
    out = []
    for r in rows:
        r = r.strip('.') if kind != 'diaer' else r.rstrip('.').lstrip('.') if r.strip('.') else ''
        if not r:
            out.append('.' * width); continue
        pad = max(0, (width - len(r)) // 2)
        line = ('.' * pad + r).ljust(width, '.')[:width]
        out.append(line)
    return out

def compose(base: str, kind: str, upper: bool) -> list[str]:
    rows = list(G[base])
    w = len(rows[0])
    if base in ('i', 'j'):
        w = 3
        rows = ['...', '...', '.#.', '.#.', '.#.', '.#.', '.#.']   # dotless i
    acc = accent_rows(kind, w)
    if upper:
        return acc + rows                      # 2 accent rows above the cap height (9 rows, top_row = -2)
    # lowercase: accent, one empty row, then the 5-row body (8 rows, top_row = -1)
    return acc + ['.' * w] + rows[2:]

COMPOSED = {
    'à': ('a', 'grave'), 'á': ('a', 'acute'), 'â': ('a', 'circ'), 'ã': ('a', 'tilde'), 'ä': ('a', 'diaer'),
    'è': ('e', 'grave'), 'é': ('e', 'acute'), 'ê': ('e', 'circ'), 'ë': ('e', 'diaer'),
    'ì': ('i', 'grave'), 'í': ('i', 'acute'), 'î': ('i', 'circ'), 'ï': ('i', 'diaer'),
    'ò': ('o', 'grave'), 'ó': ('o', 'acute'), 'ô': ('o', 'circ'), 'õ': ('o', 'tilde'), 'ö': ('o', 'diaer'),
    'ù': ('u', 'grave'), 'ú': ('u', 'acute'), 'û': ('u', 'circ'), 'ü': ('u', 'diaer'),
    'ñ': ('n', 'tilde'), 'ý': ('y', 'acute'), 'ÿ': ('y', 'diaer'),
    'À': ('A', 'grave'), 'Á': ('A', 'acute'), 'Â': ('A', 'circ'), 'Ã': ('A', 'tilde'), 'Ä': ('A', 'diaer'),
    'È': ('E', 'grave'), 'É': ('E', 'acute'), 'Ê': ('E', 'circ'), 'Ë': ('E', 'diaer'),
    'Ì': ('I', 'grave'), 'Í': ('I', 'acute'), 'Î': ('I', 'circ'), 'Ï': ('I', 'diaer'),
    'Ò': ('O', 'grave'), 'Ó': ('O', 'acute'), 'Ô': ('O', 'circ'), 'Õ': ('O', 'tilde'), 'Ö': ('O', 'diaer'),
    'Ù': ('U', 'grave'), 'Ú': ('U', 'acute'), 'Û': ('U', 'circ'), 'Ü': ('U', 'diaer'),
    'Ñ': ('N', 'tilde'), 'Ý': ('Y', 'acute'),
}
for ch, (base, kind) in COMPOSED.items():
    rows = compose(base, kind, base.isupper())
    G[ch] = rows

# ------------------------------------------------------------------------------------------------
# Build the font
# ------------------------------------------------------------------------------------------------
def rects_for(rows: list[str], top_row: int) -> list[tuple[int, int, int, int]]:
    """Greedy merge of pixels into rectangles (x0, y0, x1, y1) in pixel units, y up, baseline = 0."""
    h = len(rows); w = len(rows[0])
    used = [[False] * w for _ in range(h)]
    out = []
    for r in range(h):
        c = 0
        while c < w:
            if rows[r][c] != '#' or used[r][c]:
                c += 1; continue
            c2 = c
            while c2 + 1 < w and rows[r][c2 + 1] == '#' and not used[r][c2 + 1]:
                c2 += 1
            r2 = r
            while r2 + 1 < h and all(rows[r2 + 1][k] == '#' and not used[r2 + 1][k] for k in range(c, c2 + 1)):
                r2 += 1
            for rr in range(r, r2 + 1):
                for cc in range(c, c2 + 1):
                    used[rr][cc] = True
            # pixel row index -> y: row `top_row` is the top row of the bitmap; baseline is the bottom of row 6
            y_top = 7 - (top_row + r)
            y_bot = 7 - (top_row + r2 + 1)
            out.append((c, y_bot, c2 + 1, y_top))
            c = c2 + 1
    return out

def build() -> bytes:
    order = ['.notdef'] + [f'g{ord(ch):04X}' for ch in G]
    fb = FontBuilder(UPEM, isTTF=True)
    fb.setupGlyphOrder(order)
    cmap = {ord(ch): f'g{ord(ch):04X}' for ch in G}
    fb.setupCharacterMap(cmap)
    glyphs = {}
    metrics = {}
    # .notdef: hollow box
    pen = TTGlyphPen(None)
    for (x0, y0, x1, y1) in [(0, 0, 5, 1), (0, 6, 5, 7), (0, 1, 1, 6), (4, 1, 5, 6)]:
        pen.moveTo((x0 * PX, y0 * PX)); pen.lineTo((x0 * PX, y1 * PX)); pen.lineTo((x1 * PX, y1 * PX)); pen.lineTo((x1 * PX, y0 * PX)); pen.closePath()
    glyphs['.notdef'] = pen.glyph(); metrics['.notdef'] = (6 * PX, 0)
    for ch, rows in G.items():
        name = f'g{ord(ch):04X}'
        w = len(rows[0])
        # composed glyphs start above the cap height: capitals by 2 rows, lowercase by 1 row
        top_row = 0
        if ch in COMPOSED:
            top_row = -2 if COMPOSED[ch][0].isupper() else -1
        pen = TTGlyphPen(None)
        for (x0, y0, x1, y1) in rects_for(rows, top_row):
            pen.moveTo((x0 * PX, y0 * PX)); pen.lineTo((x0 * PX, y1 * PX)); pen.lineTo((x1 * PX, y1 * PX)); pen.lineTo((x1 * PX, y0 * PX)); pen.closePath()
        glyphs[name] = pen.glyph()
        metrics[name] = ((w + 1) * PX, 0)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=ASCENT_PX * PX, descent=-DESCENT_PX * PX, lineGap=0)
    fb.setupNameTable({
        'familyName': FAMILY, 'styleName': 'Regular', 'fullName': FAMILY, 'psName': 'FablePixel-Regular',
        'uniqueFontIdentifier': 'FablePixel;5.1', 'version': 'Version 1.0',
        'manufacturer': 'FABLE project', 'designer': 'FABLE project',
        'description': 'Original 8-px proportional pixel typeface drawn for FABLE.',
        'licenseDescription': 'SIL Open Font License 1.1',
        'copyright': 'Copyright (c) FABLE project. Licensed under the SIL Open Font License 1.1.',
    })
    fb.setupOS2(sTypoAscender=ASCENT_PX * PX, sTypoDescender=-DESCENT_PX * PX, sTypoLineGap=0,
                usWinAscent=ASCENT_PX * PX, usWinDescent=DESCENT_PX * PX, sxHeight=5 * PX, sCapHeight=7 * PX,
                fsSelection=(1 << 6) | (1 << 7), achVendID='FABL', usWeightClass=400, usWidthClass=5)
    fb.setupPost(isFixedPitch=0)
    fb.setupMaxp()
    fb.setupHead(unitsPerEm=UPEM)
    # pixel fonts should not be hinted / smoothed; flag as "optimised for cleartype" off, integer scaling on
    fb.font['head'].flags |= (1 << 3)     # force ppem to integer values
    fb.font['head'].lowestRecPPEM = 8
    buf = io.BytesIO()
    fb.save(buf)
    return buf.getvalue()

def main() -> None:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(root, 'src', 'ui', 'assets')
    os.makedirs(out_dir, exist_ok=True)
    ttf = build()
    with open(os.path.join(out_dir, 'FablePixel.ttf'), 'wb') as f:
        f.write(ttf)
    from fontTools.ttLib import TTFont
    font = TTFont(io.BytesIO(ttf))
    font.flavor = 'woff2'
    w = io.BytesIO(); font.save(w)
    b64 = base64.b64encode(w.getvalue()).decode('ascii')
    css = (
        "/* Fable Pixel - the FABLE user-interface typeface. An original 8-px proportional pixel font drawn\n"
        "   for this project (see tools/build-font.py, which generates this file). SIL Open Font License 1.1. */\n"
        "@font-face {\n"
        f'  font-family: "{FAMILY}";\n'
        "  font-style: normal;\n"
        "  font-weight: 400;\n"
        "  font-display: block;\n"
        f'  src: url("data:font/woff2;base64,{b64}") format("woff2");\n'
        "}\n"
    )
    with open(os.path.join(out_dir, 'font.css'), 'w') as f:
        f.write(css)
    print(f'glyphs: {len(G)}  ttf: {len(ttf)} bytes  woff2: {len(w.getvalue())} bytes')

if __name__ == '__main__':
    main()
