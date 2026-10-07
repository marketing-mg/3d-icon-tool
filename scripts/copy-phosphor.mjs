// Copies Phosphor SVGs into public/ so the app can fetch them lazily by URL.
// (An import.meta.glob over 9k files would emit 9k JS chunks.)
import { cpSync, existsSync, readFileSync } from 'node:fs';

const src = 'node_modules/@phosphor-icons/core/assets';
const dest = 'public/phosphor';
const version = JSON.parse(readFileSync('node_modules/@phosphor-icons/core/package.json', 'utf8')).version;
const stamp = `${dest}/.version-${version}`;

if (!existsSync(stamp)) {
  cpSync(src, dest, { recursive: true });
  cpSync('node_modules/@phosphor-icons/core/LICENSE', `${dest}/LICENSE`);
  cpSync('node_modules/@phosphor-icons/core/package.json', stamp);
  console.log(`Copied Phosphor ${version} SVGs to ${dest}`);
}
