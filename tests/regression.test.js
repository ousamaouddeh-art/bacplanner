const test = require('node:test');
const assert = require('node:assert/strict');
const { E, TODAY: D, NOW: N, fixture, harness } = require('./helpers/harness');
const pending = (s, kind) => s.sessions.filter(x => x.status === 'pending' && (!kind || x.kind === kind));
const sum = rows => rows.reduce((n, x) => n + x.minutes, 0);
const chronological = rows => rows.slice().sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
function planned(settings, options) { return E.replan(fixture(settings, options).s, N).state; }

test('الاستراحات لا تتجاوز نافذة اليوم', () => {
  const s = planned({ dayMin: Array(7).fill(120), maxSession: 60, breakMin: 30 }, { backlog: 3 });
  const rows = s.sessions.filter(x => x.date === E.fmtDay(D));
  assert.ok(rows.length); assert.ok(rows.every(x => x.start + x.minutes <= 1080));
});
test('لا جلسات بتاريخ اليوم تبدأ بعد منتصف الليل', () => {
  const s = planned({ dayMin: Array(7).fill(60), startMin: 1380, maxSession: 30, breakMin: 30 }, { backlog: 3, lessonMin: 30 });
  assert.ok(s.sessions.every(x => x.start >= 0 && x.start < 1440 && x.start + x.minutes <= 1440));
});
test('تغطية أوقات وأحجام جلسات متعددة دون تجاوز النافذة', () => {
  for (const startMin of [0, 960, 1180, 1380]) for (const breakMin of [0, 10, 30]) for (const available of [30, 75, 180]) {
    const { s } = fixture({ startMin, breakMin, dayMin: Array(7).fill(available), maxSession: 45 }, { backlog: 3, lessonMin: 75 });
    const r = E.simulate(s, { day: D, min: 0 });
    const rows = chronological(r.sessions);
    for (const x of rows) assert.ok(x.start >= startMin && x.start + x.minutes <= Math.min(1440, startMin + available));
    for (let i = 1; i < rows.length; i++) if (rows[i].date === rows[i - 1].date) assert.ok(rows[i].start >= rows[i - 1].start + rows[i - 1].minutes + breakMin);
  }
});
test('التقريب لخمس دقائق لا يزيد الوقت المتبقي', () => {
  const { s } = fixture({ dayMin: Array(7).fill(60) }, { backlog: 4 });
  const r = E.simulate(s, { day: D, min: 977 });
  assert.ok(r.sessions.filter(x => x.date === E.fmtDay(D)).every(x => x.start >= 980 && x.start + x.minutes <= 1020));
});
test('المراجعة المجزأة تحتفظ بالدقائق المتبقية', () => {
  let { s, sub } = fixture({ maxSession: 30, reviewHardMin: 90 });
  E.setLessonDone(s, sub.id, sub.lessons[0].id, true, N); E.setDifficulty(s, sub.id, sub.lessons[0].id, 'hard');
  s = E.replan(s, N).state;
  const first = chronological(pending(s, 'review'))[0];
  E.completeSession(s, first.id, { day: D + 1, min: 990 });
  s = E.replan(s, { day: D + 1, min: 990 }).state;
  assert.equal(s.subjects[0].lessons[0].review.doneMin, 30);
  assert.equal(s.subjects[0].lessons[0].review.status, 'pending');
  assert.equal(sum(pending(s, 'review')), 60);
});
test('التراجع عن جزء من مراجعة يعيد مدته فقط', () => {
  let { s, sub } = fixture({ maxSession: 30, reviewHardMin: 90 });
  const l = sub.lessons[0]; E.setLessonDone(s, sub.id, l.id, true, N); E.setDifficulty(s, sub.id, l.id, 'hard');
  s = E.replan(s, N).state; const r = chronological(pending(s, 'review'));
  E.completeSession(s, r[0].id, N); E.completeSession(s, r[1].id, N);
  E.undoSession(s, r[0].id); s = E.replan(s, N).state;
  assert.equal(s.subjects[0].lessons[0].review.doneMin, 30); assert.equal(sum(pending(s, 'review')), 60);
});
test('لا تكرار لإنجاز الجلسة نفسها', () => {
  const s = planned(); const x = pending(s, 'study')[0];
  E.completeSession(s, x.id, N); E.completeSession(s, x.id, N);
  assert.equal(s.subjects[0].lessons[0].doneMin, 60);
});
test('تراجع مراجعة قديمة لا يؤثر في دورة مراجعة جديدة', () => {
  let s = planned(); const l = s.subjects[0].lessons[0], sub = s.subjects[0];
  E.setLessonDone(s, sub.id, l.id, true, N); s = E.replan(s, N).state;
  const rv = pending(s, 'review')[0]; E.completeSession(s, rv.id, N);
  E.requestReview(s, sub.id, l.id, 'hard');
  const before = JSON.stringify(s.subjects[0].lessons[0].review);
  assert.equal(E.undoSession(s, rv.id), false);
  assert.equal(JSON.stringify(s.subjects[0].lessons[0].review), before);
});
test('إنجاز الدرس ينشئ المراجعة قبل اختيار الصعوبة', () => {
  let s = planned(); E.completeSession(s, pending(s, 'study')[0].id, N); s = E.replan(s, N).state;
  assert.equal(s.subjects[0].lessons[0].review.status, 'pending'); assert.equal(sum(pending(s, 'review')), 30);
});
test('إغلاق الملاحظة لا يفقد المراجعة', () => {
  const h = harness(planned()); h.click('toggle', { 'data-id': pending(h.state, 'study')[0].id });
  h.click('close-sheet'); h.click('replan-now');
  assert.equal(h.state.subjects[0].lessons[0].done, true); assert.equal(sum(pending(h.state, 'review')), 30);
});
test('التراجع من الواجهة يعيد التخطيط والتنبيهات', () => {
  let s = planned(); const f = pending(s, 'study')[0]; E.completeSession(s, f.id, N); s = E.replan(s, N).state;
  const h = harness(s), count = h.syncs.length; h.click('toggle', { 'data-id': f.id });
  assert.equal(h.state.subjects[0].lessons[0].done, false); assert.equal(h.state.subjects[0].lessons[0].review, null);
  const lastStudy = chronological(pending(h.state, 'study')).at(-1), firstReview = chronological(pending(h.state, 'review'))[0];
  assert.ok(lastStudy && firstReview && firstReview.date >= lastStudy.date);
  assert.ok(h.syncs.length > count);
});
test('الانتقال من الملاحظة للصعوبة لا ينشئ رجوعاً غير متزامن', () => {
  const h = harness(planned()); h.click('toggle', { 'data-id': pending(h.state, 'study')[0].id });
  const before = h.history.backs, pushes = h.history.pushes;
  h.click('skip-note'); assert.equal(h.history.backs, before); assert.equal(h.history.pushes, pushes);
  assert.ok(h.nodes['sheet-root'].innerHTML.includes('كيف كان الدرس'));
});
test('تغيير الاسم يحفظ دروس المدرس وهويتها', () => {
  const { s, sub } = fixture({}, { mode: 'teacher', teacherPerWeek: 2, backlog: 0 });
  const ids = sub.lessons.map(x => x.id);
  E.updateSubject(sub, { name: 'اسم جديد', importance: 2, mode: 'teacher', teacherPerWeek: 2, lessonMin: 60, deadline: sub.deadline, backlog: 0 }, D + 8);
  assert.deepEqual(sub.lessons.map(x => x.id), ids);
});
test('تغيير معدل المدرس يحتفظ بما وصل وبالدروس المستقبلية المبدوءة', () => {
  const { sub } = fixture({}, { mode: 'teacher', teacherPerWeek: 2, backlog: 0, deadline: E.fmtDay(D + 30) });
  const arrived = sub.lessons.filter(x => E.parseDay(x.availableFrom) <= D + 8).map(x => x.id);
  const future = sub.lessons.find(x => E.parseDay(x.availableFrom) > D + 8); future.doneMin = 15;
  const date = future.availableFrom;
  E.updateSubject(sub, { name: sub.name, mode: 'teacher', teacherPerWeek: 1, lessonMin: 60, deadline: sub.deadline }, D + 8);
  assert.ok(arrived.every(id => sub.lessons.some(x => x.id === id)));
  assert.equal(sub.lessons.filter(x => x.availableFrom === date).length, 1); assert.ok(sub.lessons.some(x => x.id === future.id));
});
test('الموعد الفارغ والمستحيل لا يمران من التحقق', () => {
  for (const deadline of ['', '2026-02-30', '2026-13-02', 'abc', null]) assert.equal(Number.isNaN(E.parseDay(deadline)), true);
  const h = harness(E.newState(), { hash: '#/subject-form/new' });
  h.input({ 'data-bind': 'name' }, 'مادة'); h.input({ 'data-bind': 'deadline' }, ''); h.click('save-subject');
  assert.equal(h.state.subjects.length, 0); assert.ok(h.nodes.app.innerHTML.includes('موعداً صالحاً'));
});
test('خفض المدة دون المنجز مرفوض', () => {
  const s = planned({ maxSession: 60 }, { lessonMin: 90 }); const sub = s.subjects[0], l = sub.lessons[0];
  E.completeSession(s, chronological(pending(s, 'study'))[0].id, N);
  assert.equal(E.setLessonDuration(s, sub.id, l.id, 30), false); assert.equal(l.min, 90);
  assert.equal(E.setLessonDuration(s, sub.id, l.id, 60), true); assert.equal(l.done, true); assert.ok(l.review);
});
test('حذف الدرس يحفظ سجله دون جلسات منتظرة يتيمة', () => {
  let s = planned(); const f = pending(s, 'study')[0]; E.completeSession(s, f.id, N);
  E.deleteLesson(s, f.subjectId, f.lessonId); s = E.replan(s, N).state;
  assert.equal(s.subjects[0].lessons.length, 0); assert.equal(E.findLesson(s.subjects[0], f.lessonId).archived, true);
  assert.equal(pending(s).length, 0); assert.ok(s.sessions.some(x => x.id === f.id));
  assert.equal(E.undoSession(s, f.id), false); assert.doesNotThrow(() => E.normalizeState(s));
});
test('مسح الملاحظة يزيلها من الدرس والجلسة', () => {
  const s = planned(); s.subjects[0].lessons[0].memo = 'ملاحظة';
  const h = harness(s); const id = pending(h.state, 'study')[0].id;
  h.click('toggle', { 'data-id': id }); h.nodes['s-note'] = { value: '' }; h.click('save-note');
  assert.equal(h.state.subjects[0].lessons[0].memo, undefined); assert.equal(h.state.sessions.find(x => x.id === id).note, undefined);
});
test('التحميل يسوي مصفوفة جلسات ناقصة ويحفظ الأصل قبل الترحيل', () => {
  const { s } = fixture(); delete s.sessions;
  const raw = JSON.stringify(s), h = harness(raw);
  assert.ok(Array.isArray(h.state.sessions)); assert.equal(h.values.get('bacplanner.v1.backup'), raw);
});
test('البيانات التالفة لا تستبدل أو تمسح عند الإقلاع', () => {
  const raw = '{invalid json', h = harness(raw);
  assert.equal(h.values.get('bacplanner.v1'), raw); assert.ok(h.nodes.app.innerHTML.includes('استرجاع البيانات'));
  h.click('new-subject'); assert.equal(h.values.get('bacplanner.v1'), raw);
});
test('المعرفات غير الآمنة مرفوضة عند الاستيراد', () => {
  const { s } = fixture(); s.subjects[0].id = '\"><img src=x onerror=alert(1)>';
  assert.throws(() => E.normalizeState(s));
});
test('الترحيل يصلح مراجعة جزئية قديمة عند وجود سجل كاف', () => {
  const s = planned({ maxSession: 30 }); const l = s.subjects[0].lessons[0];
  l.done = true; l.doneMin = l.min; l.review = { min: 90, status: 'done' };
  s.sessions = [0, 1, 2].map((i) => ({ id: 'review_' + i, subjectId: s.subjects[0].id, lessonId: l.id, kind: 'review', date: E.fmtDay(D + 1), start: 960 + 40 * i, minutes: 30, status: i === 0 ? 'done' : 'pending' }));
  const fixed = E.normalizeState(s); assert.equal(fixed.subjects[0].lessons[0].review.doneMin, 30); assert.equal(fixed.subjects[0].lessons[0].review.status, 'pending');
});
test('دورة تصدير واستيراد البيانات تحفظ المواد والملاحظات', () => {
  const s = planned(); s.subjects[0].lessons[0].memo = 'للمراجعة';
  const h = harness(E.newState()); h.import(JSON.stringify(s)); h.click('confirm-import');
  assert.equal(h.state.subjects[0].id, s.subjects[0].id); assert.equal(h.state.subjects[0].lessons[0].memo, 'للمراجعة');
});
test('استرجاع نسخة سليمة لا يمسح الأصل التالف قبل تأكيد المستخدم', () => {
  const raw = 'invalid', backup = planned(), h = harness(raw, { backup });
  h.click('restore-backup'); assert.equal(h.values.get('bacplanner.v1'), raw);
  h.click('confirm-import'); assert.equal(h.state.subjects[0].id, backup.subjects[0].id);
  assert.equal(h.values.get('bacplanner.v1.recovery'), raw);
});
test('فشل التخزين لا يستبدل البيانات المحفوظة عند الاستيراد', () => {
  const original = planned(), h = harness(original); const saved = h.values.get('bacplanner.v1');
  h.import(JSON.stringify(E.newState())); h.failWrites(true); h.click('confirm-import');
  assert.equal(h.values.get('bacplanner.v1'), saved); assert.equal(h.state.subjects.length, 1);
});
test('مسح البيانات يمسح النسخة السابقة ويزامن تنبيهات فارغة', () => {
  const h = harness(planned()), count = h.syncs.length;
  h.click('do-reset'); assert.equal(h.state.subjects.length, 0); assert.equal(h.values.has('bacplanner.v1.backup'), false);
  assert.ok(h.syncs.length > count); assert.equal(h.syncs.at(-1).sessions.length, 0);
});
test('ترحيل البيانات مرتين لا يغير هوية المراجعة ولا يسقط البيانات', () => {
  const s = planned(); E.completeSession(s, pending(s, 'study')[0].id, N);
  const first = E.normalizeState(s), second = E.normalizeState(first);
  assert.deepEqual(second, first);
});
test('خفض عدد الدروس لا يكسر مراجع الجلسات الفائتة', () => {
  const s = planned({}, { backlog: 3 }), sub = s.subjects[0];
  const removed = sub.lessons.at(-1); const session = s.sessions.find(x => x.lessonId === removed.id && x.kind === 'study');
  session.status = 'missed'; E.setBacklog(sub, 1);
  const result = E.replan(s, N).state;
  assert.equal(E.findLesson(result.subjects[0], removed.id).archived, true);
  assert.ok(result.sessions.every(x => E.findLesson(result.subjects[0], x.lessonId)));
});
test('حذف درس من الواجهة يتطلب تأكيداً ويحفظ السجل', () => {
  const h = harness(planned()), sub = h.state.subjects[0], id = sub.lessons[0].id;
  h.click('lesson-delete', { 'data-sid': sub.id, 'data-id': id });
  assert.equal(h.state.subjects[0].lessons.length, 1);
  h.click('do-lesson-delete', { 'data-sid': sub.id, 'data-id': id });
  assert.equal(h.state.subjects[0].lessons.length, 0); assert.equal(h.state.subjects[0].archivedLessons[0].id, id);
});
test('فشل الحفظ يبقى ظاهراً في شاشة الإعدادات', () => {
  const h = harness(planned()); h.failWrites(true); h.route('#/settings');
  h.click('preset', { 'data-min': '120' }); assert.ok(h.nodes.app.innerHTML.includes('role="alert"'));
});
test('النسخة السابقة للترحيل تبقى متاحة بعد تغييرات لاحقة', () => {
  const s = planned(), raw = JSON.stringify(s), h = harness(raw);
  h.click('preset', { 'data-min': '120' });
  assert.equal(h.values.get('bacplanner.v1.recovery'), raw);
});
