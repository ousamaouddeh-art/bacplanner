# مخطط البكالوريا

تطبيق أندرويد (وموقع يعمل بلا إنترنت) لتخطيط دراسة البكالوريا: مواد، دروس، جدول يومي، مراجعات، وتذكيرات محلية.

البيانات تُحفظ في `localStorage` فقط. لا يحتاج حساباً ولا شبكة بعد التثبيت.

## التشغيل في المتصفح

لا يوجد bundler. الملفات في `www/`.

```bash
python3 -m http.server 8123 --directory www
```

ثم افتح `http://localhost:8123`. الواجهة عربية وRTL ومُصمَّمة لحجم الجوال.

## الاختبارات

```bash
# محرك الجدولة (بدون متصفح)
node --test tests/engine.test.js

# الواجهة (Playwright) — يحتاج الخادم أعلاه على المنفذ 8123
node --test tests/ui.test.js
```

## بناء APK موقّع

المتطلبات محلياً: Node.js 22، JDK 21، Android SDK، Python 3 مع Pillow.

```bash
npm install
python3 scripts/gen-icons.py          # يولّد resources/android (أيقونات الكثافات)
npx cap add android
npx cap sync
node scripts/prepare-android.js       # أذونات + توقيع + نسخ الأيقونات
cd android
chmod +x gradlew
./gradlew assembleRelease
```

الملف الناتج:

`android/app/build/outputs/apk/release/app-release.apk`

سكربت `scripts/prepare-android.js` يضيف أذونات الإشعارات (`POST_NOTIFICATIONS` و`SCHEDULE_EXACT_ALARM`)، يضبط التوقيع بالمفتاح الثابت، وينسخ أيقونة المشغّل من `resources/android`.

مجلد `android/` يُولَّد ولا يُرفع إلى Git. مجلد `resources/android` أيضاً مولَّد (لا تحتاج لرفعه).

## البناء عبر GitHub Actions

الملف `.github/workflows/build-apk.yml` يبني APK موقّعاً عند الدفع إلى `master`/`main` أو يدوياً من تبويب Actions.

1. ارفع المشروع إلى GitHub.
2. انتظر انتهاء مهمة **Build signed APK**.
3. نزّل الـ artifact باسم `bacplanner-apk`.

الخطوات داخل المهمة: JDK 21، `npm install`، توليد الأيقونات بـ Pillow، `npx cap add android`، `npx cap sync`، تعديل الـ Manifest والأيقونة والتوقيع، ثم `gradlew assembleRelease`.

## التثبيت على الجهاز

1. انقل `app-release.apk` إلى الهاتف.
2. اسمح بتثبيت من مصادر غير المتجر إن طُلب.
3. ثبّت وافتح **مخطط البكالوريا**.
4. من الإعدادات اسمح بالإشعارات إن أردت التذكير قبل الجلسات.
5. على أندرويد 12 فما فوق قد تحتاج تفعيل المنبّهات الدقيقة من إعدادات النظام.

التحديثات اللاحقة من نفس مسار GitHub Actions تُوقَّع بنفس المفتاح، فيمكن التحديث فوق النسخة السابقة دون حذف البيانات.


## الإصدارات والتحديث على الهاتف

لكي يظهر زر **تحديث** بدل تثبيت، ويُحفظ `localStorage` دون حذف التطبيق:

1. نفس `appId` (`app.bacplanner`) — لا تغيّره.
2. نفس مفتاح التوقيع في `signing/bacplanner.keystore`.
3. رفع **رقم الإصدار** في `package.json` قبل كل بناء جديد، مثلاً من `0.2.0` إلى `0.2.1`.

السكربت يحوّل الإصدار تلقائياً إلى:
- `versionName` = النص (مثل `0.2.1`)
- `versionCode` = رقم صحيح متصاعد (مثل `201`)

بدون رفع `versionCode` قد يرفض أندرويد التثبيت فوق النسخة القديمة أو لا يعاملها كتحديث.

## الأيقونة والمفتاح

- المصدر: `resources/icon.png` (أزرق `#2749C9` مع دفتر وعلامة إنجاز).
- نسخ الويب: `www/icon.png`.
- إعادة التوليد: `python3 scripts/gen-icons.py` (يحتاج Pillow).
- مفتاح التوقيع الثابت: `signing/bacplanner.keystore`
  - alias: `bacplanner`
  - كلمة المرور: `bacplanner`

هذا المفتاح للبناء المتكرر من المستودع نفسه. لا تستخدمه لتوزيع على متجر عام؛ أنشئ مفتاحاً خاصاً بك عندها.

## هيكل المشروع

```text
www/                 الواجهة والمحرك
www/js/engine.js     محرك الجدولة (بدون DOM)
www/js/app.js        الواجهة
www/js/notify.js     التذكيرات عبر Capacitor
tests/               اختبارات المحرك والواجهة
capacitor.config.json
signing/             مفتاح التوقيع الثابت
resources/           أيقونات أندرويد
.github/workflows/   بناء الـ APK
```

`appId`: `app.bacplanner` — `webDir`: `www`.
