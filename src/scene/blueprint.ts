import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  GreaterDepth,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Vector2,
  Scene,
  ShaderMaterial,
  Vector3,
  type Camera,
} from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import type { LineModel } from '../geometry';
import type { State } from '../state';

function markerGeometry(centers: Float32Array) {
  const geo = new InstancedBufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.setAttribute('center', new InstancedBufferAttribute(centers, 3));
  geo.instanceCount = centers.length / 3;
  return geo;
}

export const blueprintPresets: Record<string, { label: string; background: string; line: string; accent: string }> = {
  purple: { label: 'Purple field', background: '#5840e0', line: '#f4f2ff', accent: '#ffffff' },
  paper: { label: 'White paper', background: '#f4f3ef', line: '#111111', accent: '#5840e0' },
  dark: { label: 'Black field', background: '#0e0e10', line: '#f2f2f2', accent: '#8b78ff' },
};


function lineMaterial(opts: ConstructorParameters<typeof LineMaterial>[0] = {}) {
  // depthWrite off: lines test only against the occluder, never against each other.
  return new LineMaterial({ linewidth: 1, depthWrite: false, ...opts });
}

class Lines extends LineSegments2 {
  constructor(material: LineMaterial) {
    super(new LineSegmentsGeometry(), material);
    this.visible = false;
  }
  set(positions: ArrayLike<number>) {
    this.visible = positions.length > 0;
    if (!this.visible) return;
    this.geometry.dispose();
    this.geometry = new LineSegmentsGeometry().setPositions(positions as Float32Array);
    this.computeLineDistances();
  }
}

/**
 * Technical-drawing renderer. The mesh is drawn only as a depth occluder (in the background
 * color), visible edges on top, hidden edges dashed where they fall behind the occluder.
 */
export class BlueprintScene {
  readonly scene = new Scene();
  /** Flat 2D grid behind everything, in frame units (height 2). */
  readonly gridScene = new Scene();
  readonly gridCamera = new OrthographicCamera(-1, 1, 1, -1, -1, 1);

