/* محرك الجدولة — بدون أي اعتماد على المتصفح أو أندرويد، فيعمل في الاختبارات أيضاً.
 * مكتوب بصيغة تناسب WebView قديم (بدون ?. أو ?? أو spread للكائنات).
 *
 * الأيام تُخزَّن كنص "YYYY-MM-DD" وتُحسب داخلياً كرقم (عدد الأيام منذ 1970).
 * الوقت داخل اليوم بالدقائق منذ منتصف الليل.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DAY_MS = 86400000;
  var MIN_CHUNK = 15;           // أقصر جلسة نقبلها (إلا إذا كان المتبقي من الدرس أقل)
  var HORIZON_DAYS = 450;       // سقف أيام الجدولة

  /* ============ التواريخ ============ */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function parseDay(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return NaN;
    var p = s.split('-'), y = +p[0], m = +p[1], day = +p[2];
    if (y < 1000 || m < 1 || m > 12 || day < 1 || day > 31) return NaN;
    var stamp = Date.UTC(y, m - 1, day), d = new Date(stamp);
    if (d.getUTCFullYear() !== y || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== day) return NaN;
    return Math.round(stamp / DAY_MS);
  }
  function fmtDay(n) {
    var d = new Date(n * DAY_MS);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  // 0 = الأحد ... 6 = السبت
  function dow(n) { return (((n + 4) % 7) + 7) % 7; }
  // الأسبوع يبدأ يوم السبت
  function weekStart(n) { return n - ((dow(n) + 1) % 7); }
  function nowInfo(date) {
    date = date || new Date();
    return {
      day: parseDay(date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())),
      min: date.getHours() * 60 + date.getMinutes()
    };
  }

  /* ============ التنسيق بالعربية ============ */
  var DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  var MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب',
    'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];

  function plural(n, one, two, few, many) {
    if (n === 1) return one;
    if (n === 2) return two;
    if (n >= 3 && n <= 10) return n + ' ' + few;
    return n + ' ' + many;
  }
  function fmtLessons(n) {
    if (n === 0) return 'لا دروس';
    return plural(n, 'درس واحد', 'درسان', 'دروس', 'درساً');
  }
  function fmtDays(n) { return plural(n, 'يوم', 'يومان', 'أيام', 'يوماً'); }
  function fmtDur(min) {
    min = Math.round(min);
    if (min <= 0) return '0 دقيقة';
    var h = Math.floor(min / 60), m = min % 60;
    if (h === 0) {
      if (m === 30) return 'نصف ساعة';
      if (m === 15) return 'ربع ساعة';
      return plural(m, 'دقيقة', 'دقيقتان', 'دقائق', 'دقيقة');
    }
    var hs = plural(h, 'ساعة', 'ساعتان', 'ساعات', 'ساعة');
    if (m === 0) return hs;
    if (m === 30) return hs + ' ونصف';
    if (m === 15) return hs + ' وربع';
    return hs + ' و' + plural(m, 'دقيقة', 'دقيقتان', 'دقائق', 'دقيقة');
  }
  // 12 ساعة مع ص/م
  function fmtTime(min) {
    min = ((min % 1440) + 1440) % 1440;
    var h = Math.floor(min / 60), m = min % 60;
    var suffix = h >= 12 ? 'م' : 'ص';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ':' + pad(m) + ' ' + suffix;
  }
  function fmtDate(n) {
    var d = new Date(n * DAY_MS);
    return DAY_NAMES[dow(n)] + ' ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()];
  }
  function fmtDateShort(n) {
    var d = new Date(n * DAY_MS);
    return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()];
  }
  function relDay(n, today) {
    var diff = n - today;
    if (diff === 0) return 'اليوم';
    if (diff === 1) return 'غداً';
    if (diff === -1) return 'أمس';
    return fmtDate(n);
  }

  /* ============ الحالة الافتراضية ============ */
  function defaultSettings() {
    return {
      // دقائق الدراسة المتاحة لكل يوم: [الأحد .. السبت]
      dayMin: [180, 180, 180, 180, 180, 120, 180],
      startMin: 16 * 60,        // وقت بدء الدراسة
      breakMin: 10,             // استراحة بين الجلسات
      maxSession: 90,           // أطول جلسة متواصلة
      remindBefore: 10,         // التذكير قبل الجلسة بدقائق (0 = إيقاف)
      reviewEasyMin: 30,        // مراجعة الدرس السهل أو المتوسط
      reviewHardMin: 60         // مراجعة الدرس الصعب
    };
  }
  function newState() {
    return { version: 1, settings: defaultSettings(), subjects: [], sessions: [], meta: { finish: {}, counter: 0 } };
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function normalizeState(input) {
    if (!input || input.version !== 1 || !Array.isArray(input.subjects)) throw new Error('INVALID_STATE');
    var st = clone(input), defaults = defaultSettings(), migrated = !st.meta || st.meta.repairRevision !== 2;
    if (!st.settings || typeof st.settings !== 'object' || Array.isArray(st.settings)) st.settings = {};
    function num(v, fallback, low, high) {
      return typeof v === 'number' && isFinite(v) ? Math.max(low, Math.min(high, Math.round(v))) : fallback;
    }
    st.settings.dayMin = Array.isArray(st.settings.dayMin) && st.settings.dayMin.length === 7 ? st.settings.dayMin.map(function (v, i) { return num(v, defaults.dayMin[i], 0, 720); }) : defaults.dayMin;
    Object.keys(defaults).forEach(function (key) {
      if (key !== 'dayMin') st.settings[key] = num(st.settings[key], defaults[key], key === 'maxSession' || key === 'reviewEasyMin' || key === 'reviewHardMin' ? 15 : 0, key === 'startMin' ? 1200 : 720);
    });
    if (st.sessions == null) st.sessions = [];
    if (!Array.isArray(st.sessions)) throw new Error('INVALID_SESSIONS');
    if (!st.meta || typeof st.meta !== 'object' || Array.isArray(st.meta)) st.meta = {};
    if (!st.meta.finish || typeof st.meta.finish !== 'object') st.meta.finish = {};
    var subs = {}, ids = {};
    function safeId(id) { return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id) && id !== '__proto__' && id !== 'constructor' && id !== 'prototype'; }
    st.subjects.forEach(function (sub) {
      if (!sub || !safeId(sub.id) || ids[sub.id] || typeof sub.name !== 'string' || !isFinite(parseDay(sub.deadline)) || !Array.isArray(sub.lessons)) throw new Error('INVALID_SUBJECT');
      ids[sub.id] = true; subs[sub.id] = sub;
      sub.lessonMin = num(sub.lessonMin, 60, 15, 360);
      sub.importance = num(sub.importance, 2, 1, 3);
      sub.teacherPerWeek = num(sub.teacherPerWeek, 0, 0, 14);
      sub.mode = sub.mode === 'teacher' ? 'teacher' : 'self';
      if (sub.archivedLessons == null) sub.archivedLessons = [];
      if (!Array.isArray(sub.archivedLessons)) throw new Error('INVALID_LESSONS');
      sub.lessons.concat(sub.archivedLessons).forEach(function (l) {
        if (!l || !safeId(l.id) || ids[l.id] || typeof l.title !== 'string') throw new Error('INVALID_LESSON');
        ids[l.id] = true;
        l.min = num(l.min, sub.lessonMin, 15, 360);
        l.doneMin = num(l.doneMin, l.done ? l.min : 0, 0, l.min);
        l.done = !!l.done || l.doneMin >= l.min;
        if (l.done) l.doneMin = l.min;
        l.doneDate = isFinite(parseDay(l.doneDate)) ? l.doneDate : null;
        if (l.availableFrom && !isFinite(parseDay(l.availableFrom))) throw new Error('INVALID_RELEASE');
        if (l.done && !l.archived && !l.review) ensureReview(l, st.settings);
        if (l.review) {
          if (typeof l.review !== 'object') throw new Error('INVALID_REVIEW');
          var r = l.review, legacy = typeof r.doneMin !== 'number';
          r.min = num(r.min, reviewMinFor(l, st.settings), 15, 720);
          if (!r.cycle || !safeId(r.cycle)) r.cycle = uid();
          if (legacy) {
            var done = 0, pending = false;
            st.sessions.forEach(function (x) {
              if (x && x.lessonId === l.id && x.kind === 'review') {
                if (x.status === 'pending') pending = true;
                if (x.status === 'done') done += num(x.minutes, 0, 0, 720);
              }
            });
            r.doneMin = r.status === 'done' && !pending ? r.min : Math.min(r.min, done);
          }
          r.doneMin = num(r.doneMin, 0, 0, r.min);
          r.status = r.doneMin >= r.min ? 'done' : 'pending';
        }
      });
      sub.archivedLessons.forEach(function (l) { l.archived = true; });
    });
    st.sessions.forEach(function (x) {
      if (!x || !safeId(x.id) || ids[x.id] || !subs[x.subjectId] || !safeId(x.lessonId) || !isFinite(parseDay(x.date)) || ['pending','done','missed'].indexOf(x.status) === -1 || ['study','review'].indexOf(x.kind) === -1 || typeof x.minutes !== 'number' || !isFinite(x.minutes) || x.minutes <= 0 || typeof x.start !== 'number' || !isFinite(x.start)) throw new Error('INVALID_SESSION');
      ids[x.id] = true;
      var sub = subs[x.subjectId], l = findLesson(sub, x.lessonId);
      if (!l) {
        l = { id: x.lessonId, title: x.lessonTitle || 'درس محذوف', min: x.minutes, doneMin: 0, done: false, doneDate: null, archived: true, review: null };
        sub.archivedLessons.push(l);
      }
      if (x.status === 'done' && (typeof x.doneDay !== 'number' || !isFinite(x.doneDay))) x.doneDay = parseDay(x.date);
      if (x.kind === 'review' && l.review && !x.reviewCycle) x.reviewCycle = l.review.cycle;
    });
    st.sessions = st.sessions.filter(function (x) { var l = findLesson(subs[x.subjectId], x.lessonId); return !(l.archived && x.status === 'pending'); });
    st.meta.repairRevision = 2;
    if (migrated) delete st.meta.lastPlanDay;
    return st;
  }

  var uidCounter = 0;
  function uid() {
    uidCounter++;
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + uidCounter.toString(36);
  }

  /* ============ المواد والدروس ============ */
  function reviewMinFor(lesson, S) {
    return lesson.difficulty === 'hard' ? S.reviewHardMin : S.reviewEasyMin;
  }
  function addLesson(sub, opts) {
    sub.nextNo = (sub.nextNo || sub.lessons.length) + 1;
    var l = {
      id: uid(),
      title: (opts && opts.title) || ('الدرس ' + sub.nextNo),
      min: (opts && opts.min) || sub.lessonMin,
      doneMin: 0,
      done: false,
      doneDate: null,
      difficulty: null,
      review: null,
      availableFrom: (opts && opts.availableFrom) || null,
      source: (opts && opts.source) || 'backlog'
    };
    sub.lessons.push(l);
    return l;
  }
  function isUnstarted(l) { return !l.done && !(l.doneMin > 0) && !l.review; }

  // يضيف دروس المدرّس القادمة أسبوعاً بأسبوع حتى الموعد
  function addTeacherLessons(sub, today) {
    if (sub.mode !== 'teacher' || !(sub.teacherPerWeek > 0)) return;
    var dl = parseDay(sub.deadline);
    var ws = weekStart(today) + 7;
    var guard = 0;
    // دروس تصل قبل الموعد بأقل من يومين لا تُحسب (لا يمكن دراستها فعلياً)
    while (ws <= dl - 2 && guard++ < 80) {
      for (var i = 0; i < sub.teacherPerWeek; i++) {
        addLesson(sub, { source: 'teacher', availableFrom: fmtDay(ws) });
      }
      ws += 7;
    }
  }
  function archiveLesson(sub, lesson, reason) {
    sub.archivedLessons = sub.archivedLessons || [];
    if (!sub.archivedLessons.some(function (x) { return x.id === lesson.id; })) {
      lesson.archived = true; lesson.archiveReason = reason || 'removed'; sub.archivedLessons.push(lesson);
    }
  }
  function pendingBacklog(sub) {
    return sub.lessons.filter(function (l) { return l.source !== 'teacher' && isUnstarted(l); });
  }
  // يضبط عدد الدروس المتراكمة التي لم تبدأ بعد
  function setBacklog(sub, n) {
    var cur = pendingBacklog(sub);
    if (n > cur.length) {
      for (var i = cur.length; i < n; i++) addLesson(sub, { source: 'backlog' });
    } else if (n < cur.length) {
      var drop = cur.slice(n).map(function (l) { return l.id; });
      sub.lessons = sub.lessons.filter(function (l) {
        if (drop.indexOf(l.id) !== -1) { archiveLesson(sub, l); return false; }
        return true;
      });
    }
  }
  function rebuildTeacherLessons(sub, today) {
    // Past arrivals and started/customized future lessons keep their identity.
    var next = [], used = {}, dl = parseDay(sub.deadline);
    sub.lessons.forEach(function (l) {
      if (l.source !== 'teacher' || !l.availableFrom || parseDay(l.availableFrom) <= today || !isUnstarted(l) || l.customized || l.memo) {
        next.push(l);
        if (l.source === 'teacher' && l.availableFrom) used[l.availableFrom] = (used[l.availableFrom] || 0) + 1;
      }
    });
    (sub.archivedLessons || []).forEach(function (l) {
      if (l.source === 'teacher' && l.availableFrom && l.archiveReason !== 'schedule-change') used[l.availableFrom] = (used[l.availableFrom] || 0) + 1;
    });
    var old = sub.lessons;
    sub.lessons = next;
    if (sub.mode !== 'teacher') { old.forEach(function (l) { if (next.indexOf(l) === -1) archiveLesson(sub, l, 'schedule-change'); }); return; }
    for (var ws = weekStart(today) + 7, guard = 0; ws <= dl - 2 && guard++ < 80; ws += 7) {
      var date = fmtDay(ws), slots = Math.max(0, sub.teacherPerWeek - (used[date] || 0));
      var pool = old.filter(function (l) { return l.source === 'teacher' && l.availableFrom === date && next.indexOf(l) === -1; });
      for (var i = 0; i < slots; i++) {
        if (pool[i]) sub.lessons.push(pool[i]);
        else addLesson(sub, { source: 'teacher', availableFrom: date });
      }
    }
    old.forEach(function (l) { if (sub.lessons.indexOf(l) === -1) archiveLesson(sub, l, 'schedule-change'); });
  }
  // يحذف آخر n دروس لم تبدأ (خيار «تقليل الدروس»)
  function dropLastLessons(sub, n) {
    var removed = 0;
    for (var i = sub.lessons.length - 1; i >= 0 && removed < n; i--) {
      if (isUnstarted(sub.lessons[i])) { archiveLesson(sub, sub.lessons[i]); sub.lessons.splice(i, 1); removed++; }
    }
    return removed;
  }
  function createSubject(input, today) {
    var sub = {
      id: uid(),
      name: String(input.name || '').trim(),
      importance: input.importance || 2,
      mode: input.mode === 'self' ? 'self' : 'teacher',
      lessonMin: input.lessonMin || 60,
      teacherPerWeek: input.mode === 'self' ? 0 : (input.teacherPerWeek || 0),
      deadline: input.deadline,
      lessons: [],
      nextNo: 0
    };
    setBacklog(sub, input.backlog || 0);
    addTeacherLessons(sub, today);
    return sub;
  }
  // تعديل بيانات المادة (الأسماء والأرقام) مع الحفاظ على الدروس التي بدأت
  function updateSubject(sub, input, today) {
    var oldMode = sub.mode, oldRate = sub.teacherPerWeek, oldDeadline = sub.deadline;
    sub.name = String(input.name || sub.name).trim();
    sub.importance = input.importance || sub.importance;
    sub.mode = input.mode === 'self' ? 'self' : 'teacher';
    sub.teacherPerWeek = sub.mode === 'self' ? 0 : (input.teacherPerWeek || 0);
    sub.deadline = input.deadline || sub.deadline;
    if (input.lessonMin && input.lessonMin !== sub.lessonMin) {
      sub.lessonMin = input.lessonMin;
      sub.lessons.forEach(function (l) { if (isUnstarted(l)) l.min = sub.lessonMin; });
    }
    if (typeof input.backlog === 'number') setBacklog(sub, input.backlog);
    if (input.mode !== oldMode || sub.teacherPerWeek !== oldRate || sub.deadline !== oldDeadline) rebuildTeacherLessons(sub, today);
  }

  /* ============ المحاكاة (قلب المحرك) ============ */
  function capacityFor(day, now, S, extra, doneByDay) {
    var base = S.dayMin[dow(day)] || 0;
    if (base <= 0) return 0;
    base += extra || 0;
    var cursor = day === now.day ? Math.max(roundUp(now.min, 5), S.startMin) : S.startMin;
    var end = Math.min(1440, S.startMin + base);
    return Math.max(0, Math.min(base - (doneByDay[day] || 0), end - cursor));
  }
  function roundUp(x, step) { return Math.ceil(x / step) * step; }

  function buildUnits(sub, today) {
    var units = [];
    sub.lessons.forEach(function (l, i) {
      var rem = l.done ? 0 : Math.max(0, l.min - (l.doneMin || 0));
      if (rem > 0) {
        units.push({
          type: 'study', lessonId: l.id, rem: rem, order: i,
          release: l.availableFrom ? Math.max(today, parseDay(l.availableFrom)) : today
        });
      }
      if (l.done && l.review && l.review.status === 'pending') {
        units.push({
          type: 'review', lessonId: l.id, rem: Math.max(0, l.review.min - (l.review.doneMin || 0)), reviewCycle: l.review.cycle, order: i,
          release: Math.max(today, l.doneDate ? parseDay(l.doneDate) + 1 : today)
        });
      }
    });
    return units;
  }

  function nextUnit(x, day) {
    var best = null;
    for (var i = 0; i < x.units.length; i++) {
      var u = x.units[i];
      if (u.rem <= 0 || u.release > day) continue;
      if (!best) { best = u; continue; }
      var ka = (u.type === 'review' ? 0 : 1), kb = (best.type === 'review' ? 0 : 1);
      if (ka !== kb ? ka < kb : (u.type === 'review' && u.release !== best.release ? u.release < best.release : u.order < best.order)) best = u;
    }
    return best;
  }

  function remainingTotal(x, S) {
    var t = 0;
    for (var i = 0; i < x.units.length; i++) {
      var u = x.units[i];
      if (u.rem <= 0) continue;
      t += u.rem;
      if (u.type === 'study') t += reviewMinFor(x.lessons[u.lessonId], S);
    }
    return t;
  }

  /* opts: { mode: 'mix' | 'edf', extraMin, extend: {subjectId: days} } */
  function simulate(state, now, opts) {
    opts = opts || {};
    var S = state.settings, today = now.day;
    var mode = opts.mode || 'mix', extra = opts.extraMin || 0, ext = opts.extend || {};

    var doneByDay = {};
    state.sessions.forEach(function (s) {
      if (s.status === 'done') {
        var d = typeof s.doneDay === 'number' ? s.doneDay : parseDay(s.date);
        doneByDay[d] = (doneByDay[d] || 0) + s.minutes;
      }
    });

    var subs = state.subjects.map(function (s, i) {
      var lessons = {};
      s.lessons.forEach(function (l) { lessons[l.id] = l; });
      return {
        s: s, idx: i, w: s.importance || 2, lessons: lessons,
        dl: parseDay(s.deadline) + (ext[s.id] || 0),
        units: buildUnits(s, today), assigned: 0, pace: 0,
        lastDay: null, plannedMin: 0, required: 0
      };
    });

    var end = today;
    subs.forEach(function (x) { if (x.dl > end) end = x.dl; });
    end = Math.min(end, today + HORIZON_DAYS);

    var caps = [], pref = [0], d;
    for (d = today; d <= end; d++) {
      var c = capacityFor(d, now, S, extra, doneByDay);
      caps.push(c);
      pref.push(pref[pref.length - 1] + (c > 0 ? 1 : 0));
    }
    function capDays(a, b) {
      a = Math.max(a, today); b = Math.min(b, end);
      if (b < a) return 0;
      return pref[b - today + 1] - pref[a - today];
    }
    var availTotal = function (dl) {
      var t = 0;
      for (var i = 0; i < caps.length && today + i <= dl; i++) t += caps[i];
      return t;
    };

    subs.forEach(function (x) { x.required = remainingTotal(x, S); x.available = availTotal(x.dl); });

    var sessions = [];
    for (var day = today; day <= end; day++) {
      var cap = caps[day - today];
      if (cap <= 0) continue;
      var cursor = day === today ? Math.max(roundUp(now.min, 5), S.startMin) : S.startMin;
      var windowEnd = Math.min(1440, S.startMin + (S.dayMin[dow(day)] || 0) + extra);
      state.sessions.forEach(function (done) {
        var doneDay = typeof done.doneDay === 'number' ? done.doneDay : parseDay(done.date);
        if (done.status === 'done' && doneDay === day && parseDay(done.date) === day) cursor = Math.max(cursor, done.start + done.minutes + S.breakMin);
      });
      cap = Math.min(cap, Math.max(0, windowEnd - cursor));
      subs.forEach(function (x) {
        x.assigned = 0;
        var rem = remainingTotal(x, S);
        var left = capDays(day, x.dl);
        x.pace = left > 0 ? rem / left : rem;
      });

      /* تنويع المواد: لا نكدّس نفس المادة أكثر من جلستين متتاليتين
       * ولا أكثر من 120 دقيقة متواصلة إذا وُجدت مادة أخرى.
       * نبدأ التتابع من الجلسات المنجزة اليوم حتى لا تُعاد نفس المادة مباشرة بعد الإنجاز. */
      var MAX_STREAK_SESS = 2;
      var MAX_STREAK_MIN = 120;
      var lastSubId = null, streakSess = 0, streakMin = 0;
      var dayStr = fmtDay(day);
      var prior = state.sessions
        .filter(function (s) {
          return s.date === dayStr && (s.status === 'done' || s.status === 'missed');
        })
        .sort(function (a, b) { return a.start - b.start; });
      prior.forEach(function (s) {
        if (s.subjectId === lastSubId) {
          streakSess += 1;
          streakMin += s.minutes;
        } else {
          lastSubId = s.subjectId;
          streakSess = 1;
          streakMin = s.minutes;
        }
      });

      var guard = 0;
      while (cap >= 5 && guard++ < 300) {
        var cands = subs.filter(function (x) { return day <= x.dl && nextUnit(x, day); });
        if (!cands.length) break;

        // فضّل مادة مختلفة إذا تجاوزنا حد التتابع
        var preferSwitch = lastSubId && (streakSess >= MAX_STREAK_SESS || streakMin >= MAX_STREAK_MIN);
        var others = preferSwitch
          ? cands.filter(function (x) { return x.s.id !== lastSubId; })
          : [];
        if (others.length) cands = others;

        var pick = cands[0];
        for (var k = 1; k < cands.length; k++) {
          var a = cands[k], b = pick, better;
          if (mode === 'edf') {
            better = a.dl !== b.dl ? a.dl < b.dl : (a.w !== b.w ? a.w > b.w : a.idx < b.idx);
          } else {
            var ra = a.assigned / (a.w * Math.max(a.pace, 1));
            var rb = b.assigned / (b.w * Math.max(b.pace, 1));
            better = Math.abs(ra - rb) > 1e-9 ? ra < rb : (a.w !== b.w ? a.w > b.w : a.idx < b.idx);
          }
          // عقوبة خفيفة لنفس المادة حتى قبل بلوغ الحد
          if (lastSubId && a.s.id === lastSubId && b.s.id !== lastSubId) better = false;
          if (lastSubId && b.s.id === lastSubId && a.s.id !== lastSubId) better = true;
          if (better) pick = a;
        }
        var u = nextUnit(pick, day);
        var hasAlt = subs.some(function (x) {
          return x.s.id !== pick.s.id && day <= x.dl && nextUnit(x, day);
        });
        var chunk = Math.min(u.rem, S.maxSession, cap);
        // قصّ الجلسة إذا كنا على نفس المادة واقتربنا من ساعتين وهناك بديل
        if (hasAlt && pick.s.id === lastSubId && streakMin < MAX_STREAK_MIN) {
          var room = MAX_STREAK_MIN - streakMin;
          if (room < chunk) chunk = room;
        }
        if (u.rem - chunk > 0 && u.rem - chunk < MIN_CHUNK && cap >= u.rem && u.rem <= S.maxSession + MIN_CHUNK) {
          if (!hasAlt || pick.s.id !== lastSubId || streakMin + u.rem <= MAX_STREAK_MIN) chunk = u.rem;
        }
        if (chunk < MIN_CHUNK && chunk < u.rem) {
          if (hasAlt) { streakSess = MAX_STREAK_SESS; streakMin = MAX_STREAK_MIN; continue; }
          break;
        }

        sessions.push({
          id: uid(), subjectId: pick.s.id, lessonId: u.lessonId, kind: u.type,
          date: fmtDay(day), start: cursor, minutes: chunk, status: 'pending', reviewCycle: u.reviewCycle || null
        });
        u.rem -= chunk; cursor += chunk + S.breakMin; cap = Math.max(0, Math.min(cap - chunk, windowEnd - cursor));
        pick.assigned += chunk; pick.plannedMin += chunk; pick.lastDay = day;

        if (pick.s.id === lastSubId) {
          streakSess += 1; streakMin += chunk;
        } else {
          lastSubId = pick.s.id; streakSess = 1; streakMin = chunk;
        }

        if (u.rem === 0 && u.type === 'study') {
          var les = pick.lessons[u.lessonId];
          pick.units.push({
            type: 'review', lessonId: u.lessonId, rem: reviewMinFor(les, S), order: u.order, virtual: true,
            release: day + 1 <= pick.dl ? day + 1 : day
          });
        }
      }
    }

    var out = {};
    subs.forEach(function (x) {
      var shortMin = 0, unfinished = 0, lessonsLeft = 0;
      x.units.forEach(function (u) {
        if (u.rem > 0) {
          shortMin += u.rem;
          if (u.type === 'study') {
            shortMin += reviewMinFor(x.lessons[u.lessonId], S);
            unfinished++;
          }
        }
      });
      x.s.lessons.forEach(function (l) { if (!l.done) lessonsLeft++; });
      out[x.s.id] = {
        ok: shortMin === 0,
        shortMin: shortMin,
        unfinishedLessons: unfinished,
        lessonsLeft: lessonsLeft,
        finishDay: x.lastDay,
        requiredMin: x.required,
        availableMin: x.available,
        plannedMin: x.plannedMin,
        deadlinePassed: parseDay(x.s.deadline) < today
      };
    });
    return { sessions: sessions, subjects: out, mode: mode };
  }

  function totalShort(res) {
    var t = 0;
    Object.keys(res.subjects).forEach(function (id) { t += res.subjects[id].shortMin; });
    return t;
  }
  function allOk(res) { return totalShort(res) === 0; }

  // أفضل نتيجة بين التوزيع المتنوّع وتوزيع «الأقرب موعداً أولاً»
  function best(state, now, opts) {
    var o1 = { mode: 'mix', extraMin: opts && opts.extraMin, extend: opts && opts.extend };
    var a = simulate(state, now, o1);
    if (allOk(a)) return a;
    var b = simulate(state, now, { mode: 'edf', extraMin: o1.extraMin, extend: o1.extend });
    return totalShort(b) < totalShort(a) ? b : a;
  }

  function buildOptions(state, now, res) {
    var failing = Object.keys(res.subjects).filter(function (id) { return !res.subjects[id].ok; });
    var options = { extend: [], extraMinPerDay: null, reduce: [] };
    var byId = {};
    state.subjects.forEach(function (s) { byId[s.id] = s; });

    // 1) تمديد الموعد لكل مادة على حدة
    failing.forEach(function (id) {
      var okAt = function (k) {
        var e = {}; e[id] = k;
        return best(state, now, { extend: e }).subjects[id].ok;
      };
      var lo = 0, hi = 1;
      while (hi <= 256 && !okAt(hi)) { lo = hi; hi *= 2; }
      if (hi > 256) return;
      while (hi - lo > 1) {
        var mid = Math.floor((lo + hi) / 2);
        if (okAt(mid)) hi = mid; else lo = mid;
      }
      options.extend.push({
        subjectId: id, days: hi,
        newDeadline: fmtDay(parseDay(byId[id].deadline) + hi)
      });
    });

    // 2) زيادة الساعات يومياً (لكل الأيام التي فيها دراسة)، بخطوات 5 دقائق حتى 6 ساعات
    var anyDay = state.settings.dayMin.some(function (m) { return m > 0; });
    if (anyDay) {
      var okExtra = function (k) { return allOk(best(state, now, { extraMin: k * 5 })); };
      if (okExtra(72)) {
        var lo2 = 0, hi2 = 72;
        while (hi2 - lo2 > 1) {
          var m2 = Math.floor((lo2 + hi2) / 2);
          if (okExtra(m2)) hi2 = m2; else lo2 = m2;
        }
        options.extraMinPerDay = hi2 * 5;
      }
    }

    // 3) تقليل الدروس: ما لم يتّسع له الوقت
    failing.forEach(function (id) {
      var r = res.subjects[id];
      if (r.unfinishedLessons > 0) options.reduce.push({ subjectId: id, lessons: r.unfinishedLessons, of: r.lessonsLeft });
    });
    return options;
  }

  function analyze(state, now) {
    var res = best(state, now, {});
    res.options = allOk(res) ? null : buildOptions(state, now, res);
    return res;
  }

  /* ============ ترقيم الأجزاء ============ */
  function numberParts(state) {
    var groups = {};
    state.sessions.forEach(function (s) {
      delete s.part; delete s.parts;
      if (s.kind !== 'study' || s.status === 'missed') return;
      (groups[s.lessonId] = groups[s.lessonId] || []).push(s);
    });
    Object.keys(groups).forEach(function (id) {
      var g = groups[id].sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.start - b.start; });
      if (g.length > 1) g.forEach(function (s, i) { s.part = i + 1; s.parts = g.length; });
    });
  }

  /* ============ إعادة الجدولة ============ */
  function sessionKeys(list) {
    var sorted = list.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.start - b.start; });
    var count = {}, map = {};
    sorted.forEach(function (s) {
      var base = s.lessonId + '|' + s.kind;
      count[base] = (count[base] || 0) + 1;
      map[base + '|' + count[base]] = s;
    });
    return map;
  }
  function diffSessions(oldList, newList) {
    var a = sessionKeys(oldList), b = sessionKeys(newList);
    var moved = [], added = 0, removed = 0;
    Object.keys(b).forEach(function (k) {
      if (!a[k]) added++;
      else if (a[k].date !== b[k].date) moved.push({ subjectId: b[k].subjectId, lessonId: b[k].lessonId, kind: b[k].kind, from: a[k].date, to: b[k].date });
    });
    Object.keys(a).forEach(function (k) { if (!b[k]) removed++; });
    moved.sort(function (x, y) { return x.to < y.to ? -1 : x.to > y.to ? 1 : 0; });
    return { moved: moved, added: added, removed: removed };
  }

  /* opts.forceToday: جلسات اليوم التي مضى وقتها تُعدّ فائتة */
  function replan(state, now, opts) {
    opts = opts || {};
    var st = clone(state);
    var missedNow = 0;
    st.sessions.forEach(function (s) {
      if (s.status !== 'pending') return;
      var d = parseDay(s.date);
      if (d < now.day || (opts.forceToday && d === now.day && s.start + s.minutes <= now.min)) {
        s.status = 'missed'; missedNow++;
      }
    });
    var oldPending = st.sessions.filter(function (s) { return s.status === 'pending'; });
    st.sessions = st.sessions.filter(function (s) { return s.status !== 'pending'; });

    var res = analyze(st, now);
    st.sessions = st.sessions.concat(res.sessions);
    numberParts(st);

    var finishDiff = [];
    var prev = st.meta.finish || {};
    var nextFinish = {};
    st.subjects.forEach(function (s) {
      var f = res.subjects[s.id].finishDay;
      nextFinish[s.id] = f;
      if (prev[s.id] != null && f != null && prev[s.id] !== f) finishDiff.push({ subjectId: s.id, from: prev[s.id], to: f });
    });
    st.meta.finish = nextFinish;
    st.meta.lastPlanDay = now.day;
    st.meta.status = {};
    st.subjects.forEach(function (s) {
      var r = res.subjects[s.id];
      st.meta.status[s.id] = { ok: r.ok, shortMin: r.shortMin, finishDay: r.finishDay };
    });

    return {
      state: st, analysis: res,
      diff: {
        missed: missedNow,
        moved: diffSessions(oldPending, res.sessions).moved,
        added: diffSessions(oldPending, res.sessions).added,
        removed: diffSessions(oldPending, res.sessions).removed,
        finish: finishDiff
      }
    };
  }

  // هل يحتاج التطبيق إعادة جدولة تلقائية؟ (جلسات من أيام سابقة لم تُنجز)
  function needsReplan(state, now) {
    return state.sessions.some(function (s) { return s.status === 'pending' && parseDay(s.date) < now.day; });
  }

  /* ============ تنفيذ الجلسات ============ */
  function findSubject(state, id) {
    for (var i = 0; i < state.subjects.length; i++) if (state.subjects[i].id === id) return state.subjects[i];
    return null;
  }
  function findLesson(sub, id) {
    if (!sub) return null;
    var all = sub.lessons.concat(sub.archivedLessons || []);
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }
  function findSession(state, id) {
    for (var i = 0; i < state.sessions.length; i++) if (state.sessions[i].id === id) return state.sessions[i];
    return null;
  }

  function ensureReview(lesson, settings) {
    if (!lesson.review) lesson.review = { min: reviewMinFor(lesson, settings), doneMin: 0, status: 'pending', cycle: uid() };
    if (!lesson.review.cycle) lesson.review.cycle = uid();
    if (typeof lesson.review.doneMin !== 'number') lesson.review.doneMin = lesson.review.status === 'done' ? lesson.review.min : 0;
    return lesson.review;
  }
  function completeSession(state, id, now) {
    var s = findSession(state, id), out = { lessonCompleted: false };
    if (!s || s.status !== 'pending') return out;
    var sub = findSubject(state, s.subjectId), l = findLesson(sub, s.lessonId);
    if (!l || l.archived || (s.kind === 'review' && !l.done)) return out;
    if (s.kind === 'review' && l.review && s.reviewCycle && s.reviewCycle !== l.review.cycle) return out;
    s.status = 'done'; s.doneDay = now.day;
    if (s.kind === 'study') {
      l.doneMin = Math.min(l.min, (l.doneMin || 0) + s.minutes);
      if (l.doneMin >= l.min && !l.done) {
        l.done = true; l.doneDate = fmtDay(now.day);
        ensureReview(l, state.settings);
        out.lessonCompleted = true; out.subjectId = sub.id; out.lessonId = l.id;
      }
    } else {
      var r = ensureReview(l, state.settings);
      s.reviewCycle = r.cycle;
      r.doneMin = Math.min(r.min, r.doneMin + s.minutes);
      r.status = r.doneMin >= r.min ? 'done' : 'pending';
    }
    numberParts(state);
    return out;
  }
  function undoSession(state, id) {
    var s = findSession(state, id);
    if (!s || s.status !== 'done') return false;
    var sub = findSubject(state, s.subjectId), l = findLesson(sub, s.lessonId);
    if (!l || l.archived || s.historyOnly) return false;
    if (s.kind === 'review') {
      if (!l.review || (s.reviewCycle && s.reviewCycle !== l.review.cycle)) return false;
      ensureReview(l, state.settings);
      l.review.doneMin = Math.max(0, l.review.doneMin - s.minutes);
      l.review.status = 'pending';
    } else {
      l.doneMin = Math.max(0, (l.doneMin || 0) - s.minutes);
      if (l.doneMin < l.min) { l.done = false; l.doneDate = null; l.review = null; }
      // A review cannot remain actionable before its study is complete.
      state.sessions = state.sessions.filter(function (x) {
        return !(x.lessonId === l.id && x.kind === 'review' && x.status === 'pending');
      });
    }
    s.status = 'pending'; delete s.doneDay;
    return true;
  }
  function skipSession(state, id) {
    var s = findSession(state, id);
    if (s && s.status === 'pending') s.status = 'missed';
    numberParts(state);
  }
  function setDifficulty(state, subjectId, lessonId, diff) {
    var sub = findSubject(state, subjectId), l = findLesson(sub, lessonId);
    if (!l || l.archived || ['easy', 'medium', 'hard'].indexOf(diff) === -1) return;
    l.difficulty = diff;
    if (!l.done) return;
    var r = ensureReview(l, state.settings);
    if (r.status !== 'done') {
      r.min = reviewMinFor(l, state.settings);
      r.doneMin = Math.min(r.min, r.doneMin);
      r.status = r.doneMin >= r.min ? 'done' : 'pending';
    }
  }
  function setLessonDone(state, subjectId, lessonId, flag, now) {
    var sub = findSubject(state, subjectId), l = findLesson(sub, lessonId);
    if (!l || l.archived) return;
    if (flag) {
      l.done = true; l.doneMin = l.min; l.doneDate = fmtDay(now.day);
      ensureReview(l, state.settings);
    } else {
      l.done = false; l.doneMin = 0; l.doneDate = null; l.review = null;
      // Previous study records remain history, not undoable work in this cycle.
      state.sessions.forEach(function (x) { if (x.lessonId === lessonId && x.status === 'done') x.historyOnly = true; });
    }
  }
  function requestReview(state, subjectId, lessonId, diff) {
    var sub = findSubject(state, subjectId), l = findLesson(sub, lessonId);
    if (!l || l.archived || !l.done || ['easy', 'medium', 'hard'].indexOf(diff) === -1) return;
    l.difficulty = diff;
    l.review = { min: reviewMinFor(l, state.settings), doneMin: 0, status: 'pending', cycle: uid() };
  }
  function setLessonDuration(state, subjectId, lessonId, minutes) {
    var sub = findSubject(state, subjectId), l = findLesson(sub, lessonId);
    if (!l || l.archived || l.done || typeof minutes !== 'number' || !isFinite(minutes) || minutes < Math.max(15, l.doneMin || 0) || minutes > 360) return false;
    l.min = Math.round(minutes); l.customized = true;
    if (l.doneMin >= l.min) {
      l.done = true;
      var dates = state.sessions.filter(function (x) { return x.lessonId === lessonId && x.kind === 'study' && x.status === 'done'; })
        .map(function (x) { return typeof x.doneDay === 'number' ? x.doneDay : parseDay(x.date); });
      l.doneDate = dates.length ? fmtDay(Math.max.apply(null, dates)) : null;
      ensureReview(l, state.settings);
    }
    return true;
  }
  function deleteLesson(state, subjectId, lessonId) {
    var sub = findSubject(state, subjectId), l = findLesson(sub, lessonId);
    if (!l || l.archived) return;
    // Non-destructive archive keeps completed/missed sessions and their labels valid.
    archiveLesson(sub, l);
    sub.lessons = sub.lessons.filter(function (x) { return x.id !== lessonId; });
    state.sessions = state.sessions.filter(function (x) { return !(x.lessonId === lessonId && x.status === 'pending'); });
  }

  /* ============ التقرير الأسبوعي ============ */
  function weeklyReport(state, ws, now) {
    var inWeek = state.sessions.filter(function (s) { var d = parseDay(s.date); return d >= ws && d < ws + 7; });
    var counted = inWeek.filter(function (s) {
      return s.status === 'done' || s.status === 'missed' || (s.status === 'pending' && parseDay(s.date) <= now.day);
    });
    function sum(list, f) { return list.reduce(function (t, s) { return t + (f ? (f(s) ? s.minutes : 0) : s.minutes); }, 0); }
    var doneMin = sum(inWeek, function (s) { return s.status === 'done'; });
    var countedMin = sum(counted);
    var rep = {
      weekStart: ws,
      plannedMin: sum(inWeek),
      doneMin: doneMin,
      missedMin: sum(inWeek, function (s) { return s.status === 'missed'; }),
      percent: countedMin > 0 ? Math.round(doneMin / countedMin * 100) : null,
      lessonsDone: [], late: [], bySubject: [], next: null
    };

    state.subjects.forEach(function (sub) {
      var ss = inWeek.filter(function (s) { return s.subjectId === sub.id; });
      var cs = counted.filter(function (s) { return s.subjectId === sub.id; });
      var dMin = sum(ss, function (s) { return s.status === 'done'; });
      var cMin = sum(cs);
      var doneLessons = sub.lessons.concat(sub.archivedLessons || []).filter(function (l) { return l.doneDate && parseDay(l.doneDate) >= ws && parseDay(l.doneDate) < ws + 7; });
      doneLessons.forEach(function (l) { rep.lessonsDone.push({ subjectId: sub.id, lessonId: l.id, title: l.title }); });
      var lateIds = {};
      ss.forEach(function (s) {
        if (s.status === 'missed' && s.kind === 'study') {
          var l = findLesson(sub, s.lessonId);
          if (l && !l.done) lateIds[l.id] = l.title;
        }
      });
      Object.keys(lateIds).forEach(function (id) { rep.late.push({ subjectId: sub.id, lessonId: id, title: lateIds[id] }); });
      if (ss.length || doneLessons.length) {
        rep.bySubject.push({
          subjectId: sub.id, name: sub.name, plannedMin: sum(ss), doneMin: dMin,
          percent: cMin > 0 ? Math.round(dMin / cMin * 100) : null, lessonsDone: doneLessons.length
        });
      }
    });

    var nextSess = state.sessions.filter(function (s) {
      var d = parseDay(s.date); return d >= ws + 7 && d < ws + 14 && s.status === 'pending';
    });
    var per = {};
    nextSess.forEach(function (s) { per[s.subjectId] = (per[s.subjectId] || 0) + s.minutes; });
    rep.next = {
      count: nextSess.length, minutes: sum(nextSess),
      bySubject: Object.keys(per).map(function (id) { return { subjectId: id, minutes: per[id] }; })
    };
    return rep;
  }

  /* ============ مساعدات للواجهة ============ */
  function sessionsOn(state, day) {
    var ds = fmtDay(day);
    return state.sessions.filter(function (s) { return s.date === ds; })
      .sort(function (a, b) { return a.start - b.start; });
  }
  function subjectProgress(sub) {
    var total = sub.lessons.length, done = sub.lessons.filter(function (l) { return l.done; }).length;
    return { total: total, done: done };
  }

  return {
    // تواريخ وتنسيق
    parseDay: parseDay, fmtDay: fmtDay, dow: dow, weekStart: weekStart, nowInfo: nowInfo,
    fmtDur: fmtDur, fmtTime: fmtTime, fmtDate: fmtDate, fmtDateShort: fmtDateShort, relDay: relDay,
    fmtLessons: fmtLessons, fmtDays: fmtDays, plural: plural, DAY_NAMES: DAY_NAMES, MONTHS: MONTHS,
    // الحالة
    newState: newState, defaultSettings: defaultSettings, clone: clone, normalizeState: normalizeState,
    // المواد والدروس
    createSubject: createSubject, updateSubject: updateSubject, addLesson: addLesson,
    pendingBacklog: pendingBacklog, setBacklog: setBacklog, dropLastLessons: dropLastLessons, subjectProgress: subjectProgress,
    findSubject: findSubject, findLesson: findLesson, findSession: findSession,
    // الجدولة
    simulate: simulate, analyze: analyze, replan: replan, needsReplan: needsReplan, numberParts: numberParts,
    // التنفيذ
    completeSession: completeSession, undoSession: undoSession, skipSession: skipSession,
    setDifficulty: setDifficulty, setLessonDone: setLessonDone, requestReview: requestReview, setLessonDuration: setLessonDuration, deleteLesson: deleteLesson,
    // تقارير
    weeklyReport: weeklyReport, sessionsOn: sessionsOn
  };
});
