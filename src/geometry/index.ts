import { Box3, Vector3, type BufferGeometry } from 'three';
import { buildSolid, type RawBuild } from './solid';
import { buildEmbossed, buildEngraved, buildOutline } from './tile';
import { EdgeModel } from './edges';
import { circleCenters, glyphContours, sharpCorners } from './features';
import type { Glyph } from './svgToShapes';
import type { State } from '../state';

export type Mode = State['geometry']['mode'];

export const modes: { key: Mode; label: string; hint: string }[] = [
  { key: 'solid', label: 'Solid', hint: 'Fill weight works best.' },
  { key: 'engrave', label: 'Tile: engraved', hint: 'Regular or bold weight reads as cut grooves.' },
  { key: 'emboss', label: 'Tile: embossed', hint: 'Regular, bold or fill weight.' },
  { key: 'outline', label: 'Tile: outline', hint: 'Regular or bold weight; keep glyph scale small enough to clear the frame.' },
];

/** Everything the blueprint style draws, in the same (centered) space as the mesh. */
export interface LineModel {
  edges: EdgeModel;
  /** Corner marker positions, xyz triples. */
  corners: Float32Array;
  centers: { x: number; y: number; z: number; r: number }[];
  bounds: Box3;
  frontZ: number;
}

export interface Built {
  geometry: BufferGeometry;
  /** Built on first use: only the blueprint style needs it. */
  lines: () => LineModel;
}

export function buildGeometry(glyph: Glyph, g: State['geometry']): Built {
  const raw = buildRaw(glyph, g);
  // A part may be the mesh itself (solid mode); keep edge extraction on an uncentered copy.
  raw.parts = raw.parts.map((p) => (p.geo === raw.geometry ? { ...p, geo: p.geo.clone() } : p));
  raw.geometry.computeBoundingBox();
  const offset = raw.geometry.boundingBox!.getCenter(new Vector3()).negate();
  raw.geometry.translate(offset.x, offset.y, offset.z);
  raw.geometry.computeBoundingBox();
  const bounds = raw.geometry.boundingBox!.clone();

  let cached: LineModel | null = null;
  const lines = () => (cached ??= buildLines(glyph, g, raw, offset, bounds));
  return { geometry: raw.geometry, lines };
}

function buildRaw(glyph: Glyph, g: State['geometry']): RawBuild {
  switch (g.mode) {
    case 'engrave':
      return buildEngraved(glyph, g);
    case 'emboss':
      return buildEmbossed(glyph, g);
    case 'outline':
      return buildOutline(glyph, g);
    default:
      return buildSolid(glyph, g);
  }
}

function buildLines(glyph: Glyph, g: State['geometry'], raw: RawBuild, offset: Vector3, bounds: Box3): LineModel {
  const contours = glyphContours(glyph, raw.glyphScale, g.curveSegments);
  // Where the glyph meets a slab face, draw its outline on that plane.
  const extra: number[] = [];
  for (const z of raw.planes)
    for (const c of contours)
      c.forEach((p, i) => {
        const q = c[(i + 1) % c.length];
        extra.push(p.x, p.y, z, q.x, q.y, z);
      });

  const corners = sharpCorners(contours).flatMap((p) => [p.x + offset.x, p.y + offset.y, raw.cornerZ + offset.z]);
  const centers = circleCenters(glyph, raw.glyphScale).map(({ center, r }) => ({
    x: center.x + offset.x,
    y: center.y + offset.y,
    z: raw.glyphFront + offset.z,
    r,
  }));
  return {
    edges: new EdgeModel(raw.parts, extra, offset),
    corners: new Float32Array(corners),
    centers,
    bounds,
    frontZ: bounds.max.z,
  };
}
