import type { IconEntry } from '@phosphor-icons/core';
import type { Weight } from '../state';

export const weights: Weight[] = ['thin', 'light', 'regular', 'bold', 'fill', 'duotone'];

export interface IconInfo {
  name: string;
  /** Lowercased name + tags + categories, for search. */
  haystack: string;
}

let catalog: Promise<IconInfo[]> | null = null;

/** The Phosphor catalog (~1.5k entries with tags). Loaded on first use, kept out of the main bundle. */
export function getCatalog() {
  catalog ??= import('@phosphor-icons/core').then(({ icons }) =>
    (icons as readonly IconEntry[]).map((i) => ({
      name: i.name,
      haystack: [i.name, ...i.tags, ...i.categories, i.alias?.name ?? ''].join(' ').toLowerCase(),
    })),
  );
  return catalog;
}

export async function search(query: string, limit = 120): Promise<IconInfo[]> {
  const all = await getCatalog();
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return all.slice(0, limit);
  // Name matches first (prefix before substring), then tag matches.
  const score = (i: IconInfo) => {
    if (!terms.every((t) => i.haystack.includes(t))) return -1;
    const q = terms.join('-');
    return i.name.startsWith(q) ? 3 : i.name.includes(q) ? 2 : 1;
  };
  return all
    .map((i) => [i, score(i)] as const)
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([i]) => i);
}

export const fileName = (name: string, weight: Weight) =>
  weight === 'regular' ? `${name}.svg` : `${name}-${weight}.svg`;

export const iconUrl = (name: string, weight: Weight) =>
  `${import.meta.env.BASE_URL}phosphor/${weight}/${fileName(name, weight)}`;

const svgCache = new Map<string, Promise<string>>();

export function loadSvg(name: string, weight: Weight): Promise<string> {
  const url = iconUrl(name, weight);
  let p = svgCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Icon not found: ${weight}/${name}`);
      return r.text();
    });
    p.catch(() => svgCache.delete(url));
    svgCache.set(url, p);
  }
  return p;
}

// --- Recent icons (per browser; a convenience, not part of shared state) ---

const RECENT_KEY = 'mis.recent';
export type IconRef = { name: string; weight: Weight };

export function getRecent(): IconRef[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function pushRecent(ref: IconRef) {
  const list = [ref, ...getRecent().filter((r) => r.name !== ref.name || r.weight !== ref.weight)].slice(0, 12);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable: recents just won't persist */
  }
  return list;
}

/** The 8 test icons from samples/. */
export const sampleIcons = [
  'browser',
  'cpu',
  'gear-six',
  'terminal-window',
  'cube',
  'circuitry',
  'database',
  'git-branch',
];
