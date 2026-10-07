import { Color, MeshPhysicalMaterial } from 'three';
import type { State } from '../state';

type MaterialParams = Pick<State['material'], 'tint' | 'roughness' | 'clearcoat' | 'anisotropy'>;

interface MaterialPreset extends MaterialParams {
  label: string;
  /** A full look can also set lighting and grain (applied over the current values). */
  lighting?: Partial<State['lighting']>;
  grain?: Partial<State['grain']>;
}

export const materialPresets: Record<string, MaterialPreset> = {
  brand: {
    label: 'Brand',
    tint: '#5840e0',
    roughness: 0,
    clearcoat: 1,
    anisotropy: 0,
    lighting: { preset: 'studio', rotation: 0, intensity: 1, contrast: 0.75, exposure: 0.5, toneMapping: 'aces' },
    grain: { amount: 0 },
  },
  chrome: { label: 'Chrome', tint: '#ffffff', roughness: 0.16, clearcoat: 1, anisotropy: 0 },
  aluminum: { label: 'Aluminum', tint: '#e8e8e8', roughness: 0.28, clearcoat: 0, anisotropy: 0 },
  brushed: { label: 'Brushed', tint: '#e2e2e2', roughness: 0.35, clearcoat: 0, anisotropy: 0.6 },
};

export function createMaterial() {
  return new MeshPhysicalMaterial({ metalness: 1, clearcoatRoughness: 0.05 });
}

export function applyMaterial(mat: MeshPhysicalMaterial, m: State['material']) {
  mat.color = new Color(m.tint);
  mat.roughness = m.roughness;
  mat.clearcoat = m.clearcoat;
  mat.anisotropy = m.anisotropy;
  // Extrude UVs follow SVG x, so rotation 0 runs the brushing lines horizontally across the face.
  mat.anisotropyRotation = 0;
}
