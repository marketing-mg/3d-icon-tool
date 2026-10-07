import {
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  Texture,
  WebGLRenderer,
} from 'three';
import type { State } from '../state';

/** An emissive rectangle in the studio, aimed at the origin. Positions are in a ~10-unit room. */
interface Panel {
  pos: [number, number, number];
  size: [number, number];
  intensity: number;
}

// Camera sits roughly on +Z. Faces pointing at the camera reflect the +Z hemisphere, so that's
// where the big soft panels go; ±X stays a black void so the side walls fall to near black.
export const lightingPresets: Record<string, { label: string; panels: Panel[] }> = {
  studio: {
    label: 'Studio',
    panels: [
      { pos: [0, 1.5, 8], size: [15, 7], intensity: 1.5 }, // big front softbox: wide so faces stay bright across yaw
      { pos: [-6, 1, 5], size: [1.2, 9], intensity: 5 }, // tall left strip
      { pos: [0, 7, 3], size: [10, 1.2], intensity: 5 }, // top strip
      { pos: [0, 8, -1], size: [8, 6], intensity: 0.8 }, // wide overhead panel
      { pos: [0, -3, -8], size: [16, 6], intensity: 1.6 }, // back sweep: undersides seen from below reflect this
      { pos: [0, -7, 2], size: [14, 1], intensity: 8 }, // low strip: crisp highlight on lower chamfers
    ],
  },
  top: {
    label: 'Top strip',
    panels: [
      { pos: [0, 6, 5], size: [12, 1.6], intensity: 7 },
      { pos: [0, 1, 8], size: [8, 3], intensity: 0.9 },
      { pos: [0, -8, 3], size: [10, 6], intensity: 0.5 },
    ],
  },
  rim: {
    label: 'Rim',
    panels: [
      { pos: [-7, 0, -2], size: [1.2, 10], intensity: 8 },
      { pos: [7, 0, -2], size: [1.2, 10], intensity: 8 },
      { pos: [0, 7, -2], size: [10, 1.2], intensity: 6 },
      { pos: [0, 0, 8], size: [8, 5], intensity: 0.5 },
    ],
  },
  soft: {
    label: 'Soft',
    panels: [
      { pos: [0, 2, 8], size: [14, 9], intensity: 1.4 },
      { pos: [0, 8, 1], size: [12, 8], intensity: 1.2 },
      { pos: [-8, 0, 3], size: [6, 10], intensity: 1 },
      { pos: [0, -8, 3], size: [12, 8], intensity: 0.7 },
    ],
  },
};

const plane = new PlaneGeometry(1, 1);

function buildStudio(l: State['lighting']): Scene {
  const scene = new Scene();
  // Contrast 1 = pure black void; lower values lift the void toward grey.
  const v = (1 - l.contrast) * 0.25;
  scene.background = new Color(v, v, v);
  const rig = new Group();
  rig.rotation.y = (l.rotation * Math.PI) / 180;
  for (const p of (lightingPresets[l.preset] ?? lightingPresets.studio).panels) {
    const m = new Mesh(plane, new MeshBasicMaterial({ side: DoubleSide }));
    m.material.color.setScalar(p.intensity);
    m.scale.set(p.size[0], p.size[1], 1);
    m.position.set(...p.pos);
    m.lookAt(0, 0, 0);
    rig.add(m);
  }
  scene.add(rig);
  return scene;
}

export class StudioEnvironment {
  private pmrem: PMREMGenerator;
  private cache = new Map<string, Texture>();

  constructor(renderer: WebGLRenderer) {
    this.pmrem = new PMREMGenerator(renderer);
  }

  get(l: State['lighting']): Texture {
    const key = `${l.preset}|${l.rotation}|${l.contrast}`;
    let tex = this.cache.get(key);
    if (!tex) {
      const scene = buildStudio(l);
      tex = this.pmrem.fromScene(scene, 0, 0.1, 50).texture;
      scene.traverse((o) => (o as Mesh).material && ((o as Mesh).material as MeshBasicMaterial).dispose());
      // Keep the cache small: slider drags would otherwise fill it with one texture per step.
      if (this.cache.size > 8) {
        const [oldKey, old] = this.cache.entries().next().value!;
        old.dispose();
        this.cache.delete(oldKey);
      }
      this.cache.set(key, tex);
    }
    return tex;
  }
}
