// Takes the four captures named in shots.json from the app served by serve.ts, using the installed Chromium
// through Playwright so each capture waits for the route's data (window.__shotReady). On this machine a global
// SOCKS proxy is in the environment; Chromium is told --no-proxy-server and serve.ts is started with the proxy
// variables unset, so loopback and make.fun are reached directly. A capture over the size caps fails the run
// rather than being written.
//
//   node shots.mjs

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PORT = Number(process.env.SHOT_PORT ?? 8098);
const BASE = `http://127.0.0.1:${PORT}`;
const CHROME = process.env.SHOT_CHROME
  ?? '/home/azureuser/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome';
const PW = process.env.SHOT_PLAYWRIGHT
  ?? '/home/azureuser/projects/tiktok-dm-bot/node_modules/playwright';
const OUT = 'screenshots';
const MAX_BYTES = 262144;

const shots = [
  { file: '1-board.png', hash: '#/', label: 'board' },
  { file: '2-bounty.png', hash: '#/bounty/makefun-frontend-01', label: 'bounty' },
  { file: '3-leaderboard.png', hash: '#/leaderboard/makefun-frontend-01', label: 'leaderboard' },
  { file: '4-profile.png', hash: '#/profile/bounty-runner-72', label: 'profile' }
];

mkdirSync(OUT, { recursive: true });

const env = { ...process.env };
for (const key of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy']) {
  delete env[key];
}

const server = spawn(process.execPath, ['serve.ts', '--port', String(PORT)], { stdio: 'inherit', env });

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`${BASE}/index.html`, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await wait(250);
  }
  throw new Error('serve.ts did not come up');
}

function measure(path) {
  const bytes = statSync(path).size;
  if (bytes === 0) throw new Error(`${path}: empty file`);
  if (bytes > MAX_BYTES) throw new Error(`${path}: ${bytes} bytes, over ${MAX_BYTES}`);
  const png = readFileSync(path);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (Math.max(width, height) > 1280) throw new Error(`${path}: ${width}x${height}, long side over 1280`);
  if (Math.min(width, height) < 360) throw new Error(`${path}: ${width}x${height}, short side under 360`);
  return { bytes, width, height };
}

const require = createRequire(import.meta.url);
const { chromium } = require(PW);

try {
  await waitForServer();
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-proxy-server', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--hide-scrollbars']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });

  for (const shot of shots) {
    await page.goto(`${BASE}/${shot.hash}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 60000 });
    const route = await page.evaluate(() => document.body.dataset.route);
    const path = join(OUT, shot.file);
    await page.screenshot({ path, type: 'png' });
    const { bytes, width, height } = measure(path);
    console.log(`${shot.file} route=${route} ${width}x${height} bytes=${bytes} ${shot.hash}`);
  }

  await browser.close();
  console.log('shots: done');
} finally {
  server.kill('SIGTERM');
}
