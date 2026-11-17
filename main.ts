// makefun-frontend-01 entry program.
//
// Hands the entry in: copies app/ and the three dossier screenshots from this repository into the output
// directory (MAKEFUN_OUTPUT_DIR, /output in the grader), refuses to run unless the dossier set holds three
// usable captures, then writes dossier.json with the vendored make.fun library so the bytes are exactly what
// the scorer's own copy of buildDossier produces.
//
// The repository keeps four captures (screenshots/1-board.png through 4-profile.png, the profile page being
// the fourth surface); the scorer takes three images, so 4-profile.png stays in the repository and out of
// the hand-in set. DOSSIER_SHOTS below is the hand-in, cover first.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const appDir = join(here, 'app');
const shotsDir = join(here, 'screenshots');

// The cover first, as the judge reads them. The fourth capture (profile) is kept in the repository but not
// handed in: the scorer's screenshots row takes at most 3.
const DOSSIER_SHOTS = ['1-board.png', '2-bounty.png', '3-leaderboard.png'];

const SHOT_RE = /\.(?:png|jpe?g)$/i;
const SHOT_MAX_BYTES = 262144;
const LONG_SIDE_MAX = 1280;
const SHORT_SIDE_MIN = 360;

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

// A screenshot is a whole PNG or JPEG of known size. Reading the header here means a truncated or renamed
// file fails on this machine, with a named file, instead of inside the scorer.
function imageSize(file) {
  const bytes = readFileSync(file);
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { format: 'png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const length = bytes.readUInt16BE(offset + 2);
      const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) {
        return { format: 'jpeg', width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
      }
      if (length < 2) break;
      offset += 2 + length;
    }
    fail(`${file} starts as a JPEG but its frame header is missing`);
  }
  fail(`${file} is neither a whole PNG nor a whole JPEG`);
}

function checkShot(name) {
  const file = join(shotsDir, name);
  if (!existsSync(file)) fail(`screenshots/${name} is missing: the hand-in needs ${DOSSIER_SHOTS.join(', ')}`);
  const bytes = statSync(file).size;
  if (bytes > SHOT_MAX_BYTES) fail(`screenshots/${name} is ${bytes} bytes, over the ${SHOT_MAX_BYTES} a screenshot may be`);
  const { format, width, height } = imageSize(file);
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  if (long > LONG_SIDE_MAX) fail(`screenshots/${name} is ${width}x${height}: its long side is over ${LONG_SIDE_MAX}`);
  if (short < SHORT_SIDE_MIN) fail(`screenshots/${name} is ${width}x${height}: its short side is under ${SHORT_SIDE_MIN}`);
  return { name, format, width, height, bytes };
}

if (!existsSync(appDir) || !statSync(appDir).isDirectory()) fail('app/ is missing: an entry is a directory of static files');
if (!existsSync(join(appDir, 'index.html'))) fail('app/index.html is missing: that is the page the entry opens');

const repoShots = imageFiles(shotsDir);
if (!repoShots.length) fail('screenshots/ holds no image: the entry needs captures of the running app');
for (const name of repoShots) checkShot(name);
for (const name of DOSSIER_SHOTS) checkShot(name);

const extra = repoShots.filter((name) => !DOSSIER_SHOTS.includes(name));

mkdirSync(out, { recursive: true });

const outApp = join(out, 'app');
const outShots = join(out, 'screenshots');
rmSync(outApp, { recursive: true, force: true });
rmSync(outShots, { recursive: true, force: true });
cpSync(appDir, outApp, { recursive: true });
mkdirSync(outShots, { recursive: true });
for (const name of DOSSIER_SHOTS) cpSync(join(shotsDir, name), join(outShots, name));

const handedShots = imageFiles(outShots);
if (handedShots.length !== 3) fail(`after copying, the output holds ${handedShots.length} screenshots, not 3`);

// The scorer's caps (gate.json): text_max_bytes shapes the dossier's bytes; the rest refuse an entry
// the scorer would refuse. app/ shares the platform's 1,000-entry, 64 MiB output with screenshots/
// and dossier.json, so 993 files and directories and 16 MiB leave room for them.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: SHOT_MAX_BYTES },
  app_max_files: 993,
  app_max_bytes: 16777216
});

writeFileSync(join(out, 'dossier.json'), dossier);

const sizes = DOSSIER_SHOTS.map((name) => {
  const shot = checkShot(name);
  return `${name} ${shot.width}x${shot.height} ${shot.bytes} B`;
}).join(', ');

process.stdout.write(
  `main.ts: wrote ${join(out, 'dossier.json')} (${dossier.byteLength} bytes) from ${repoShots.length} capture(s) in screenshots/, handing in 3: ${sizes}` +
  (extra.length ? `; kept in the repository only: ${extra.join(', ')}` : '') + '\n'
);
