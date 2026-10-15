import { BufferGeometry, Vector3 } from 'three';

/** Edges sharper than this are drawn as creases; softer ones are only drawn where they form a silhouette. */
const CREASE = (30 * Math.PI) / 180;

export interface EdgePart {
  geo: BufferGeometry;
  zMin?: number;
  zMax?: number;
}

/**
 * Line drawing of a set of solids: fixed crease edges, plus silhouette edges of curved surfaces,
 * recomputed per viewpoint (an edge is a silhouette when one neighbor faces the eye and the other doesn't).
 */
export class EdgeModel {
  private creases: number[] = [];
  /** Per smooth edge: a(3) b(3) n1(3) n2(3). */
  private smooth: Float32Array;
  private smoothCount = 0;

  constructor(parts: EdgePart[], extraSegments: number[], offset: Vector3) {
    const smooth: number[] = [];
    for (const part of parts) this.extract(part, smooth);
    this.creases.push(...extraSegments);
    // Bake the centering offset in.
    const o = [offset.x, offset.y, offset.z];
    for (let i = 0; i < this.creases.length; i++) this.creases[i] += o[i % 3];
    for (let i = 0; i < smooth.length; i += 12) {
      for (let k = 0; k < 6; k++) smooth[i + k] += o[k % 3];
    }
    this.smooth = new Float32Array(smooth);
    this.smoothCount = smooth.length / 12;
  }

  private extract({ geo, zMin = -Infinity, zMax = Infinity }: EdgePart, smooth: number[]) {
    const pos = geo.attributes.position;
    const index = geo.index;
    const triCount = (index ? index.count : pos.count) / 3;

    // Weld by position: ExtrudeGeometry and friends are non-indexed.
    const ids = new Map<string, number>();
    const verts: number[] = [];
    const vid = (i: number) => {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const key = `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
      let id = ids.get(key);
      if (id === undefined) {
        id = verts.length / 3;
        ids.set(key, id);
        verts.push(x, y, z);
      }
      return id;
    };

    const normals: number[] = [];
    const edges = new Map<number, number[]>();
    const a = new Vector3(), b = new Vector3(), c = new Vector3();
    let n = 0;
    for (let t = 0; t < triCount; t++) {
      const i0 = index ? index.getX(t * 3) : t * 3;
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      const v = [vid(i0), vid(i1), vid(i2)];
      a.fromBufferAttribute(pos, i0);
      b.fromBufferAttribute(pos, i1);
      c.fromBufferAttribute(pos, i2);
      const nrm = b.sub(a).cross(c.sub(a));
      if (nrm.lengthSq() < 1e-14) continue; // degenerate
      nrm.normalize();
      normals.push(nrm.x, nrm.y, nrm.z);
      for (let k = 0; k < 3; k++) {
        const p = v[k], q = v[(k + 1) % 3];
        if (p === q) continue;
        const key = Math.min(p, q) * 1e7 + Math.max(p, q);
        const list = edges.get(key);
        if (list) list.push(n);
        else edges.set(key, [n]);
      }
      n++;
    }

    const cosCrease = Math.cos(CREASE);
    for (const [key, faces] of edges) {
      if (faces.length < 2) continue; // open boundary: not part of a closed solid's outline
      const p = Math.floor(key / 1e7), q = key % 1e7;
      const pa = [verts[p * 3], verts[p * 3 + 1], verts[p * 3 + 2]];
      const pb = [verts[q * 3], verts[q * 3 + 1], verts[q * 3 + 2]];
      const f1 = faces[0] * 3, f2 = faces[1] * 3;
      const dot = normals[f1] * normals[f2] + normals[f1 + 1] * normals[f2 + 1] + normals[f1 + 2] * normals[f2 + 2];
      const clipped = clipZ(pa, pb, zMin, zMax);
      if (!clipped) continue;
      if (dot < cosCrease || faces.length > 2) this.creases.push(...clipped[0], ...clipped[1]);
      else
        smooth.push(
          ...clipped[0], ...clipped[1],
          normals[f1], normals[f1 + 1], normals[f1 + 2],
          normals[f2], normals[f2 + 1], normals[f2 + 2],
        );
    }
  }

  /** Crease + silhouette segments for a viewpoint. eye = camera position (perspective), or null with dir (ortho). */
  segments(eye: Vector3 | null, dir: Vector3): Float32Array {
    const s = this.smooth;
    const sil: number[] = [];
    for (let i = 0; i < this.smoothCount; i++) {
      const o = i * 12;
      let vx = dir.x, vy = dir.y, vz = dir.z;
      if (eye) {
        vx = (s[o] + s[o + 3]) / 2 - eye.x;
        vy = (s[o + 1] + s[o + 4]) / 2 - eye.y;
        vz = (s[o + 2] + s[o + 5]) / 2 - eye.z;
      }
      const d1 = s[o + 6] * vx + s[o + 7] * vy + s[o + 8] * vz;
      const d2 = s[o + 9] * vx + s[o + 10] * vy + s[o + 11] * vz;
      if (d1 * d2 < 0) for (let k = 0; k < 6; k++) sil.push(s[o + k]);
    }
    const out = new Float32Array(this.creases.length + sil.length);
    out.set(this.creases);
    out.set(sil, this.creases.length);
    return out;
  }
}

function clipZ(a: number[], b: number[], zMin: number, zMax: number): [number[], number[]] | null {
  const eps = 1e-6;
  let p = a, q = b;
  for (const [limit, keepAbove] of [[zMin, true], [zMax, false]] as const) {
    if (!Number.isFinite(limit)) continue;
    const inP = keepAbove ? p[2] >= limit - eps : p[2] <= limit + eps;
    const inQ = keepAbove ? q[2] >= limit - eps : q[2] <= limit + eps;
    if (!inP && !inQ) return null;
    if (inP !== inQ) {
      const t = (limit - p[2]) / (q[2] - p[2]);
      const m = [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]), limit];
      if (inP) q = m;
      else p = m;
    }
  }
  return [p, q];
}
