import './style.css';
import { decodeHash, encodeHash, onChange, parseSettings, replaceState, state, touch, type State } from './state';
import { Stage } from './scene/renderer';
import { buildSolid } from './geometry/solid';
import { parseSvg, type Glyph } from './geometry/svgToShapes';
import { loadSvg, pushRecent, type IconRef } from './icons/phosphor';
import { buildPanel } from './ui/panel';
import { refreshControls } from './ui/controls';
import { aspectRatio, download, exportSize, pngName } from './export/png';
import { zipFiles } from './export/batch';

const canvas = document.querySelector<HTMLCanvasElement>('#app')!;
const viewport = document.querySelector<HTMLElement>('#viewport')!;
const stage = new Stage(canvas);

// A share link overrides the brand defaults.
const fromHash = decodeHash(location.hash);
if (fromHash) Object.assign(state, fromHash);

let glyph: Glyph | null = null;
let iconRequest = 0;

async function loadGlyph(ref: IconRef) {
  return parseSvg(await loadSvg(ref.name, ref.weight));
}

async function loadIcon() {
  const req = ++iconRequest;
  const ref = { ...state.icon };
  const warn = document.querySelector<HTMLElement>('#icon-warning')!;
  try {
    const g = await loadGlyph(ref);
    if (req !== iconRequest) return;
    glyph = g;
    warn.hidden = !g.hasStrokes;
    warn.textContent = g.hasStrokes ? 'This SVG uses strokes. Only filled shapes are extruded for now.' : '';
    pushRecent(ref);
    rebuildGeometry();
    syncPanel(new Set(['icon']));
  } catch (e) {
    if (req !== iconRequest) return;
    warn.hidden = false;
    warn.textContent = (e as Error).message;
  }
}

function rebuildGeometry() {
  if (!glyph) return;
  stage.mesh.geometry.dispose();
  stage.mesh.geometry = buildSolid(glyph, state.geometry);
}

/** Letterbox the canvas to the export aspect so the preview frame matches the PNG. */
function fitCanvas() {
  const pad = 32;
  const vw = viewport.clientWidth - pad * 2;
  const vh = viewport.clientHeight - pad * 2;
  const r = aspectRatio(state.export);
  const [w, h] = vw / vh > r ? [vh * r, vh] : [vw, vw / r];
  canvas.style.width = `${Math.max(1, Math.floor(w))}px`;
  canvas.style.height = `${Math.max(1, Math.floor(h))}px`;
}

const currentSize = () => exportSize(state.export, stage.maxSize);

const syncPanel = buildPanel(document.querySelector<HTMLElement>('#panel')!, {
  exportSizeLabel: () => {
    const { w, h, clamped } = currentSize();
    return `${w} × ${h} px, transparent PNG${clamped ? ' (capped at GPU max)' : ''}`;
  },
  async exportPng() {
    const { w, h, grainScale } = currentSize();
    download(await stage.snapshot(w, h, grainScale), pngName(state.icon.name, state.icon.weight, state));
  },
  async exportBatch(items, progress) {
    const { w, h, grainScale } = currentSize();
    const files: { name: string; blob: Blob }[] = [];
    const preview = stage.mesh.geometry;
    try {
      for (const [i, ref] of items.entries()) {
        progress(i);
        const g = await loadGlyph(ref);
        stage.mesh.geometry = buildSolid(g, state.geometry);
        files.push({ name: pngName(ref.name, ref.weight, state), blob: await stage.snapshot(w, h, grainScale) });
        stage.mesh.geometry.dispose();
      }
    } finally {
      stage.mesh.geometry = preview;
    }
    progress(items.length);
    const stamp = new Date().toISOString().slice(0, 10);
    download(await zipFiles(files), `metal-icons-${stamp}.zip`);
  },
  async copyLink() {
    await navigator.clipboard.writeText(`${location.origin}${location.pathname}#${encodeHash(state)}`);
  },
  async copyJson() {
    await navigator.clipboard.writeText(JSON.stringify(state, null, 2));
  },
  downloadJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    download(blob, `metal-icon-settings-${state.icon.name}.json`);
  },
  async importJson(file) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      throw new Error('That file is not valid JSON.');
    }
    replaceState(parseSettings(parsed));
    refreshControls();
  },
});

let hashTimer = 0;
onChange((changed) => {
  if (changed.has('icon')) loadIcon();
  else if (changed.has('geometry')) rebuildGeometry();
  if (changed.has('preview')) viewport.dataset.backdrop = state.preview.backdrop;
  if (changed.has('export')) fitCanvas();
  stage.apply(state, changed);
  syncPanel(changed);
  // Keep the URL a live share link, without spamming history.
  clearTimeout(hashTimer);
  hashTimer = window.setTimeout(() => history.replaceState(null, '', `#${encodeHash(state)}`), 300);
});

window.addEventListener('hashchange', () => {
  const next = decodeHash(location.hash);
  if (next && location.hash.slice(1) !== encodeHash(state)) {
    replaceState(next);
    refreshControls();
  }
});

new ResizeObserver(fitCanvas).observe(viewport);
new ResizeObserver(() => stage.resize()).observe(canvas);

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

refreshControls();
touch(...(Object.keys(state) as (keyof State)[]));
stage.renderer.setAnimationLoop(() => stage.render());

if (import.meta.env.DEV) Object.assign(window, { stage, state, touch });
