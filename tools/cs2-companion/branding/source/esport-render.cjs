const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const [mode, secs, fps, outDir] = [process.argv[2], +process.argv[3], +process.argv[4], process.argv[5]];
  fs.mkdirSync(outDir, { recursive: true });
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto('file://' + path.join(__dirname, 'esport-motion.html')); await p.evaluate(() => window.ready);
  const n = Math.round(secs * fps);
  for (let i = 0; i < n; i++) {
    await p.evaluate(([m, t]) => window.render(m, t), [mode, i / fps]);
    await p.locator('#c').screenshot({ path: `${outDir}/f${String(i).padStart(4, '0')}.png` });
  }
  await b.close();
})();
