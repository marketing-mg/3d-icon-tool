import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  Color,
  HalfFloatType,
  NoToneMapping,
  type ToneMapping,
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
import { BlueprintScene } from './blueprint';
import { effectiveCamera, type Look, type State } from '../state';
import type { Built } from '../geometry';
import { blueprintSvg } from '../export/svg';

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
  private grainAmount = 0;
  private toneMapping: ToneMapping = AgXToneMapping;

  readonly blueprint = new BlueprintScene();
  private bpComposer: EffectComposer;
  private bpGridPass: RenderPass;
  private bpObjectPass: RenderPass;
  private look: Look = 'metal';
  private built: Built | null = null;

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

    // Blueprint: flat grid pass (clears to the background), then the object pass on top.
    // The grain pass is shared; it also un-premultiplies the edges for the transparent export.
    const bpTarget = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
    this.bpComposer = new EffectComposer(this.renderer, bpTarget);
    this.bpGridPass = new RenderPass(this.blueprint.gridScene, this.blueprint.gridCamera, null, new Color(0, 0, 0), 0);
    this.bpObjectPass = new RenderPass(this.blueprint.scene, this.rig.active);
    this.bpObjectPass.clear = false;
    this.bpComposer.addPass(this.bpGridPass);
    this.bpComposer.addPass(this.bpObjectPass);
    this.bpComposer.addPass(new OutputPass());
    this.bpComposer.addPass(this.grain);
  }

  /** Swap in a new model (preview or batch export). */
  setModel(built: Built) {
    this.built = built;
    this.mesh.geometry = built.geometry;
    if (this.look === 'blueprint') this.blueprint.setModel(built.geometry, built.lines());
  }

  get model() {
    return this.built;
  }

  private get activeComposer() {
    return this.look === 'blueprint' ? this.bpComposer : this.composer;
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
    for (const c of [this.composer, this.bpComposer]) {
      c.setPixelRatio(pixelRatio);
      c.setSize(w, h);
    }
    this.blueprint.setSize(w * pixelRatio, h * pixelRatio);
    this.grain.uniforms.resolution.value.set(w * pixelRatio, h * pixelRatio);
    this.grain.uniforms.size.value = this.grainSize * grainScale;
    this.rig.aspect = w / h;
    if (this.camera) this.updateCamera(this.camera);
  }

  private updateCamera(c: State['camera']) {
    this.camera = c;
    this.rig.update(c);
    this.renderPass.camera = this.rig.active;
    this.bpObjectPass.camera = this.rig.active;
    this.blueprint.invalidateView();
  }

  /**
   * Render one frame at exactly w×h pixels and capture it as a PNG.
   * The canvas bitmap is copied synchronously by toBlob, so the preview size is restored before
   * the next frame and never flashes. grainScale keeps grain the same relative size at any resolution.
   */
  snapshot(w: number, h: number, grainScale: number): Promise<Blob> {
    this.setBufferSize(w, h, 1, grainScale);
    this.render();
    const blob = new Promise<Blob>((resolve, reject) =>
      this.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png'),
    );
    this.resize();
    return blob;
  }

  /**
   * SVG of the current view at w×h. Blueprint: true vector linework. Metal: the full-quality
   * render embedded as an image (reflections and grain can't be vector).
   */
  async svg(w: number, h: number, grainScale: number, s: State): Promise<string> {
    if (this.look === 'blueprint' && this.built && this.camera) {
      this.rig.aspect = w / h;
      this.rig.update(this.camera);
      const camera = this.rig.active;
      camera.updateMatrixWorld();
      try {
        return blueprintSvg({
          renderer: this.renderer,
          camera,
          geometry: this.built.geometry,
          model: this.built.lines(),
          scene: this.blueprint,
          style: s.blueprint,
          width: w,
          height: h,
        });
      } finally {
        this.resize();
      }
    }
    const png = await this.snapshot(w, h, grainScale);
    const bytes = new Uint8Array(await png.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
      `<image width="${w}" height="${h}" href="data:image/png;base64,${btoa(bin)}"/></svg>\n`
    );
  }

  /** Largest square buffer this GPU can render to. */
  get maxSize() {
    const gl = this.renderer.getContext();
    return Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), this.renderer.capabilities.maxTextureSize, 8192);
  }

  apply(s: State, changed: Set<keyof State>) {
    if (changed.has('look')) {
      this.look = s.look.style;
      if (this.look === 'blueprint' && this.built) this.blueprint.setModel(this.built.geometry, this.built.lines());
    }
    if (changed.has('camera') || changed.has('look') || changed.has('blueprint')) this.updateCamera(effectiveCamera(s));
    if (changed.has('blueprint')) {
      this.blueprint.setStyle(s.blueprint);
    }
    if (changed.has('material')) applyMaterial(this.material, s.material);
    if (changed.has('lighting')) {
      this.scene.environment = this.env.get(s.lighting);
      this.scene.environmentIntensity = s.lighting.intensity;
      this.toneMapping = s.lighting.toneMapping === 'aces' ? ACESFilmicToneMapping : AgXToneMapping;
      this.renderer.toneMappingExposure = s.lighting.exposure;
    }
    if (changed.has('grain')) {
      this.grainAmount = s.grain.amount;
      this.grain.uniforms.seed.value = s.grain.seed;
      this.grainSize = s.grain.size;
      this.resize();
    }
  }

  render() {
    const bp = this.look === 'blueprint';
    // Blueprint colors are exact brand values: no tone mapping, no grain.
    this.renderer.toneMapping = bp ? NoToneMapping : this.toneMapping;
    this.grain.uniforms.amount.value = bp ? 0 : this.grainAmount;
    if (bp) this.blueprint.prepare(this.rig.active);
    this.activeComposer.render();
  }
}
