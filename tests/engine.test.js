const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../www/js/engine.js');

const TODAY = E.parseDay('2026-11-11'); // الأربعاء
const NOW = { day: TODAY, min: 8 * 60 }; // 8 صباحاً، قبل وقت الدراسة (4 م)

function mkState(over) {
  const st = E.newState();
  st.settings.dayMin = [120, 120, 120, 120, 120, 120, 120];
  if (over) Object.assign(st.settings, over);
  return st;
}
function addSub(st, o) {
  const sub = E.createSubject(Object.assign({
    name: 'م', importance: 2, mode: 'self', backlog: 3, lessonMin: 90, teacherPerWeek: 0,
    deadline: E.fmtDay(TODAY + 10)
  }, o), TODAY);
  st.subjects.push(sub);
  return sub;
}
const sum = (l) => l.reduce((t, s) => t + s.minutes, 0);

test('التواريخ: يوم الأسبوع وبداية الأسبوع (السبت)', () => {
  assert.equal(E.dow(TODAY), 3);                         // الأربعاء
  assert.equal(E.fmtDay(E.weekStart(TODAY)), '2026-11-07'); // السبت
  assert.equal(E.dow(E.weekStart(TODAY)), 6);
  assert.equal(E.fmtDay(E.weekStart(E.parseDay('2026-11-07'))), '2026-11-07');
  assert.equal(E.fmtDay(E.weekStart(E.parseDay('2026-11-13'))), '2026-11-07'); // الجمعة
});

test('تنسيق المدد والأوقات بالعربية', () => {
  assert.equal(E.fmtDur(30), 'نصف ساعة');
  assert.equal(E.fmtDur(15), 'ربع ساعة');
  assert.equal(E.fmtDur(45), '45 دقيقة');
  assert.equal(E.fmtDur(60), 'ساعة');
  assert.equal(E.fmtDur(90), 'ساعة ونصف');
  assert.equal(E.fmtDur(120), 'ساعتان');
  assert.equal(E.fmtDur(150), 'ساعتان ونصف');
  assert.equal(E.fmtDur(180), '3 ساعات');
  assert.equal(E.fmtDur(80), 'ساعة و20 دقيقة');
  assert.equal(E.fmtDur(11 * 60), '11 ساعة');
  assert.equal(E.fmtTime(16 * 60), '4:00 م');
  assert.equal(E.fmtTime(0), '12:00 ص');
  assert.equal(E.fmtTime(12 * 60 + 5), '12:05 م');
  assert.equal(E.fmtLessons(1), 'درس واحد');
  assert.equal(E.fmtLessons(2), 'درسان');
  assert.equal(E.fmtLessons(5), '5 دروس');
  assert.equal(E.fmtLessons(12), '12 درساً');
});

test('خطة ممكنة: كل الدروس والمراجعات تُجدول ضمن الموعد والسعة', () => {
  const st = mkState();
  const sub = addSub(st, { backlog: 3, lessonMin: 90 });
  const r = E.replan(st, NOW);
  const a = r.analysis.subjects[sub.id];
  assert.equal(a.ok, true);
  const s = r.state.sessions;
  const study = s.filter((x) => x.kind === 'study');
  const review = s.filter((x) => x.kind === 'review');
  assert.equal(sum(study), 270);
  assert.equal(sum(review), 90);              // 3 مراجعات × نصف ساعة
  assert.ok(s.every((x) => x.minutes <= 90));  // لا جلسة أطول من 90
  assert.ok(s.every((x) => x.date <= sub.deadline));
  // لا تتجاوز السعة اليومية ولا تتداخل
  const byDay = {};
  s.forEach((x) => (byDay[x.date] = (byDay[x.date] || []).concat(x)));
  Object.values(byDay).forEach((list) => {
    assert.ok(sum(list) <= 120);
    list.sort((a, b) => a.start - b.start);
    for (let i = 1; i < list.length; i++) assert.ok(list[i].start >= list[i - 1].start + list[i - 1].minutes);
  });
});

test('المراجعة تأتي بعد يوم من إنهاء الدرس على الأقل', () => {
  const st = mkState();
  addSub(st, { backlog: 2, lessonMin: 60 });
  const r = E.replan(st, NOW);
  r.state.sessions.filter((x) => x.kind === 'review').forEach((rv) => {
    const lastStudy = r.state.sessions.filter((x) => x.kind === 'study' && x.lessonId === rv.lessonId)
      .map((x) => x.date).sort().pop();
    assert.ok(rv.date > lastStudy, 'المراجعة ' + rv.date + ' بعد ' + lastStudy);
  });
});

