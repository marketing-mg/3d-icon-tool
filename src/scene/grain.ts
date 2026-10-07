import { Vector2 } from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * Monochrome film grain, applied after tone mapping in display space.
 * Deterministic: noise depends only on pixel coordinate, grain size and seed.
 * Scaled by alpha so transparent areas stay clean.
 */
export function createGrainPass() {
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      amount: { value: 0.08 },
      size: { value: 1 },
      seed: { value: 1 },
      resolution: { value: new Vector2(1, 1) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float amount;
      uniform float size;
      uniform float seed;
      uniform vec2 resolution;
      varying vec2 vUv;

      // PCG-style integer hash: stable across GPUs, no sin() precision drift.
      uint hash(uvec3 v) {
        v = v * 1664525u + 1013904223u;
        v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
        v ^= v >> 16u;
        v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
        return v.x;
      }

      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        uvec2 cell = uvec2(floor(vUv * resolution / max(size, 1.0)));
        // Sum of two uniforms gives a softer, film-like triangular distribution in [-1, 1].
        float a = float(hash(uvec3(cell, uint(seed))) & 0xffffu) / 65535.0;
        float b = float(hash(uvec3(cell, uint(seed) + 7919u)) & 0xffffu) / 65535.0;
        float n = a + b - 1.0;
        c.rgb = clamp(c.rgb + n * amount, 0.0, 1.0);
        gl_FragColor = c;
      }
    `,
  });
}
