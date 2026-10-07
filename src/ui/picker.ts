import { state, touch, type Weight } from '../state';
import { getRecent, iconUrl, search, weights, type IconRef } from '../icons/phosphor';
import { el } from './controls';

interface PickerOptions {
  /** Alt/Shift-click on a tile toggles it in the batch. */
  onBatchToggle: (ref: IconRef) => void;
}

export function buildPicker({ onBatchToggle }: PickerOptions) {
  const input = el('input', { type: 'search', placeholder: 'Search Monograph + 1,512 Phosphor icons…', class: 'search' });
  const weightBar = el('div', { class: 'segmented' });
  const grid = el('div', { class: 'icon-grid' });
  const recent = el('div', { class: 'icon-strip' });
  const current = el('div', { class: 'current' });

  const tile = (ref: IconRef, small = false) => {
    const b = el('button', { type: 'button', class: small ? 'tile small' : 'tile', title: ref.name });
    b.append(el('img', { src: iconUrl(ref.name, ref.weight), alt: ref.name, decoding: 'async', draggable: false }));
    b.dataset.name = ref.name;
    b.addEventListener('click', (e) => {
      if (e.altKey || e.shiftKey) return onBatchToggle(ref);
      state.icon = { ...ref };
      touch('icon');
    });
    return b;
  };

  let searchId = 0;
  async function renderGrid() {
    const id = ++searchId;
    const results = await search(input.value);
    if (id !== searchId) return;
    grid.replaceChildren(
      ...(results.length
        ? results.map((r) => tile({ name: r.name, weight: state.icon.weight }))
        : [el('p', { class: 'muted' }, 'No icons match.')]),
    );
    markCurrent();
  }

  function renderRecent() {
    const list = getRecent();
    recent.hidden = !list.length;
    recent.replaceChildren(...list.map((r) => tile(r, true)));
  }

  function markCurrent() {
    grid.querySelectorAll<HTMLElement>('.tile').forEach((t) => t.classList.toggle('on', t.dataset.name === state.icon.name));
    current.textContent = `${state.icon.name} · ${state.icon.weight}`;
  }

  for (const w of weights) {
    const b = el('button', { type: 'button' }, w);
    b.dataset.weight = w;
    b.addEventListener('click', () => {
      state.icon.weight = w as Weight;
      touch('icon');
    });
    weightBar.append(b);
  }

  let debounce = 0;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = window.setTimeout(renderGrid, 120);
  });

  let shownWeight: Weight | null = null;
  /** Call when state.icon changes. */
  function sync() {
    weightBar.querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('on', b.dataset.weight === state.icon.weight));
    if (shownWeight !== state.icon.weight) {
      shownWeight = state.icon.weight;
      renderGrid();
    } else markCurrent();
    renderRecent();
  }

  const root = el(
    'div',
    { class: 'picker' },
    current,
    input,
    weightBar,
    grid,
    el('p', { class: 'hint' }, 'Shift-click an icon to add it to the batch.'),
    recent,
  );
  return { root, sync };
}
