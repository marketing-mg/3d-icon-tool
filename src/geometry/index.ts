import type { BufferGeometry } from 'three';
import { buildSolid } from './solid';
import { buildEmbossed, buildEngraved, buildOutline } from './tile';
import type { Glyph } from './svgToShapes';
import type { State } from '../state';

export type Mode = State['geometry']['mode'];

export const modes: { key: Mode; label: string; hint: string }[] = [
  { key: 'solid', label: 'Solid', hint: 'Fill weight works best.' },
  { key: 'engrave', label: 'Tile: engraved', hint: 'Regular or bold weight reads as cut grooves.' },
  { key: 'emboss', label: 'Tile: embossed', hint: 'Regular, bold or fill weight.' },
  { key: 'outline', label: 'Tile: outline', hint: 'Regular or bold weight; keep glyph scale small enough to clear the frame.' },
];

export function buildGeometry(glyph: Glyph, g: State['geometry']): BufferGeometry {
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
