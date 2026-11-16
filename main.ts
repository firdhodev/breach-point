// BREACH POINT Node 22 hand-in program: stage the entry beside this file into the output
// directory (default /output), then write the scorer's dossier.json there.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.argv[2] ?? process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

mkdirSync(out, { recursive: true });
for (const name of ['game', 'screenshots'] as const) {
  const from = join(here, name);
  if (existsSync(from)) cpSync(from, join(out, name), { recursive: true });
}

const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(out, 'dossier.json'), dossier);
console.log(`wrote ${join(out, 'dossier.json')} (${dossier.length} bytes)`);
