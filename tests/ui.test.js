// Starts a local server and tests the real UI. No machine-specific paths.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
const { once } = require('node:events');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../www');
test('تدفق المتصفح والحفظ والاسترجاع', { timeout: 120000 }, async () => {
  const server = http.createServer((req, res) => {
    let file;
    try {
      const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
      if (!file.startsWith(root + path.sep)) throw new Error('outside root');
    } catch { res.writeHead(400); res.end(); return; }
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); res.end(data);
    });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  let browser;
  try {
    browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar', timezoneId: 'Asia/Damascus', acceptDownloads: true });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.clock.setFixedTime(new Date('2026-11-11T12:00:00+03:00'));
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.waitForSelector('.welcome'); await page.click('[data-act="new-subject"]');
    await page.fill('#f-name', 'الرياضيات'); await page.fill('#f-deadline', ''); await page.click('[data-act="save-subject"]');
    assert.equal(await page.evaluate(() => window.__bac.state.subjects.length), 0);
    await page.fill('#f-deadline', '2027-01-10'); await page.click('[data-act="save-subject"]');
    await page.waitForSelector('.srow');
    assert.equal(await page.evaluate(() => window.__bac.state.subjects.length), 1);
    const first = page.locator('.srow .chk[data-act="toggle"]').first(), id = await first.getAttribute('data-id');
    await first.click(); await page.waitForSelector('#s-note'); await page.fill('#s-note', 'مراجعة قوانين الدرس');
    await page.click('[data-act="save-note"]'); await page.waitForSelector('[data-act="difficulty"]');
    await page.click('[data-act="difficulty"][data-diff="hard"]'); await page.waitForSelector('.sheet', { state: 'detached' });
    const lesson = await page.evaluate(id => {
      const s = window.__bac.state, session = s.sessions.find(x => x.id === id);
      return s.subjects[0].lessons.find(x => x.id === session.lessonId);
    }, id);
    assert.equal(lesson.done, true); assert.equal(lesson.review.min, 60); assert.equal(lesson.review.doneMin, 0);
    assert.equal(lesson.memo, 'مراجعة قوانين الدرس');
    await page.reload(); await page.waitForSelector('.daysum');
    assert.equal(await page.evaluate(() => window.__bac.state.subjects[0].lessons.filter(x => x.done).length), 1);
    for (const tab of ['subjects', 'schedule', 'report', 'settings']) {
      await page.click('#tabs [data-to="' + tab + '"]'); await page.waitForTimeout(80);
      assert.ok(await page.locator('#app').innerText());
      for (const width of [360, 1024]) {
        await page.setViewportSize({ width, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'overflow: ' + tab);
      }
    }
    const downloading = page.waitForEvent('download'); await page.click('[data-act="export-data"]');
    const download = await downloading, exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(exported.subjects.length, 1);
    await page.click('[data-act="reset"]'); await page.click('[data-act="do-reset"]'); await page.waitForSelector('.welcome');
    await page.evaluate(() => { location.hash = '#/settings'; }); await page.waitForSelector('#import-data');
    await page.setInputFiles('#import-data', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
    await page.click('[data-act="confirm-import"]'); await page.waitForSelector('.daysum');
    assert.equal(await page.evaluate(() => window.__bac.state.subjects[0].lessons[0].memo), lesson.memo);
    assert.deepEqual(errors, [], 'browser errors'); await ctx.close();
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
