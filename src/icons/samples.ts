const files = import.meta.glob('/samples/**/*.svg', { query: '?raw', import: 'default' }) as Record<
  string,
  () => Promise<string>
>;

export const sampleKeys = Object.keys(files).sort();

export function sampleLabel(key: string) {
  const [, , weight, file] = key.split('/');
  return `${file.replace(/\.svg$/, '').replace(`-${weight}`, '')} (${weight})`;
}

export async function loadSvg(key: string): Promise<string> {
  const load = files[key];
  if (!load) throw new Error(`Unknown icon: ${key}`);
  return load();
}
