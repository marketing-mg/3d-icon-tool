import { Shape } from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

export interface GlyphLayer {
  shapes: Shape[];
  /** fill-opacity × opacity; Phosphor duotone marks its background layer with 0.2. */
  opacity: number;
}

export interface Glyph {
  layers: GlyphLayer[];
  /** Normalization: SVG units → scene units. Based on the viewBox, not the tight bounds. */
  center: [number, number];
  unitsPerScene: number;
  hasStrokes: boolean;
}

export function parseSvg(text: string): Glyph {
  // three's Color doesn't know currentColor; fill color is irrelevant for geometry.
  const data = new SVGLoader().parse(text.replace(/currentColor/g, '#000'));
  const svg = data.xml as unknown as SVGSVGElement;
  const vb = (svg.getAttribute?.('viewBox') ?? '0 0 256 256').split(/[\s,]+/).map(Number);
  const [x, y, w, h] = vb.length === 4 ? vb : [0, 0, 256, 256];

  let hasStrokes = false;
  const layers: GlyphLayer[] = [];
  for (const path of data.paths) {
    const style: Record<string, any> = path.userData?.style ?? {};
    if (style.stroke && style.stroke !== 'none' && style.strokeWidth > 0) hasStrokes = true;
    if (style.fill === 'none') continue;
    const shapes = path.toShapes();
    if (shapes.length) layers.push({ shapes, opacity: (style.fillOpacity ?? 1) * (style.opacity ?? 1) });
  }

  // Glyph spans [-1, 1] in scene units for a full viewBox.
  return { layers, center: [x + w / 2, y + h / 2], unitsPerScene: Math.max(w, h) / 2, hasStrokes };
}
