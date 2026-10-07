import { BufferGeometry, ExtrudeGeometry, Path, Shape, Vector3 } from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { extrudeGlyph } from './solid';
import type { Glyph } from './svgToShapes';
import type { State } from '../state';

/** Tile spans [-1, 1] in x and y, matching a full-viewBox glyph so framing is the same in every mode. */
const HALF = 1;
/** Smooth the faceted rounded corners but keep bevel/chamfer edges crisp. */
const CREASE = (35 * Math.PI) / 180;

/**
 * Creased normals for the walls and bevels, but flat caps. Smoothing a cap into its first bevel
 * step tilts the normals at its rim, which the big cap triangles then interpolate into a gradient
 * across the whole face.
 */
function smoothSides(geo: BufferGeometry) {
  const out = toCreasedNormals(geo, CREASE);
  geo.dispose();
  const p = out.attributes.position;
  const n = out.attributes.normal;
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    const face = b.sub(a).cross(c.sub(a)).normalize();
    if (Math.abs(face.z) > 0.9999) for (let k = 0; k < 3; k++) n.setXYZ(i + k, 0, 0, Math.sign(face.z));
  }
  n.needsUpdate = true;
  return out;
}

function roundedRect<T extends Path>(target: T, half: number, radius: number, reverse = false): T {
  const r = Math.min(Math.max(radius, 0.0001), half);
  const h = half;
  if (!reverse) {
    target.moveTo(-h + r, -h);
    target.lineTo(h - r, -h);
    target.absarc(h - r, -h + r, r, -Math.PI / 2, 0, false);
    target.lineTo(h, h - r);
    target.absarc(h - r, h - r, r, 0, Math.PI / 2, false);
    target.lineTo(-h + r, h);
    target.absarc(-h + r, h - r, r, Math.PI / 2, Math.PI, false);
    target.lineTo(-h, -h + r);
    target.absarc(-h + r, -h + r, r, Math.PI, Math.PI * 1.5, false);
  } else {
    target.moveTo(-h + r, -h);
    target.absarc(-h + r, -h + r, r, Math.PI * 1.5, Math.PI, true);
    target.lineTo(-h, h - r);
    target.absarc(-h + r, h - r, r, Math.PI, Math.PI / 2, true);
    target.lineTo(h - r, h);
    target.absarc(h - r, h - r, r, Math.PI / 2, 0, true);
    target.lineTo(h, -h + r);
    target.absarc(h - r, -h + r, r, 0, -Math.PI / 2, true);
  }
  return target;
}

/** Extrude a scene-unit shape with its front face at z = 0. */
function extrudeShape(shape: Shape, depth: number, bevel: number, g: State['geometry']) {
  const b = Math.min(bevel, depth * 0.45);
  const geo = new ExtrudeGeometry(shape, {
    depth: Math.max(depth - 2 * b, 0.001),
    curveSegments: Math.max(g.curveSegments, 12),
    bevelEnabled: b > 0,
    bevelSize: b,
    bevelThickness: b,
    bevelOffset: -b,
    bevelSegments: g.bevelSegments,
  });
  geo.translate(0, 0, -depth + b);
  return geo;
}

/** The slab doesn't depend on the icon, so cache it: icon switches and batch exports reuse it. */
let slabCache: { key: string; geo: BufferGeometry } | null = null;

function slab(g: State['geometry']) {
  const key = [g.cornerRadius, g.slabDepth, g.slabBevel, g.bevelSegments, g.curveSegments].join('|');
  if (slabCache?.key !== key) {
    slabCache?.geo.dispose();
    const radius = g.cornerRadius * HALF;
    const geo = smoothSides(extrudeShape(roundedRect(new Shape(), HALF, radius), g.slabDepth, g.slabBevel, g));
    slabCache = { key, geo };
  }
  return slabCache.geo.clone();
}

const glyphParams = (g: State['geometry'], depth: number) => ({ ...g, depth });

/** Engraved: the glyph cut into the slab face with a CSG subtraction. */
export function buildEngraved(glyph: Glyph, g: State['geometry']): BufferGeometry {
  const base = slab(g);
  // Cutter: the glyph, from just above the face down to the groove floor. Its back bevel
  // chamfers the groove floor; the excess above the face keeps the cut clean.
  const above = 0.05;
  const depth = Math.min(g.engraveDepth, g.slabDepth * 0.8);
  const cutter = extrudeGlyph(
    glyph,
    // CSG cost scales with cutter triangles; grooves are small, so 12 segments per curve is plenty.
    {
      ...g,
      depth: depth + above,
      bevelThickness: Math.min(g.bevelThickness, depth / 3),
      curveSegments: Math.min(g.curveSegments, 12),
    },
    g.glyphScale,
  );
  cutter.translate(0, 0, above);
  base.clearGroups();
  cutter.clearGroups();

  const evaluator = new Evaluator();
  evaluator.attributes = ['position', 'uv', 'normal'];
  evaluator.useGroups = false;
  const a = new Brush(base);
  const b = new Brush(cutter);
  a.updateMatrixWorld();
  b.updateMatrixWorld();
  const result = evaluator.evaluate(a, b, SUBTRACTION).geometry;
  base.dispose();
  cutter.dispose();
  return finish(result);
}

/** Embossed: the glyph raised off the slab face. No CSG: the glyph's base just sinks into the slab. */
export function buildEmbossed(glyph: Glyph, g: State['geometry']): BufferGeometry {
  const sink = 0.01;
  const raised = extrudeGlyph(glyph, glyphParams(g, g.embossHeight + sink), g.glyphScale);
  raised.translate(0, 0, g.embossHeight);
  return finish(merge([slab(g), raised]));
}

/** Outline: a hollow rounded frame with the glyph standing inside it, flush with the frame's front. */
export function buildOutline(glyph: Glyph, g: State['geometry']): BufferGeometry {
  const radius = g.cornerRadius * HALF;
  const wall = Math.min(g.wallThickness, HALF * 0.4);
  const frame = roundedRect(new Shape(), HALF, radius);
  frame.holes.push(roundedRect(new Path(), HALF - wall, Math.max(radius - wall, 0.0001), true));
  const ring = smoothSides(extrudeShape(frame, g.slabDepth, g.slabBevel, g));
  const inner = extrudeGlyph(glyph, glyphParams(g, g.slabDepth), g.glyphScale);
  return finish(merge([ring, inner]));
}

function merge(parts: BufferGeometry[]) {
  // ExtrudeGeometry and toCreasedNormals output differ in indexing/groups; normalize before merging.
  const clean = parts.map((p) => {
    const geo = p.index ? p.toNonIndexed() : p;
    geo.clearGroups();
    for (const name of Object.keys(geo.attributes)) {
      if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    }
    return geo;
  });
  const merged = mergeGeometries(clean, false)!;
  parts.forEach((p) => p.dispose());
  return merged;
}

function finish(geo: BufferGeometry) {
  geo.center();
  return geo;
}
