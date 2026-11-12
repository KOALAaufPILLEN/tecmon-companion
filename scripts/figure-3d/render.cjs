// GLB im Headless-Chromium mit three.js rendern; transparenter Hintergrund.
// Aufruf siehe README.md in diesem Ordner.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const work = process.env.TECMON_3D_WORK, frames = process.argv[2];
// Ausdrücke in der Reihenfolge von FACES in faces.py (ohne idle); Bildnummer ab TURNS.
const faces = ['blink', 'happy', 'talkA', 'talkB', 'focus', 'busy', 'wink', 'surprised', 'dizzy', 'laugh', 'love', 'kiss',
  'angry', 'sleepy', 'tongue', 'sad', 'cool', 'star', 'confused'];
const TURNS = 72, STEP = 360 / TURNS;
const jobs = [];
for (let i = 0; i < TURNS; i++) jobs.push(['idle', i * STEP, `${frames}/${String(i).padStart(2, '0')}.png`]);
faces.forEach((n, k) => jobs.push([n, 0, `${frames}/${TURNS + k}.png`]));
const only = process.argv[3]; // optional: nur Ausdrücke ("faces") neu rendern
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png' };
const server = http.createServer((q, s) => {
  const file = path.join(work, decodeURIComponent(q.url.split('?')[0]));
  if (!file.startsWith(work)) return s.end();
  s.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).on('error', () => s.end()).pipe(s);
}).listen(8765, '127.0.0.1');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error(e.message));
  await page.goto('http://127.0.0.1:8765/index.html?s=384');
  await page.evaluate(() => window.ready);
  let face = '';
  for (const [name, deg, file] of jobs) {
    if (only === 'faces' && name === 'idle') continue;
    if (name !== face) { await page.evaluate((f) => setFace(f), name); face = name; }
    const url = await page.evaluate((y) => shot(y), (deg * Math.PI) / 180);
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  }
  await browser.close(); server.close();
})();
