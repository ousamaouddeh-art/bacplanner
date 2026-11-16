/* التذكيرات المحلية عبر Capacitor LocalNotifications.
 * داخل المتصفح (للاختبار) لا يفعل شيئاً، وأي خطأ لا يوقف التطبيق. */
(function (root) {
  'use strict';

  function plugin() {
    try {
      var c = root.Capacitor;
      if (c && c.isNativePlatform && c.isNativePlatform() && c.Plugins && c.Plugins.LocalNotifications) {
        return c.Plugins.LocalNotifications;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  var MAX_NOTIFICATIONS = 60;
  var DAYS_AHEAD = 7;

  var Notify = {
    isNative: function () { return !!plugin(); },

    // 'granted' | 'denied' | 'prompt' | 'unavailable'
    status: function () {
      var p = plugin();
      if (!p) return Promise.resolve('unavailable');
      return p.checkPermissions().then(function (r) { return r.display; })
        .catch(function () { return 'unavailable'; });
    },

    request: function () {
      var p = plugin();
      if (!p) return Promise.resolve('unavailable');
      return p.requestPermissions().then(function (r) { return r.display; })
        .catch(function () { return 'unavailable'; });
    },

    // أندرويد 12+: التذكير بالدقيقة المضبوطة يحتاج إذناً خاصاً
    exactStatus: function () {
      var p = plugin();
      if (!p || !p.checkExactNotificationSetting) return Promise.resolve('granted');
      return p.checkExactNotificationSetting().then(function (r) { return r.exact_alarm; })
        .catch(function () { return 'granted'; });
    },
    openExactSettings: function () {
      var p = plugin();
      if (!p || !p.changeExactNotificationSetting) return Promise.resolve();
      return p.changeExactNotificationSetting().catch(function () { });
    },

    // يعيد جدولة تذكيرات الجلسات القادمة بحسب الخطة الحالية
    sync: function (state, now, E) {
      var p = plugin();
      if (!p) return Promise.resolve();
      return p.checkPermissions().then(function (perm) {
        if (perm.display !== 'granted') return null;
        return p.getPending().then(function (res) {
          return res.notifications && res.notifications.length ? p.cancel({ notifications: res.notifications }) : null;
        }).then(function () {
          var before = state.settings.remindBefore;
          if (!before || before <= 0) return null;
          var subjects = {};
          state.subjects.forEach(function (s) { subjects[s.id] = s; });
          var base = new Date();
          var list = [];
          state.sessions
            .filter(function (s) { return s.status === 'pending' && E.parseDay(s.date) - now.day <= DAYS_AHEAD; })
            .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.start - b.start; })
            .forEach(function (s) {
              if (list.length >= MAX_NOTIFICATIONS) return;
              var day = E.parseDay(s.date);
              var at = new Date(base.getFullYear(), base.getMonth(), base.getDate() + (day - now.day), 0, s.start - before, 0, 0);
              if (at.getTime() < Date.now() + 5000) return;
              var sub = subjects[s.subjectId];
              var les = sub ? E.findLesson(sub, s.lessonId) : null;
              list.push({
                id: list.length + 1,
                title: (s.kind === 'review' ? 'مراجعة ' : 'دراسة ') + (sub ? sub.name : ''),
                body: (les ? les.title + ' — ' : '') + E.fmtDur(s.minutes) + ' تبدأ ' + E.fmtTime(s.start),
                schedule: { at: at, allowWhileIdle: true },
                channelId: 'sessions'
              });
            });
          if (!list.length) return null;
          var ch = p.createChannel ? p.createChannel({
            id: 'sessions', name: 'تذكير جلسات الدراسة', description: 'تنبيه قبل موعد كل جلسة دراسة',
            importance: 4, visibility: 1, vibration: true
          }).catch(function () { }) : Promise.resolve();
          return ch.then(function () { return p.schedule({ notifications: list }); });
        });
      }).catch(function (e) {
        if (root.console) console.warn('notify.sync', e);
      });
    }
  };

  root.Notify = Notify;
})(typeof self !== 'undefined' ? self : this);
