/* Local reminders: serialized updates prevent an older plan replacing a newer one.
 * Browser mode is a no-op. Failures are returned to the UI, never reported as success.
 */
(function (root) {
  'use strict';
  function plugin() {
    try {
      var c = root.Capacitor;
      if (c && c.isNativePlatform && c.isNativePlatform() && c.Plugins && c.Plugins.LocalNotifications) return c.Plugins.LocalNotifications;
    } catch (e) { /* unavailable bridge */ }
    return null;
  }
  var MAX_NOTIFICATIONS = 60, DAYS_AHEAD = 7, queue = Promise.resolve();
  function runSync(state, now, E) {
    var p = plugin();
    if (!p) return Promise.resolve({ status: 'unavailable', count: 0 });
    return p.checkPermissions().then(function (perm) {
      // Cancellation also runs when permission was revoked, or reminders are disabled.
      return p.getPending().then(function (res) {
        return res.notifications && res.notifications.length ? p.cancel({ notifications: res.notifications }) : null;
      }).then(function () {
        if (perm.display !== 'granted') return { status: 'denied', count: 0 };
        var before = state.settings.remindBefore;
        if (!before || before <= 0) return { status: 'disabled', count: 0 };
        var subjects = {}, base = new Date(), list = [];
        state.subjects.forEach(function (s) { subjects[s.id] = s; });
        state.sessions.filter(function (s) {
          var diff = E.parseDay(s.date) - now.day;
          return s.status === 'pending' && diff >= 0 && diff <= DAYS_AHEAD;
        }).sort(function (a, b) {
          return a.date < b.date ? -1 : a.date > b.date ? 1 : a.start - b.start;
        }).forEach(function (s) {
          if (list.length >= MAX_NOTIFICATIONS) return;
          var sub = subjects[s.subjectId], les = sub ? E.findLesson(sub, s.lessonId) : null;
          if (!sub || !les || les.archived || s.start < 0 || s.start + s.minutes > 1440) return;
          var day = E.parseDay(s.date);
          var at = new Date(base.getFullYear(), base.getMonth(), base.getDate() + (day - now.day), 0, s.start - before, 0, 0);
          if (at.getTime() < Date.now() + 5000) return;
          list.push({
            id: list.length + 1,
            title: (s.kind === 'review' ? 'مراجعة ' : 'دراسة ') + sub.name,
            body: les.title + ' — ' + E.fmtDur(s.minutes) + ' تبدأ ' + E.fmtTime(s.start),
            schedule: { at: at, allowWhileIdle: true }, channelId: 'sessions'
          });
        });
        if (!list.length) return { status: 'empty', count: 0 };
        var channel = p.createChannel ? p.createChannel({
          id: 'sessions', name: 'تذكير جلسات الدراسة', description: 'تنبيه قبل موعد كل جلسة دراسة',
          importance: 4, visibility: 1, vibration: true
        }) : Promise.resolve();
        return channel.then(function () { return p.schedule({ notifications: list }); }).then(function () {
          return { status: 'scheduled', count: list.length };
        });
      });
    });
  }
  var Notify = {
    isNative: function () { return !!plugin(); },
    status: function () {
      var p = plugin();
      if (!p) return Promise.resolve('unavailable');
      return p.checkPermissions().then(function (r) { return r.display; }).catch(function () { return 'unavailable'; });
    },
    request: function () {
      var p = plugin();
      if (!p) return Promise.resolve('unavailable');
      return p.requestPermissions().then(function (r) { return r.display; }).catch(function () { return 'unavailable'; });
    },
    exactStatus: function () {
      var p = plugin();
      if (!p || !p.checkExactNotificationSetting) return Promise.resolve('unavailable');
      return p.checkExactNotificationSetting().then(function (r) { return r.exact_alarm || 'unavailable'; }).catch(function () { return 'unavailable'; });
    },
    openExactSettings: function () {
      var p = plugin();
      if (!p || !p.changeExactNotificationSetting) return Promise.resolve(false);
      return p.changeExactNotificationSetting().then(function () { return true; }).catch(function () { return false; });
    },
    sync: function (state, now, E) {
      // Snapshot on request; no later mutation can alter an in-flight update.
      var snapshot;
      try { snapshot = JSON.parse(JSON.stringify(state)); }
      catch (e) { return Promise.resolve({ status: 'error', count: 0 }); }
      var time = { day: now.day, min: now.min };
      var task = queue.then(function () { return runSync(snapshot, time, E); }).catch(function () {
        return { status: 'error', count: 0 };
      });
      queue = task.then(function () {});
      return task;
    }
  };
  root.Notify = Notify;
})(typeof self !== 'undefined' ? self : this);
