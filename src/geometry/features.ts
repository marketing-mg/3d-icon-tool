import { EllipseCurve, Vector2, type Curve } from 'three';
import type { Glyph } from './svgToShapes';

/** Glyph outlines in scene units (y up) at a given scale: one closed polyline per contour. */
export function glyphContours(glyph: Glyph, scale: number, divisions: number): Vector2[][] {
  const S = glyph.unitsPerScene / scale;
  const [cx, cy] = glyph.center;
  const map = (p: Vector2) => new Vector2((p.x - cx) / S, -(p.y - cy) / S);
  const out: Vector2[][] = [];
  for (const layer of glyph.layers) {
    for (const shape of layer.shapes) {
      const { shape: outer, holes } = shape.extractPoints(divisions);
      for (const c of [outer, ...holes]) {
        const pts = c.map(map);
        if (pts.length > 1 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-6) pts.pop();
        if (pts.length > 2) out.push(pts);
      }
    }
  }
  return out;
}

/** Sharp corners (turn > 35°) along the contours. Tessellated curves turn gently and are skipped. */
export function sharpCorners(contours: Vector2[][]): Vector2[] {
  const limit = Math.cos((35 * Math.PI) / 180);
  const out: Vector2[] = [];
  for (const c of contours) {
    for (let i = 0; i < c.length; i++) {
      const prev = c[(i - 1 + c.length) % c.length], cur = c[i], next = c[(i + 1) % c.length];
      const d1 = cur.clone().sub(prev), d2 = next.clone().sub(cur);
      if (d1.lengthSq() < 1e-12 || d2.lengthSq() < 1e-12) continue;
      if (d1.normalize().dot(d2.normalize()) < limit) out.push(cur.clone());
    }
  }
  return out;
}

/**
 * Centers of circles and large arcs, from the SVG's arc commands. Arcs sharing a center are summed;
 * keep ones sweeping ≥ 270° with a radius well above a stroke cap (so line ends don't get marks).
 */
export function circleCenters(glyph: Glyph, scale: number): { center: Vector2; r: number }[] {
  const S = glyph.unitsPerScene / scale;
  const [cx, cy] = glyph.center;
  const minR = glyph.unitsPerScene * (14 / 128);
  const groups = new Map<string, { x: number; y: number; r: number; sweep: number }>();
  const visit = (curve: Curve<Vector2>) => {
    if (!(curve instanceof EllipseCurve) || Math.abs(curve.xRadius - curve.yRadius) > 0.5) return;
    const key = `${Math.round(curve.aX * 2)},${Math.round(curve.aY * 2)}`;
    const g = groups.get(key) ?? { x: curve.aX, y: curve.aY, r: 0, sweep: 0 };
    g.r = Math.max(g.r, curve.xRadius);
    g.sweep += arcSweep(curve);
    groups.set(key, g);
  };
  for (const layer of glyph.layers)
    for (const shape of layer.shapes) {
      shape.curves.forEach(visit);
      shape.holes.forEach((h) => h.curves.forEach(visit));
    }
  return [...groups.values()]
    .filter((g) => g.r >= minR && g.sweep >= Math.PI * 1.5)
    .map((g) => ({ center: new Vector2((g.x - cx) / S, -(g.y - cy) / S), r: g.r / S }));
}

/** Angle actually swept, following EllipseCurve's own direction rules (start→end may wrap the long way). */
function arcSweep(c: EllipseCurve) {
  const TAU = Math.PI * 2;
  let d = c.aEndAngle - c.aStartAngle;
  while (d < 0) d += TAU;
  while (d > TAU) d -= TAU;
  if (d < Number.EPSILON) d = TAU;
  if (c.aClockwise) d = d === TAU ? TAU : TAU - d;
  return d;
}
