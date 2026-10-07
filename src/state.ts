import brand from './presets/brand.json';

export type ToneMap = 'aces' | 'agx';
export type Backdrop = 'light' | 'dark' | 'checker';

export interface State {
  icon: { key: string };
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
  preview: { backdrop: Backdrop };
}

export const brandState = (): State => structuredClone(brand) as State;

export const state: State = brandState();

type Section = keyof State;
type Listener = (changed: Set<Section>) => void;
const listeners: Listener[] = [];
const pending = new Set<Section>();
let scheduled = false;

export function onChange(fn: Listener) {
  listeners.push(fn);
}

/** Mark sections dirty; listeners run once per frame with the set of changed sections. */
export function touch(...sections: Section[]) {
  sections.forEach((s) => pending.add(s));
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
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
