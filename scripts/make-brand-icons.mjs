// Generates the Monograph mark in Phosphor's weights on Phosphor's 256 grid.
// Source: assets/monograph-source.svg (two convex polygons). Output: public/brand-icons/<weight>/.
//
// Outline weights use Phosphor's stroke widths (light 12, regular 16, bold 24) with rounded outer
// corners like Phosphor's round joins, but the stroke runs *inward* from the logo edge: a centered
// stroke would close the logo's diagonal gap (~16 units at this size). Fill is the exact mark.
import { mkdirSync, writeFileSync } from 'node:fs';

const LOGO = [
  [[0, 0], [0, 110], [73.3333, 110], [27.5, 0]],
  [[100.832, 110], [82.501, 110], [55, 43.9971], [73.332, 0], [100.832, 0]],
];
const LOGO_W = 100.832, LOGO_H = 110;
const SIZE = 256, EXTENT = 208; // Phosphor glyphs span 24..232
const s = EXTENT / LOGO_H;
const ox = (SIZE - LOGO_W * s) / 2, oy = (SIZE - EXTENT) / 2;

const area = (p) => p.reduce((a, [x, y], i) => { const [x2, y2] = p[(i + 1) % p.length]; return a + x * y2 - x2 * y; }, 0);
// Screen-clockwise (positive shoelace in y-down coords), so inward normal of edge (dx,dy) is (-dy,dx).
const polys = LOGO.map((p) => p.map(([x, y]) => [ox + x * s, oy + y * s])).map((p) => (area(p) > 0 ? p : [...p].reverse()));

const inward = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); return [-dy / l, dx / l]; };

/** Inset a convex polygon by d: clip it by each edge's inward-shifted half-plane. */
function inset(poly, d) {
  let out = poly;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], n = inward(a, poly[(i + 1) % poly.length]);
    const f = (p) => n[0] * (p[0] - a[0]) + n[1] * (p[1] - a[1]) - d;
    const next = [];
    for (let j = 0; j < out.length; j++) {
      const p = out[j], q = out[(j + 1) % out.length], fp = f(p), fq = f(q);
      if (fp >= 0) next.push(p);
      if (fp >= 0 !== fq >= 0) { const t = fp / (fp - fq); next.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
    }
    out = next;
  }
  return out;
}

const f = (n) => +n.toFixed(2);
const pt = ([x, y]) => `${f(x)},${f(y)}`;

/** Convex polygon with convex corners rounded by r: (P inset r) ⊕ disk(r). */
function rounded(poly, r) {
  const q = inset(poly, r);
  let d = '';
  for (let i = 0; i < q.length; i++) {
    const prev = q[(i - 1 + q.length) % q.length], cur = q[i], next = q[(i + 1) % q.length];
    const a = inward(prev, cur), b = inward(cur, next);
    const start = [cur[0] - a[0] * r, cur[1] - a[1] * r], end = [cur[0] - b[0] * r, cur[1] - b[1] * r];
    d += `${i ? 'L' : 'M'}${pt(start)}A${r},${r},0,0,1,${pt(end)}`;
  }
  return d + 'Z';
}

/** Hole: inner edge of the inward stroke, wound opposite so the nonzero rule cuts it out. */
const hole = (poly, w) => 'M' + inset(poly, w).reverse().map(pt).join('L') + 'Z';

const svg = (d) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="${d}"/></svg>\n`;

const weights = { light: 12, regular: 16, bold: 24 };
const files = {
  fill: svg(polys.map((p) => 'M' + p.map(pt).join('L') + 'Z').join('')),
  ...Object.fromEntries(
    Object.entries(weights).map(([wt, w]) => [wt, svg(polys.map((p) => rounded(p, w / 2) + hole(p, w)).join(''))]),
  ),
};

for (const [weight, text] of Object.entries(files)) {
  mkdirSync(`public/brand-icons/${weight}`, { recursive: true });
  writeFileSync(`public/brand-icons/${weight}/${weight === 'regular' ? 'monograph' : `monograph-${weight}`}.svg`, text);
}
console.log('Wrote', Object.keys(files).map((w) => `brand-icons/${w}`).join(', '));