test('خطة مستحيلة: تنبيه + خيارات (تمديد/ساعات/تقليل) والخيارات تنجح فعلاً', () => {
  const st = mkState({ dayMin: [60, 60, 60, 60, 60, 60, 60] });
  const sub = addSub(st, { backlog: 10, lessonMin: 90, deadline: E.fmtDay(TODAY + 3) });
  const r = E.replan(st, NOW);
  const a = r.analysis.subjects[sub.id];
  assert.equal(a.ok, false);
  assert.ok(a.shortMin > 0);
  const o = r.analysis.options;
  assert.ok(o.extend.length === 1 && o.extend[0].days > 0);
  assert.ok(o.extraMinPerDay > 0);
  assert.ok(o.reduce[0].lessons > 0 && o.reduce[0].lessons <= 10);

  // تطبيق التمديد
  const s2 = E.clone(st);
  s2.subjects[0].deadline = o.extend[0].newDeadline;
  assert.equal(E.replan(s2, NOW).analysis.subjects[sub.id].ok, true);
  // وتمديد أقل بيوم لا يكفي
  const s3 = E.clone(st);
  s3.subjects[0].deadline = E.fmtDay(E.parseDay(o.extend[0].newDeadline) - 1);
  assert.equal(E.replan(s3, NOW).analysis.subjects[sub.id].ok, false);
  // تطبيق زيادة الساعات
  const s4 = E.clone(st);
  s4.settings.dayMin = s4.settings.dayMin.map((m) => m + o.extraMinPerDay);
  assert.equal(E.replan(s4, NOW).analysis.subjects[sub.id].ok, true);
});

test('الأهمية تؤثر على توزيع الوقت بين المواد', () => {
  const st = mkState({ dayMin: [120, 120, 120, 120, 120, 120, 120] });
  const hi = addSub(st, { name: 'عالية', importance: 3, backlog: 6, lessonMin: 60, deadline: E.fmtDay(TODAY + 20) });
  const lo = addSub(st, { name: 'منخفضة', importance: 1, backlog: 6, lessonMin: 60, deadline: E.fmtDay(TODAY + 20) });
  const r = E.replan(st, NOW);
  const firstWeek = r.state.sessions.filter((x) => x.date <= E.fmtDay(TODAY + 6));
  const mHi = sum(firstWeek.filter((x) => x.subjectId === hi.id));
  const mLo = sum(firstWeek.filter((x) => x.subjectId === lo.id));
  assert.ok(mHi > mLo, `العالية ${mHi} أكثر من المنخفضة ${mLo}`);
  assert.equal(r.analysis.subjects[hi.id].ok && r.analysis.subjects[lo.id].ok, true);
});

test('المواد المتعددة تتقاسم الوقت في اليوم الواحد (تنوّع)', () => {
  const st = mkState({ dayMin: [180, 180, 180, 180, 180, 180, 180] });
  const a = addSub(st, { name: 'أ', backlog: 6, lessonMin: 60, deadline: E.fmtDay(TODAY + 14) });
  const b = addSub(st, { name: 'ب', backlog: 6, lessonMin: 60, deadline: E.fmtDay(TODAY + 14) });
  const r = E.replan(st, NOW);
  const day1 = r.state.sessions.filter((x) => x.date === E.fmtDay(TODAY));
  const ids = new Set(day1.map((x) => x.subjectId));
  assert.ok(ids.has(a.id) && ids.has(b.id));
});

test('وضع المدرّس: دروس المدرّس الجديدة لا تُجدول قبل وصولها', () => {
  const st = mkState();
  const sub = addSub(st, { mode: 'teacher', backlog: 2, teacherPerWeek: 2, lessonMin: 60, deadline: E.fmtDay(TODAY + 24) });
  const teacher = sub.lessons.filter((l) => l.source === 'teacher');
  assert.ok(teacher.length >= 6);
  assert.equal(teacher[0].availableFrom, '2026-11-14'); // السبت القادم
  const r = E.replan(st, NOW);
  r.state.sessions.filter((x) => x.kind === 'study').forEach((x) => {
    const l = E.findLesson(r.state.subjects[0], x.lessonId);
    if (l.availableFrom) assert.ok(x.date >= l.availableFrom, `${x.date} >= ${l.availableFrom}`);
  });
  assert.equal(r.analysis.subjects[sub.id].ok, true);
});

