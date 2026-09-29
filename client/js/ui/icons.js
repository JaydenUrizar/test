// Emberwild item icons: procedural, flat / low-poly style inline SVG (64x64) for every item, plus tooltip HTML.
// No gradients / ids / filters are used, so icons render identically inside hidden or duplicated containers.
import { ITEMS } from '/shared/items.js';

// ---------------------------------------------------------------- colour helpers
const hx = (c) => { c = c.replace('#', ''); if (c.length === 3) c = c.split('').map((x) => x + x).join(''); return [0, 2, 4].map((i) => parseInt(c.substr(i, 2), 16)); };
const toHex = (a) => '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = hx(a), B = hx(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
const lt = (c, t = 0.25) => mix(c, '#ffffff', t);
const dk = (c, t = 0.25) => mix(c, '#000000', t);
const OUT = '#0d1418';
const WOOD = '#a8743f', STEEL = '#aeb6bf', DARKSTEEL = '#525a64', GOLD = '#e0b840', LEATHER = '#6e4a2c', CREAM = '#efe6cf';

// ---------------------------------------------------------------- svg helpers
const P = (d, f, x = '') => `<path d="${d}" fill="${f}" ${x}/>`;
const H = (d, f = '#fff', o = 0.35) => `<path d="${d}" fill="${f}" opacity="${o}" stroke="none"/>`;
const L = (d, s, w = 2, o = 1, x = '') => `<path d="${d}" fill="none" stroke="${s}" stroke-width="${w}" opacity="${o}" ${x}/>`;
const C = (cx, cy, r, f, x = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${f}" ${x}/>`;
const E = (cx, cy, rx, ry, f, x = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${f}" ${x}/>`;
const R = (x, y, w, h, f, rx = 2, ex = '') => { if (typeof f === 'number') { const t = f; f = rx; rx = t; } return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${f}" ${ex}/>`; };
const G = (inner, tf, ex = '') => `<g transform="${tf}" ${ex}>${inner}</g>`;
const PG = (pts, f, x = '') => `<polygon points="${pts}" fill="${f}" ${x}/>`;
const NS = 'stroke="none"';

function gearPath(cx, cy, r, teeth, depth = 0.22, inner = 0.16) {
  const ri = r * (1 - depth); const pts = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const w = step * (0.5 - inner), w2 = step * (0.5 - inner - 0.1);
    const seq = [[a - w, ri], [a - w2, r], [a + w2, r], [a + w, ri]];
    for (const [ang, rad] of seq) pts.push((cx + Math.cos(ang) * rad).toFixed(1) + ',' + (cy + Math.sin(ang) * rad).toFixed(1));
  }
  return pts.join(' ');
}

// ---------------------------------------------------------------- shapes
const S = {};

S.log = (c) => {
  const end = lt(c, 0.55);
  const one = (x, y, w, h, col) => {
    const ry = h / 2, rx = ry * 0.55;
    return P(`M${x + rx} ${y} H${x + w} V${y + h} H${x + rx} A${rx} ${ry} 0 0 1 ${x + rx} ${y} Z`, col)
      + L(`M${x + rx + 3} ${y + h * 0.35} H${x + w - 4}`, dk(col, 0.35), 1.4, 0.7)
      + L(`M${x + rx + 6} ${y + h * 0.68} H${x + w - 8}`, dk(col, 0.35), 1.4, 0.7)
      + H(`M${x + rx + 2} ${y + 2.5} H${x + w - 3} V${y + 5.5} H${x + rx + 2} Z`, '#fff', 0.28)
      + E(x + w, y + ry, rx, ry, end)
      + E(x + w, y + ry, rx * 0.62, ry * 0.62, 'none', `stroke="${dk(end, 0.3)}" stroke-width="1.2"`)
      + C(x + w, y + ry, 1.3, dk(end, 0.35), NS);
  };
  return one(14, 10, 34, 19, dk(c, 0.12)) + one(6, 30, 40, 22, c) + one(20, 47, 30, 13, dk(c, 0.2));
};

S.rock = (c, id) => {
  if (id === 'rock') {
    return PG('12,44 14,30 26,20 42,20 54,32 52,46 38,54 22,54', c)
      + PG('14,30 26,20 42,20 34,31 22,36', lt(c, 0.35), NS)
      + PG('42,20 54,32 52,46 38,54 34,31', dk(c, 0.28), NS)
      + PG('12,44 14,30 22,36 34,31 38,54 22,54', dk(c, 0.08), NS)
      + L('M22 36 L34 31 L38 54', dk(c, 0.5), 1.3, 0.6)
      + H('M18 30 L26 24 L30 27 L22 32Z', '#fff', 0.5);
  }
  const small = PG('40,50 44,44 52,42 59,48 57,56 46,57', lt(c, 0.05))
    + PG('44,44 52,42 59,48 50,49', lt(c, 0.4), NS) + PG('59,48 57,56 46,57 50,49', dk(c, 0.3), NS);
  return PG('6,44 10,28 22,16 38,16 50,26 52,44 40,52 18,52', c)
    + PG('10,28 22,16 38,16 30,28 18,33', lt(c, 0.35), NS)
    + PG('38,16 50,26 52,44 40,52 30,28', dk(c, 0.3), NS)
    + PG('6,44 10,28 18,33 30,28 40,52 18,52', dk(c, 0.06), NS)
    + L('M18 33 L30 28 L40 52', dk(c, 0.5), 1.3, 0.6)
    + H('M13 27 L21 20 L26 23 L17 30Z', '#fff', 0.5) + small;
};

S.fiber = (c) => {
  const strands = [
    ['M32 52 C26 40 14 32 10 10', dk(c, 0.15)], ['M32 52 C28 38 20 26 20 6', lt(c, 0.2)], ['M32 52 C32 36 30 22 34 4', c],
    ['M32 52 C36 38 44 28 46 8', lt(c, 0.1)], ['M32 52 C38 42 52 36 56 16', dk(c, 0.1)],
  ];
  let s = '';
  for (const [d] of strands) s += L(d, OUT, 6);
  for (const [d, col] of strands) s += L(d, col, 3.6);
  for (const [d] of strands) s += L(d, '#fff', 1, 0.3, 'transform="translate(-.8 0)"');
  s += L('M28 54 L26 60 M32 54 L32 61 M36 54 L38 60', c, 3, 1);
  s += R(25, 43, 14, 9, '#c9a36b', 3) + L('M27 45 L37 50 M27 50 L37 45', dk('#c9a36b', 0.4), 1.3, 0.8) + H('M27 44.5 H37 V46 H27Z', '#fff', 0.4);
  return s;
};

S.cloth = (c) => {
  const layer = (y, col) => PG(`8,${y} 32,${y - 8} 56,${y} 32,${y + 8}`, col)
    + PG(`8,${y} 32,${y + 8} 32,${y + 14} 8,${y + 6}`, dk(col, 0.22)) + PG(`56,${y} 32,${y + 8} 32,${y + 14} 56,${y + 6}`, dk(col, 0.38));
  return layer(44, dk(c, 0.06)) + layer(35, lt(c, 0.05)) + layer(26, c)
    + L('M14 27 L32 20 L50 27', dk(c, 0.3), 1.4, 0.8, 'stroke-dasharray="3 3"')
    + H('M14 25 L30 19 L32 21 L18 27Z', '#fff', 0.55) + L('M20 44 L32 39', dk(c, 0.25), 1, 0.6);
};

S.hide = (c) => {
  const body = 'M20 10 Q32 5 44 10 L50 20 L60 24 L54 33 L59 44 L50 46 L46 58 L38 51 L32 59 L26 51 L18 58 L14 46 L5 44 L10 33 L4 24 L14 20 Z';
  return P(body, c)
    + P('M22 18 Q32 14 42 18 L46 28 L44 44 Q32 50 20 44 L18 28 Z', lt(c, 0.18), 'stroke="none"')
    + E(28, 30, 4, 3, dk(c, 0.25), NS) + E(38, 38, 4.5, 3, dk(c, 0.22), NS) + E(33, 22, 3, 2.2, dk(c, 0.25), NS) + E(25, 40, 2.6, 2, dk(c, 0.2), NS)
    + H('M14 22 L20 13 L26 12 L18 24Z', '#fff', 0.35) + L('M8 26 L14 24 M56 26 L50 24', dk(c, 0.4), 1.2, 0.7);
};

S.ore = (c, id) => {
  const cr = (x, y, w, h) => PG(`${x},${y + h} ${x + w * 0.12},${y + h * 0.3} ${x + w * 0.5},${y} ${x + w * 0.88},${y + h * 0.3} ${x + w},${y + h}`, c)
    + PG(`${x + w * 0.5},${y} ${x + w * 0.88},${y + h * 0.3} ${x + w},${y + h} ${x + w * 0.5},${y + h}`, dk(c, 0.22), NS)
    + PG(`${x + w * 0.12},${y + h * 0.3} ${x + w * 0.5},${y} ${x + w * 0.42},${y + h * 0.5}`, lt(c, 0.55), NS);
  const base = '#5d646c';
  return PG('6,46 10,30 22,18 40,20 54,30 58,46 46,57 18,57', base)
    + PG('10,30 22,18 40,20 30,32', '#7b838c', NS) + PG('40,20 54,30 58,46 46,57 30,32', dk(base, 0.25), NS)
    + cr(11, 36, 14, 17) + cr(26, 24, 15, 25) + cr(42, 36, 12, 15) + cr(22, 42, 9, 12) + cr(40, 26, 8, 10);
};

S.ingot = (c) => {
  const ing = (x, y) => PG(`${x + 6},${y} ${x + 30},${y} ${x + 24},${y + 6} ${x},${y + 6}`, lt(c, 0.4))
    + PG(`${x},${y + 6} ${x + 24},${y + 6} ${x + 24},${y + 15} ${x},${y + 15}`, c)
    + PG(`${x + 24},${y + 6} ${x + 30},${y} ${x + 30},${y + 9} ${x + 24},${y + 15}`, dk(c, 0.3))
    + H(`M${x + 3} ${y + 8} L${x + 9} ${y + 8} L${x + 5} ${y + 14} L${x + 3} ${y + 14}Z`, '#fff', 0.45);
  return ing(3, 40) + ing(30, 40) + ing(16, 26);
};

S.powder = (c) => {
  const sack = lt(c, 0.12);
  let s = P('M22 20 Q12 32 13 46 Q14 59 32 59 Q50 59 51 46 Q52 32 42 20 Z', sack)
    + H('M20 26 Q15 36 16 46 L22 46 Q21 36 25 24Z', '#fff', 0.2)
    + P('M22 20 L42 20 L40 13 Q32 9 24 13 Z', dk(sack, 0.12))
    + R(21, 18, 22, 5, '#c9a36b', 2) + L('M24 19 L28 22 M32 19 L36 22', dk('#c9a36b', 0.4), 1.2, 0.8);
  const dots = [[22, 34], [30, 30], [38, 36], [26, 44], [36, 46], [44, 44], [20, 48], [32, 52]];
  for (const [x, y] of dots) s += C(x, y, 1.6, lt(c, 0.5), NS + ' opacity=".65"');
  s += P('M25 36 H39 L38 46 H26Z', CREAM, 'stroke="none"') + C(32, 41, 3.2, '#22262b', NS) + L('M32 36 V38', '#22262b', 1.2);
  return s;
};

S.gear = (c) => {
  const g = (cx, cy, r, t, col, hole) => P('M' + gearPath(cx, cy, r, t).split(' ').join(' L') + 'Z', col)
    + C(cx, cy, r * 0.6, 'none', `stroke="${dk(col, 0.35)}" stroke-width="1.4" opacity=".7"`)
    + C(cx, cy, hole, '#1d262b') + H(`M${cx - r * 0.7} ${cy - r * 0.2} A${r * 0.75} ${r * 0.75} 0 0 1 ${cx - r * 0.1} ${cy - r * 0.72} L${cx - r * 0.05} ${cy - r * 0.5} A${r * 0.55} ${r * 0.55} 0 0 0 ${cx - r * 0.5} ${cy - r * 0.15}Z`, '#fff', 0.35);
  return g(26, 38, 20, 9, c, 5.5) + g(48, 18, 12, 7, lt(c, 0.18), 3.2);
};

S.berry = (c) => {
  const b = (x, y, r) => C(x, y, r, c) + H(`M${x - r * 0.6} ${y - r * 0.1} A${r * 0.7} ${r * 0.7} 0 0 1 ${x} ${y - r * 0.65} L${x} ${y - r * 0.4} A${r * 0.45} ${r * 0.45} 0 0 0 ${x - r * 0.35} ${y - r * 0.05}Z`, '#fff', 0.55)
    + C(x + r * 0.35, y + r * 0.4, r * 0.4, dk(c, 0.3), NS + ' opacity=".5"') + PG(`${x},${y - r * 0.78} ${x + 3},${y - r * 0.55} ${x},${y - r * 0.32} ${x - 3},${y - r * 0.55}`, '#4c8a34');
  return L('M34 22 Q34 12 42 8', '#5b8a3a', 3) + P('M40 10 Q52 4 58 14 Q48 20 40 10Z', '#6fb54a') + L('M42 11 Q50 11 55 13', '#3f7a2e', 1.2, 0.8)
    + b(22, 40, 11) + b(43, 38, 11) + b(32, 27, 11);
};

S.corn = (c) => G(
  P('M32 60 C12 56 8 34 20 26 C22 40 28 48 32 52Z', '#6fb54a') + P('M32 60 C52 56 56 34 44 26 C42 40 36 48 32 52Z', '#5aa03e')
  + E(32, 30, 10.5, 23, c)
  + L('M27 12 V48 M32 8 V52 M37 12 V48', dk(c, 0.3), 1, 0.7) + L('M23 20 Q32 24 41 20 M22 28 Q32 32 42 28 M22 36 Q32 40 42 36 M24 44 Q32 47 40 44', dk(c, 0.3), 1, 0.7)
  + H('M25 14 Q22 30 26 46 L28 46 Q25 30 28 12Z', '#fff', 0.5) + P('M26 52 L38 52 L36 58 L28 58Z', '#8bc95c'),
  'rotate(-28 32 32) translate(0 2)');

S.pumpkin = (c) => E(32, 38, 23, 18, dk(c, 0.15)) + E(20, 38, 12, 17, c) + E(44, 38, 12, 17, c) + E(32, 38, 11, 18, lt(c, 0.1))
  + L('M32 21 Q28 38 32 55', dk(c, 0.3), 1.2, 0.5) + H('M14 30 Q12 38 16 46 Q14 38 20 28Z', '#fff', 0.4)
  + R(29, 12, 7, 11, '#6b8f3a', 2) + H('M30 13 h2 v9 h-2Z', '#fff', 0.3)
  + L('M36 18 Q46 8 52 14 Q54 18 50 19', '#5aa03e', 2) + P('M22 22 Q14 18 12 26 Q20 28 22 22Z', '#6fb54a');

S.meat = (c, id) => {
  const cooked = id === 'cooked_meat';
  let s = L('M20 42 L9 54', OUT, 8) + L('M20 42 L9 54', CREAM, 4.6) + C(7, 53, 4, CREAM) + C(11, 57, 4, CREAM) + C(7, 53, 4, CREAM, 'stroke="none"') + C(11, 57, 4, CREAM, 'stroke="none"');
  s += P('M14 34 C10 20 24 10 38 12 C52 14 60 28 53 41 C47 53 28 57 21 48 C17 44 15 40 14 34Z', c);
  if (cooked) {
    s += L('M22 22 L34 34 M30 17 L44 31 M38 16 L50 28', dk(c, 0.55), 2.2, 0.8) + H('M20 20 Q26 14 36 15 L34 19 Q26 18 22 24Z', '#fff', 0.3);
  } else {
    s += L('M20 26 Q30 22 36 30 Q40 36 34 42 M40 20 Q48 26 46 34', lt(c, 0.7), 2.2, 0.85) + H('M20 20 Q26 14 36 15 L34 19 Q26 18 22 24Z', '#fff', 0.5);
  }
  return s;
};

S.can = (c, id) => {
  const soda = id === 'soda';
  const body = soda ? c : '#cfd6db';
  let s = P('M17 14 V50 Q32 58 47 50 V14 Z', body)
    + E(32, 50, 15, 1, 'none', 'stroke="none"');
  if (soda) {
    s += P('M17 28 Q32 36 47 26 V38 Q32 46 17 40Z', '#fff', 'stroke="none"') + L('M22 22 H42 M22 46 H40', '#fff', 1.6, 0.7)
      + C(32, 33, 4, c, NS + ' opacity=".55"');
  } else {
    s += P('M17 24 H47 V42 H17Z', c, 'stroke="none"') + L('M17 24 H47 M17 42 H47', dk(c, 0.4), 1.3, 0.8)
      + E(27, 33, 3.6, 2.4, '#7a3f1f', NS) + E(35, 31, 3.6, 2.4, '#8e4a24', NS) + E(37, 36, 3.2, 2.2, '#7a3f1f', NS) + E(29, 37, 3, 2, '#8e4a24', NS);
  }
  s += H('M19 16 H24 V49 Q21 48 19 47Z', '#fff', 0.35)
    + E(32, 14, 15, 5, '#dfe5ea') + E(32, 14, 11.5, 3.2, '#9aa4ad', 'stroke="none"') + R(28, 11.5, 8, 4, '#cfd6db', 2, 'stroke-width="1.2"') + C(32, 13.5, 1, '#5a626b', NS);
  return s;
};

S.bottle = (c) => P('M23 27 Q23 22 27 19 V13 H37 V19 Q41 22 41 27 V54 Q41 59 36 59 H28 Q23 59 23 54Z', lt(c, 0.55))
  + P('M23 33 Q32 29 41 33 V54 Q41 59 36 59 H28 Q23 59 23 54Z', c, 'stroke="none"')
  + L('M23 33 Q32 29 41 33', lt(c, 0.6), 1.5, 0.9)
  + R(23, 40, 18, 9, '#f2f2f2', 1, 'stroke="none"') + L('M26 45 Q29 42 32 45 T38 45', c, 1.6)
  + H('M26 24 V55 H29 V24Z', '#fff', 0.5)
  + R(25, 5, 14, 8, '#e6ecf0', 2) + L('M28 6 V12 M32 6 V12 M36 6 V12', '#9aa4ad', 1, 0.8);

S.bandage = () => {
  const w = '#f4f4f2';
  return P('M30 51 Q46 58 58 50 L58 42 Q46 48 36 46Z', w)
    + P('M50 42 H56 V44 H58 V48 H56 V50 H50 V48 H48 V44 H50Z', '#e0453f', 'stroke="none"')
    + C(27, 32, 20, w) + C(27, 32, 15.5, 'none', 'stroke="#cfd4d8" stroke-width="1.4"') + C(27, 32, 11, 'none', 'stroke="#cfd4d8" stroke-width="1.4"')
    + C(27, 32, 12.5, 'none', 'stroke="#e0453f" stroke-width="2.2" opacity=".85"') + C(27, 32, 4, '#2b3c45')
    + H('M12 24 A17 17 0 0 1 26 14 L26 18 A13 13 0 0 0 16 26Z', '#fff', 0.7);
};

S.medkit = (c) => L('M22 20 V14 Q22 9 27 9 H37 Q42 9 42 14 V20', OUT, 7)
  + L('M22 20 V14 Q22 9 27 9 H37 Q42 9 42 14 V20', '#3a4148', 3.6)
  + R(7, 19, 50, 36, 7, c) + P('M7 26 Q7 19 14 19 H50 Q57 19 57 26 V30 H7Z', dk(c, 0.18), 'stroke="none"') + L('M7 30 H57', dk(c, 0.5), 1.5, 0.6)
  + H('M12 22 H52 V24 H12Z', '#fff', 0.35)
  + R(27, 33, 10, 19, '#fff', 2, 'stroke="none"') + R(22.5, 37.5, 19, 10, '#fff', 2, 'stroke="none"')
  + R(4, 32, 5, 9, GOLD, 2) + R(55, 32, 5, 9, GOLD, 2);

S.seed = (c, id) => {
  const zig = 'M16 13 l4 -4 l4 4 l4 -4 l4 4 l4 -4 l4 4 l4 -4 l4 4';
  const leaf = id === 'pumpkin_seed' ? '#3f8a3a' : '#2f7a2a';
  return P(`${zig} V57 H16Z`, CREAM)
    + R(20, 24, 24, 26, 3, c, `stroke="${dk(c, 0.5)}" stroke-width="1.4"`)
    + L('M32 46 V34', '#215a1f', 2.2) + P('M32 38 Q24 36 23 30 Q31 30 32 38Z', leaf, 'stroke-width="1.2"') + P('M32 34 Q40 32 41 26 Q33 26 32 34Z', lt(leaf, 0.15), 'stroke-width="1.2"')
    + H('M17 12 H22 V56 H17Z', '#fff', 0.3)
    + E(53, 53, 3.2, 2, c, 'transform="rotate(30 53 53)" stroke-width="1.4"') + E(57, 47, 3.2, 2, c, 'transform="rotate(-20 57 47)" stroke-width="1.4"') + E(51, 59, 3, 1.9, c, 'transform="rotate(-10 51 59)" stroke-width="1.4"');
};

// ---- tools (drawn upright, rotated)
S.hatchet = (c, id) => {
  const iron = id.startsWith('iron');
  const wrap = iron
    ? R(27, 24, 10, 5, '#6b737c', 2)
    : L('M28 24 L36 29 M28 28 L36 33 M28 32 L36 37', '#d8c38a', 2.4);
  const inner = R(29, 8, 6, 51, WOOD, 3) + H('M30 10 H32 V57 H30Z', '#fff', 0.3) + L('M33 40 V56', dk(WOOD, 0.35), 1.2, 0.6)
    + R(29, 47, 6, 3, dk(WOOD, 0.3), 1, NS) + R(29, 53, 6, 3, dk(WOOD, 0.3), 1, NS)
    + P('M20 12 H30 V24 H20 Z', dk(c, 0.3))
    + P('M30 9 L43 5 Q57 15 48 29 L30 25 Z', c)
    + P('M30 9 L43 5 L46 15 L30 18Z', lt(c, 0.35), 'stroke="none"') + P('M30 25 L48 29 Q52 22 50 15 L30 18Z', dk(c, 0.12), 'stroke="none"')
    + L('M43 5 Q57 15 48 29', lt(c, 0.75), 2, 0.9) + wrap;
  return G(inner, 'rotate(38 32 32) translate(0 1)');
};

S.pickaxe = (c, id) => {
  const inner = R(29, 14, 6, 46, WOOD, 3) + H('M30 16 H32 V58 H30Z', '#fff', 0.3) + R(29, 50, 6, 3, dk(WOOD, 0.3), 1, NS) + R(29, 55, 6, 3, dk(WOOD, 0.3), 1, NS)
    + P('M4 28 Q32 -2 60 28 L54 31 Q32 12 10 31 Z', c)
    + P('M4 28 Q32 -2 60 28 L57 29 Q32 7 7 29Z', lt(c, 0.4), 'stroke="none"')
    + L('M6 29 Q32 3 58 29', lt(c, 0.6), 1.4, 0.6)
    + R(25, 15, 14, 11, dk(c, 0.22), 2) + H('M27 17 H37 V19 H27Z', '#fff', 0.3)
    + (id.startsWith('iron') ? '' : L('M28 27 L36 31 M28 31 L36 35', '#d8c38a', 2.4));
  return G(inner, 'rotate(38 32 32) translate(0 2)');
};

S.hammer = (c) => G(
  R(29, 20, 6, 41, c, 3) + H('M30 22 H32 V59 H30Z', '#fff', 0.3) + R(29, 50, 6, 3, dk(c, 0.3), 1, NS) + R(29, 55, 6, 3, dk(c, 0.3), 1, NS)
  + R(12, 6, 40, 19, '#8e97a1', 4) + R(12, 6, 8, 19, '#6f7882', 3) + R(44, 6, 8, 19, '#6f7882', 3)
  + H('M22 8 H42 V11 H22Z', '#fff', 0.45) + L('M20 6 V25 M44 6 V25', OUT, 1.4, 0.8),
  'rotate(38 32 32) translate(0 2)');

S.torch = () => G(
  C(32, 22, 20, '#ffb457', NS + ' opacity=".1"') + C(32, 22, 13, '#ffd27a', NS + ' opacity=".14"')
  + P('M27 60 L37 60 L39 30 L25 30 Z', '#8a5a2b') + H('M28 34 L30 34 L30 58 L28 58Z', '#fff', 0.25)
  + R(23, 27, 18, 13, '#d8cfae', 4) + L('M24 31 L40 35 M24 35 L40 39', dk('#d8cfae', 0.45), 1.6, 0.8)
  + P('M32 3 C41 12 47 19 45 27 C44 33 22 33 20 27 C18 19 26 12 32 3Z', '#ff8a3c')
  + P('M32 11 C38 18 41 22 40 27 C39 31 25 31 24 27 C23 22 28 18 32 11Z', '#ffc64a', 'stroke="none"')
  + P('M32 19 C35 23 36 26 35 28 C34 30 30 30 29 28 C28 26 30 23 32 19Z', '#fff4b8', 'stroke="none"'),
  'rotate(12 32 32)');

S.spear = () => G(
  R(30, 14, 4, 48, '#b58a5a', 2) + H('M30.6 16 H32 V60 H30.6Z', '#fff', 0.35)
  + P('M32 1 L41 20 Q32 27 23 20 Z', '#a9afb6') + P('M32 1 L41 20 Q37 22 32 22Z', dk('#a9afb6', 0.25), 'stroke="none"') + H('M32 4 L26 19 L29 21 L32 12Z', '#fff', 0.5)
  + L('M28 22 L36 27 M28 26 L36 31 M28 30 L36 35', '#d8c38a', 2.4)
  + P('M30 54 L24 62 L27 50Z', '#e8e0c8', 'stroke-width="1.4"') + P('M34 54 L40 62 L37 50Z', '#d9633f', 'stroke-width="1.4"'),
  'rotate(45 32 32) translate(0 1)');

S.machete = (c) => G(
  P('M24 44 V10 L28 4 Q42 6 43 22 Q43 34 37 44 Z', c)
  + P('M24 10 L28 4 L30 6 L27 44 H24Z', dk(c, 0.3), 'stroke="none"') + P('M35 6 Q43 12 43 22 Q43 34 37 44 L34 44 Q39 32 38 22 Q37 12 32 5Z', lt(c, 0.5), 'stroke="none"')
  + L('M29 12 V36', dk(c, 0.3), 1.4, 0.7) + H('M26 8 L28 6 L28 40 L26 40Z', '#fff', 0.35)
  + R(21, 43, 19, 4, '#7b838c', 2) + R(25, 46, 11, 16, '#2f353c', 3) + L('M25 51 H36 M25 55 H36', '#565e68', 1.6, 0.9)
  + C(30.5, 49, 1.4, GOLD, NS) + C(30.5, 58, 1.4, GOLD, NS),
  'rotate(38 32 32)');

S.bow = (c) => L('M48 6 Q6 32 48 58', OUT, 8) + L('M48 6 Q6 32 48 58', c, 5) + L('M46 9 Q12 32 46 55', lt(c, 0.45), 1.3, 0.8)
  + L('M48 6 V58', OUT, 3.4, 0.9) + L('M48 6 V58', '#efe6cf', 1.4)
  + R(23, 24, 7, 16, LEATHER, 2) + L('M23 28 H30 M23 32 H30 M23 36 H30', dk(LEATHER, 0.4), 1.2, 0.8)
  + L('M28 32 H58', OUT, 4) + L('M28 32 H58', '#c9a36b', 2)
  + P('M62 32 L54 28 L55 32 L54 36Z', '#aab0b8', 'stroke-width="1.4"')
  + P('M30 32 L24 27 L28 32 L24 37Z', '#e8e0c8', 'stroke-width="1.2"') + P('M34 32 L28 27 L32 32 L28 37Z', '#d9633f', 'stroke-width="1.2"');

S.revolver = (c) => {
  const wood = '#7a4a2a';
  return P('M6 56 L4 50 L8 34 L22 30 L20 44 L14 58 Q10 60 6 56Z', wood)
    + H('M8 36 L12 35 L9 50 L6 50Z', '#fff', 0.25) + C(13, 42, 1.6, GOLD, NS)
    + L('M22 34 Q28 46 34 34', OUT, 5) + L('M22 34 Q28 46 34 34', c, 2.2)
    + R(26, 17, 34, 8, dk(c, 0.15), 2) + R(40, 25, 16, 5, dk(c, 0.3), 2) + H('M28 18.5 H58 V20.5 H28Z', '#fff', 0.5)
    + PG('56,17 60,17 60,13 57,13', dk(c, 0.3))
    + P('M6 22 L15 20 L15 34 L22 34 L22 26 L26 26 L26 17 L20 17 L20 24 L8 24Z', c, '')
    + R(18, 16, 14, 18, 4, dk(c, 0.1)).replace('rx="4"', 'rx="4"') + L('M22 18 V32 M28 18 V32', dk(c, 0.5), 1.3, 0.7)
    + PG('6,22 12,15 15,17 12,24', dk(c, 0.3)) + H('M8 22.5 H14 V23.5 H8Z', '#fff', 0.5);
};

S.smg = (c) => {
  const d = dk(c, 0.3);
  return L('M13 21 H3 V33 H13', OUT, 5) + L('M13 21 H3 V33 H13', d, 2.4)
    + P('M26 32 H36 L38 56 H28Z', d) + L('M27 40 H36 M28 46 H37 M28 51 H37', OUT, 1, 0.6)
    + P('M11 32 H23 L20 52 H10Z', '#2b3138') + L('M12 40 H21 M11 46 H20', '#4a525b', 1.2, 0.8)
    + L('M24 33 Q30 44 38 34', OUT, 4) + L('M24 33 Q30 44 38 34', d, 1.6)
    + R(10, 18, 40, 15, 3, c) + R(48, 21, 12, 9, 2, d) + R(58, 23, 4, 5, 1, '#2b3138')
    + L('M52 23 V28 M55 23 V28', OUT, 1.2, 0.8)
    + R(16, 13, 20, 5, 1, d) + PG('40,18 42,12 44,12 44,18', d) + H('M12 19.5 H46 V22 H12Z', '#fff', 0.35)
    + R(38, 21, 6, 3, 1, '#2b3138', NS) + C(14, 25, 1.4, OUT, NS);
};

S.shotgun = (c) => {
  const steel = '#6e767f';
  return P('M20 21 L4 25 L5 43 L20 35Z', c) + H('M6 27 L18 23 L18 25 L6 29Z', '#fff', 0.3)
    + P('M16 31 L26 32 L22 47 L14 44Z', dk(c, 0.15))
    + R(22, 18, 40, 5, 2, steel) + R(22, 24, 34, 4, 2, '#565d66') + H('M24 19 H60 V20.5 H24Z', '#fff', 0.5)
    + R(14, 18, 16, 15, 3, '#4b525b') + L('M18 22 H26', '#7b838c', 1.4)
    + R(30, 24, 18, 9, 3, c) + L('M34 25 V32 M38 25 V32 M42 25 V32', dk(c, 0.4), 1.2, 0.8)
    + PG('58,18 61,18 61,14 59,14', '#565d66')
    + L('M22 33 Q27 44 33 33', OUT, 4) + L('M22 33 Q27 44 33 33', steel, 1.6);
};

S.rifle = (c) => {
  const steel = '#6e767f';
  return P('M3 23 L20 25 L30 30 L30 37 L20 37 L9 45 L3 42Z', c) + H('M5 25 L18 27 V29 L5 27Z', '#fff', 0.3)
    + R(36, 25, 27, 4, 1.5, steel) + R(38, 29, 16, 4, 2, c) + R(20, 24, 18, 9, 2, '#4b525b')
    + R(20, 12, 30, 8, 3, '#2e343b') + C(21, 16, 4.2, '#3a424a') + C(21, 16, 2.4, '#6ad0ef', 'stroke="none"') + C(49, 16, 3.6, '#3a424a') + C(49, 16, 1.8, '#6ad0ef', 'stroke="none"')
    + R(24, 19, 3, 6, 0, '#2e343b') + R(42, 19, 3, 6, 0, '#2e343b') + H('M26 13 H44 V14.5 H26Z', '#fff', 0.35)
    + L('M32 28 L32 22', OUT, 3) + C(32, 21.5, 1.8, '#9aa4ad') + R(25, 33, 8, 7, 1, '#3a4148')
    + L('M27 33 Q31 42 37 33', OUT, 3.6) + L('M27 33 Q31 42 37 33', steel, 1.4);
};

S.arrow = (c) => {
  const one = (dx) => G(
    R(30.5, 9, 3, 44, 1, c) + H('M31 10 H32 V52 H31Z', '#fff', 0.4)
    + P('M32 1 L38 13 L32 11 L26 13Z', '#aab0b8') + P('M32 44 L24 52 L24 60 L32 55Z', '#e8e0c8', 'stroke-width="1.4"') + P('M32 44 L40 52 L40 60 L32 55Z', '#d9633f', 'stroke-width="1.4"'),
    `translate(${dx} 0)`);
  return G(one(-10) + one(4), 'rotate(45 32 32)');
};

S.bullet = (c, id) => {
  const rifle = id === 'rifle_ammo';
  const one = (x, h) => {
    const w = 12, base = 58, top = base - h;
    if (rifle) {
      return P(`M${x + 1} ${base} V${base - h * 0.45} L${x + 3} ${base - h * 0.6} H${x + w - 3} L${x + w - 1} ${base - h * 0.45} V${base} Z`, c)
        + P(`M${x + 3} ${base - h * 0.6} L${x + 3} ${base - h * 0.62} Q${x + w / 2} ${top - 4} ${x + w - 3} ${base - h * 0.62} L${x + w - 3} ${base - h * 0.6}Z`, '#c8ccd2')
        + R(x - 0.5, base - 3, w + 1, 3.5, 1, dk(c, 0.2)) + H(`M${x + 2} ${base - 3} h2.5 V${base - h * 0.5} h-2.5Z`, '#fff', 0.4) + C(x + w / 2, base - 1.5, 1.4, dk(c, 0.5), NS);
    }
    return P(`M${x} ${base} V${top + 12} H${x + w} V${base} Z`, c)
      + P(`M${x} ${top + 12} Q${x} ${top} ${x + w / 2} ${top} Q${x + w} ${top} ${x + w} ${top + 12} Z`, '#c9773a')
      + R(x - 0.5, base - 3, w + 1, 3.5, 1, dk(c, 0.2)) + H(`M${x + 2} ${top + 4} h2.5 V${base - 4} h-2.5Z`, '#fff', 0.45) + C(x + w / 2, base - 1.5, 1.4, dk(c, 0.5), NS);
  };
  return rifle ? one(5, 46) + one(26, 50) + one(47, 46) : one(5, 32) + one(26, 36) + one(47, 32);
};

S.shell = (c) => {
  const sh = (tf) => G(
    R(23, 8, 18, 32, 3, c) + R(23, 8, 18, 6, 2, dk(c, 0.25)) + L('M26 8 V14 M30 8 V14 M34 8 V14 M38 8 V14', OUT, 0.9, 0.5)
    + H('M25 16 H28 V38 H25Z', '#fff', 0.35)
    + R(23, 39, 18, 15, 2, '#d9a441') + R(21.5, 51, 21, 4, 1.5, '#b9832a') + H('M25 41 H28 V51 H25Z', '#fff', 0.4) + C(32, 47, 2.6, dk('#d9a441', 0.4), 'stroke="none"'), tf);
  return sh('rotate(-16 32 34) translate(-8 3)') + sh('rotate(14 32 34) translate(9 1)');
};

// ---- armour
S.hood = (c) => P('M32 5 C15 5 9 22 12 38 L9 53 Q20 60 32 57 Q44 60 55 53 L52 38 C55 22 49 5 32 5Z', c)
  + P('M32 17 C23 17 21 30 24 39 Q32 45 40 39 C43 30 41 17 32 17Z', dk(c, 0.68))
  + P('M32 17 C41 17 43 30 40 39 Q44 30 42 22 Q38 16 32 17Z', dk(c, 0.55), 'stroke="none"')
  + L('M32 6 V16', dk(c, 0.35), 1.3, 0.7) + L('M12 38 Q14 46 10 52 M52 38 Q50 46 54 52', dk(c, 0.35), 1.3, 0.6)
  + H('M15 18 Q19 9 30 7 Q21 11 18 22 Q16 30 16 38 Q13 30 15 18Z', '#fff', 0.5) + L('M22 55 Q32 59 42 55', dk(c, 0.3), 1.6, 0.8);

S.shirt = (c) => {
  const iron = c.toLowerCase() === '#c9d1d9';
  return P('M22 8 L11 14 L3 35 L14 39 L18 30 L18 57 H46 L46 30 L50 39 L61 35 L53 14 L42 8 Q32 17 22 8Z', c)
    + P('M46 30 L46 57 H32 V14 Q38 13 42 8 L53 14 L61 35 L50 39Z', dk(c, 0.14), 'stroke="none"')
    + P('M22 8 Q32 19 42 8 L39 5 Q32 11 25 5Z', dk(c, 0.3)) + L('M32 15 V57', dk(c, 0.4), 1.4, 0.8)
    + R(3, 33, 12, 5, 1, dk(c, 0.28), 'transform="rotate(20 9 35)" stroke-width="1.2"') + R(49, 33, 12, 5, 1, dk(c, 0.28), 'transform="rotate(-20 55 35)" stroke-width="1.2"')
    + P('M21 40 H29 V48 H21Z', dk(c, 0.1), 'stroke-width="1.2"') + P('M35 40 H43 V48 H35Z', dk(c, 0.2), 'stroke-width="1.2"')
    + H('M20 12 L13 16 L7 32 L10 33 L16 20 L20 18Z', '#fff', 0.4) + C(32, 22, 1, dk(c, 0.5), NS) + C(32, 30, 1, dk(c, 0.5), NS) + C(32, 38, 1, dk(c, 0.5), NS);
};

S.pants = (c, id) => {
  const iron = id.startsWith('iron');
  let s = P('M17 6 H47 L51 59 H35 L32 27 L29 59 H13Z', c)
    + P('M47 6 L51 59 H35 L32 27 L32 6Z', dk(c, 0.14), 'stroke="none"')
    + P('M17 6 H47 L47.4 13 H16.6Z', dk(c, 0.28)) + L('M32 13 V27', dk(c, 0.45), 1.4, 0.8)
    + L('M14 54 H29 M35 54 H50', dk(c, 0.35), 2, 0.8) + H('M19 14 L14 55 L17 55 L22 14Z', '#fff', 0.35);
  if (iron) s += P('M17 24 H29 L28 34 H16.5Z', lt(c, 0.12), 'stroke-width="1.4"') + P('M35 24 H47 L47.5 34 H36Z', dk(c, 0.05), 'stroke-width="1.4"') + C(20, 29, 1.2, dk(c, 0.5), NS) + C(44, 29, 1.2, dk(c, 0.5), NS) + L('M20 38 V52 M43 38 V52', dk(c, 0.4), 1.2, 0.7);
  else s += L('M19 15 Q23 18 26 15', dk(c, 0.4), 1.2, 0.8);
  return s;
};

S.boots = (c, id) => {
  const iron = id.startsWith('iron');
  let s = P('M17 5 H39 V31 Q39 35 45 37 L56 41 Q61 43 61 50 V56 H15 Q12 56 12 52Z', c)
    + P('M17 5 H39 V13 H17Z', lt(c, 0.12)) + R(12, 52, 49, 7, 3, dk(c, 0.4))
    + P('M39 31 Q39 35 45 37 L56 41 Q61 43 61 50 V52 H36Z', dk(c, 0.12), 'stroke="none"')
    + L('M22 18 H35 M22 24 H35 M22 30 H36', dk(c, 0.4), 1.6, 0.85) + H('M19 15 H22 V50 H19Z', '#fff', 0.35)
    + L('M44 40 Q52 42 56 46', dk(c, 0.4), 1.3, 0.7);
  if (iron) s += P('M17 13 H39 L38 22 H18Z', lt(c, 0.1), 'stroke-width="1.4"') + C(22, 17, 1.2, dk(c, 0.5), NS) + C(34, 17, 1.2, dk(c, 0.5), NS) + P('M46 40 L58 44 Q61 46 61 50 H44Z', lt(c, 0.1), 'stroke-width="1.4"');
  return s;
};

S.helmet = (c) => P('M9 40 C7 17 20 6 32 6 C44 6 57 17 55 40 L55 52 H43 L43 42 Q32 37 21 42 L21 52 H9Z', c)
  + P('M55 40 C57 17 44 6 32 6 C44 12 47 24 46 38 L43 42 V52 H55Z', dk(c, 0.2), 'stroke="none"')
  + R(28, 6, 8, 30, 2, lt(c, 0.12)) + R(17, 27, 30, 6, 3, '#1d262b') + L('M20 30 H44', '#0a0f12', 1, 1)
  + H('M13 20 C14 13 20 9 27 8 C21 12 18 19 18 27 L17 36 Q13 30 13 20Z', '#fff', 0.5)
  + C(14, 44, 1.5, dk(c, 0.5), NS) + C(50, 44, 1.5, dk(c, 0.5), NS) + C(32, 12, 1.5, dk(c, 0.5), NS) + L('M9 47 H21 M43 47 H55', dk(c, 0.35), 1.2, 0.7);

S.chest = (c) => P('M17 9 Q32 18 47 9 L60 15 L58 30 L49 32 L49 55 Q32 61 15 55 L15 32 L6 30 L4 15Z', c)
  + P('M47 9 L60 15 L58 30 L49 32 L49 55 Q40 58 32 59 V16 Q40 14 47 9Z', dk(c, 0.15), 'stroke="none"')
  + P('M23 9 Q32 17 41 9 L38 6 Q32 12 26 6Z', dk(c, 0.5)) + L('M32 17 V58', dk(c, 0.4), 1.5, 0.8)
  + E(12, 19, 8, 6, lt(c, 0.15), 'transform="rotate(-14 12 19)"') + E(52, 19, 8, 6, dk(c, 0.05), 'transform="rotate(14 52 19)"')
  + L('M20 36 Q32 40 44 36 M20 44 Q32 48 44 44', dk(c, 0.4), 1.5, 0.8) + H('M10 13 L15 11 L14 30 L8 28Z', '#fff', 0.4)
  + C(18, 24, 1.3, dk(c, 0.5), NS) + C(46, 24, 1.3, dk(c, 0.5), NS) + C(32, 50, 1.3, dk(c, 0.5), NS);

S.campfire = () => C(32, 34, 26, '#ff9a3c', NS + ' opacity=".14"')
  + G(R(6, 46, 46, 9, 4, '#7a4f28') + E(52, 50.5, 3.5, 4.5, '#d6b27a'), 'rotate(-18 32 50)')
  + G(R(12, 46, 46, 9, 4, '#8f5d30') + E(58, 50.5, 3.5, 4.5, '#d6b27a'), 'rotate(18 32 50)')
  + P('M32 3 C42 14 50 22 47 34 C45 42 19 42 17 34 C15 22 24 15 32 3Z', '#ff8a3c')
  + P('M32 15 C39 22 42 27 40 35 C38 40 26 40 24 35 C22 27 27 22 32 15Z', '#ffc64a', 'stroke="none"')
  + P('M32 26 C35 29 36 33 35 36 C34 38 30 38 29 36 C28 33 30 29 32 26Z', '#fff4b8', 'stroke="none"')
  + E(9, 54, 6, 4.5, '#9aa0a6') + E(21, 58, 6, 4, '#868c93') + E(43, 58, 6, 4, '#9aa0a6') + E(55, 54, 6, 4.5, '#868c93')
  + H('M6 52 H12 V53.5 H6Z', '#fff', 0.5) + H('M40 56.5 H46 V58 H40Z', '#fff', 0.5);

S.furnace = (c) => {
  const brick = (x, y, w) => L(`M${x} ${y} h${w}`, dk(c, 0.4), 1.1, 0.6);
  let s = C(48, 6, 4, '#c9ced3', NS + ' opacity=".55"') + C(52, 2, 3, '#c9ced3', NS + ' opacity=".35"')
    + R(37, 6, 14, 18, 2, dk(c, 0.15)) + R(35, 4, 18, 5, 2, dk(c, 0.3))
    + R(8, 20, 48, 37, 4, c) + H('M10 22 H54 V25 H10Z', '#fff', 0.35)
    + R(5, 53, 54, 7, 2, dk(c, 0.25));
  for (const y of [30, 38, 46]) s += brick(9, y, 46);
  s += L('M22 20 V30 M40 20 V30 M16 30 V38 M32 30 V38 M48 30 V38 M22 38 V46 M40 38 V46', dk(c, 0.4), 1.1, 0.6);
  s += P('M18 55 V40 Q18 29 32 29 Q46 29 46 40 V55Z', '#1a110d') + P('M22 55 V43 Q22 34 32 34 Q42 34 42 43 V55Z', '#e8641c', 'stroke="none"')
    + P('M26 55 V46 Q26 39 32 38 Q38 39 38 46 V55Z', '#ffc64a', 'stroke="none"') + P('M29 55 V49 Q32 44 35 49 V55Z', '#fff4b8', 'stroke="none"');
  return s;
};

S.bench = (c, id) => {
  const t2 = id === 'workbench_2';
  let s = R(10, 34, 7, 24, 1, dk(c, 0.3)) + R(47, 34, 7, 24, 1, dk(c, 0.3)) + R(17, 47, 30, 4, 1, dk(c, 0.2))
    + R(8, 31, 48, 6, 2, dk(c, 0.15)) + PG('4,24 10,16 54,16 60,24', lt(c, 0.25)) + R(4, 24, 56, 8, 2, c)
    + H('M6 25.5 H58 V27 H6Z', '#fff', 0.35) + L('M20 24 V32 M40 24 V32', dk(c, 0.4), 1.1, 0.6);
  if (t2) {
    s += R(44, 8, 14, 9, 2, '#565d66') + R(50, 4, 3, 5, 1, '#9aa4ad') + C(50, 20, 0.1, '#000', NS)
      + P('M' + gearPath(21, 12, 8, 8).split(' ').join(' L') + 'Z', '#aeb6bf') + C(21, 12, 2.4, '#1d262b')
      + R(30, 12, 10, 4, 1, '#d9b84a', 'transform="rotate(-14 35 14)"');
  } else {
    s += G(R(30, 8, 4, 16, 1, WOOD), 'rotate(58 32 16) translate(-4 -1)') + R(14, 10, 14, 6, 2, '#8e97a1', 'transform="rotate(-8 20 13)"') + R(42, 12, 13, 4, 1, '#cbb27c');
  }
  s += `<circle cx="53" cy="53" r="8" fill="#3a2a10" stroke="#ffd27a" stroke-width="1.6"/><text x="53" y="57" font-family="Trebuchet MS,Segoe UI,sans-serif" font-size="11" font-weight="800" text-anchor="middle" fill="#ffd27a" stroke="none">${t2 ? '2' : '1'}</text>`;
  return s;
};

S.bag = (c) => R(5, 20, 46, 28, 14, c) + H('M14 24 H42 V27 H14Z', '#fff', 0.35)
  + E(50, 34, 12, 14, lt(c, 0.25)) + E(50, 34, 8, 9.5, 'none', `stroke="${dk(c, 0.35)}" stroke-width="1.4"`) + E(50, 34, 4, 5, 'none', `stroke="${dk(c, 0.35)}" stroke-width="1.4"`)
  + P('M14 20 H21 V48 H14Z', dk(c, 0.42)) + P('M31 20 H38 V48 H31Z', dk(c, 0.42)) + R(15, 31, 5, 6, 1, GOLD, 'stroke-width="1.2"') + R(32, 31, 5, 6, 1, GOLD, 'stroke-width="1.2"')
  + L('M22 26 H30 M22 42 H30', dk(c, 0.3), 1.6, 0.7) + L('M8 34 H14', dk(c, 0.3), 1.4, 0.7)
  + P('M8 51 Q26 57 44 51 L44 54 Q26 60 8 54Z', 'rgba(0,0,0,.25)', 'stroke="none"');

S.box = (c) => R(7, 16, 50, 41, 3, c) + R(5, 12, 54, 11, 3, lt(c, 0.12))
  + L('M8 33 H56 M8 45 H56', dk(c, 0.42), 1.5, 0.8) + L('M22 24 V56 M42 24 V56', dk(c, 0.3), 1.2, 0.5)
  + R(7, 16, 7, 41, 1, dk(c, 0.42), 'stroke-width="1.3"') + R(50, 16, 7, 41, 1, dk(c, 0.42), 'stroke-width="1.3"')
  + R(27, 20, 10, 11, 2, GOLD) + C(32, 25, 1.7, '#4a3a0a', NS) + H('M8 13 H58 V15 H8Z', '#fff', 0.4)
  + C(10.5, 20, 1, '#cfd6db', NS) + C(53.5, 20, 1, '#cfd6db', NS) + C(10.5, 52, 1, '#cfd6db', NS) + C(53.5, 52, 1, '#cfd6db', NS);

S.chest3 = (c) => R(5, 30, 54, 27, 3, c) + P('M5 31 V24 Q5 7 32 7 Q59 7 59 24 V31Z', lt(c, 0.12))
  + P('M45 8 Q59 12 59 24 V31 H50 V12Z', dk(c, 0.15), 'stroke="none"')
  + R(12, 8, 7, 49, 1, '#5b6470') + R(45, 8, 7, 49, 1, '#5b6470') + R(4, 28, 56, 5, 1.5, '#4a525c') + H('M13 10 H16 V55 H13Z', '#fff', 0.25)
  + R(26, 27, 12, 15, 3, GOLD) + C(32, 33, 2.2, '#4a3a0a', NS) + R(31, 34, 2, 5, 1, '#4a3a0a', NS) + H('M27 28 H37 V30 H27Z', '#fff', 0.45)
  + L('M6 40 H58 M6 49 H58', dk(c, 0.42), 1.3, 0.7) + C(15.5, 14, 1, '#cfd6db', NS) + C(48.5, 14, 1, '#cfd6db', NS);

S.lock = (c) => L('M19 30 V19 Q19 5 32 5 Q45 5 45 19 V30', OUT, 9) + L('M19 30 V19 Q19 5 32 5 Q45 5 45 19 V30', '#b6bdc4', 5)
  + L('M21 28 V19 Q21 8 32 8', '#fff', 1.4, 0.55)
  + R(10, 28, 44, 31, 7, c) + P('M10 36 Q10 28 17 28 H47 Q54 28 54 36Z', lt(c, 0.25), 'stroke="none"')
  + R(16, 33, 32, 8, 2, '#22262b') + L('M20 37 H44', '#7fdc86', 2, 0.9)
  + [0, 1, 2].map((i) => [0, 1].map((j) => C(23 + i * 9, 47 + j * 6, 2.1, '#3b2f0a', NS)).join('')).join('')
  + H('M12 36 H15 V56 H12Z', '#fff', 0.35);

S.spikes = (c) => {
  const stake = (tf) => G(P('M27 62 V20 L32 3 L37 20 V62 Z', c) + P('M32 3 L37 20 V62 H33Z', dk(c, 0.25), 'stroke="none"') + P('M32 3 L37 20 H27Z', '#ead6a4') + H('M28 22 H30 V60 H28Z', '#fff', 0.3), tf);
  return stake('rotate(-32 32 62)') + stake('rotate(32 32 62)') + stake('')
    + R(24, 38, 16, 5, 2, '#c9a36b') + L('M26 39 L30 42 M32 39 L36 42', dk('#c9a36b', 0.45), 1.2, 0.8) + E(32, 61, 14, 2.6, '#000', NS + ' opacity=".25"');
};

S.turret = (c) => R(12, 52, 40, 8, 3, dk(c, 0.3)) + R(27, 40, 10, 14, 1, dk(c, 0.15))
  + R(46, 22, 16, 5, 2, '#3d434b') + R(46, 31, 16, 5, 2, '#3d434b') + R(60, 21, 3, 7, 1, '#22262b') + R(60, 30, 3, 7, 1, '#22262b')
  + R(10, 14, 38, 28, 8, c) + H('M14 17 H44 V20 H14Z', '#fff', 0.35)
  + P('M48 14 Q56 20 48 42 Z', dk(c, 0.3), 'stroke="none"')
  + C(26, 29, 8, '#20262b') + C(26, 29, 5, '#e2554b') + C(24, 27, 1.8, '#ffd0c8', NS) + L('M12 36 H16 M12 39 H16', dk(c, 0.5), 1.3, 0.8) + L('M38 24 H44 M38 28 H44', dk(c, 0.5), 1.3, 0.8)
  + R(8, 24, 5, 12, 1, '#c9a441');

S.satchel = (c) => {
  const stick = (tf, col) => G(R(20, 6, 9, 30, 2, col) + R(20, 6, 9, 5, 2, dk(col, 0.3)) + H('M22 12 H24 V34 H22Z', '#fff', 0.35), tf);
  return stick('rotate(-10 24 34)', '#d63a30') + stick('rotate(10 24 34) translate(14 0)', '#c22f27')
    + L('M30 8 Q34 0 40 4', OUT, 4) + L('M30 8 Q34 0 40 4', '#e8dcb0', 1.8) + PG('40,0 43,5 47,3 43,7 45,11 40,8 36,11 38,6 34,3 38,4', '#ffc64a', 'stroke-width="1"')
    + P('M11 24 H47 L51 55 Q51 59 47 59 H15 Q11 59 11 55Z', c) + P('M11 24 H51 L49 38 Q31 46 13 38Z', dk(c, 0.18))
    + H('M13 26 H49 V28.5 H13Z', '#fff', 0.35)
    + R(26, 34, 8, 10, 2, GOLD, 'stroke-width="1.4"') + L('M20 24 V56 M42 24 V56', dk(c, 0.4), 1.3, 0.5)
    + L('M14 24 Q30 2 48 24', OUT, 6, 0) + L('M15 26 Q6 40 14 52', dk(c, 0.45), 3, 0.9);
};

const BP_TARGET = { bp_iron_tools: 'iron_pickaxe', bp_revolver: 'revolver', bp_smg: 'smg', bp_shotgun: 'shotgun', bp_rifle: 'rifle', bp_iron_armor: 'iron_chestplate', bp_turret: 'turret', bp_satchel: 'satchel' };
S.bp = (c, id) => {
  const paper = c, tgt = BP_TARGET[id];
  let s = R(9, 13, 46, 38, 2, paper) + H('M11 15 H53 V18 H11Z', '#fff', 0.35);
  for (let x = 17; x < 54; x += 8) s += L(`M${x} 15 V49`, '#fff', 0.8, 0.28);
  for (let y = 21; y < 50; y += 8) s += L(`M11 ${y} H53`, '#fff', 0.8, 0.28);
  s += R(4, 8, 56, 9, 4.5, CREAM) + R(4, 47, 56, 9, 4.5, CREAM)
    + E(6, 12.5, 2.2, 3.4, dk(CREAM, 0.25), NS) + E(58, 12.5, 2.2, 3.4, dk(CREAM, 0.25), NS) + E(6, 51.5, 2.2, 3.4, dk(CREAM, 0.25), NS) + E(58, 51.5, 2.2, 3.4, dk(CREAM, 0.25), NS)
    + H('M8 10 H56 V12 H8Z', '#fff', 0.6);
  if (tgt) {
    s += C(32, 32, 12.5, '#f4f1e6', 'stroke-width="1.4"') + `<g transform="translate(20.5 20.5) scale(.36)" stroke-width="3">${inner(tgt)}</g>`;
  } else s += C(32, 32, 9, CREAM);
  s += L('M27 56 Q32 62 37 56', '#c9a36b', 2.4);
  return s;
};

function inner(id) {
  const d = ITEMS[id];
  const fn = d && S[d.shape];
  return fn ? fn(d.color, id) : `<rect x="12" y="12" width="40" height="40" rx="8" fill="${(d && d.color) || '#888'}"/><text x="32" y="43" text-anchor="middle" font-size="28" font-weight="800" fill="#fff" stroke="none" font-family="sans-serif">?</text>`;
}

// ---------------------------------------------------------------- public API
const cache = new Map();
function svgFor(id) {
  let s = cache.get(id);
  if (!s) {
    s = `<g stroke="${OUT}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" fill="none">${inner(id)}</g>`;
    cache.set(id, s);
  }
  return s;
}

export function iconHTML(id, cls = 'ico') {
  return `<svg viewBox="0 0 64 64" class="${cls}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${svgFor(id)}</svg>`;
}
export function iconEl(id) {
  const t = document.createElement('template');
  t.innerHTML = iconHTML(id);
  return t.content.firstElementChild;
}

export const CAT_NAMES = { res: 'Resource', food: 'Food & Drink', tool: 'Tool', melee: 'Melee Weapon', gun: 'Firearm', bow: 'Bow', ammo: 'Ammunition', armor: 'Armor', deploy: 'Deployable', bp: 'Blueprint', med: 'Medical', build: 'Building Tool', seed: 'Seed' };
export const CAT_COLORS = { res: '#9db0b8', food: '#f2c94c', tool: '#5cc0e8', melee: '#ff8a6a', gun: '#ff8a6a', bow: '#ff8a6a', ammo: '#d9a441', armor: '#a78bfa', deploy: '#ffb457', bp: '#4aa3e8', med: '#e2554b', build: '#5cc0e8', seed: '#7fbf5a' };
const SLOT_NAMES = { head: 'Head', chest: 'Chest', legs: 'Legs', feet: 'Feet' };
const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const num = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toString();

// Tooltip HTML for an item id and optional instance ({n,dur,ammo}).
export function itemTip(id, inst) {
  const d = ITEMS[id];
  if (!d) return `<div class="tip-name">${esc(id)}</div>`;
  const rows = [];
  const row = (k, v, cls = '') => rows.push(`<div class="tip-row ${cls}"><span>${k}</span><b>${v}</b></div>`);
  const col = CAT_COLORS[d.cat] || '#9db0b8';
  let cat = CAT_NAMES[d.cat] || d.cat;
  if (d.cat === 'armor') cat = `Armor · ${SLOT_NAMES[d.slot] || d.slot}`;
  if (d.melee) {
    const m = d.melee;
    row('Damage', num(m.dmg, 0)); row('Speed', num(1 / m.rate, 1) + ' hits/s'); row('Reach', num(m.range, 1) + ' m');
  }
  if (d.gun) {
    const g = d.gun;
    const pel = g.pellets > 1 ? ` × ${g.pellets}` : '';
    row('Damage', num(g.dmg, 0) + pel);
    row('Fire rate', g.type === 'bow' ? num(1 / g.rate, 1) + ' shots/s' : (g.auto ? 'Auto · ' : 'Semi · ') + num(60 / g.rate, 0) + ' rpm');
    if (g.type !== 'bow') { row('Magazine', (inst && inst.ammo != null ? inst.ammo + ' / ' : '') + g.mag); row('Reload', num(g.reload, 1) + ' s' + (g.perShell ? ' / shell' : '')); }
    row('Range', num(g.range, 0) + ' m');
    row('Ammo', esc(ITEMS[g.ammo]?.name || g.ammo));
  }
  if (d.power) {
    if (d.power.axe > 8 || d.cat === 'tool') { if (d.power.axe) row('Chop power', num(d.power.axe, 0)); if (d.power.pick) row('Mine power', num(d.power.pick, 0)); }
  }
  if (d.armor != null) { row('Protection', '−' + num(d.armor * 100, 0) + '% damage', 'good'); }
  if (d.warmth) row('Warmth', '+' + d.warmth + '°', 'warm');
  if (d.food) row('Food', '+' + d.food, 'good');
  if (d.water) row('Water', '+' + d.water, 'water');
  if (d.heal) row('Heals', '+' + d.heal + ' HP', 'good');
  if (d.sick) row('Risk', 'May cause sickness', 'bad');
  if (d.light) row('Light', 'Lights the dark', 'warm');
  if (d.dur) {
    const cur = inst && inst.dur != null ? inst.dur : d.dur;
    const pct = Math.max(0, Math.min(1, cur / d.dur));
    row('Durability', `${Math.ceil(cur)} / ${d.dur}`);
    rows.push(`<div class="tip-dur"><i style="width:${pct * 100}%;background:${pct > 0.5 ? '#7fbf5a' : pct > 0.25 ? '#f2c94c' : '#e2554b'}"></i></div>`);
  }
  if (d.stack > 1) row('Stack', `${inst ? inst.n + ' / ' : ''}${d.stack}`, 'dim');
  const hint = d.cat === 'bp' ? 'Hold in hand and click to learn.' : d.cat === 'armor' ? 'Drag to the matching slot or shift-click to wear.' : (d.cat === 'food' || d.cat === 'med') ? 'Hold in hand and click to use.' : d.deploy ? 'Hold in hand to place it.' : '';
  return `<div class="tip-head"><i class="tip-ico">${iconHTML(id, 'ico')}</i><div><div class="tip-name">${esc(d.name)}</div><div class="tip-cat" style="color:${col}">${esc(cat)}</div></div></div>`
    + `<div class="tip-desc">${esc(d.desc || '')}</div>`
    + (rows.length ? `<div class="tip-rows">${rows.join('')}</div>` : '')
    + (hint ? `<div class="tip-hint">${hint}</div>` : '');
}
