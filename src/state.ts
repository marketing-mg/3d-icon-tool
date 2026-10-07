import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import brand from './presets/brand.json';

export type ToneMap = 'aces' | 'agx';
export type Backdrop = 'light' | 'dark' | 'checker';
export type Weight = 'regular' | 'thin' | 'light' | 'bold' | 'fill' | 'duotone';
export type Aspect = '1:1' | '3:2' | '16:9' | 'custom';

export interface State {
  icon: { name: string; weight: Weight };
  geometry: {
    depth: number;
    bevelSize: number;
    bevelThickness: number;
    bevelSegments: number;
    curveSegments: number;
  };
  camera: { yaw: number; pitch: number; roll: number; perspective: number; locked: boolean };
  material: { preset: string; tint: string; roughness: number; clearcoat: number; anisotropy: number };
  lighting: {
    preset: string;
    rotation: number;
    intensity: number;
    contrast: number;
    exposure: number;
    toneMapping: ToneMap;
  };
  grain: { amount: number; size: number; seed: number };
  /** scale 1/2/4 multiplies a 1024px base edge; scale 0 = custom width/height. */
  export: { aspect: Aspect; scale: number; width: number; height: number };
  preview: { backdrop: Backdrop };
}

export type Section = keyof State;

export const brandState = (): State => structuredClone(brand) as State;

/** Copy only keys that exist in the template with a matching type, so old or hand-edited settings can't break state. */
function mergeKnown<T>(template: T, input: unknown): T {
  if (typeof template !== 'object' || template === null) {
    return typeof input === typeof template ? (input as T) : template;
  }
  const out = structuredClone(template) as Record<string, unknown>;
  if (typeof input !== 'object' || input === null) return out as T;
  for (const key of Object.keys(out)) {
    if (key in (input as object)) out[key] = mergeKnown(out[key], (input as Record<string, unknown>)[key]);
  }
  return out as T;
}

export const parseSettings = (input: unknown): State => mergeKnown(brandState(), input);

export const state: State = brandState();

type Listener = (changed: Set<Section>) => void;
const listeners: Listener[] = [];
const pending = new Set<Section>();
let scheduled = false;

export function onChange(fn: Listener) {
  listeners.push(fn);
}

/**
 * Mark sections dirty; listeners run once per task with the set of changed sections.
 * (A microtask, not rAF: rAF pauses in background tabs, which would stall share links and exports.)
 */
export function touch(...sections: Section[]) {
  sections.forEach((s) => pending.add(s));
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    const changed = new Set(pending);
    pending.clear();
    listeners.forEach((fn) => fn(changed));
  });
}

export function replaceState(next: State) {
  Object.assign(state, structuredClone(next));
  touch(...(Object.keys(state) as Section[]));
}

// --- URL hash: deflated JSON, base64url. Short enough to paste in Slack. ---

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export function encodeHash(s: State) {
  return 's=' + toBase64Url(deflateSync(strToU8(JSON.stringify(s)), { level: 9 }));
}

export function decodeHash(hash: string): State | null {
  const m = /(?:^#?|&)s=([\w-]+)/.exec(hash);
  if (!m) return null;
  try {
    return parseSettings(JSON.parse(strFromU8(inflateSync(fromBase64Url(m[1])))));
  } catch {
    return null;
  }
}
