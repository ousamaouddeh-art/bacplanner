// اختبار شامل للواجهة بمتصفح بحجم جوال. التشغيل: node tests/ui.test.js [مجلد_الصور]
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const out = process.argv[2] || '/tmp/shots';
const URL = process.env.APP_URL || 'http://localhost:8123/';
const log = (...a) => console.log(...a);
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'ar', timezoneId: 'Asia/Damascus' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.clock.setFixedTime(new Date('2026-11-11T17:10:00+03:00'));
  const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
  const click = (sel) => page.click(sel);
  const text = (t) => page.getByText(t, { exact: false });

  await page.goto(URL);
  await page.waitForSelector('.welcome');
  await shot('01-welcome');
  await click('[data-act=preset][data-min="180"]');
  await click('[data-act=new-subject]');
  await page.waitForSelector('#f-name');
  await page.fill('#f-name', 'الرياضيات');
  await click('[data-act=set][data-field=mode][data-val=teacher]');
  for (let i = 0; i < 2; i++) await click('[data-act=step][data-field=lessonMin][data-dir="1"]'); // 60 -> 90
  for (let i = 0; i < 3; i++) await click('[data-act=step][data-field=backlog][data-dir="1"]');   // 5 -> 8
  await shot('02-form');
  await click('[data-act=save-subject]');
  await page.waitForSelector('.daysum');
  await shot('03-today');

  // مادة ثانية: ذاتية، أهمية عالية
  await click('#tabs a[data-to=subjects]');
  await click('[data-act=new-subject]');
  await page.fill('#f-name', 'الفيزياء');
  await click('[data-act=set][data-field=importance][data-val="3"]');
  for (let i = 0; i < 7; i++) await click('[data-act=step][data-field=backlog][data-dir="1"]'); // 12
  await click('[data-act=save-subject]');
  await page.waitForSelector('.subj');
  await shot('04-subjects');

  await click('#tabs a[data-to=schedule]');
  await page.waitForSelector('.dchip');
  await shot('05-schedule');

  // تفاصيل مادة
  await click('#tabs a[data-to=subjects]');
  await click('.subj >> nth=0');
  await page.waitForSelector('.lrow');
  await shot('06-subject');
  await page.goBack();

  // إنجاز جلسة اليوم
  await click('#tabs a[data-to=today]');
  await page.waitForSelector('.daysum');
  const hasRows = await page.locator('.srow').count();
  log('today rows:', hasRows);
  if (hasRows) {
    await click('.srow .chk >> nth=0');
    await shot('07-after-toggle');
  }
  const sheet = await page.locator('.sheet').count();
  log('difficulty sheet shown:', sheet);
  if (sheet) { await shot('08-sheet'); }

  await click('#tabs a[data-to=report]');
  await page.waitForSelector('.weeknav');
  await shot('09-report');
  await click('#tabs a[data-to=settings]');
  await page.waitForSelector('.setrow');
  await shot('10-settings');

  // مادة مستحيلة: موعد قريب جداً
  await click('#tabs a[data-to=subjects]');
  await click('[data-act=new-subject]');
  await page.fill('#f-name', 'الكيمياء');
  for (let i = 0; i < 20; i++) await click('[data-act=step][data-field=backlog][data-dir="1"]');
  await page.fill('#f-deadline', '2026-11-18');
  await page.dispatchEvent('#f-deadline', 'input');
  await shot('11-form-infeasible');
  await click('[data-act=save-subject]');
  await page.waitForSelector('.sheet');
  await page.waitForTimeout(400);
  await shot('12-options');
  await click('.sheet [data-act=apply-extend]');
  await page.waitForTimeout(400);
  await click('#tabs a[data-to=today]');
  await shot('13-today-final');

  // استمرار البيانات بعد إعادة التحميل
  await page.reload();
  await page.waitForSelector('.daysum');
  const subjectsAfter = await page.evaluate(() => window.__bac.state.subjects.length);
  log('subjects after reload:', subjectsAfter);

  log('ERRORS:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => { console.error('TEST FAILED', e); process.exit(1); });
