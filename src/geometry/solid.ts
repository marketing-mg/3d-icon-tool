import { BufferGeometry, ExtrudeGeometry } from 'three';
import type { Glyph } from './svgToShapes';
import type { State } from '../state';

export interface ExtrudeParams {
  /** Total thickness in scene units, bevels included. */
  depth: number;
  bevelSize: number;
  bevelThickness: number;
  bevelSegments: number;
  curveSegments: number;
}

/**
 * Extrude the glyph at `scale` (1 = full viewBox spans [-1, 1]) with its front face at z = 0,
 * extending toward -z. Params are in scene units.
 */
export function extrudeGlyph(glyph: Glyph, p: ExtrudeParams, scale = 1): BufferGeometry {
  // Work in SVG units so curve tessellation is resolution-independent, then normalize.
  const S = glyph.unitsPerScene / scale;
  const bt = Math.min(p.bevelThickness, p.depth * 0.45);
  const bevel = p.bevelSize > 0 && bt > 0;
  const geo = new ExtrudeGeometry(
    glyph.layers.flatMap((l) => l.shapes),
    {
      depth: Math.max(p.depth - (bevel ? 2 * bt : 0), 0.001) * S,
      curveSegments: p.curveSegments,
      bevelEnabled: bevel,
      bevelSize: p.bevelSize * S,
      bevelThickness: bt * S,
      // Inset the bevel so the silhouette and holes keep their SVG size.
      bevelOffset: -p.bevelSize * S,
      bevelSegments: p.bevelSegments,
    },
  );
  // SVG y points down: rotate 180° about X (flips y and z, keeps handedness) then normalize.
  geo.translate(-glyph.center[0], -glyph.center[1], 0);
  geo.scale(1 / S, -1 / S, -1 / S);
  geo.computeBoundingBox();
  geo.translate(0, 0, -geo.boundingBox!.max.z);
  return geo;
}

/** Solid mode: the glyph as a single beveled solid, centered on the origin. */
export function buildSolid(glyph: Glyph, g: State['geometry']): BufferGeometry {
  // Solid depth historically excludes the bevel thickness; keep that so saved settings render the same.
  const geo = extrudeGlyph(glyph, { ...g, depth: g.depth + 2 * Math.min(g.bevelThickness, g.depth) });
  geo.center();
  return geo;
}