test('سعة اليوم الحالي تُحسب من الوقت الحالي', () => {
  const st = mkState({ dayMin: [180, 180, 180, 180, 180, 180, 180] });
  addSub(st, { backlog: 8, lessonMin: 60, deadline: E.fmtDay(TODAY + 30) });
  const now = { day: TODAY, min: 18 * 60 }; // 6 م، والدراسة تبدأ 4 م وتنتهي 7 م
  const r = E.replan(st, now);
  const today = r.state.sessions.filter((x) => x.date === E.fmtDay(TODAY));
  assert.ok(sum(today) <= 60, 'متبقي ساعة فقط: ' + sum(today));
  assert.ok(today.every((x) => x.start >= 18 * 60));
});

test('بعد الوقت المخصص لليوم لا جلسات اليوم', () => {
  const st = mkState();
  addSub(st, { backlog: 3 });
  const r = E.replan(st, { day: TODAY, min: 22 * 60 });
  assert.equal(r.state.sessions.filter((x) => x.date === E.fmtDay(TODAY)).length, 0);
});

test('إعادة الجدولة: جلسات الأمس غير المنجزة تصير فائتة ويُعاد توزيعها', () => {
  const st = mkState();
  const sub = addSub(st, { backlog: 4, lessonMin: 60, deadline: E.fmtDay(TODAY + 14) });
  const first = E.replan(st, { day: TODAY, min: 8 * 60 }).state;
  const planned = first.sessions.filter((x) => x.kind === 'study').length;
  assert.ok(E.needsReplan(first, { day: TODAY + 2, min: 8 * 60 }));

  const r = E.replan(first, { day: TODAY + 2, min: 8 * 60 });
  const missed = r.state.sessions.filter((x) => x.status === 'missed');
  assert.ok(missed.length > 0);
  assert.equal(r.diff.missed, missed.length);
  // لا جلسة قادمة في الماضي
  r.state.sessions.filter((x) => x.status === 'pending').forEach((x) => assert.ok(x.date >= E.fmtDay(TODAY + 2)));
  // كل الزمن المتبقي للدروس موزّع من جديد
  const left = r.state.sessions.filter((x) => x.kind === 'study' && x.status === 'pending');
  assert.equal(sum(left), 4 * 60);
  assert.equal(r.analysis.subjects[sub.id].ok, true);
  assert.ok(r.state.sessions.filter((x) => x.kind === 'study').length >= planned);
});

test('إنجاز جلسة يكمل الدرس، واختيار «صعب» يضيف مراجعة ساعة', () => {
  const st = mkState();
  const sub = addSub(st, { backlog: 2, lessonMin: 60 });
  let s = E.replan(st, NOW).state;
  const first = s.sessions.filter((x) => x.kind === 'study').sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))[0];
  const res = E.completeSession(s, first.id, NOW);
  assert.equal(res.lessonCompleted, true);
  E.setDifficulty(s, sub.id, res.lessonId, 'hard');
  const l = E.findLesson(s.subjects[0], res.lessonId);
  assert.deepEqual(l.review, { min: 60, status: 'pending' });
  s = E.replan(s, NOW).state;
  const rev = s.sessions.filter((x) => x.kind === 'review' && x.lessonId === res.lessonId);
  assert.equal(sum(rev), 60);
  // لا تتكرر جلسة دراسة للدرس المنجز
  assert.equal(s.sessions.filter((x) => x.kind === 'study' && x.lessonId === res.lessonId && x.status === 'pending').length, 0);
});

test('درس سهل أو متوسط: مراجعة نصف ساعة', () => {
  const st = mkState();
  const sub = addSub(st, { backlog: 1, lessonMin: 60 });
  E.setLessonDone(st, sub.id, sub.lessons[0].id, true, NOW);
  E.setDifficulty(st, sub.id, sub.lessons[0].id, 'medium');
  assert.equal(sub.lessons[0].review.min, 30);
});

