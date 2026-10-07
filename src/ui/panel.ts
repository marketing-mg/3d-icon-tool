import { brandState, replaceState, state, touch } from '../state';
import { cameraPresets } from '../scene/camera';
import { lightingPresets } from '../scene/environment';
import { materialPresets } from '../scene/materials';
import { sampleKeys, sampleLabel } from '../icons/samples';
import { buttons, checkbox, color, el, group, refreshControls, select, slider } from './controls';

export function buildPanel(root: HTMLElement) {
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

  root.append(
    el('h1', {}, 'Metal Icon Studio'),
    group(
      'Icon',
      select(
        'icon',
        'key',
        'Sample',
        sampleKeys.map((k) => [k, sampleLabel(k)]),
      ),
      el('p', { class: 'warn', id: 'icon-warning', hidden: true }),
    ),
    group(
      'Geometry',
      slider('geometry', 'depth', 'Depth', 0.02, 1.5, 0.01),
      slider('geometry', 'bevelSize', 'Bevel size', 0, 0.05, 0.001),
      slider('geometry', 'bevelThickness', 'Bevel thickness', 0, 0.08, 0.001),
      slider('geometry', 'bevelSegments', 'Bevel segments', 1, 8, 1),
      slider('geometry', 'curveSegments', 'Curve segments', 4, 64, 1),
    ),
    group(
      'Camera',
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
      'Material',
      select(
        'material',
        'preset',
        'Preset',
        Object.entries(materialPresets).map(([k, p]) => [k, p.label]),
        (k) => {
          const { label: _label, ...params } = materialPresets[k];
          Object.assign(state.material, params);
        },
      ),
      color('material', 'tint', 'Tint'),
      slider('material', 'roughness', 'Roughness', 0, 1, 0.01),
      slider('material', 'clearcoat', 'Clearcoat', 0, 1, 0.01),
      slider('material', 'anisotropy', 'Anisotropy', 0, 1, 0.01),
    ),
    group(
      'Lighting',
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
      slider('grain', 'amount', 'Amount', 0, 0.4, 0.005),
      slider('grain', 'size', 'Size (px)', 1, 4, 0.1),
      slider('grain', 'seed', 'Seed', 1, 999, 1),
    ),
    group(
      'Preview',
      select('preview', 'backdrop', 'Backdrop', [
        ['light', 'Light'],
        ['dark', 'Dark'],
        ['checker', 'Checker (transparent)'],
      ]),
    ),
    buttons([['Reset to brand', () => (replaceState(brandState()), refreshControls())]]),
  );
  refreshControls();
}
