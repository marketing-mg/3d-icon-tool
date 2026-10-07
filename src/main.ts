import './style.css';
import { onChange, state, touch, type State } from './state';
import { Stage } from './scene/renderer';
import { buildSolid } from './geometry/solid';
import { parseSvg, type Glyph } from './geometry/svgToShapes';
import { loadSvg } from './icons/samples';
import { buildPanel } from './ui/panel';
import { refreshControls } from './ui/controls';

const canvas = document.querySelector<HTMLCanvasElement>('#app')!;
const viewport = document.querySelector<HTMLElement>('#viewport')!;
const stage = new Stage(canvas);
buildPanel(document.querySelector<HTMLElement>('#panel')!);

let glyph: Glyph | null = null;
let iconRequest = 0;

async function loadIcon(key: string) {
  const req = ++iconRequest;
  const g = parseSvg(await loadSvg(key));
  if (req !== iconRequest) return;
  glyph = g;
  const warn = document.querySelector<HTMLElement>('#icon-warning')!;
  warn.hidden = !g.hasStrokes;
  warn.textContent = g.hasStrokes ? 'This SVG uses strokes. Only filled shapes are extruded for now.' : '';
  rebuildGeometry();
}

function rebuildGeometry() {
  if (!glyph) return;
  stage.mesh.geometry.dispose();
  stage.mesh.geometry = buildSolid(glyph, state.geometry);
}

onChange((changed) => {
  if (changed.has('icon')) loadIcon(state.icon.key);
  else if (changed.has('geometry')) rebuildGeometry();
  if (changed.has('preview')) viewport.dataset.backdrop = state.preview.backdrop;
  stage.apply(state, changed);
});

new ResizeObserver(() => {
  stage.resize();
  stage.rig.update(state.camera);
}).observe(canvas);

// Drag to orbit; hold Shift to snap to 5° steps.
let drag: { x: number; y: number; yaw: number; pitch: number } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  if (state.camera.locked) return;
  canvas.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, yaw: state.camera.yaw, pitch: state.camera.pitch };
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const snap = (v: number) => (e.shiftKey ? Math.round(v / 5) * 5 : Math.round(v * 2) / 2);
  const clamp = (v: number, a: number) => Math.max(-a, Math.min(a, v));
  state.camera.yaw = snap(clamp(drag.yaw + (e.clientX - drag.x) * 0.3, 90));
  state.camera.pitch = snap(clamp(drag.pitch + (e.clientY - drag.y) * 0.3, 89));
  refreshControls();
  touch('camera');
});
const endDrag = () => (drag = null);
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

touch(...(Object.keys(state) as (keyof State)[]));
stage.renderer.setAnimationLoop(() => stage.render());

if (import.meta.env.DEV) Object.assign(window, { stage, state, touch });
