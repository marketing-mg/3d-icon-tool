import type { State } from '../state';

const BASE_EDGE = 1024;
const RATIOS = { '1:1': 1, '3:2': 3 / 2, '16:9': 16 / 9 } as const;

export function aspectRatio(e: State['export']) {
  return e.aspect === 'custom' ? Math.max(e.width, 1) / Math.max(e.height, 1) : RATIOS[e.aspect];
}

/** Output pixel size. 1× = 1024px on the long edge; grainScale keeps grain proportional. */
export function exportSize(e: State['export'], max: number) {
  let w: number;
  let h: number;
  if (e.aspect === 'custom') {
    [w, h] = [e.width, e.height];
  } else {
    const r = RATIOS[e.aspect];
    // scale 0 = custom width at this aspect.
    w = e.scale > 0 ? BASE_EDGE * e.scale : e.width;
    h = Math.round(w / r);
  }
  const fit = Math.min(1, max / Math.max(w, h));
  w = Math.max(1, Math.round(w * fit));
  h = Math.max(1, Math.round(h * fit));
  return { w, h, grainScale: Math.max(w, h) / BASE_EDGE, clamped: fit < 1 };
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const pngName = (name: string, weight: string, s: State) => `${name}-${weight}-${s.material.preset}.png`;
