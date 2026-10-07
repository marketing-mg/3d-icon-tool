import { state, touch, type State } from '../state';

type Section = keyof State;
const refreshers: (() => void)[] = [];

/** Re-sync every control from state (after presets, drag-orbit, reset). */
export function refreshControls() {
  refreshers.forEach((r) => r());
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...children: (Node | string)[]
) {
  const node = document.createElement(tag);
  const { class: cls, ...rest } = props;
  if (cls) node.className = cls;
  Object.assign(node, rest);
  node.append(...children);
  return node;
}

export function group(title: string, ...children: Node[]) {
  return el('details', { open: true, class: 'group' }, el('summary', {}, title), ...children);
}

export function slider<S extends Section>(
  section: S,
  key: keyof State[S] & string,
  label: string,
  min: number,
  max: number,
  step: number,
  onInput?: () => void,
) {
  const obj = () => state[section] as Record<string, number>;
  const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step) });
  const num = el('input', { type: 'number', min: String(min), max: String(max), step: String(step), class: 'num' });
  const set = (v: number) => {
    if (Number.isNaN(v)) return;
    obj()[key] = v;
    input.value = num.value = String(v);
    onInput?.();
    touch(section);
  };
  input.addEventListener('input', () => set(input.valueAsNumber));
  num.addEventListener('change', () => set(num.valueAsNumber));
  refreshers.push(() => (input.value = num.value = String(obj()[key])));
  return el('label', { class: 'row' }, el('span', {}, label), input, num);
}

export function select<S extends Section>(
  section: S,
  key: keyof State[S] & string,
  label: string,
  options: [value: string, label: string][],
  onSelect?: (value: string) => void,
) {
  const obj = () => state[section] as Record<string, string>;
  const input = el('select', {}, ...options.map(([value, text]) => el('option', { value }, text)));
  input.addEventListener('change', () => {
    obj()[key] = input.value;
    onSelect?.(input.value);
    refreshControls();
    touch(section);
  });
  refreshers.push(() => (input.value = obj()[key]));
  return el('label', { class: 'row' }, el('span', {}, label), input);
}

export function color<S extends Section>(section: S, key: keyof State[S] & string, label: string) {
  const obj = () => state[section] as Record<string, string>;
  const input = el('input', { type: 'color' });
  input.addEventListener('input', () => {
    obj()[key] = input.value;
    touch(section);
  });
  refreshers.push(() => (input.value = obj()[key]));
  return el('label', { class: 'row' }, el('span', {}, label), input);
}

export function checkbox<S extends Section>(
  section: S,
  key: keyof State[S] & string,
  label: string,
  onToggle?: (on: boolean) => void,
) {
  const obj = () => state[section] as unknown as Record<string, boolean>;
  const input = el('input', { type: 'checkbox' });
  input.addEventListener('change', () => {
    obj()[key] = input.checked;
    onToggle?.(input.checked);
    refreshControls();
    touch(section);
  });
  refreshers.push(() => {
    input.checked = obj()[key];
    onToggle?.(input.checked);
  });
  return el('label', { class: 'row check' }, input, el('span', {}, label));
}

export function buttons(items: [label: string, onClick: () => void][]) {
  return el(
    'div',
    { class: 'buttons' },
    ...items.map(([label, onClick]) => {
      const b = el('button', { type: 'button' }, label);
      b.addEventListener('click', onClick);
      return b;
    }),
  );
}
