/* واجهة التطبيق. بدون مكتبات خارجية، وبصيغة JS تناسب WebView قديم. */
(function () {
  'use strict';

  var E = window.Engine, N = window.Notify;
  var KEY = 'bacplanner.v1';
  var COLORS = ['#F2B705', '#2FBF8F', '#EE7B73', '#4BA3EA', '#9B7FD4', '#F28F3B', '#22AEBB', '#8FC13E'];
  var IMP = { 1: 'منخفضة', 2: 'متوسطة', 3: 'عالية' };
  var SUGGEST = ['الرياضيات', 'الفيزياء', 'الكيمياء', 'العلوم', 'اللغة العربية', 'اللغة الإنكليزية', 'اللغة الفرنسية', 'التربية الدينية'];
  var DAY_ORDER = [6, 0, 1, 2, 3, 4, 5];                       // السبت أولاً
  var SHORT = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

  var S = null;
  var memoryOnly = false;
  var ui = { selDay: null, weekOffset: 0, repOffset: 0 };
  var draft = null;          // مسودة نموذج المادة
  var sheetDraft = null;     // مسودة ورقة الدرس
  var notifStatus = null;
  var lastRouteKey = '';

  var app = document.getElementById('app');
  var tabsEl = document.getElementById('tabs');
  var sheetRoot = document.getElementById('sheet-root');
  var toastEl = document.getElementById('toast');

  /* ============ التخزين ============ */
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var st = JSON.parse(raw);
        if (st && st.version === 1 && st.settings && st.subjects) {
          st.meta = st.meta || { finish: {} };
          var def = E.defaultSettings();
          Object.keys(def).forEach(function (k) { if (st.settings[k] == null) st.settings[k] = def[k]; });
          return st;
        }
      }
    } catch (e) { memoryOnly = true; }
    return E.newState();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { memoryOnly = true; }
  }

  /* ============ أدوات ============ */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var ICONS = {
    today: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
    subjects: '<path d="M5 4.5h10a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/>',
    schedule: '<rect x="4" y="5.5" width="16" height="14.5" rx="3"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
    report: '<path d="M5 20v-8M12 20V4M19 20v-5"/>',
    settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    back: '<path d="M9 5l7 7-7 7"/>',
    next: '<path d="M15 5l-7 7 7 7"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>'
  };
  function icon(n) { return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[n] + '</svg>'; }
  function now() { return E.nowInfo(); }
  function colorOf(sub) { return COLORS[(sub && sub.color != null ? sub.color : 0) % COLORS.length]; }
  function nextColor() {
    var used = {};
    S.subjects.forEach(function (s) { used[s.color] = true; });
    for (var i = 0; i < COLORS.length; i++) if (!used[i]) return i;
    return S.subjects.length % COLORS.length;
  }
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.className = 'show';
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { toastEl.className = ''; }, 2600);
  }
  function sum(list, f) { return list.reduce(function (t, x) { return t + f(x); }, 0); }
  function daysLabel(dl, today) {
    var d = dl - today;
    if (d < 0) return 'فات الموعد';
    if (d === 0) return 'اليوم';
    if (d === 1) return 'غداً';
    return 'بعد ' + E.fmtDays(d);
  }
  function importancePips(n) {
    var h = '<span class="pips" role="img" aria-label="الأهمية ' + IMP[n] + '">';
    for (var i = 1; i <= 3; i++) h += '<i class="' + (i <= n ? 'on' : '') + '"></i>';
    return h + '</span>';
  }

  /* ============ الجدولة ============ */
  function replan(opts) {
    var r = E.replan(S, now(), opts || {});
    S = r.state;
    save();
    if (N) N.sync(S, now(), E);
    return r;
  }
  function failing() {
    var out = [];
    S.subjects.forEach(function (s) {
      var st = S.meta.status && S.meta.status[s.id];
      if (st && !st.ok) out.push({ sub: s, st: st });
    });
    return out;
  }

  /* ============ التوجيه ============ */
  function parseRoute() {
    var p = (location.hash || '').replace(/^#\/?/, '').split('/');
    return { name: p[0] || 'today', arg: p[1] ? decodeURIComponent(p[1]) : null };
  }
  function go(path) { location.hash = '#/' + path; }
  function goReplace(path) { location.replace('#/' + path); }

  var TABS = [
    ['today', 'اليوم'], ['subjects', 'المواد'], ['schedule', 'الجدول'], ['report', 'التقرير'], ['settings', 'الإعدادات']
  ];
  function renderTabs(active) {
    var h = '<div class="in">';
    TABS.forEach(function (t) {
      h += '<a href="#/' + t[0] + '" data-act="tab" data-to="' + t[0] + '" class="' + (t[0] === active ? 'on' : '') + '"' +
        (t[0] === active ? ' aria-current="page"' : '') + '><span class="pill">' + icon(t[0]) + '</span>' + t[1] + '</a>';
    });
    tabsEl.innerHTML = h + '</div>';
  }

  function header(title, sub, opts) {
    opts = opts || {};
    return '<header class="top">' +
      (opts.back ? '<button class="back" data-act="back" aria-label="رجوع">' + icon('back') + '</button>' : '') +
      '<h1>' + esc(title) + (sub ? '<span class="sub">' + esc(sub) + '</span>' : '') + '</h1>' +
      (opts.action || '') + '</header>';
  }

  function render() {
    if (!S) return;
    var r = parseRoute(), html = '', tabs = true, tab = r.name;
    switch (r.name) {
      case 'welcome': html = screenWelcome(); tabs = false; break;
      case 'subjects': html = screenSubjects(); break;
      case 'subject': html = screenSubject(r.arg); tabs = false; tab = 'subjects'; break;
      case 'subject-form': html = screenSubjectForm(r.arg); tabs = false; break;
      case 'schedule': html = screenSchedule(); break;
      case 'report': html = screenReport(); break;
      case 'settings': html = screenSettings(); break;
      default: tab = 'today'; html = screenToday();
    }
    var key = r.name + '/' + (r.arg || '');
    var y = key === lastRouteKey ? window.pageYOffset : 0;
    lastRouteKey = key;
    app.innerHTML = html;
    document.body.className = tabs ? '' : 'no-tabs';
    renderTabs(tab);
    window.scrollTo(0, y);
    if (r.name === 'settings') refreshNotifStatus();
  }

  /* ============ شاشة: اليوم ============ */
  function stripHTML(list, thin) {
    if (!list.length) return '<div class="strip empty' + (thin ? ' thin' : '') + '"></div>';
    var h = '<div class="strip' + (thin ? ' thin' : '') + '" role="img" aria-label="شريط الجلسات">';
    list.forEach(function (s) {
      var sub = E.findSubject(S, s.subjectId);
      h += '<span class="seg ' + s.status + '" style="flex:' + s.minutes + ' 1 0;--c:' + colorOf(sub) + '"></span>';
    });
    return h + '</div>';
  }

  function sessionRow(s, n) {
    var sub = E.findSubject(S, s.subjectId), les = E.findLesson(sub, s.lessonId);
    if (!sub) return '';
    var day = E.parseDay(s.date);
    var title = les ? les.title : '';
    if (s.parts > 1) title += ' — الجزء ' + s.part + ' من ' + s.parts;
    if (s.note) title = s.note + (les && les.title && les.title.indexOf('الدرس ') === 0 ? '' : (title ? ' · ' + title : ''));
    var tags = '';
    if (s.kind === 'review') tags += '<span class="tag rev">مراجعة</span>';
    if (s.status === 'missed') tags += '<span class="tag late">فائتة</span>';
    else if (s.status === 'pending' && (day < n.day || (day === n.day && s.start + s.minutes <= n.min))) tags += '<span class="tag late">مضى وقتها</span>';
    var timeParts = E.fmtTime(s.start).split(' ');
    var end = E.fmtTime(s.start + s.minutes);
    return '<div class="srow ' + s.status + '" style="--c:' + colorOf(sub) + '">' +
      '<span class="bar"></span>' +
      '<div class="stime"><b>' + timeParts[0] + ' ' + timeParts[1] + '</b><span>حتى ' + end + '</span></div>' +
      '<div class="body" data-act="session" data-id="' + s.id + '" role="button" tabindex="0">' +
      '<div class="who"><span class="nm">' + esc(sub.name) + '</span>' + tags + '</div>' +
      '<div class="what">' + esc(title) + ' · ' + E.fmtDur(s.minutes) + '</div></div>' +
      '<div class="tick">' + (s.status === 'missed'
        ? '<span class="chk" aria-label="فائتة">' + icon('x') + '</span>'
        : '<button class="chk" data-act="toggle" data-id="' + s.id + '" aria-label="' + (s.status === 'done' ? 'تراجع عن الإنجاز' : 'تمّت الجلسة') + '">' + icon('check') + '</button>') +
      '</div></div>';
  }

  function nextSessionAfter(day) {
    var best = null;
    S.sessions.forEach(function (s) {
      if (s.status !== 'pending') return;
      var d = E.parseDay(s.date);
      if (d <= day) return;
      if (!best || s.date < best.date || (s.date === best.date && s.start < best.start)) best = s;
    });
    return best;
  }

  function emptyNoSubjects() {
    return header('اليوم', E.fmtDate(now().day)) +
      '<div class="card empty"><h3>ما في مواد بعد</h3><p>أضف أول مادة وعدد دروسها المتراكمة، وبيُبنى جدولك.</p>' +
      '<button class="btn" data-act="new-subject">' + icon('plus') + 'إضافة مادة</button></div>';
  }

  function screenToday() {
    var n = now();
    if (!S.subjects.length) return emptyNoSubjects();
    var list = E.sessionsOn(S, n.day);
    var h = header('اليوم', E.fmtDate(n.day));

    failing().forEach(function (f) {
      h += '<div class="banner bad"><div><b>' + esc(f.sub.name) + '</b>: الوقت لا يكفي، ينقصها ' + E.fmtDur(f.st.shortMin) + '.</div>' +
        '<button class="btn small" data-act="options">الخيارات</button></div>';
    });
    var overdue = list.filter(function (s) { return s.status === 'pending' && s.start + s.minutes <= n.min; }).length;
    if (overdue) {
      h += '<div class="banner warn"><div>مضى وقت <b>' + E.plural(overdue, 'جلسة', 'جلستين', 'جلسات', 'جلسة') + '</b> ولم تُسجَّل.</div>' +
        '<button class="btn small" data-act="replan-now">أعد التوزيع</button></div>';
    }

    var active = list.filter(function (s) { return s.status !== 'missed'; });
    var total = sum(active, function (s) { return s.minutes; });
    var done = sum(active.filter(function (s) { return s.status === 'done'; }), function (s) { return s.minutes; });
    h += '<section class="card daysum">';
    if (!list.length) {
      var nx = nextSessionAfter(n.day);
      h += '<div class="big">لا جلسات اليوم</div>' + stripHTML([]);
      h += '<div class="cap"><span>' + (nx
        ? 'التالية: ' + E.relDay(E.parseDay(nx.date), n.day) + ' ' + E.fmtTime(nx.start)
        : 'كل الدروس المخططة انتهت') + '</span></div>';
    } else {
      h += '<div class="big">' + E.fmtDur(total) + ' <small>دراسة اليوم</small></div>' + stripHTML(list);
      h += '<div class="cap"><span>أنجزت ' + (done ? E.fmtDur(done) : 'لا شيء بعد') + '</span><span>' +
        E.plural(active.length, 'جلسة', 'جلستان', 'جلسات', 'جلسة') + '</span></div>';
    }
    h += '</section>';

    if (list.length) {
      h += '<h2 class="sec">جلسات اليوم</h2>';
      list.forEach(function (s) { h += sessionRow(s, n); });
    }
    if (memoryOnly) {
      h += '<div class="banner warn" style="margin-top:20px"><div>تعذّر حفظ البيانات على هذا الجهاز، وقد تضيع عند إغلاق التطبيق.</div></div>';
    }
    return h;
  }

  /* ============ شاشة: المواد ============ */
  function ticksHTML(sub) {
    var total = sub.lessons.length;
    if (!total) return '';
    var c = colorOf(sub);
    if (total > 40) {
      var d = sub.lessons.filter(function (l) { return l.done; }).length;
      return '<div class="strip thin" style="margin-top:12px"><span class="seg done" style="flex:' + d + ' 1 0;--c:' + c + '"></span>' +
        '<span class="seg pending" style="flex:' + (total - d) + ' 1 0;--c:' + c + '"></span></div>';
    }
    var h = '<div class="ticks" style="--c:' + c + '">';
    sub.lessons.forEach(function (l) { h += '<i class="' + (l.done ? 'd' : (l.doneMin > 0 ? 'p' : '')) + '"></i>'; });
    return h + '</div>';
  }
  function statusLine(sub) {
    var st = S.meta.status && S.meta.status[sub.id];
    var p = E.subjectProgress(sub);
    if (p.total > 0 && p.done === p.total) {
      var pendingReview = sub.lessons.some(function (l) { return l.review && l.review.status === 'pending'; });
      return pendingReview ? '<div class="status ok">أنهيت الدروس، وبقيت مراجعات</div>' : '<div class="status ok">أنهيت كل الدروس</div>';
    }
    if (!st) return '';
    if (!st.ok) return '<div class="status bad">الوقت لا يكفي، ينقص ' + E.fmtDur(st.shortMin) + '</div>';
    return '<div class="status ok">على المسار' + (st.finishDay != null ? ' · تنتهي ' + E.fmtDateShort(st.finishDay) : '') + '</div>';
  }

  function screenSubjects() {
    var n = now();
    var h = header('المواد', S.subjects.length ? E.plural(S.subjects.length, 'مادة واحدة', 'مادتان', 'مواد', 'مادة') : null, {
      action: '<div class="actions"><button class="btn small" data-act="new-subject">' + icon('plus') + 'مادة</button></div>'
    });
    if (!S.subjects.length) return h + '<div class="card empty"><h3>ما في مواد بعد</h3><p>أضف مادة وأدخل عدد دروسها المتراكمة ومدة الدرس.</p></div>';
    S.subjects.forEach(function (sub) {
      var p = E.subjectProgress(sub);
      h += '<button class="subj" style="--c:' + colorOf(sub) + '" data-act="open-subject" data-id="' + sub.id + '">' +
        '<div class="head"><span class="name">' + esc(sub.name) + '</span>' + importancePips(sub.importance) +
        '<span class="tag" style="margin-right:10px">' + (sub.mode === 'teacher' ? 'مع مدرّس' : 'ذاتي') + '</span></div>' +
        ticksHTML(sub) +
        '<div class="meta">' + p.done + ' من ' + E.fmtLessons(p.total) + ' · الموعد ' + E.fmtDateShort(E.parseDay(sub.deadline)) + ' (' + daysLabel(E.parseDay(sub.deadline), n.day) + ')</div>' +
        statusLine(sub) + '</button>';
    });
    return h;
  }

  /* ============ شاشة: تفاصيل المادة ============ */
  function screenSubject(id) {
    var sub = E.findSubject(S, id);
    if (!sub) return header('المادة', null, { back: true }) + '<div class="card empty"><h3>المادة غير موجودة</h3></div>';
    var n = now(), c = colorOf(sub), p = E.subjectProgress(sub);
    var h = header(sub.name, p.done + ' من ' + E.fmtLessons(p.total), {
      back: true, action: '<div class="actions"><button class="btn small ghost" data-act="edit-subject" data-id="' + sub.id + '">تعديل</button></div>'
    });
    h += '<div class="chips"><span class="tag pri">' + (sub.mode === 'teacher' ? 'مع مدرّس' : 'دراسة ذاتية') + '</span>' +
      '<span class="tag">الدرس ' + E.fmtDur(sub.lessonMin) + '</span>' +
      '<span class="tag">الأهمية ' + IMP[sub.importance] + '</span>' +
      '<span class="tag">الموعد ' + E.fmtDateShort(E.parseDay(sub.deadline)) + '</span></div>';
    h += '<div class="card" style="--c:' + c + ';margin-top:8px">' + ticksHTML(sub) + statusLine(sub) + '</div>';

    h += '<h2 class="sec">الدروس</h2>';
    if (!sub.lessons.length) {
      h += '<div class="card empty"><p>لا دروس بعد. أضف درساً أو زد عدد الدروس المتراكمة من «تعديل».</p></div>';
    } else {
      h += '<div class="card flat" style="--c:' + c + '">';
      sub.lessons.forEach(function (l) {
        var note = [];
        note.push(E.fmtDur(l.min));
        if (l.availableFrom && E.parseDay(l.availableFrom) > n.day) note.push('يصل ' + E.fmtDateShort(E.parseDay(l.availableFrom)));
        if (l.done && l.difficulty) note.push({ easy: 'سهل', medium: 'متوسط', hard: 'صعب' }[l.difficulty]);
        if (l.done && l.review && l.review.status === 'pending') note.push('مراجعة قادمة');
        if (l.done && l.review && l.review.status === 'done') note.push('روجع');
        if (!l.done && l.doneMin > 0) note.push('أنجزت ' + E.fmtDur(l.doneMin));
        h += '<div class="lrow ' + (l.done ? 'done' : '') + '">' +
          '<button class="chk" data-act="lesson-toggle" data-sid="' + sub.id + '" data-id="' + l.id + '" aria-label="' + (l.done ? 'إلغاء الإنجاز' : 'تمّ الدرس') + '">' + icon('check') + '</button>' +
          '<button class="t" data-act="lesson" data-sid="' + sub.id + '" data-id="' + l.id + '" style="text-align:right"><b>' + esc(l.title) + '</b><small>' + note.join(' · ') + '</small></button></div>';
      });
      h += '</div>';
    }
    h += '<div class="btns"><button class="btn ghost" data-act="add-lesson" data-id="' + sub.id + '">' + icon('plus') + 'إضافة درس</button></div>';
    h += '<div class="btns"><button class="btn danger" data-act="delete-subject" data-id="' + sub.id + '">حذف المادة</button></div>';
    return h;
  }

  /* ============ شاشة: نموذج المادة ============ */
  function stepper(field, val, label, o) {
    return '<div class="stepper" role="group" aria-label="' + esc(label) + '">' +
      '<button type="button" data-act="step" data-field="' + field + '" data-dir="-1" data-step="' + o.step + '" data-min="' + o.min + '" data-max="' + o.max + '"' + (val <= o.min ? ' disabled' : '') + ' aria-label="إنقاص">−</button>' +
      '<output>' + o.fmt(val) + '</output>' +
      '<button type="button" data-act="step" data-field="' + field + '" data-dir="1" data-step="' + o.step + '" data-min="' + o.min + '" data-max="' + o.max + '"' + (val >= o.max ? ' disabled' : '') + ' aria-label="زيادة">+</button></div>';
  }
  function draftInput() {
    return {
      name: draft.name, importance: draft.importance, mode: draft.mode, backlog: draft.backlog,
      lessonMin: draft.lessonMin, teacherPerWeek: draft.mode === 'teacher' ? draft.teacherPerWeek : 0, deadline: draft.deadline
    };
  }
  function previewDraft() {
    var n = now(), st = E.clone(S), sub;
    if (E.parseDay(draft.deadline) <= n.day) return null;
    if (draft.id) { sub = E.findSubject(st, draft.id); E.updateSubject(sub, draftInput(), n.day); }
    else { sub = E.createSubject(draftInput(), n.day); sub.id = '__preview'; st.subjects.push(sub); }
    return E.analyze(st, n).subjects[sub.id];
  }
  function newDraft() {
    var n = now();
    return { id: null, name: '', importance: 2, mode: 'self', backlog: 5, lessonMin: 60, teacherPerWeek: 2, deadline: E.fmtDay(n.day + 60), errors: {} };
  }

  function screenSubjectForm(arg) {
    var n = now();
    if (!draft || (arg !== 'new' && draft.id !== arg) || (arg === 'new' && draft.id)) {
      if (arg && arg !== 'new') {
        var sub = E.findSubject(S, arg);
        if (!sub) return header('المادة', null, { back: true });
        draft = { id: sub.id, name: sub.name, importance: sub.importance, mode: sub.mode, backlog: E.pendingBacklog(sub).length,
          lessonMin: sub.lessonMin, teacherPerWeek: sub.teacherPerWeek || 2, deadline: sub.deadline, errors: {} };
      } else draft = newDraft();
    }
    var d = draft, isEdit = !!d.id;
    var h = header(isEdit ? 'تعديل المادة' : 'مادة جديدة', null, { back: true });

    h += '<div class="field"><label for="f-name">اسم المادة</label><input id="f-name" type="text" data-bind="name" value="' + esc(d.name) + '" maxlength="40" autocomplete="off" placeholder="مثلاً: الرياضيات">' +
      (d.errors.name ? '<div class="err">' + d.errors.name + '</div>' : '') + '<div class="namechips">';
    SUGGEST.forEach(function (s) { h += '<button type="button" data-act="pick-name" data-name="' + esc(s) + '">' + esc(s) + '</button>'; });
    h += '</div></div>';

    h += '<div class="field"><span class="lbl">أهمية المادة عندك</span><div class="seg2">';
    [3, 2, 1].forEach(function (v) { h += '<button type="button" data-act="set" data-field="importance" data-val="' + v + '" class="' + (d.importance === v ? 'on' : '') + '">' + IMP[v] + '</button>'; });
    h += '</div><div class="hint">المواد الأهم تأخذ وقتاً أكبر من جدولك.</div></div>';

    h += '<div class="field"><span class="lbl">طريقة الدراسة</span><div class="seg2">' +
      '<button type="button" data-act="set" data-field="mode" data-val="teacher" class="' + (d.mode === 'teacher' ? 'on' : '') + '">مع مدرّس</button>' +
      '<button type="button" data-act="set" data-field="mode" data-val="self" class="' + (d.mode === 'self' ? 'on' : '') + '">دراسة ذاتية</button></div></div>';

    h += '<div class="field"><span class="lbl">عدد الدروس المتراكمة</span>' +
      stepper('backlog', d.backlog, 'عدد الدروس المتراكمة', { step: 1, min: 0, max: 200, fmt: function (v) { return v === 0 ? 'لا دروس' : E.fmtLessons(v); } }) +
      '<div class="hint">الدروس التي لم تدرسها بعد وتريد إنهاءها.' + (isEdit ? ' التغيير يشمل الدروس التي لم تبدأ فقط.' : '') + '</div>' +
      (d.errors.backlog ? '<div class="err">' + d.errors.backlog + '</div>' : '') + '</div>';

    h += '<div class="field"><span class="lbl">مدة الدرس الواحد</span>' +
      stepper('lessonMin', d.lessonMin, 'مدة الدرس', { step: 15, min: 15, max: 360, fmt: E.fmtDur }) +
      '<div class="hint">كم يأخذ منك الدرس الواحد في الدراسة، مع حل التمارين. مثلاً درس الرياضيات: ساعة ونصف.</div></div>';

    if (d.mode === 'teacher') {
      h += '<div class="field"><span class="lbl">دروس المدرّس كل أسبوع</span>' +
        stepper('teacherPerWeek', d.teacherPerWeek, 'دروس المدرّس أسبوعياً', { step: 1, min: 0, max: 14, fmt: function (v) { return v === 0 ? 'لا دروس جديدة' : E.fmtLessons(v) + ' أسبوعياً'; } }) +
        '<div class="hint">الدروس الجديدة التي يعطيك إياها المدرّس. تدخل في جدولك بعد أسبوعها، وتُدرس في البيت.</div></div>';
    }

    var minDate = E.fmtDay(n.day + 1);
    h += '<div class="field"><label for="f-deadline">الموعد المطلوب لإنهاء الدروس</label>' +
      '<input id="f-deadline" type="date" data-bind="deadline" min="' + minDate + '" value="' + esc(d.deadline) + '">' +
      '<div class="hint" id="deadline-hint">' + deadlineHint() + '</div>' +
      (d.errors.deadline ? '<div class="err">' + d.errors.deadline + '</div>' : '') + '</div>';

    h += '<div id="preview">' + previewHTML() + '</div>';
    h += '<div class="btns"><button class="btn" data-act="save-subject">' + (isEdit ? 'حفظ التعديل' : 'حفظ المادة') + '</button></div>';
    return h;
  }
  function deadlineHint() {
    var n = now(), dl = E.parseDay(draft.deadline);
    return dl > n.day ? E.fmtDate(dl) + ' (' + daysLabel(dl, n.day) + ')' : '';
  }
  function previewHTML() {
    var r = previewDraft();
    if (!r) return '';
    var ok = r.ok;
    return '<div class="preview ' + (ok ? 'ok' : 'bad') + '">' +
      '<div class="verdict">' + (ok ? 'الوقت يكفي' : 'الوقت لا يكفي') + '</div>' +
      '<div class="l"><span>الزمن المطلوب (مع المراجعة)</span><b>' + E.fmtDur(r.requiredMin) + '</b></div>' +
      '<div class="l"><span>وقتك المتاح حتى الموعد (لكل المواد)</span><b>' + E.fmtDur(r.availableMin) + '</b></div>' +
      (ok ? '' : '<div class="l"><span>الناقص</span><b>' + E.fmtDur(r.shortMin) + '</b></div>') +
      '<div class="note">الوقت المتاح تتقاسمه كل موادك. بعد الحفظ، ستظهر لك خيارات إن لم يكفِ.</div></div>';
  }
  function refreshPreview() {
    var el = document.getElementById('preview');
    if (el) el.innerHTML = previewHTML();
    var dh = document.getElementById('deadline-hint');
    if (dh) dh.textContent = deadlineHint();
  }

  function saveSubject() {
    var d = draft, n = now(), errs = {};
    if (!d.name.trim()) errs.name = 'اكتب اسم المادة';
    if (E.parseDay(d.deadline) <= n.day) errs.deadline = 'اختر موعداً بعد اليوم';
    if (!d.id && d.backlog === 0 && (d.mode === 'self' || d.teacherPerWeek === 0)) errs.backlog = 'أضف درساً واحداً على الأقل';
    d.errors = errs;
    if (Object.keys(errs).length) { render(); return; }
    var id = d.id;
    if (id) {
      E.updateSubject(E.findSubject(S, id), draftInput(), n.day);
    } else {
      var sub = E.createSubject(draftInput(), n.day);
      sub.color = nextColor();
      S.subjects.push(sub);
      id = sub.id;
    }
    var first = !S.meta.onboarded;
    S.meta.onboarded = true;
    draft = null;
    replan();
    toast(d.id ? 'تم حفظ التعديل' : 'تمت إضافة المادة وبُني جدولها');
    goReplace(first ? 'today' : 'subjects');
    render();
    var f = failing();
    if (f.length) setTimeout(function () { openOptions(); }, 250);
  }

  /* ============ شاشة: الجدول الأسبوعي ============ */
  function weekLabel(ws) {
    var a = new Date(ws * 86400000), b = new Date((ws + 6) * 86400000);
    var am = E.MONTHS[a.getUTCMonth()], bm = E.MONTHS[b.getUTCMonth()];
    return a.getUTCDate() + (am === bm ? '' : ' ' + am) + ' – ' + b.getUTCDate() + ' ' + bm;
  }
  function weekNav(off, act) {
    var n = now(), ws = E.weekStart(n.day) + 7 * off;
    var rel = off === 0 ? 'هذا الأسبوع' : off === 1 ? 'الأسبوع القادم' : off === -1 ? 'الأسبوع الماضي' : '';
    return '<div class="weeknav"><button class="iconbtn" data-act="' + act + '" data-dir="-1" aria-label="الأسبوع السابق">' + icon('back') + '</button>' +
      '<div class="lbl">' + weekLabel(ws) + (rel ? '<small>' + rel + '</small>' : '') + '</div>' +
      '<button class="iconbtn" data-act="' + act + '" data-dir="1" aria-label="الأسبوع التالي">' + icon('next') + '</button></div>';
  }
  function screenSchedule() {
    var n = now(), ws = E.weekStart(n.day) + 7 * ui.weekOffset;
    if (ui.selDay == null || ui.selDay < ws || ui.selDay > ws + 6) ui.selDay = (n.day >= ws && n.day <= ws + 6) ? n.day : ws;
    var h = header('الجدول', null) + weekNav(ui.weekOffset, 'week');
    h += '<div class="days">';
    for (var i = 0; i < 7; i++) {
      var day = ws + i, ss = E.sessionsOn(S, day).filter(function (s) { return s.status !== 'missed'; });
      var cap = S.settings.dayMin[E.dow(day)];
      var stack = '';
      ss.slice(0, 4).forEach(function (s) {
        var sub = E.findSubject(S, s.subjectId);
        stack += '<i class="' + (s.status === 'done' ? '' : 'p') + '" style="--c:' + colorOf(sub) + ';height:' + Math.max(4, Math.min(16, Math.round(s.minutes / 6))) + 'px"></i>';
      });
      h += '<button class="dchip' + (day === n.day ? ' today' : '') + (day === ui.selDay ? ' sel' : '') + (!cap && !ss.length ? ' off' : '') + '" data-act="pick-day" data-day="' + day + '" aria-label="' + E.fmtDate(day) + '">' +
        '<span class="dn">' + SHORT[E.dow(day)] + '</span><span class="dd">' + new Date(day * 86400000).getUTCDate() + '</span><span class="stack">' + stack + '</span></button>';
    }
    h += '</div>';

    var list = E.sessionsOn(S, ui.selDay);
    var active = list.filter(function (s) { return s.status !== 'missed'; });
    h += '<h2 class="sec">' + E.fmtDate(ui.selDay) + (active.length ? ' · ' + E.fmtDur(sum(active, function (s) { return s.minutes; })) : '') + '</h2>';
    if (!list.length) {
      var cap2 = S.settings.dayMin[E.dow(ui.selDay)];
      h += '<div class="card empty"><h3>' + (cap2 ? 'لا جلسات في هذا اليوم' : 'يوم راحة') + '</h3><p>' +
        (cap2 ? (S.subjects.length ? 'الخطة لا تحتاج وقتاً منك هذا اليوم.' : 'أضف مادة لتظهر جلساتك هنا.') : 'ضبطت هذا اليوم بلا دراسة. تقدر تغيّره من الإعدادات.') + '</p></div>';
    } else list.forEach(function (s) { h += sessionRow(s, n); });
    return h;
  }

  /* ============ شاشة: التقرير ============ */
  function screenReport() {
    var n = now(), ws = E.weekStart(n.day) + 7 * ui.repOffset;
    var r = E.weeklyReport(S, ws, n);
    var h = header('التقرير', null) + weekNav(ui.repOffset, 'rweek');
    if (!S.subjects.length) return h + '<div class="card empty"><h3>لا بيانات بعد</h3><p>أضف مادة وابدأ الدراسة ليظهر تقريرك.</p></div>';

    h += '<section class="card">';
    if (r.percent === null) {
      h += '<div class="big" style="font-size:20px;font-weight:800">' + (ws > n.day ? 'أسبوع لم يبدأ بعد' : 'لا جلسات مسجّلة') + '</div>';
      if (r.plannedMin) h += '<div class="note">مخطّط لهذا الأسبوع ' + E.fmtDur(r.plannedMin) + '.</div>';
    } else {
      h += '<div class="pct">' + r.percent + '<small>%</small></div><div class="note" style="margin:0 0 12px">نسبة الإنجاز حتى الآن</div>' +
        '<div class="strip"><span class="seg" style="flex:' + Math.max(r.doneMin, 0.01) + ' 1 0;--c:var(--ok)"></span>' +
        '<span class="seg missed" style="flex:' + Math.max(r.plannedMin - r.doneMin, 0.01) + ' 1 0;--c:var(--ink3)"></span></div>';
    }
    h += '</section>';

    h += '<section class="card"><div class="stat"><span>ساعات الدراسة</span><b>' + E.fmtDur(r.doneMin) + (r.plannedMin ? ' من ' + E.fmtDur(r.plannedMin) : '') + '</b></div>' +
      '<div class="stat"><span>الدروس المنجزة</span><b>' + E.fmtLessons(r.lessonsDone.length) + '</b></div>' +
      '<div class="stat"><span>جلسات فائتة</span><b>' + (r.missedMin ? E.fmtDur(r.missedMin) : 'لا شيء') + '</b></div></section>';

    if (r.late.length) {
      h += '<h2 class="sec">دروس متأخرة</h2><div class="chips">';
      r.late.forEach(function (l) { h += '<span class="tag late">' + esc(E.findSubject(S, l.subjectId).name) + ' · ' + esc(l.title) + '</span>'; });
      h += '</div>';
    }
    if (r.lessonsDone.length) {
      h += '<h2 class="sec">أنجزتها هذا الأسبوع</h2><div class="chips">';
      r.lessonsDone.forEach(function (l) { h += '<span class="tag ok">' + esc(E.findSubject(S, l.subjectId).name) + ' · ' + esc(l.title) + '</span>'; });
      h += '</div>';
    }
    if (r.bySubject.length) {
      h += '<h2 class="sec">حسب المادة</h2><section class="card">';
      r.bySubject.forEach(function (b) {
        var sub = E.findSubject(S, b.subjectId), c = colorOf(sub);
        var pct = b.plannedMin ? Math.round(b.doneMin / b.plannedMin * 100) : 0;
        h += '<div class="bsub"><div class="r"><span class="dot" style="--c:' + c + '"></span><b>' + esc(b.name) + '</b><span>' + E.fmtDur(b.doneMin) + ' من ' + E.fmtDur(b.plannedMin) + '</span></div>' +
          '<div class="strip thin"><span class="seg" style="flex:' + Math.max(pct, 0.01) + ' 1 0;--c:' + c + '"></span><span class="seg pending" style="flex:' + Math.max(100 - pct, 0.01) + ' 1 0;--c:' + c + '"></span></div></div>';
      });
      h += '</section>';
    }
    var nx = r.next;
    h += '<h2 class="sec">الأسبوع التالي</h2><section class="card">' +
      (nx.count ? '<div class="stat"><span>جلسات مخطّطة</span><b>' + nx.count + '</b></div><div class="stat"><span>وقت الدراسة</span><b>' + E.fmtDur(nx.minutes) + '</b></div>'
        : '<div class="note" style="margin:0">لا جلسات مخطّطة لذلك الأسبوع.</div>');
    nx.bySubject.forEach(function (b) {
      var sub = E.findSubject(S, b.subjectId);
      h += '<div class="stat"><span><span class="dot" style="--c:' + colorOf(sub) + '"></span>' + esc(sub.name) + '</span><b>' + E.fmtDur(b.minutes) + '</b></div>';
    });
    return h + '</section>';
  }

  /* ============ شاشة: الإعدادات ============ */
  function setStepper(field, val, o) {
    return '<div class="stepper">' +
      '<button type="button" data-act="sstep" data-field="' + field + '" data-dir="-1" data-step="' + o.step + '" data-min="' + o.min + '" data-max="' + o.max + '"' + (val <= o.min ? ' disabled' : '') + ' aria-label="إنقاص">−</button>' +
      '<output>' + o.fmt(val) + '</output>' +
      '<button type="button" data-act="sstep" data-field="' + field + '" data-dir="1" data-step="' + o.step + '" data-min="' + o.min + '" data-max="' + o.max + '"' + (val >= o.max ? ' disabled' : '') + ' aria-label="زيادة">+</button></div>';
  }
  function minToTime(m) { return (m < 600 ? '0' : '') + Math.floor(m / 60) + ':' + (m % 60 < 10 ? '0' : '') + (m % 60); }
  function hoursEditor() {
    var st = S.settings;
    var h = '<section class="card flat"><div class="presets"><span style="align-self:center;margin:0 0 8px 10px;font-weight:700">كل الأيام:</span>';
    [60, 120, 180, 240].forEach(function (m) { h += '<button type="button" data-act="preset" data-min="' + m + '">' + E.fmtDur(m) + '</button>'; });
    h += '</div>';
    DAY_ORDER.forEach(function (dw) {
      h += '<div class="setrow"><div class="lab">' + E.DAY_NAMES[dw] + '</div>' +
        setStepper('day:' + dw, st.dayMin[dw], { step: 30, min: 0, max: 720, fmt: function (v) { return v ? E.fmtDur(v) : 'راحة'; } }) + '</div>';
    });
    h += '<div class="setrow"><div class="lab">وقت بدء الدراسة<small>تبدأ جلسات كل يوم من هذا الوقت</small></div>' +
      '<input type="time" data-bind-set="startMin" value="' + minToTime(st.startMin) + '"></div></section>';
    return h;
  }
  function screenSettings() {
    var st = S.settings;
    var h = header('الإعدادات', null);
    h += '<h2 class="sec" style="margin-top:4px">ساعات الدراسة المتاحة</h2>' + hoursEditor();
    h += '<h2 class="sec">الجلسات</h2><section class="card flat">' +
      '<div class="setrow"><div class="lab">أطول جلسة متواصلة<small>الدرس الأطول يُقسم لأجزاء</small></div>' + setStepper('maxSession', st.maxSession, { step: 15, min: 30, max: 180, fmt: E.fmtDur }) + '</div>' +
      '<div class="setrow"><div class="lab">استراحة بين الجلسات</div>' + setStepper('breakMin', st.breakMin, { step: 5, min: 0, max: 30, fmt: function (v) { return v ? E.fmtDur(v) : 'بلا استراحة'; } }) + '</div>' +
      '<div class="setrow"><div class="lab">مراجعة الدرس السهل أو المتوسط</div>' + setStepper('reviewEasyMin', st.reviewEasyMin, { step: 15, min: 15, max: 90, fmt: E.fmtDur }) + '</div>' +
      '<div class="setrow"><div class="lab">مراجعة الدرس الصعب</div>' + setStepper('reviewHardMin', st.reviewHardMin, { step: 15, min: 15, max: 180, fmt: E.fmtDur }) + '</div></section>';
    h += '<h2 class="sec">التذكيرات</h2><section class="card flat">' +
      '<div class="setrow"><div class="lab">التذكير قبل الجلسة</div>' + setStepper('remindBefore', st.remindBefore, { step: 5, min: 0, max: 60, fmt: function (v) { return v ? E.fmtDur(v) : 'متوقف'; } }) + '</div>' +
      '<div class="setrow"><div class="lab" id="notif-lab">' + notifText() + '</div><button class="btn small ghost" data-act="notif">تفعيل</button></div></section>';
    h += '<h2 class="sec">الجدول</h2><div class="btns" style="margin-top:0"><button class="btn ghost" data-act="replan-now">إعادة الجدولة الآن</button></div>' +
      '<p class="note">التطبيق يعيد توزيع ما فاتك تلقائياً كل يوم، وهذا الزر للتحديث الفوري.</p>';
    h += '<h2 class="sec">البيانات</h2><div class="btns" style="margin-top:0"><button class="btn danger" data-act="reset">مسح كل البيانات</button></div>' +
      '<p class="note">بياناتك كلها على جوالك ولا تُرسل لأي جهة. عند مسحها لا يمكن استرجاعها.<br>الإصدار 0.1 (تجريبي)</p>';
    return h;
  }
  function notifText() {
    if (notifStatus === 'unavailable' || notifStatus == null) return 'الإشعارات<small>تعمل داخل تطبيق أندرويد فقط</small>';
    if (notifStatus === 'granted') return 'الإشعارات مفعّلة<small>سيصلك تنبيه قبل كل جلسة</small>';
    return 'الإشعارات غير مفعّلة<small>فعّلها ليصلك تنبيه قبل كل جلسة</small>';
  }
  function refreshNotifStatus() {
    if (!N) return;
    N.status().then(function (s) {
      notifStatus = s;
      var el = document.getElementById('notif-lab');
      if (el) el.innerHTML = notifText();
    });
  }

  /* ============ شاشة: الترحيب ============ */
  function screenWelcome() {
    return '<div class="welcome"><div class="hero"><h1>خطة دراسة تناسب وقتك الفعلي</h1>' +
      '<p>أدخل عدد الدروس التي تراكمت عليك ومدة كل درس، والتطبيق يرتّب لك الأيام والساعات ويعيد ترتيبها إذا تأخرت.</p></div>' +
      '<h2 class="sec">أولاً: كم تدرس في البيت؟</h2>' + hoursEditor() +
      '<div class="btns"><button class="btn" data-act="new-subject">التالي: أضف أول مادة</button></div></div>';
  }

  /* ============ الأوراق السفلية ============ */
  var sheetOpen = false, skipPop = 0;
  function openSheet(html) {
    toastEl.className = '';
    sheetRoot.innerHTML = '<div class="backdrop" data-act="close-sheet"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>' + html + '</div>';
    if (!sheetOpen) { sheetOpen = true; try { history.pushState({ sheet: 1 }, ''); } catch (e) { /* ignore */ } }
  }
  function closeSheet() {
    if (!sheetOpen) return;
    sheetRoot.innerHTML = '';
    sheetOpen = false; skipPop++;
    try { history.back(); } catch (e) { skipPop = 0; }
  }
  window.addEventListener('popstate', function () {
    if (skipPop > 0) { skipPop--; return; }
    if (sheetOpen) { sheetRoot.innerHTML = ''; sheetOpen = false; }
  });

  function sessionSheet(id) {
    var s = E.findSession(S, id); if (!s) return;
    var sub = E.findSubject(S, s.subjectId), les = E.findLesson(sub, s.lessonId), n = now();
    var h = '<h3>' + esc(sub.name) + (s.kind === 'review' ? ' — مراجعة' : '') + '</h3><p class="lead">' + esc(les ? les.title : '') +
      (s.parts > 1 ? ' — الجزء ' + s.part + ' من ' + s.parts : '') + '<br>' + E.relDay(E.parseDay(s.date), n.day) + ' · ' + E.fmtTime(s.start) + ' حتى ' + E.fmtTime(s.start + s.minutes) + ' · ' + E.fmtDur(s.minutes) + '</p>';
    if (s.note) h += '<div class="note-box"><b>ما دُرس</b><p>' + esc(s.note) + '</p></div>';
    if (s.status === 'pending') {
      h += '<button class="btn block" data-act="toggle" data-id="' + id + '">تمّت الجلسة</button>' +
        '<div class="btns" style="margin-top:10px"><button class="btn line block" data-act="skip" data-id="' + id + '">لن أدرسها، أعد توزيعها</button></div>';
    } else if (s.status === 'done') {
      h += '<button class="btn line block" data-act="toggle" data-id="' + id + '">تراجع عن الإنجاز</button>';
    } else h += '<p class="note">هذه الجلسة فاتت، وأُعيد توزيع وقتها على الأيام القادمة.</p>';
    openSheet(h);
  }

  function studyNoteSheet(sessionId, followUp) {
    var s = E.findSession(S, sessionId);
    if (!s) return;
    var sub = E.findSubject(S, s.subjectId), les = E.findLesson(sub, s.lessonId);
    sheetDraft = { sessionId: sessionId, note: s.note || '', followUp: followUp || null, rename: false };
    var h = '<h3 class="fancy">ماذا تريد أن تراجع أو تحفظ لاحقاً؟</h3>' +
      '<p class="lead soft">اكتب ما تود العودة إليه لاحقاً، ليظهر مع الجلسة وقت المراجعة.</p>' +
      '<div class="field" style="margin-top:4px"><label for="s-note">للتراجع لاحقاً</label>' +
      '<textarea id="s-note" data-bind-sheet="note" rows="3" maxlength="160" placeholder="مثال: قاعدة السلسلة — تمرين 4">' +
      esc(sheetDraft.note) + '</textarea>' +
      '<div class="hint">يُحفظ مع الجلسة ويظهر عند المراجعة.</div></div>';
    if (les && les.title && les.title.indexOf('الدرس ') === 0) {
      h += '<label class="checkline"><input type="checkbox" id="s-rename" data-act="toggle-rename"> تحديث اسم الدرس بهذا النص</label>';
    }
    h += '<div class="btns"><button class="btn block" data-act="save-note">حفظ</button></div>' +
      '<div class="btns" style="margin-top:8px"><button class="btn line block" data-act="skip-note">تخطي</button></div>';
    openSheet(h);
  }

  function difficultySheet(subjectId, lessonId) {
    var sub = E.findSubject(S, subjectId), les = E.findLesson(sub, lessonId);
    var h = '<h3>أنهيت ' + esc(les.title) + '</h3><p class="lead">كيف كان الدرس؟ يحدد هذا مدة مراجعته.</p><div class="diffs">';
    [['easy', 'سهل', S.settings.reviewEasyMin], ['medium', 'متوسط', S.settings.reviewEasyMin], ['hard', 'صعب', S.settings.reviewHardMin]].forEach(function (d) {
      h += '<button class="opt' + (les.difficulty === d[0] ? ' rec' : '') + '" data-act="difficulty" data-sid="' + subjectId + '" data-id="' + lessonId + '" data-diff="' + d[0] + '"><b>' + d[1] + '</b><span>مراجعة ' + E.fmtDur(d[2]) + '</span></button>';
    });
    openSheet(h + '</div>');
  }

  function lessonSheet(subjectId, lessonId) {
    var sub = E.findSubject(S, subjectId), l = E.findLesson(sub, lessonId); if (!l) return;
    sheetDraft = { sid: subjectId, id: lessonId, title: l.title, min: l.min };
    var h = '<h3>' + esc(sub.name) + '</h3>' +
      '<div class="field" style="margin-top:8px"><label for="l-title">اسم الدرس</label><input id="l-title" type="text" data-bind-sheet="title" value="' + esc(l.title) + '" maxlength="60"></div>';
    if (!l.done) {
      h += '<div class="field"><span class="lbl">مدة الدرس</span>' + lessonStepper(l.min) + '</div>';
    }
    h += '<div class="btns"><button class="btn" data-act="lesson-save">حفظ</button></div>';
    if (l.done) {
      h += '<h2 class="sec">إعادة الدرس للمراجعة</h2><div class="diffs">';
      [['easy', 'سهل'], ['medium', 'متوسط'], ['hard', 'صعب']].forEach(function (d) {
        h += '<button class="opt" data-act="request-review" data-sid="' + subjectId + '" data-id="' + lessonId + '" data-diff="' + d[0] + '"><b>' + d[1] + '</b></button>';
      });
      h += '</div>';
    }
    h += '<div class="btns"><button class="btn line" data-act="lesson-toggle" data-sid="' + subjectId + '" data-id="' + lessonId + '" data-close="1">' + (l.done ? 'إلغاء إنجاز الدرس' : 'تمّ الدرس') + '</button>' +
      '<button class="btn danger" data-act="lesson-delete" data-sid="' + subjectId + '" data-id="' + lessonId + '">حذف</button></div>';
    openSheet(h);
  }
  function lessonStepper(v) {
    return '<div class="stepper" id="l-stepper"><button type="button" data-act="lstep" data-dir="-1" aria-label="إنقاص"' + (v <= 15 ? ' disabled' : '') + '>−</button><output>' + E.fmtDur(v) + '</output><button type="button" data-act="lstep" data-dir="1" aria-label="زيادة"' + (v >= 360 ? ' disabled' : '') + '>+</button></div>';
  }

  function openOptions() {
    var n = now(), a = E.analyze(S, n), o = a.options;
    var bad = S.subjects.filter(function (s) { return !a.subjects[s.id].ok; });
    if (!o || !bad.length) { toast('خطتك تكفي الآن'); return; }
    var h = '<h3>الوقت لا يكفي</h3><p class="lead">اختر ما يناسبك، وسأعيد بناء الجدول فوراً.</p>';
    o.extend.forEach(function (e) {
      var sub = E.findSubject(S, e.subjectId);
      h += '<button class="opt rec" data-act="apply-extend" data-id="' + sub.id + '" data-date="' + e.newDeadline + '"><b>مدّد موعد ' + esc(sub.name) + '</b><span>إلى ' + E.fmtDate(E.parseDay(e.newDeadline)) + ' (أي ' + E.fmtDays(e.days) + ' زيادة)</span></button>';
    });
    if (o.extraMinPerDay) {
      var active = S.settings.dayMin.filter(function (m) { return m > 0; }).length;
      h += '<button class="opt" data-act="apply-hours" data-min="' + o.extraMinPerDay + '"><b>زد ساعات الدراسة</b><span>' + E.fmtDur(o.extraMinPerDay) + ' إضافية في كل يوم دراسة (' + E.fmtDays(active) + ' أسبوعياً) تكفي</span></button>';
    }
    o.reduce.forEach(function (r) {
      var sub = E.findSubject(S, r.subjectId);
      h += '<button class="opt" data-act="apply-reduce" data-id="' + sub.id + '" data-n="' + r.lessons + '"><b>قلّل دروس ' + esc(sub.name) + '</b><span>احذف آخر ' + E.fmtLessons(r.lessons) + ' لم تبدأها، وركّز على الباقي</span></button>';
    });
    h += '<div class="btns"><button class="btn line" data-act="close-sheet">لاحقاً</button></div>';
    openSheet(h);
  }

  function resultSheet(r) {
    var d = r.diff, n = now();
    var h = '<h3>تم تعديل جدولك</h3>';
    var lines = '';
    if (d.missed) lines += '<li>فاتتك ' + E.plural(d.missed, 'جلسة', 'جلستان', 'جلسات', 'جلسة') + '، وأُعيد توزيع وقتها على الأيام القادمة.</li>';
    d.moved.slice(0, 6).forEach(function (m) {
      var sub = E.findSubject(S, m.subjectId), les = E.findLesson(sub, m.lessonId);
      if (!sub) return;
      lines += '<li><b>' + esc(sub.name) + '</b> — ' + esc(les ? les.title : '') + (m.kind === 'review' ? ' (مراجعة)' : '') +
        '<br><small>من ' + E.relDay(E.parseDay(m.from), n.day) + ' إلى ' + E.relDay(E.parseDay(m.to), n.day) + '</small></li>';
    });
    if (d.moved.length > 6) lines += '<li><small>و' + (d.moved.length - 6) + ' جلسات أخرى تغيّر موعدها</small></li>';
    d.finish.forEach(function (f) {
      var sub = E.findSubject(S, f.subjectId);
      if (sub) lines += '<li><b>' + esc(sub.name) + '</b>: تنتهي الآن ' + E.fmtDate(f.to) + '<br><small>بدل ' + E.fmtDate(f.from) + '</small></li>';
    });
    if (!lines) lines = '<li>لا تغييرات على الجلسات القادمة.</li>';
    h += '<ul class="chg">' + lines + '</ul>';
    openSheet(h + '<div class="btns"><button class="btn block" data-act="close-sheet">تمام</button></div>');
    if (failing().length) { /* البانر في الشاشة الرئيسية يعرض الخيارات */ }
  }

  function confirmSheet(title, text, label, act, attrs) {
    openSheet('<h3>' + esc(title) + '</h3><p class="lead">' + esc(text) + '</p><div class="btns"><button class="btn line" data-act="close-sheet">إلغاء</button>' +
      '<button class="btn danger" data-act="' + act + '" ' + (attrs || '') + '>' + esc(label) + '</button></div>');
  }

  /* ============ الأوامر ============ */
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  var A = {
    tab: function (el, ev) { ev.preventDefault(); goReplace(el.getAttribute('data-to')); },
    back: function () { if (history.length > 1) history.back(); else goReplace('subjects'); },
    'close-sheet': function () { closeSheet(); },

    toggle: function (el) {
      var id = el.getAttribute('data-id'), s = E.findSession(S, id);
      if (!s || s.status === 'missed') return;
      if (sheetOpen) closeSheet();
      if (s.status === 'done') { E.undoSession(S, id); save(); render(); return; }
      var wasStudy = s.kind === 'study';
      var res = E.completeSession(S, id, now());
      if (res.lessonCompleted) {
        E.setDifficulty(S, res.subjectId, res.lessonId, 'medium');
        replan();
        render();
        if (wasStudy) {
          studyNoteSheet(id, { type: 'difficulty', subjectId: res.subjectId, lessonId: res.lessonId });
        } else {
          difficultySheet(res.subjectId, res.lessonId);
        }
      } else if (wasStudy) {
        save(); render();
        studyNoteSheet(id, null);
      } else {
        save(); render(); toast('أحسنت، سُجّلت الجلسة');
      }
    },
    'toggle-rename': function (el) {
      if (sheetDraft) sheetDraft.rename = !!(el.checked || (el.target && el.target.checked));
    },
    'save-note': function () {
      if (!sheetDraft || !sheetDraft.sessionId) { closeSheet(); return; }
      var s = E.findSession(S, sheetDraft.sessionId);
      var noteEl = document.getElementById('s-note');
      var note = String((noteEl && noteEl.value) || sheetDraft.note || '').trim();
      var follow = sheetDraft.followUp;
      var renEl = document.getElementById('s-rename');
      var rename = renEl ? !!renEl.checked : !!sheetDraft.rename;
      if (s) {
        if (note) s.note = note;
        else delete s.note;
        if (rename && note) {
          var sub = E.findSubject(S, s.subjectId), les = E.findLesson(sub, s.lessonId);
          if (les) les.title = note.slice(0, 60);
        }
      }
      closeSheet();
      save(); render();
      if (follow && follow.type === 'difficulty') {
        difficultySheet(follow.subjectId, follow.lessonId);
      } else {
        toast(note ? 'سُجّل موضوع الجلسة' : 'أحسنت، سُجّلت الجلسة');
      }
    },
    'skip-note': function () {
      var follow = sheetDraft && sheetDraft.followUp;
      closeSheet();
      if (follow && follow.type === 'difficulty') difficultySheet(follow.subjectId, follow.lessonId);
      else toast('أحسنت، سُجّلت الجلسة');
    },
    session: function (el) { sessionSheet(el.getAttribute('data-id')); },
    skip: function (el) {
      closeSheet();
      E.skipSession(S, el.getAttribute('data-id'));
      replan(); render(); toast('أُعيد توزيع وقتها على الأيام القادمة');
    },
    difficulty: function (el) {
      var sid = el.getAttribute('data-sid'), id = el.getAttribute('data-id'), diff = el.getAttribute('data-diff');
      closeSheet();
      E.setDifficulty(S, sid, id, diff);
      replan(); render();
      toast('أضفت مراجعة ' + E.fmtDur(diff === 'hard' ? S.settings.reviewHardMin : S.settings.reviewEasyMin) + ' لهذا الدرس');
    },
    'replan-now': function () {
      if (sheetOpen) closeSheet();
      var r = replan({ forceToday: true });
      render(); resultSheet(r);
    },
    options: function () { openOptions(); },
    'apply-extend': function (el) {
      var sub = E.findSubject(S, el.getAttribute('data-id'));
      sub.deadline = el.getAttribute('data-date');
      closeSheet(); replan(); render(); toast('مُدّد موعد ' + sub.name);
    },
    'apply-hours': function (el) {
      var add = +el.getAttribute('data-min');
      S.settings.dayMin = S.settings.dayMin.map(function (m) { return m > 0 ? Math.min(720, m + add) : m; });
      closeSheet(); replan(); render(); toast('زدت ساعات الدراسة اليومية');
    },
    'apply-reduce': function (el) {
      var sub = E.findSubject(S, el.getAttribute('data-id'));
      E.dropLastLessons(sub, +el.getAttribute('data-n'));
      closeSheet(); replan(); render(); toast('خُفّفت دروس ' + sub.name);
    },

    /* المواد */
    'new-subject': function () { draft = null; go('subject-form/new'); },
    'edit-subject': function (el) { draft = null; go('subject-form/' + el.getAttribute('data-id')); },
    'open-subject': function (el) { go('subject/' + el.getAttribute('data-id')); },
    'pick-name': function (el) { draft.name = el.getAttribute('data-name'); var i = document.getElementById('f-name'); if (i) i.value = draft.name; },
    set: function (el) {
      var f = el.getAttribute('data-field'), v = el.getAttribute('data-val');
      draft[f] = (f === 'importance') ? +v : v;
      if (f === 'mode' && v === 'teacher' && !draft.teacherPerWeek) draft.teacherPerWeek = 2;
      render();
    },
    step: function (el) {
      var f = el.getAttribute('data-field');
      draft[f] = clamp(draft[f] + (+el.getAttribute('data-dir')) * (+el.getAttribute('data-step')), +el.getAttribute('data-min'), +el.getAttribute('data-max'));
      render();
    },
    'save-subject': function () { saveSubject(); },
    'delete-subject': function (el) {
      var sub = E.findSubject(S, el.getAttribute('data-id'));
      confirmSheet('حذف ' + sub.name + '؟', 'تُحذف المادة وكل دروسها وجلساتها. لا يمكن التراجع.', 'حذف المادة', 'do-delete-subject', 'data-id="' + sub.id + '"');
    },
    'do-delete-subject': function (el) {
      var id = el.getAttribute('data-id');
      S.subjects = S.subjects.filter(function (s) { return s.id !== id; });
      S.sessions = S.sessions.filter(function (s) { return s.subjectId !== id; });
      closeSheet(); replan(); goReplace('subjects'); render(); toast('حُذفت المادة');
    },

    /* الدروس */
    lesson: function (el) { lessonSheet(el.getAttribute('data-sid'), el.getAttribute('data-id')); },
    'lesson-toggle': function (el) {
      var sid = el.getAttribute('data-sid'), id = el.getAttribute('data-id');
      var sub = E.findSubject(S, sid), l = E.findLesson(sub, id);
      if (el.getAttribute('data-close')) closeSheet();
      if (l.done) { E.setLessonDone(S, sid, id, false, now()); replan(); render(); return; }
      E.setLessonDone(S, sid, id, true, now());
      E.setDifficulty(S, sid, id, 'medium');
      replan(); render(); difficultySheet(sid, id);
    },
    'add-lesson': function (el) {
      var sub = E.findSubject(S, el.getAttribute('data-id'));
      E.addLesson(sub, { source: 'manual' });
      replan(); render(); toast('أضفت درساً جديداً');
    },
    lstep: function (el) {
      sheetDraft.min = clamp(sheetDraft.min + (+el.getAttribute('data-dir')) * 15, 15, 360);
      var w = document.getElementById('l-stepper');
      if (w) { var tmp = document.createElement('div'); tmp.innerHTML = lessonStepper(sheetDraft.min); w.parentNode.replaceChild(tmp.firstChild, w); }
    },
    'lesson-save': function () {
      var sub = E.findSubject(S, sheetDraft.sid), l = E.findLesson(sub, sheetDraft.id);
      if (sheetDraft.title.trim()) l.title = sheetDraft.title.trim();
      if (!l.done) l.min = sheetDraft.min;
      closeSheet(); replan(); render(); toast('تم الحفظ');
    },
    'lesson-delete': function (el) {
      var sub = E.findSubject(S, el.getAttribute('data-sid'));
      sub.lessons = sub.lessons.filter(function (l) { return l.id !== el.getAttribute('data-id'); });
      closeSheet(); replan(); render(); toast('حُذف الدرس');
    },
    'request-review': function (el) {
      E.requestReview(S, el.getAttribute('data-sid'), el.getAttribute('data-id'), el.getAttribute('data-diff'));
      closeSheet(); replan(); render(); toast('أُضيفت المراجعة إلى جدولك');
    },

    /* الجدول والتقرير */
    week: function (el) { ui.weekOffset += +el.getAttribute('data-dir'); ui.selDay = null; render(); },
    rweek: function (el) { ui.repOffset += +el.getAttribute('data-dir'); render(); },
    'pick-day': function (el) { ui.selDay = +el.getAttribute('data-day'); render(); },

    /* الإعدادات */
    sstep: function (el) {
      var f = el.getAttribute('data-field'), dir = +el.getAttribute('data-dir'), st = S.settings;
      var step = +el.getAttribute('data-step'), mn = +el.getAttribute('data-min'), mx = +el.getAttribute('data-max');
      if (f.indexOf('day:') === 0) { var dw = +f.slice(4); st.dayMin[dw] = clamp(st.dayMin[dw] + dir * step, mn, mx); }
      else st[f] = clamp(st[f] + dir * step, mn, mx);
      replan(); render();
    },
    preset: function (el) {
      var m = +el.getAttribute('data-min');
      S.settings.dayMin = [m, m, m, m, m, m, m];
      replan(); render();
    },
    notif: function () {
      if (!N || !N.isNative()) { toast('الإشعارات تعمل داخل تطبيق أندرويد'); return; }
      N.request().then(function (s) {
        notifStatus = s;
        if (s === 'granted') {
          N.sync(S, now(), E);
          N.exactStatus().then(function (x) { if (x !== 'granted') { toast('اسمح بالتنبيهات الدقيقة لتصل في موعدها'); N.openExactSettings(); } else toast('فُعّلت الإشعارات'); });
        } else toast('لم يُسمح بالإشعارات، فعّلها من إعدادات الجوال');
        var el = document.getElementById('notif-lab'); if (el) el.innerHTML = notifText();
      });
    },
    reset: function () { confirmSheet('مسح كل البيانات؟', 'تُحذف موادك ودروسك وجلساتك وإعداداتك من هذا الجهاز.', 'مسح كل شيء', 'do-reset'); },
    'do-reset': function () {
      closeSheet(); S = E.newState(); draft = null; save(); goReplace('welcome'); render();
    }
  };

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest ? ev.target.closest('[data-act]') : null;
    if (!el) return;
    var fn = A[el.getAttribute('data-act')];
    if (fn) fn(el, ev);
  });
  document.addEventListener('keydown', function (ev) {
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.getAttribute && ev.target.getAttribute('role') === 'button') {
      ev.preventDefault(); ev.target.click();
    }
  });
  document.addEventListener('input', function (ev) {
    var t = ev.target, k;
    if ((k = t.getAttribute('data-bind'))) {
      draft[k] = t.value;
      if (k === 'deadline') { draft.errors.deadline = null; refreshPreview(); }
    } else if ((k = t.getAttribute('data-bind-sheet'))) {
      if (sheetDraft) sheetDraft[k] = t.value;
    } else if (t.getAttribute('data-bind-set') === 'startMin') {
      var m = /^(\d{1,2}):(\d{2})$/.exec(t.value);
      if (m) { S.settings.startMin = clamp(+m[1] * 60 + +m[2], 0, 20 * 60); }
    }
  });
  document.addEventListener('change', function (ev) {
    if (ev.target.getAttribute && ev.target.getAttribute('data-bind-set') === 'startMin') { replan(); render(); }
  });

  /* ============ الإقلاع والتحديث الدوري ============ */
  function tick(showResult) {
    var n = now();
    if (!S.subjects.length) return;
    if (E.needsReplan(S, n)) {
      var r = replan();
      if (showResult && (r.diff.missed || r.diff.moved.length)) { render(); resultSheet(r); return; }
    } else if (S.meta.lastPlanDay !== n.day) replan();
  }

  function start() {
    S = load();
    if (!location.hash || location.hash === '#') {
      goReplace(S.meta.onboarded || S.subjects.length ? 'today' : 'welcome');
    }
    tick(true);
    render();
    window.addEventListener('hashchange', render);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { tick(true); if (!sheetOpen) render(); }
    });
    setInterval(function () {
      if (sheetOpen || document.hidden) return;
      var r = parseRoute();
      if (r.name === 'today' || !r.name) { tick(false); render(); }
    }, 60000);
    if (N) N.sync(S, now(), E);
  }

  window.__bac = { get state() { return S; } };   // لأغراض الاختبار فقط
  start();
})();
