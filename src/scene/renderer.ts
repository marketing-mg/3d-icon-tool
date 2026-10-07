import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  HalfFloatType,
  Mesh,
  Scene,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CameraRig } from './camera';
import { StudioEnvironment } from './environment';
import { applyMaterial, createMaterial } from './materials';
import { createGrainPass } from './grain';
import type { State } from '../state';

export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly rig = new CameraRig();
  readonly material = createMaterial();
  readonly mesh = new Mesh(undefined, this.material);
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private grain = createGrainPass();
  private env: StudioEnvironment;
  private grainSize = 1;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: false });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.env = new StudioEnvironment(this.renderer);
    this.scene.add(this.mesh);

    // MSAA target keeps edges clean through the post chain; half float keeps highlights > 1 for tone mapping.
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.renderPass = new RenderPass(this.scene, this.rig.active);
    this.renderPass.clearAlpha = 0;
    this.composer.addPass(this.renderPass);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(this.grain);
  }

  private camera: State['camera'] | null = null;

  /** Size the drawing buffer to the canvas's CSS size (preview). */
  resize() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    this.setBufferSize(w, h, Math.min(window.devicePixelRatio, 2), Math.min(window.devicePixelRatio, 2));
  }

  private setBufferSize(w: number, h: number, pixelRatio: number, grainScale: number) {
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    this.grain.uniforms.resolution.value.set(w * pixelRatio, h * pixelRatio);
    this.grain.uniforms.size.value = this.grainSize * grainScale;
    this.rig.aspect = w / h;
    if (this.camera) this.rig.update(this.camera);
  }

  /**
   * Render one frame at exactly w×h pixels and capture it as a PNG.
   * The canvas bitmap is copied synchronously by toBlob, so the preview size is restored before
   * the next frame and never flashes. grainScale keeps grain the same relative size at any resolution.
   */
  snapshot(w: number, h: number, grainScale: number): Promise<Blob> {
    this.setBufferSize(w, h, 1, grainScale);
    this.composer.render();
    const blob = new Promise<Blob>((resolve, reject) =>
      this.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png'),
    );
    this.resize();
    return blob;
  }

  /** Largest square buffer this GPU can render to. */
  get maxSize() {
    const gl = this.renderer.getContext();
    return Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), this.renderer.capabilities.maxTextureSize, 8192);
  }

  apply(s: State, changed: Set<keyof State>) {
    if (changed.has('camera')) {
      this.camera = s.camera;
      this.rig.update(s.camera);
      this.renderPass.camera = this.rig.active;
    }
    if (changed.has('material')) applyMaterial(this.material, s.material);
    if (changed.has('lighting')) {
      this.scene.environment = this.env.get(s.lighting);
      this.scene.environmentIntensity = s.lighting.intensity;
      this.renderer.toneMapping = s.lighting.toneMapping === 'aces' ? ACESFilmicToneMapping : AgXToneMapping;
      this.renderer.toneMappingExposure = s.lighting.exposure;
    }
    if (changed.has('grain')) {
      this.grain.uniforms.amount.value = s.grain.amount;
      this.grain.uniforms.seed.value = s.grain.seed;
      this.grainSize = s.grain.size;
      this.resize();
    }
  }

  render() {
    this.composer.render();
  }
}
