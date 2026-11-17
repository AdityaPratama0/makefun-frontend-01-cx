// Takes screenshots/1-board.png, 2-bounty.png and 3-leaderboard.png from the app served by serve.ts,
// using the installed Chromium through Playwright. Network goes through the local SOCKS5 proxy, as
// it must on this machine; loopback is bypassed so the local server is reached directly.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PORT = Number(process.env.SHOT_PORT ?? 8099);
const BASE = `http://127.0.0.1:${PORT}`;
const CHROME = '/home/azureuser/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome';
const PW = '/home/azureuser/projects/tiktok-dm-bot/node_modules/playwright';
const OUT = 'screenshots';

const shots = [
  { file: '1-board.png', hash: '#/', width: 1280, height: 800 },
  { file: '2-bounty.png', hash: '#/bounty/makefun-frontend-01', width: 1280, height: 800 },
  { file: '3-leaderboard.png', hash: '#/leaderboard/makefun-frontend-01', width: 1280, height: 800 }
];

mkdirSync(OUT, { recursive: true });

const server = spawn(process.execPath, ['serve.ts', '--port', String(PORT)], { stdio: 'inherit' });

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`${BASE}/index.html`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await wait(250);
  }
  throw new Error('serve.ts did not come up');
}

const require = createRequire(import.meta.url);
const chromium = require(PW).chromium;

try {
  await waitForServer();
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--proxy-server=socks5://127.0.0.1:1080',
      '--proxy-bypass-list=127.0.0.1;localhost'
    ]
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });

  for (const shot of shots) {
    await page.setViewportSize({ width: shot.width, height: shot.height });
    await page.goto(`${BASE}/${shot.hash}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 60000 });
    await page.evaluate(() => (document.fonts ? document.fonts.ready : true));
    await page.waitForTimeout(200);
    const route = await page.evaluate(() => document.body.dataset.route);
    const path = join(OUT, shot.file);
    await page.screenshot({ path, type: 'png' });
    const bytes = readFileSync(path).length;
    console.log(`${shot.file} route=${route} bytes=${bytes} hash=${shot.hash}`);
  }

  await browser.close();
  console.log('shots: done');
} finally {
  server.kill('SIGTERM');
}
