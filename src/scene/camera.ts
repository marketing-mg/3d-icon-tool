import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import type { State } from '../state';

const DEG = Math.PI / 180;
/** Radius of the sphere we keep in frame, in scene units (glyph spans [-1, 1] plus depth). */
const FRAME_RADIUS = 1.55;

export interface CameraPreset {
  label: string;
  yaw: number;
  pitch: number;
  roll: number;
  /** Vertical FOV in degrees; 0 = orthographic. */
  perspective: number;
}

// Positive pitch looks from above, negative from below. Positive yaw orbits to the viewer's left
// (revealing the object's left side). Hero matches the reference: seen from below-right.
export const cameraPresets: Record<string, CameraPreset> = {
  hero: { label: 'Hero', yaw: -28, pitch: -18, roll: -6, perspective: 30 },
  leanRight: { label: 'Lean right', yaw: 32, pitch: -14, roll: 4, perspective: 30 },
  topDown: { label: 'Top down', yaw: -15, pitch: 45, roll: 0, perspective: 25 },
  front: { label: 'Front flat', yaw: 0, pitch: 0, roll: 0, perspective: 20 },
  iso: { label: 'True iso', yaw: 45, pitch: 35.264, roll: 0, perspective: 0 },
};

export class CameraRig {
  readonly persp = new PerspectiveCamera(30, 1, 0.1, 200);
  readonly ortho = new OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  aspect = 1;

  get active() {
    return this.isOrtho ? this.ortho : this.persp;
  }

  private isOrtho = false;

  update(c: State['camera']) {
    this.isOrtho = c.perspective < 1;
    const fov = Math.max(c.perspective, 1);
    // Move the camera so the framed size stays constant as FOV changes.
    const dist = this.isOrtho ? 20 : FRAME_RADIUS / Math.sin((fov * DEG) / 2);

    const yaw = -c.yaw * DEG;
    const pitch = c.pitch * DEG;
    const dir = new Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const cam = this.active;
    cam.position.copy(dir.multiplyScalar(dist));
    cam.up.set(0, 1, 0);
    cam.lookAt(0, 0, 0);
    cam.rotateZ(c.roll * DEG);

    this.persp.fov = fov;
    this.persp.aspect = this.aspect;
    const h = FRAME_RADIUS;
    this.ortho.left = -h * this.aspect;
    this.ortho.right = h * this.aspect;
    this.ortho.top = h;
    this.ortho.bottom = -h;
    cam.updateProjectionMatrix();
  }
}
