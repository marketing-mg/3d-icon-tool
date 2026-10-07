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

  resize() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    this.grain.uniforms.resolution.value.set(w * pr, h * pr);
    this.grain.uniforms.size.value = this.grainSize * pr;
    this.rig.aspect = w / h;
  }

  apply(s: State, changed: Set<keyof State>) {
    if (changed.has('camera')) {
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
      this.grain.uniforms.size.value = s.grain.size * this.renderer.getPixelRatio();
    }
  }

  render() {
    this.composer.render();
  }
}
