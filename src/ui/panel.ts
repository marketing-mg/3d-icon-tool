import { brandState, replaceState, state, touch, type State } from '../state';
import { cameraPresets } from '../scene/camera';
import { lightingPresets } from '../scene/environment';
import { materialPresets } from '../scene/materials';
import { sampleIcons, type IconRef } from '../icons/phosphor';
import { modes } from '../geometry';
import { buttons, checkbox, color, el, group, refreshControls, section, select, slider } from './controls';
import { buildPicker } from './picker';

export interface PanelActions {
  exportPng: () => Promise<void>;
  exportBatch: (items: IconRef[], progress: (done: number) => void) => Promise<void>;
  exportSizeLabel: () => string;
  copyLink: () => Promise<void>;
  copyJson: () => Promise<void>;
  downloadJson: () => void;
  importJson: (file: File) => Promise<void>;
}

export function buildPanel(root: HTMLElement, actions: PanelActions) {
  const status = el('p', { class: 'status', role: 'status' });
  let statusTimer = 0;
  const say = (msg: string, sticky = false) => {
    status.textContent = msg;
    clearTimeout(statusTimer);
    if (!sticky) statusTimer = window.setTimeout(() => (status.textContent = ''), 3000);
  };
  const run = (label: string, fn: () => Promise<void> | void) => async () => {
    try {
      await fn();
      if (label) say(label);
    } catch (e) {
      say(`Error: ${(e as Error).message}`, true);
    }
  };

  // --- Batch list (session-only; not part of shared state) ---
  const batch: IconRef[] = [];
  const batchList = el('div', { class: 'chips' });
  const zipButton = el('button', { type: 'button', class: 'primary' });
  const same = (a: IconRef, b: IconRef) => a.name === b.name && a.weight === b.weight;
  const renderBatch = () => {
    batchList.replaceChildren(
      ...batch.map((ref, i) => {
        const chip = el('button', { type: 'button', class: 'chip', title: 'Remove' }, `${ref.name} · ${ref.weight} ×`);
        chip.addEventListener('click', () => (batch.splice(i, 1), renderBatch()));
        return chip;
      }),
    );
    if (!batch.length) batchList.append(el('p', { class: 'muted' }, 'No icons in the batch yet.'));
    zipButton.textContent = `Export zip (${batch.length})`;
    zipButton.disabled = !batch.length;
  };
  const toggleBatch = (ref: IconRef) => {
    const i = batch.findIndex((b) => same(b, ref));
    if (i >= 0) batch.splice(i, 1);
    else batch.push({ ...ref });
    renderBatch();
  };
  zipButton.addEventListener(
    'click',
    run('', async () => {
      zipButton.disabled = true;
      try {
        await actions.exportBatch(batch, (done) => say(`Rendering ${done}/${batch.length}…`, true));
        say(`Exported ${batch.length} icons.`);
      } finally {
        zipButton.disabled = false;
      }
    }),
  );

  const picker = buildPicker({ onBatchToggle: toggleBatch });

  // --- Geometry: each mode shows only the sliders it uses ---
  const geo = {
    depth: slider('geometry', 'depth', 'Depth', 0.02, 1.5, 0.01),
    slabDepth: slider('geometry', 'slabDepth', 'Tile depth', 0.1, 1.5, 0.01),
    glyphScale: slider('geometry', 'glyphScale', 'Glyph scale', 0.2, 1, 0.01),
    cornerRadius: slider('geometry', 'cornerRadius', 'Corner radius', 0, 1, 0.01),
    slabBevel: slider('geometry', 'slabBevel', 'Tile bevel', 0, 0.1, 0.001),
    wallThickness: slider('geometry', 'wallThickness', 'Wall thickness', 0.03, 0.4, 0.005),
    engraveDepth: slider('geometry', 'engraveDepth', 'Engrave depth', 0.01, 0.3, 0.005),
    embossHeight: slider('geometry', 'embossHeight', 'Emboss height', 0.01, 0.3, 0.005),
  };
  const visibleIn: Record<keyof typeof geo, string[]> = {
    depth: ['solid'],
    slabDepth: ['engrave', 'emboss', 'outline'],
    glyphScale: ['engrave', 'emboss', 'outline'],
    cornerRadius: ['engrave', 'emboss', 'outline'],
    slabBevel: ['engrave', 'emboss', 'outline'],
    wallThickness: ['outline'],
    engraveDepth: ['engrave'],
    embossHeight: ['emboss'],
  };
  const modeHint = el('p', { class: 'hint' });

  // --- Camera ---
  const cameraSliders = el(
    'div',
    {},
    buttons(
      Object.values(cameraPresets).map((p) => [
        p.label,
        () => {
          Object.assign(state.camera, { yaw: p.yaw, pitch: p.pitch, roll: p.roll, perspective: p.perspective });
          refreshControls();
          touch('camera');
        },
      ]),
    ),
    slider('camera', 'yaw', 'Yaw', -90, 90, 0.5),
    slider('camera', 'pitch', 'Pitch', -89, 89, 0.5),
    slider('camera', 'roll', 'Roll', -45, 45, 0.5),
    slider('camera', 'perspective', 'Perspective (FOV, 0 = ortho)', 0, 70, 1),
  );

  // --- Export size ---
  const scaleSelect = el(
    'select',
    {},
    ...[
      ['1', '1× (1024px)'],
      ['2', '2× (2048px)'],
      ['4', '4× (4096px)'],
      ['0', 'Custom width'],
    ].map(([value, text]) => el('option', { value }, text)),
  );
  scaleSelect.addEventListener('change', () => {
    state.export.scale = Number(scaleSelect.value);
    touch('export');
  });
  const scaleRow = el('label', { class: 'row' }, el('span', {}, 'Size'), scaleSelect);
  const widthRow = slider('export', 'width', 'Width (px)', 64, 8192, 1);
  const heightRow = slider('export', 'height', 'Height (px)', 64, 8192, 1);
  const sizeLabel = el('p', { class: 'muted' });

  const reset = el('button', { type: 'button', class: 'reset', title: 'Reset every setting to the defaults in brand.json' }, 'Reset');
  reset.addEventListener('click', () => (replaceState(brandState()), refreshControls(), say('Reset to defaults.')));

  root.append(
    el('header', { class: 'panel-head' }, el('h1', {}, 'Monograph Icon Studio'), reset),
    group(
      'Export',
      true,
      select('export', 'aspect', 'Aspect', [
        ['1:1', 'Square'],
        ['3:2', '3:2'],
        ['16:9', '16:9'],
        ['custom', 'Custom'],
      ]),
      scaleRow,
      widthRow,
      heightRow,
      sizeLabel,
      buttons([['Download PNG', run('PNG downloaded.', actions.exportPng)]]),
      el('h2', {}, 'Batch'),
      batchList,
      buttons([
        ['Add current', () => (batch.some((b) => same(b, state.icon)) || batch.push({ ...state.icon }), renderBatch())],
        [
          'Add 8 samples',
          () => {
            for (const name of sampleIcons) {
              const ref = { name, weight: state.icon.weight };
              if (!batch.some((b) => same(b, ref))) batch.push(ref);
            }
            renderBatch();
          },
        ],
        ['Clear', () => ((batch.length = 0), renderBatch())],
      ]),
      el('div', { class: 'buttons' }, zipButton),
    ),
    group('Icon', true, picker.root, el('p', { class: 'warn', id: 'icon-warning', hidden: true })),
    group(
      'Material',
      false,
      select(
        'material',
        'preset',
        'Preset',
        Object.entries(materialPresets).map(([k, p]) => [k, p.label]),
        (k) => {
          const { label: _label, lighting, grain, ...params } = materialPresets[k];
          Object.assign(state.material, params);
          if (lighting) Object.assign(state.lighting, lighting);
          if (grain) Object.assign(state.grain, grain);
          touch('lighting', 'grain');
        },
      ),
      color('material', 'tint', 'Tint'),
      slider('material', 'roughness', 'Roughness', 0, 1, 0.01),
      slider('material', 'clearcoat', 'Clearcoat', 0, 1, 0.01),
      slider('material', 'anisotropy', 'Anisotropy', 0, 1, 0.01),
    ),
    group(
      'Geometry',
      false,
      select(
        'geometry',
        'mode',
        'Mode',
        modes.map((m) => [m.key, m.label]),
      ),
      modeHint,
      geo.depth,
      geo.slabDepth,
      geo.glyphScale,
      geo.cornerRadius,
      geo.slabBevel,
      geo.wallThickness,
      geo.engraveDepth,
      geo.embossHeight,
      el('h2', {}, 'Glyph edges'),
      slider('geometry', 'bevelSize', 'Bevel size', 0, 0.05, 0.001),
      slider('geometry', 'bevelThickness', 'Bevel thickness', 0, 0.08, 0.001),
      slider('geometry', 'bevelSegments', 'Bevel segments', 1, 8, 1),
      slider('geometry', 'curveSegments', 'Curve segments', 4, 64, 1),
    ),
    group(
      'Camera',
      false,
      checkbox('camera', 'locked', 'Lock to brand angle', (on) => {
        cameraSliders.hidden = on;
        if (on) {
          Object.assign(state.camera, brandState().camera, { locked: true });
          touch('camera');
        }
      }),
      cameraSliders,
    ),
    group(
      'Lighting',
      false,
      select(
        'lighting',
        'preset',
        'Preset',
        Object.entries(lightingPresets).map(([k, p]) => [k, p.label]),
      ),
      slider('lighting', 'rotation', 'Env rotation', -180, 180, 1),
      slider('lighting', 'intensity', 'Intensity', 0, 3, 0.01),
      slider('lighting', 'contrast', 'Contrast', 0, 1, 0.01),
      slider('lighting', 'exposure', 'Exposure', 0.1, 3, 0.01),
      select('lighting', 'toneMapping', 'Tone mapping', [
        ['agx', 'AgX'],
        ['aces', 'ACES Filmic'],
      ]),
    ),
    group(
      'Grain',
      false,
      slider('grain', 'amount', 'Amount', 0, 0.4, 0.005),
      slider('grain', 'size', 'Size (px)', 1, 4, 0.1),
      slider('grain', 'seed', 'Seed', 1, 999, 1),
    ),
    section(
      'Settings',
      buttons([
        ['Copy share link', run('Link copied.', actions.copyLink)],
        ['Copy JSON', run('Settings JSON copied.', actions.copyJson)],
        ['Download JSON', run('', actions.downloadJson)],
        ['Import JSON…', () => fileInput.click()],
      ]),
    ),
    section(
      'Preview',
      select('preview', 'backdrop', 'Backdrop', [
        ['light', 'Light'],
        ['dark', 'Dark'],
        ['checker', 'Checker (transparent)'],
      ]),
    ),
    status,
  );

  const fileInput = el('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) await run('Settings imported.', () => actions.importJson(file))();
  });
  root.append(fileInput);

  renderBatch();
  refreshControls();

  /** Call on state change to sync parts not covered by refreshControls. */
  return (changed: Set<keyof State>) => {
    if (changed.has('icon')) picker.sync();
    if (changed.has('geometry')) {
      const mode = state.geometry.mode;
      for (const [key, row] of Object.entries(geo)) row.hidden = !visibleIn[key as keyof typeof geo].includes(mode);
      modeHint.textContent = modes.find((m) => m.key === mode)?.hint ?? '';
    }
    if (changed.has('export')) {
      const e = state.export;
      scaleSelect.value = String(e.scale);
      scaleRow.hidden = e.aspect === 'custom';
      widthRow.hidden = !(e.aspect === 'custom' || e.scale === 0);
      heightRow.hidden = e.aspect !== 'custom';
      sizeLabel.textContent = actions.exportSizeLabel();
    }
  };
}
