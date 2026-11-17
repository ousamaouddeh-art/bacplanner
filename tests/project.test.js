const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..');
test('اتساق إصدار الحزمة والقفل والواجهة', () => {
  const pkg = require('../package.json'), lock = require('../package-lock.json');
  assert.equal(pkg.version, lock.version); assert.equal(pkg.version, lock.packages[''].version);
  assert.ok(fs.readFileSync(path.join(root, 'www/js/app.js'), 'utf8').includes("var APP_VERSION = '" + pkg.version + "';"));
});
test('اختبار المتصفح يستخدم اعتماد المشروع ويؤكد النتائج', () => {
  const pkg = require('../package.json'), lock = require('../package-lock.json');
  assert.equal(pkg.devDependencies.playwright, lock.packages['node_modules/playwright'].version);
  const source = fs.readFileSync(path.join(__dirname, 'ui.test.js'), 'utf8');
  assert.ok(source.includes("require('playwright')")); assert.ok(!source.includes('/opt/'));
  assert.ok(source.includes("assert.deepEqual(errors, []"));
});
test('البناء يشغل الاختبارات قبل إنشاء أندرويد', () => {
  const source = fs.readFileSync(path.join(root, '.github/workflows/build-apk.yml'), 'utf8');
  assert.ok(source.indexOf('run: npm test') > 0);
  assert.ok(source.indexOf('run: npm run test:ui') < source.indexOf('run: npx cap add android'));
});
for (const kotlin of [false, true]) test('تجهيز أندرويد ' + (kotlin ? 'Kotlin' : 'Groovy') + ' دون تغيير التوقيع السابق', () => {
  const os = require('node:os'), { execFileSync } = require('node:child_process');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bac-android-check-'));
  try {
    for (const dir of ['scripts', 'resources/android/values', 'android/app/src/main']) fs.mkdirSync(path.join(tmp, dir), { recursive: true });
    fs.copyFileSync(path.join(root, 'scripts/prepare-android.js'), path.join(tmp, 'scripts/prepare-android.js'));
    fs.copyFileSync(path.join(root, 'package.json'), path.join(tmp, 'package.json'));
    const manifest = path.join(tmp, 'android/app/src/main/AndroidManifest.xml');
    fs.writeFileSync(manifest, '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application /></manifest>');
    const gradle = path.join(tmp, 'android/app/build.gradle' + (kotlin ? '.kts' : ''));
    fs.writeFileSync(gradle, kotlin ? 'android {\n defaultConfig {\n versionCode = 1\n versionName = "0.1.0"\n }\n buildTypes {\n getByName("release") { }\n }\n}' : 'android {\n defaultConfig {\n versionCode 1\n versionName "0.1.0"\n }\n buildTypes {\n release { }\n }\n}');
    fs.writeFileSync(path.join(tmp, 'resources/android/values/check.xml'), '<resources />');
    const execute = () => execFileSync(process.execPath, [path.join(tmp, 'scripts/prepare-android.js')], { stdio: 'pipe' });
    execute(); const before = fs.readFileSync(gradle, 'utf8'); execute();
    assert.equal(fs.readFileSync(gradle, 'utf8'), before);
    assert.ok(before.includes('0.2.2')); assert.ok(before.includes('202')); assert.ok(before.includes('../../signing/bacplanner.keystore'));
    assert.equal((fs.readFileSync(manifest, 'utf8').match(/android.permission.POST_NOTIFICATIONS/g) || []).length, 1);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
