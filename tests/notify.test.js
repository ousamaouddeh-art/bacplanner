const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const E = require('../www/js/engine');
const source = fs.readFileSync(path.join(__dirname, '../www/js/notify.js'), 'utf8');
function fixture(overrides = {}) {
  let entries = [{ id: 999 }], cancelCount = 0, attempts = 0;
  const plugin = {
    async checkPermissions() { return { display: 'granted' }; },
    async getPending() { return { notifications: entries }; },
    async cancel() { cancelCount++; entries = []; },
    async createChannel() {},
    async schedule({ notifications }) { attempts++; entries = notifications; },
    ...overrides
  };
  const self = { Capacitor: { isNativePlatform: () => true, Plugins: { LocalNotifications: plugin } } };
  vm.runInNewContext(source, { self, console });
  const now = E.nowInfo(); const s = E.newState();
  const sub = E.createSubject({ name: 'مادة', mode: 'self', backlog: 1, lessonMin: 60, deadline: E.fmtDay(now.day + 10) }, now.day);
  s.subjects.push(sub);
  s.sessions = [{ id: 'session', subjectId: sub.id, lessonId: sub.lessons[0].id, kind: 'study', date: E.fmtDay(now.day + 1), start: 960, minutes: 60, status: 'pending' }];
  return { n: self.Notify, s, now, get entries() { return entries; }, get cancels() { return cancelCount; }, get attempts() { return attempts; } };
}
test('مزامنة خطة فارغة تلغي التذكيرات القديمة', async () => {
  const f = fixture(); const r = await f.n.sync(E.newState(), f.now, E);
  assert.equal(r.status, 'empty'); assert.equal(f.cancels, 1); assert.equal(f.entries.length, 0);
});
test('وصول المزامنة لا يدعي الوصول الفعلي للهاتف', async () => {
  const f = fixture(); const r = await f.n.sync(f.s, f.now, E);
  assert.equal(r.status, 'scheduled'); assert.equal(r.count, 1); assert.equal(f.entries.length, 1);
});
test('فشل الجدولة يعاد كخطأ ظاهر ولا يعاد تلقائياً', async () => {
  let calls = 0; const f = fixture({ async schedule() { calls++; throw new Error('native failure'); } });
  const r = await f.n.sync(f.s, f.now, E); assert.equal(r.status, 'error'); assert.equal(calls, 1);
});
test('فشل فحص المنبهات الدقيقة ليس سماحاً', async () => {
  const f = fixture({ async checkExactNotificationSetting() { throw new Error('failed'); } });
  assert.equal(await f.n.exactStatus(), 'unavailable'); assert.equal(await f.n.openExactSettings(), false);
});
test('المزامنات المتداخلة لا تعيد تنبيهات خطة ممسوحة', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; }); let first = true, entries = [];
  const f = fixture({ async getPending() { return { notifications: entries }; }, async cancel() { entries = []; }, async schedule({ notifications }) { if (first) { first = false; await gate; } entries = notifications; } });
  const a = f.n.sync(f.s, f.now, E), b = f.n.sync(E.newState(), f.now, E);
  release(); await Promise.all([a, b]); assert.equal(entries.length, 0);
});
test('حد 60 تذكيراً ونافذة الأسبوع لا يتغيران', async () => {
  const f = fixture(), original = f.s.sessions[0];
  f.s.sessions = Array.from({ length: 70 }, (_, i) => ({ ...original, id: 's_' + i, start: 480 + i }));
  const r = await f.n.sync(f.s, f.now, E); assert.equal(r.count, 60);
  f.s.sessions = [{ ...original, date: E.fmtDay(f.now.day + 8) }]; assert.equal((await f.n.sync(f.s, f.now, E)).count, 0);
});
test('إيقاف التذكير يلغي القديم ولا يجدول جديداً', async () => {
  const f = fixture(); f.s.settings.remindBefore = 0; const r = await f.n.sync(f.s, f.now, E);
  assert.equal(r.status, 'disabled'); assert.equal(f.entries.length, 0); assert.equal(f.attempts, 0);
});
test('رفض الإذن لا يترك تنبيهات معلقة من الخطة القديمة', async () => {
  const f = fixture({ async checkPermissions() { return { display: 'denied' }; } });
  const r = await f.n.sync(f.s, f.now, E); assert.equal(r.status, 'denied'); assert.equal(f.entries.length, 0);
});
