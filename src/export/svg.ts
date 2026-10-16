import {
  Color,
  DoubleSide,
  FloatType,
  Mesh,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderTarget,
  type BufferGeometry,
  type Camera,
  type WebGLRenderer,
} from 'three';
import { gridSegments, type BlueprintScene } from '../scene/blueprint';
import type { LineModel } from '../geometry';
import type { State } from '../state';

/** Depth map resolution cap: visibility is decided per depth-map pixel. */
const MAX_DEPTH_EDGE = 2048;

interface Options {
  renderer: WebGLRenderer;
  camera: Camera;
  geometry: BufferGeometry;
  model: LineModel;
  scene: BlueprintScene;
  style: State['blueprint'];
  width: number;
  height: number;
}

/**
 * Vector export of the blueprint drawing. Hidden-line removal mirrors the GPU render: each line is
 * sampled along its length and tested against a depth map of the object, then split into
 * visible (solid) and hidden (dashed) runs.
 */
export function blueprintSvg(o: Options): string {
  const { width: w, height: h, style } = o;
  const px = Math.max(w, h) / 1024; // line widths are px at a 1024px long edge, as in the render
  const depth = new DepthMap(o.renderer, o.camera, o.geometry, w, h);
  const project = new Projector(o.camera, w, h);

  const camera = o.camera as Camera & { isPerspectiveCamera?: boolean };
  const dir = camera.getWorldDirection(new Vector3());
  const eye = camera.isPerspectiveCamera ? camera.position.clone() : null;

  const edges = split(o.model.edges.segments(eye, dir), project, depth);
  const construction = style.construction ? split(o.scene.constructionSegments(), project, depth).visible : [];
  const centers = style.centers ? split(o.scene.centerMarkSegments(), project, depth).visible : [];

  const lw = style.lineWidth * px;
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<g fill="none" stroke-linecap="round" stroke-linejoin="round">`,
  );
  if (!style.transparent) out.push(`<rect width="${w}" height="${h}" fill="${style.background}" stroke="none"/>`);

  if (style.grid && !style.transparent) {
    const aspect = w / h;
    const g = gridSegments(aspect, style.gridDivisions);
    const segs: number[][] = [];
    for (let i = 0; i < g.length; i += 6) {
      const tx = (x: number) => ((x / aspect + 1) / 2) * w;
      const ty = (y: number) => ((1 - y) / 2) * h;
      segs.push([tx(g[i]), ty(g[i + 1]), tx(g[i + 3]), ty(g[i + 4])]);
    }
    out.push(path(chain(segs), style.line, Math.max(lw * 0.6, 0.75), 0.28, dashes(0.015 * h, 0.011 * h)));
  }
  if (style.hiddenLines)
    out.push(path(chain(edges.hidden), style.line, lw * 0.8, style.hiddenOpacity, dashes(5 * px, 3.5 * px)));
  out.push(path(chain(edges.visible), style.line, lw));
  if (construction.length)
    out.push(path(chain(construction), style.line, Math.max(lw * 0.6, 0.75), 0.5, dashes(8 * px, 4.5 * px)));
  if (centers.length) out.push(path(chain(centers), style.accent, lw * 0.8));

  if (style.corners) {
    const size = Math.max(style.markerSize * px, 3);
    const stroke = Math.max(lw, 1);
    const fill = style.transparent ? 'none' : style.background;
    const c = o.model.corners;
    const rects: string[] = [];
    for (let i = 0; i < c.length; i += 3) {
      const p = new Vector3(c[i], c[i + 1], c[i + 2]);
      // Same pull toward the eye as the render, so the bevel beside a corner doesn't hide it.
      const toEye = eye ? eye.clone().sub(p).normalize() : dir.clone().negate();
      const s = project.point(p.addScaledVector(toEye, 0.06));
      if (!depth.visible(s.x, s.y, s.z)) continue;
      // The render draws the stroke inside the square; inset by half a stroke to match.
      const r = size / 2 - stroke / 2;
      rects.push(`<rect x="${f(s.x - r)}" y="${f(s.y - r)}" width="${f(2 * r)}" height="${f(2 * r)}"/>`);
    }
    if (rects.length)
      out.push(`<g fill="${fill}" stroke="${style.accent}" stroke-width="${f(stroke)}" stroke-linejoin="miter">${rects.join('')}</g>`);
  }

  out.push('</g></svg>\n');
  depth.dispose();
  return out.join('\n');
}

const f = (n: number) => (Math.round(n * 10) / 10).toString();
const dashes = (dash: number, gap: number) => `${f(dash)} ${f(gap)}`;

function path(lines: number[][], color: string, width: number, opacity = 1, dash?: string) {
  if (!lines.length) return '';
  const d = lines.map((l) => 'M' + l.map(f).join(' ').replace(/^(\S+ \S+) /, '$1L')).join('');
  return (
    `<path d="${d}" stroke="${color}" stroke-width="${f(width)}"` +
    (opacity < 1 ? ` stroke-opacity="${opacity}"` : '') +
    (dash ? ` stroke-dasharray="${dash}"` : '') +
    '/>'
  );
}

class Projector {
  private v = new Vector3();
  constructor(
    private camera: Camera,
    private w: number,
    private h: number,
  ) {}
  /** Screen px (top-left origin) plus view-space depth in z. */
  point(p: Vector3) {
    const view = this.v.copy(p).applyMatrix4(this.camera.matrixWorldInverse);
    const z = -view.z;
    const ndc = view.applyMatrix4(this.camera.projectionMatrix);
    return new Vector3(((ndc.x + 1) / 2) * this.w, ((1 - ndc.y) / 2) * this.h, z);
  }
}

/** View-space depth of the object, read back from the GPU. 0 = no surface. */
class DepthMap {
  private data: Float32Array;
  private target: WebGLRenderTarget;
  private k: number;
  private W: number;
  private H: number;

  constructor(renderer: WebGLRenderer, camera: Camera, geometry: BufferGeometry, w: number, h: number) {
    this.k = Math.min(1, MAX_DEPTH_EDGE / Math.max(w, h));
    this.W = Math.max(1, Math.round(w * this.k));
    this.H = Math.max(1, Math.round(h * this.k));
    this.target = new WebGLRenderTarget(this.W, this.H, { type: FloatType });
    const material = new ShaderMaterial({
      vertexShader: /* glsl */ `
        varying float vDepth;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vDepth;
        void main() { gl_FragColor = vec4(vDepth, 0.0, 0.0, 1.0); }
      `,
      side: DoubleSide,
    });
    const scene = new Scene();
    scene.add(new Mesh(geometry, material));

    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    const prevColor = renderer.getClearColor(new Color());
    const prevAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = true;
    renderer.render(scene, camera);
    this.data = new Float32Array(this.W * this.H * 4);
    renderer.readRenderTargetPixels(this.target, 0, 0, this.W, this.H, this.data);
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevColor, prevAlpha);
    renderer.autoClear = prevAutoClear;
    material.dispose();
  }

  /**
   * A point is visible if it is no deeper than the farthest surface in its 3×3 neighborhood
   * (plus a small tolerance), or if any neighbor is empty: lines on silhouettes stay visible.
   */
  visible(x: number, y: number, z: number) {
    const bx = Math.floor(x * this.k), by = Math.floor(y * this.k);
    let max = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const px = bx + dx, py = by + dy;
        if (px < 0 || py < 0 || px >= this.W || py >= this.H) return true;
        const d = this.data[((this.H - 1 - py) * this.W + px) * 4];
        if (d === 0) return true;
        if (d > max) max = d;
      }
    return z <= max + 0.02 + z * 0.002;
  }

  dispose() {
    this.target.dispose();
  }
}

/** Sample each 3D segment along its screen length and split it into visible/hidden 2D runs. */
function split(segs: ArrayLike<number>, project: Projector, depth: DepthMap) {
  const visible: number[][] = [];
  const hidden: number[][] = [];
  const a = new Vector3(), b = new Vector3(), p = new Vector3();
  for (let i = 0; i + 5 < segs.length; i += 6) {
    a.set(segs[i], segs[i + 1], segs[i + 2]);
    b.set(segs[i + 3], segs[i + 4], segs[i + 5]);
    const sa = project.point(a), sb = project.point(b);
    const n = Math.max(1, Math.ceil(Math.hypot(sb.x - sa.x, sb.y - sa.y) / 1.5));
    let runStart = sa;
    let runVis = depth.visible(sa.x, sa.y, sa.z);
    let prev = sa;
    for (let k = 1; k <= n; k++) {
      const s = k === n ? sb : project.point(p.lerpVectors(a, b, k / n));
      const vis = depth.visible(s.x, s.y, s.z);
      if (vis !== runVis) {
        // Switch halfway between the two samples.
        const mx = (prev.x + s.x) / 2, my = (prev.y + s.y) / 2;
        (runVis ? visible : hidden).push([runStart.x, runStart.y, mx, my]);
        runStart = new Vector3(mx, my, 0);
        runVis = vis;
      }
      prev = s;
    }
    (runVis ? visible : hidden).push([runStart.x, runStart.y, sb.x, sb.y]);
  }
  const keep = (l: number[][]) => l.filter((s) => Math.hypot(s[2] - s[0], s[3] - s[1]) > 0.05);
  return { visible: keep(visible), hidden: keep(hidden) };
}

/**
 * Join segments that share endpoints into polylines: much smaller files, and dash patterns run
 * continuously along curves instead of restarting on every tiny tessellated segment.
 */
function chain(segs: number[][]): number[][] {
  const key = (x: number, y: number) => `${Math.round(x * 20)},${Math.round(y * 20)}`;
  const at = new Map<string, number[]>();
  segs.forEach((s, i) => {
    for (const k of [key(s[0], s[1]), key(s[2], s[3])]) {
      const list = at.get(k);
      if (list) list.push(i);
      else at.set(k, [i]);
    }
  });
  const used = new Uint8Array(segs.length);
  const next = (x: number, y: number): [number, number] | null => {
    for (const j of at.get(key(x, y)) ?? []) {
      if (used[j]) continue;
      used[j] = 1;
      const s = segs[j];
      return key(s[0], s[1]) === key(x, y) ? [s[2], s[3]] : [s[0], s[1]];
    }
    return null;
  };
  const lines: number[][] = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const fwd = [segs[i][2], segs[i][3]];
    for (let q = next(fwd[0], fwd[1]); q; q = next(q[0], q[1])) fwd.push(q[0], q[1]);
    const back: number[] = [];
    for (let q = next(segs[i][0], segs[i][1]); q; q = next(q[0], q[1])) back.unshift(q[0], q[1]);
    lines.push([...back, segs[i][0], segs[i][1], ...fwd]);
  }
  return lines;
}
