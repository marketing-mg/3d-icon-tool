import { Color, MeshPhysicalMaterial } from 'three';
import type { State } from '../state';

type MaterialParams = Pick<State['material'], 'tint' | 'roughness' | 'clearcoat' | 'anisotropy'>;

export const materialPresets: Record<string, { label: string } & MaterialParams> = {
  chrome: { label: 'Chrome', tint: '#ffffff', roughness: 0.16, clearcoat: 1, anisotropy: 0 },
  aluminum: { label: 'Aluminum', tint: '#e8e8e8', roughness: 0.28, clearcoat: 0, anisotropy: 0 },
  brushed: { label: 'Brushed', tint: '#e2e2e2', roughness: 0.35, clearcoat: 0, anisotropy: 0.6 },
  graphite: { label: 'Graphite', tint: '#5a5c60', roughness: 0.3, clearcoat: 0.5, anisotropy: 0 },
  gunmetal: { label: 'Gunmetal', tint: '#7d8794', roughness: 0.22, clearcoat: 0.6, anisotropy: 0 },
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
