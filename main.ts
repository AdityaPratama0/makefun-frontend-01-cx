// makefun-frontend-01 entry program.
//
// Hands the entry in: copies app/ and screenshots/ from this repository into the output directory
// (MAKEFUN_OUTPUT_DIR, /output in the grader), refuses to run unless screenshots/ holds exactly
// three usable captures, then writes dossier.json with the vendored make.fun library so the bytes
// are exactly what the scorer's own copy of buildDossier produces.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const appDir = join(here, 'app');
const shotsDir = join(here, 'screenshots');

const SHOT_RE = /\.(?:png|jpe?g)$/i;

function imageFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.') && SHOT_RE.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function fail(message) {
  process.stderr.write(`main.ts: ${message}\n`);
  process.exit(1);
}

if (!existsSync(appDir) || !statSync(appDir).isDirectory()) fail('app/ is missing: an entry is a directory of static files');
if (!existsSync(join(appDir, 'index.html'))) fail('app/index.html is missing: that is the page the entry opens');

const repoShots = imageFiles(shotsDir);
if (repoShots.length !== 3) {
  fail(`screenshots/ holds ${repoShots.length} image(s) (${repoShots.join(', ') || 'none'}); this entry needs exactly 3`);
}

for (const name of repoShots) {
  const bytes = statSync(join(shotsDir, name)).size;
  if (bytes > 262144) fail(`screenshots/${name} is ${bytes} bytes, over the 262144 a screenshot may be`);
}

mkdirSync(out, { recursive: true });

const outApp = join(out, 'app');
const outShots = join(out, 'screenshots');
rmSync(outApp, { recursive: true, force: true });
rmSync(outShots, { recursive: true, force: true });
cpSync(appDir, outApp, { recursive: true });
mkdirSync(outShots, { recursive: true });
cpSync(shotsDir, outShots, { recursive: true });

const handedShots = imageFiles(outShots);
if (handedShots.length !== 3) {
  fail(`after copying, the output holds ${handedShots.length} screenshots, not 3`);
}

// The scorer's caps (gate.json): text_max_bytes shapes the dossier's bytes; the rest refuse an entry
// the scorer would refuse. app/ shares the platform's 1,000-entry, 64 MiB output with screenshots/
// and dossier.json, so 993 files and directories and 16 MiB leave room for them.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216
});

writeFileSync(join(out, 'dossier.json'), dossier);

process.stdout.write(
  `main.ts: wrote ${join(out, 'dossier.json')} (${dossier.byteLength} bytes) from ${repoShots.length} screenshots: ${repoShots.join(', ')}\n`
);
