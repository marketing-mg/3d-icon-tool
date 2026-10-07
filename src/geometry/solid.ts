import { BufferGeometry, ExtrudeGeometry } from 'three';
import type { Glyph } from './svgToShapes';
import type { State } from '../state';

/** Extrude every layer of the glyph into a single beveled solid, centered on the origin. */
export function buildSolid(glyph: Glyph, g: State['geometry']): BufferGeometry {
  const S = glyph.unitsPerScene;
  const bevel = g.bevelSize > 0 && g.bevelThickness > 0;
  const shapes = glyph.layers.flatMap((l) => l.shapes);

  const geo = new ExtrudeGeometry(shapes, {
    depth: g.depth * S,
    curveSegments: g.curveSegments,
    bevelEnabled: bevel,
    bevelSize: g.bevelSize * S,
    bevelThickness: g.bevelThickness * S,
    // Inset the bevel so the silhouette and holes keep their SVG size.
    bevelOffset: -g.bevelSize * S,
    bevelSegments: g.bevelSegments,
  });

  // SVG y points down: rotate 180° about X (flips y and z, keeps handedness) then normalize.
  geo.translate(-glyph.center[0], -glyph.center[1], 0);
  geo.scale(1 / S, -1 / S, -1 / S);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  geo.translate(0, 0, -(bb.min.z + bb.max.z) / 2);

  return geo;
}
