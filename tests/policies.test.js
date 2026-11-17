// These tests document intentionally UNCHANGED policies pending the owner's choice.
const test = require('node:test'), assert = require('node:assert/strict');
const { E, TODAY: D, NOW: N, fixture } = require('./helpers/harness');
test('سياسة مؤجلة: استثناء الجزء القصير من حد الجلسة لم يتغير', () => {
  const { s } = fixture({ maxSession: 90 }, { lessonMin: 100 });
  assert.equal(E.simulate(s, N).sessions.find(x => x.kind === 'study').minutes, 100);
});
test('سياسة مؤجلة: مراجعة يوم الموعد نفسه ما زالت مسموحة في المحاكاة', () => {
  const { s } = fixture({}, { deadline: E.fmtDay(D + 1) }); s.settings.dayMin[E.dow(D)] = 0;
  const rows = E.simulate(s, N).sessions;
  assert.equal(rows.find(x => x.kind === 'study').date, rows.find(x => x.kind === 'review').date);
});
test('سياسة مؤجلة: التقرير ما زال يعتمد أسبوع الموعد المخطط', () => {
  const { s } = fixture(); const p = E.replan(s, N).state, x = p.sessions.find(x => x.kind === 'study');
  E.completeSession(p, x.id, { day: D + 7, min: 960 });
  assert.equal(E.weeklyReport(p, E.weekStart(D), { day: D + 7, min: 960 }).doneMin, 60);
});
