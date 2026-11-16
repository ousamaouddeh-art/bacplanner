# حالة المشروع: مخطط البكالوريا (نسخة 0.1)

تطبيق ويب (HTML/JS بدون bundler) سيُغلَّف بـ Capacitor ليصير APK. الكود في `www/`.

## الجاهز
- `www/js/engine.js`: محرك الجدولة (نقي، بدون DOM). اختباراته في `tests/engine.test.js`، وتشغيلها: `node --test tests/engine.test.js` (21 اختباراً ناجحاً).
- `www/index.html` و`www/css/style.css` و`www/js/app.js`: الواجهة العربية RTL بكل الشاشات (اليوم، المواد، تفاصيل المادة، نموذج المادة، الجدول، التقرير، الإعدادات). جُرّبت بمتصفح بحجم جوال دون أخطاء في الـconsole.
- `www/js/notify.js`: التذكيرات عبر Capacitor LocalNotifications (لا تفعل شيئاً خارج أندرويد).
- `tests/ui.test.js`: اختبار واجهة بـ Playwright (يحتاج خادماً محلياً على منفذ 8123: `python3 -m http.server 8123 --directory www`).

## المطلوب إكماله
1. `package.json` وملف `capacitor.config.json` (appId مثل `app.bacplanner`، appName «مخطط البكالوريا»، webDir `www`) مع @capacitor/core و@capacitor/cli و@capacitor/android و@capacitor/local-notifications بنفس الإصدار الرئيسي.
2. `.github/workflows/build-apk.yml`: JDK 21، `npm install`، `npx cap add android`، `npx cap sync`، تعديل AndroidManifest (أذونات POST_NOTIFICATIONS وSCHEDULE_EXACT_ALARM)، أيقونة، توقيع بمفتاح ثابت، `gradlew assembleRelease`، رفع الـAPK كـ artifact.
3. أيقونة التطبيق.
4. README عربي بخطوات الرفع والبناء والتثبيت.

## قيود يجب الحفاظ عليها
- يعمل بدون إنترنت، والبيانات في localStorage فقط.
- لا optional chaining (`?.`) ولا `??` ولا flex gap ولا color-mix (لدعم WebView قديم).
- المحرك لا يعتمد على المتصفح.

## لم يُختبر
- بناء الـAPK والإشعارات على جهاز أندرويد حقيقي.
- قوائم الدروس الحقيقية للمنهاج (ستُضاف لاحقاً كـ JSON، ونموذج الدرس جاهز لاستقبالها).