  private occluderMaterial = new MeshBasicMaterial({
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  readonly occluder = new Mesh(undefined, this.occluderMaterial);
  /**
   * Background as a full-frame plane rather than a clear color: it goes through the same color
   * pipeline as the occluder, so the object's fill matches the background exactly.
   */
  private backgroundMat = new MeshBasicMaterial({ depthWrite: false, depthTest: false });
  private background = new Mesh(new PlaneGeometry(2, 2), this.backgroundMat);

  private visibleMat = lineMaterial();
  private hiddenMat = lineMaterial({ dashed: true, transparent: true, depthFunc: GreaterDepth });
  private centerMat = lineMaterial();
  private constructionMat = lineMaterial({ dashed: true, transparent: true });
  private gridMat = lineMaterial({ dashed: true, transparent: true, depthTest: false });

  private visibleLines = new Lines(this.visibleMat);
  private hiddenLines = new Lines(this.hiddenMat);
  private centerLines = new Lines(this.centerMat);
  private constructionLines = new Lines(this.constructionMat);
  private gridLines = new Lines(this.gridMat);

  /**
   * Corner markers: camera-facing quads sized in pixels (instanced), drawn as hollow squares.
   * Point sprites would be simpler but clip and size inconsistently across browsers.
   */
  private markerMat = new ShaderMaterial({
    uniforms: {
      color: { value: new Color() },
      fill: { value: new Color() },
      fillOpacity: { value: 1 },
      size: { value: 10 },
      stroke: { value: 1.5 },
      resolution: { value: new Vector2(1, 1) },
    },
    vertexShader: /* glsl */ `
      attribute vec3 center;
      uniform float size;
      uniform vec2 resolution;
      varying vec2 vUv;
      void main() {
        // Pull toward the eye a little: the bevel beside a corner rises toward the camera and
        // would otherwise hide most of the square. Small next to the object's depth, so corners
        // on the far side stay hidden.
        vec4 mv = modelViewMatrix * vec4(center, 1.0);
        vec3 toEye = projectionMatrix[3][3] == 1.0 ? vec3(0.0, 0.0, 1.0) : normalize(-mv.xyz); // ortho vs perspective
        mv.xyz += toEye * 0.06;
        vec4 clip = projectionMatrix * mv;
        clip.xy += position.xy * size / resolution * clip.w;
        gl_Position = clip;
        vUv = position.xy;
      }
    `,
    // Hollow square; the interior is filled with the background so lines stop at the marker.
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform vec3 fill;
      uniform float fillOpacity;
      uniform float size;
      uniform float stroke;
      varying vec2 vUv;
      void main() {
        vec2 p = abs(vUv) * size * 0.5;
        if (max(p.x, p.y) < size * 0.5 - stroke) {
          if (fillOpacity < 0.5) discard;
          gl_FragColor = vec4(fill, 1.0);
        } else {
          gl_FragColor = vec4(color, 1.0);
        }
      }
    `,
    depthWrite: false,
  });
  private markers = new Mesh(markerGeometry(new Float32Array()), this.markerMat);

  private model: LineModel | null = null;
  private style: State['blueprint'] | null = null;
  private viewDirty = true;
  private pxScale = 1;
  private aspect = 1;

  constructor() {
    this.markers.frustumCulled = false;
    // Draw order: occluder, hidden (dashed), visible, construction, center marks, markers.
    this.occluder.renderOrder = 0;
    this.hiddenLines.renderOrder = 1;
    this.visibleLines.renderOrder = 2;
    this.constructionLines.renderOrder = 3;
    this.centerLines.renderOrder = 4;
    this.markers.renderOrder = 5;
    this.scene.add(this.occluder, this.hiddenLines, this.visibleLines, this.constructionLines, this.centerLines, this.markers);
    this.background.renderOrder = -1;
    this.gridScene.add(this.background, this.gridLines);
  }

  setModel(geometry: BufferGeometry, model: LineModel) {
    this.occluder.geometry = geometry;
    this.model = model;
    this.markers.geometry.dispose();
    this.markers.geometry = markerGeometry(model.corners);
    this.centerLines.set(this.centerMarkSegments());
    this.constructionLines.set(this.constructionSegments());
    this.viewDirty = true;
  }

  /** Recompute silhouettes from the camera. Call after the camera moves. */
  invalidateView() {
    this.viewDirty = true;
  }

  setStyle(s: State['blueprint']) {
    this.style = s;
    const line = new Color(s.line);
    const bg = new Color(s.background);
    this.visibleMat.color.copy(line);
    this.hiddenMat.color.copy(line);
    this.hiddenMat.opacity = s.hiddenOpacity;
    this.hiddenLines.material.visible = s.hiddenLines;
    this.centerMat.color.set(s.accent);
    this.constructionMat.color.copy(line);
    this.constructionMat.opacity = 0.5;
    this.gridMat.color.copy(line);
    this.gridMat.opacity = 0.28;
    this.occluderMaterial.color.copy(bg);
    this.backgroundMat.color.copy(bg);
    this.background.visible = !s.transparent;
    // Transparent export: the object hides lines behind it but paints nothing itself.
    this.occluderMaterial.colorWrite = !s.transparent;
    this.markerMat.uniforms.color.value.set(s.accent);
    this.markerMat.uniforms.fill.value.copy(bg);
    this.markerMat.uniforms.fillOpacity.value = s.transparent ? 0 : 1;
    this.markers.visible = s.corners;
    this.centerLines.material.visible = s.centers;
    this.constructionLines.material.visible = s.construction;
    this.gridLines.material.visible = s.grid && !s.transparent;
    this.gridLines.set(this.gridSegments());
    this.applySizes();
  }

  /** Device-pixel resolution of the target. Line widths are px at a 1024px long edge, so they scale with output size. */
  setSize(width: number, height: number) {
    this.pxScale = Math.max(width, height) / 1024;
    this.aspect = width / height;
    for (const m of [this.visibleMat, this.hiddenMat, this.centerMat, this.constructionMat, this.gridMat]) {
      m.resolution.set(width, height);
    }
    this.markerMat.uniforms.resolution.value.set(width, height);
    this.gridCamera.left = -this.aspect;
    this.gridCamera.right = this.aspect;
    this.gridCamera.updateProjectionMatrix();
    this.background.scale.set(this.aspect, 1, 1);
    if (this.style) this.gridLines.set(this.gridSegments());
    this.applySizes();
  }

  private applySizes() {
    if (!this.style) return;
    const w = this.style.lineWidth * this.pxScale;
    this.visibleMat.linewidth = w;
    this.hiddenMat.linewidth = w * 0.8;
    this.centerMat.linewidth = w * 0.8;
    this.constructionMat.linewidth = Math.max(w * 0.6, 0.75);
    this.gridMat.linewidth = Math.max(w * 0.6, 0.75);
    // World-space dashes for the object (they foreshorten with it); frame-space for the grid.
    this.hiddenMat.dashSize = 0.045;
    this.hiddenMat.gapSize = 0.03;
    this.constructionMat.dashSize = 0.07;
    this.constructionMat.gapSize = 0.04;
    this.gridMat.dashSize = 0.03;
    this.gridMat.gapSize = 0.022;
    this.markerMat.uniforms.size.value = Math.max(this.style.markerSize * this.pxScale, 3);
    this.markerMat.uniforms.stroke.value = Math.max(w, 1);
  }

  /** Called right before rendering. */
  prepare(camera: Camera) {
    if (!this.viewDirty || !this.model) return;
    this.viewDirty = false;
    camera.updateMatrixWorld();
    const dir = camera.getWorldDirection(new Vector3());
    const eye = (camera as { isPerspectiveCamera?: boolean }).isPerspectiveCamera ? camera.position.clone() : null;
    const segs = this.model.edges.segments(eye, dir);
    this.visibleLines.set(segs);
    this.hiddenLines.geometry = this.visibleLines.geometry;
    this.hiddenLines.visible = this.visibleLines.visible;
    if (this.hiddenLines.visible) this.hiddenLines.computeLineDistances();
  }

  private centerMarkSegments() {
    // Drafting center mark: a small cross, a gap, then long arms past the circle.
    const out: number[] = [];
    for (const { x, y, z, r } of this.model?.centers ?? []) {
      const small = r * 0.16, gap = r * 0.3, long = r * 1.25;
      out.push(x - small, y, z, x + small, y, z, x, y - small, z, x, y + small, z);
      for (const s of [-1, 1]) {
        out.push(x + s * gap, y, z, x + s * long, y, z);
        out.push(x, y + s * gap, z, x, y + s * long, z);
      }
    }
    return out;
  }

  private constructionSegments() {
    if (!this.model) return [];
    const { min, max } = this.model.bounds;
    const z = this.model.frontZ;
    const cx = (min.x + max.x) / 2, cy = (min.y + max.y) / 2;
    const ext = 0.28;
    const out = [
      // Center lines through the object on its front plane, running past it.
      min.x - ext, cy, z, max.x + ext, cy, z,
      cx, min.y - ext, z, cx, max.y + ext, z,
    ];
    // Bounding box, dashed.
    const c = (i: number) => [i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z];
    for (let i = 0; i < 8; i++)
      for (const bit of [1, 2, 4]) if (!(i & bit)) out.push(...c(i), ...c(i | bit));
    return out;
  }

  private gridSegments() {
    if (!this.style) return [];
    const n = Math.max(2, Math.round(this.style.gridDivisions));
    const step = 2 / n;
    const out: number[] = [];
    for (let y = -1 + step; y < 1 - 1e-6; y += step) out.push(-this.aspect, y, 0, this.aspect, y, 0);
    for (let x = 0; x < this.aspect; x += step) {
      out.push(x, -1, 0, x, 1, 0);
      if (x > 0) out.push(-x, -1, 0, -x, 1, 0);
    }
    return out;
  }
}