test('تراجع عن إنجاز جلسة', () => {
  const st = mkState();
  const sub = addSub(st, { backlog: 1, lessonMin: 60 });
  const s = E.replan(st, NOW).state;
  const first = s.sessions.find((x) => x.kind === 'study');
  const res = E.completeSession(s, first.id, NOW);
  E.setDifficulty(s, sub.id, res.lessonId, 'easy');
  E.undoSession(s, first.id);
  const l = s.subjects[0].lessons[0];
  assert.equal(l.done, false);
  assert.equal(l.review, null);
  assert.equal(l.doneMin, 0);
});

test('درس يُقسم لأجزاء إذا زاد عن أقصى جلسة، والأجزاء مرقّمة', () => {
  const st = mkState({ maxSession: 60, dayMin: [180, 180, 180, 180, 180, 180, 180] });
  addSub(st, { backlog: 1, lessonMin: 150, deadline: E.fmtDay(TODAY + 6) });
  const r = E.replan(st, NOW).state;
  const parts = r.sessions.filter((x) => x.kind === 'study');
  assert.ok(parts.length >= 3);
  assert.ok(parts.every((p) => p.parts === parts.length));
  assert.equal(sum(parts), 150);
});

test('موعد فات: كل المتبقي يظهر كنقص', () => {
  const st = mkState();
  const sub = addSub(st, { backlog: 3, deadline: E.fmtDay(TODAY - 2) });
  const a = E.analyze(st, NOW).subjects[sub.id];
  assert.equal(a.ok, false);
  assert.equal(a.deadlinePassed, true);
});

test('لا أيام دراسة: لا جلسات، ولا انهيار', () => {
  const st = mkState({ dayMin: [0, 0, 0, 0, 0, 0, 0] });
  addSub(st, { backlog: 2 });
  const r = E.replan(st, NOW);
  assert.equal(r.state.sessions.length, 0);
  assert.equal(r.analysis.options.extraMinPerDay, null);
});

test('تعديل المادة: تغيير عدد المتراكم يحافظ على الدروس المنجزة', () => {
  const st = mkState();
  const sub = addSub(st, { backlog: 4, lessonMin: 60 });
  E.setLessonDone(st, sub.id, sub.lessons[0].id, true, NOW);
  E.updateSubject(sub, { name: sub.name, importance: 2, mode: 'self', lessonMin: 45, deadline: sub.deadline, backlog: 2 }, TODAY);
  assert.equal(sub.lessons.length, 3);               // 1 منجز + 2 متراكم
  assert.equal(sub.lessons[0].min, 60);              // المنجز لم يتغير
  assert.ok(sub.lessons.slice(1).every((l) => l.min === 45));
});

test('التقرير الأسبوعي', () => {
  const st = mkState();
  const sub = addSub(st, { backlog: 3, lessonMin: 60, deadline: E.fmtDay(TODAY + 6) });
  let s = E.replan(st, NOW).state;
  const todays = s.sessions.filter((x) => x.date === E.fmtDay(TODAY) && x.kind === 'study');
  assert.ok(todays.length > 0);
  E.completeSession(s, todays[0].id, NOW);
  const ws = E.weekStart(TODAY);
  const rep = E.weeklyReport(s, ws, NOW);
  assert.ok(rep.doneMin >= 60);
  assert.ok(rep.percent !== null && rep.percent > 0 && rep.percent <= 100);
  assert.equal(rep.bySubject[0].subjectId, sub.id);
  assert.ok(rep.next.count >= 0);
});

test('لا تغيّر في المدخلات الأصلية عند replan (نقاء الدالة)', () => {
  const st = mkState();
  addSub(st, { backlog: 3 });
  const before = JSON.stringify(st);
  E.replan(st, NOW);
  assert.equal(JSON.stringify(st), before);
});

test('أداء: خطة كبيرة (6 مواد × 20 درساً) تُحسب بسرعة', () => {
  const st = mkState({ dayMin: [240, 240, 240, 240, 240, 240, 240] });
  ['أ', 'ب', 'ج', 'د', 'هـ', 'و'].forEach((n, i) => addSub(st, {
    name: n, importance: (i % 3) + 1, mode: i % 2 ? 'teacher' : 'self', backlog: 20, teacherPerWeek: 2,
    lessonMin: 75, deadline: E.fmtDay(TODAY + 90)
  }));
  const t0 = Date.now();
  const r = E.replan(st, NOW);
  const ms = Date.now() - t0;
  assert.ok(ms < 3000, 'استغرق ' + ms + 'ms');
  console.log('   (6 مواد، ' + r.state.sessions.length + ' جلسة، ' + ms + 'ms)');
});
