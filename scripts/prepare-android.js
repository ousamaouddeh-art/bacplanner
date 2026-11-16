#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const android = path.join(root, 'android');
const manifestPath = path.join(android, 'app/src/main/AndroidManifest.xml');
const gradleGroovy = path.join(android, 'app/build.gradle');
const gradleKts = path.join(android, 'app/build.gradle.kts');
const resDir = path.join(android, 'app/src/main/res');
const srcAndroid = path.join(root, 'resources/android');

function readPkgVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const ver = String(pkg.version || '0.1.0').trim();
    const parts = ver.split('.').map(function (x) { return parseInt(x, 10) || 0; });
    const major = parts[0] || 0, minor = parts[1] || 0, patch = parts[2] || 0;
    // versionCode must rise with every release so Android offers «تحديث»
    const code = major * 10000 + minor * 100 + patch;
    return { name: ver, code: Math.max(1, code) };
  } catch (e) {
    return { name: '0.1.0', code: 1 };
  }
}


if (!fs.existsSync(manifestPath)) {
  console.error('مجلد android غير موجود. شغّل أولاً: npx cap add android');
  process.exit(1);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  fs.readdirSync(src).forEach(function (name) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    if (fs.statSync(from).isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  });
}

let manifest = fs.readFileSync(manifestPath, 'utf8');
const perms = [
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.VIBRATE',
  'android.permission.WAKE_LOCK'
];
perms.forEach(function (p) {
  if (manifest.indexOf(p) === -1) {
    manifest = manifest.replace(
      '</manifest>',
      '    <uses-permission android:name="' + p + '" />\n</manifest>'
    );
  }
});
fs.writeFileSync(manifestPath, manifest);
console.log('patched AndroidManifest.xml');

function patchGroovy(src) {
  let gradle = src;

  // Ensure signingConfigs.release exists with keystore settings
  if (gradle.indexOf('storeFile file("../../signing/bacplanner.keystore")') === -1) {
    if (gradle.indexOf('signingConfigs') === -1) {
      gradle = gradle.replace(
        /([ \t]*)buildTypes\s*\{/,
        '$1signingConfigs {\n' +
          '$1    release {\n' +
          '$1        storeFile file("../../signing/bacplanner.keystore")\n' +
          '$1        storePassword "bacplanner"\n' +
          '$1        keyAlias "bacplanner"\n' +
          '$1        keyPassword "bacplanner"\n' +
          '$1    }\n' +
          '$1}\n' +
          '$1buildTypes {'
      );
    } else {
      // signingConfigs exists but without our keystore — inject into first release block inside it
      gradle = gradle.replace(
        /(signingConfigs\s*\{[\s\S]*?release\s*\{)/,
        '$1\n            storeFile file("../../signing/bacplanner.keystore")\n' +
          '            storePassword "bacplanner"\n' +
          '            keyAlias "bacplanner"\n' +
          '            keyPassword "bacplanner"'
      );
    }
  }

  // Attach signingConfig only inside buildTypes { release { ... } }
  if (gradle.indexOf('signingConfig signingConfigs.release') === -1) {
    gradle = gradle.replace(
      /(buildTypes\s*\{[\s\S]*?)(\brelease\s*\{)/,
      '$1$2\n            signingConfig signingConfigs.release'
    );
  }

  var ver = readPkgVersion();
  if (/versionName\s+"[^"]+"/.test(gradle)) {
    gradle = gradle.replace(/versionName\s+"[^"]+"/, 'versionName "' + ver.name + '"');
  } else if (/defaultConfig\s*\{/.test(gradle)) {
    gradle = gradle.replace(/defaultConfig\s*\{/, 'defaultConfig {\n        versionName "' + ver.name + '"');
  }
  if (/versionCode\s+\d+/.test(gradle)) {
    gradle = gradle.replace(/versionCode\s+\d+/, 'versionCode ' + ver.code);
  } else if (/defaultConfig\s*\{/.test(gradle)) {
    gradle = gradle.replace(/defaultConfig\s*\{/, 'defaultConfig {\n        versionCode ' + ver.code);
  }
  console.log('versionName ' + ver.name + ' / versionCode ' + ver.code);
  return gradle;
}

function patchKts(src) {
  let gradle = src;

  if (gradle.indexOf('storeFile = file("../../signing/bacplanner.keystore")') === -1) {
    if (gradle.indexOf('signingConfigs') === -1) {
      gradle = gradle.replace(
        /([ \t]*)buildTypes\s*\{/,
        '$1signingConfigs {\n' +
          '$1    create("release") {\n' +
          '$1        storeFile = file("../../signing/bacplanner.keystore")\n' +
          '$1        storePassword = "bacplanner"\n' +
          '$1        keyAlias = "bacplanner"\n' +
          '$1        keyPassword = "bacplanner"\n' +
          '$1    }\n' +
          '$1}\n' +
          '$1buildTypes {'
      );
    } else {
      gradle = gradle.replace(
        /(signingConfigs\s*\{[\s\S]*?create\("release"\)\s*\{)/,
        '$1\n            storeFile = file("../../signing/bacplanner.keystore")\n' +
          '            storePassword = "bacplanner"\n' +
          '            keyAlias = "bacplanner"\n' +
          '            keyPassword = "bacplanner"'
      );
    }
  }

  if (gradle.indexOf('signingConfig = signingConfigs.getByName("release")') === -1) {
    gradle = gradle.replace(
      /(buildTypes\s*\{[\s\S]*?)(getByName\("release"\)\s*\{)/,
      '$1$2\n            signingConfig = signingConfigs.getByName("release")'
    );
  }

  var ver = readPkgVersion();
  if (/versionName\s*=\s*"[^"]+"/.test(gradle)) {
    gradle = gradle.replace(/versionName\s*=\s*"[^"]+"/, 'versionName = "' + ver.name + '"');
  } else if (/defaultConfig\s*\{/.test(gradle)) {
    gradle = gradle.replace(/defaultConfig\s*\{/, 'defaultConfig {\n        versionName = "' + ver.name + '"');
  }
  if (/versionCode\s*=\s*\d+/.test(gradle)) {
    gradle = gradle.replace(/versionCode\s*=\s*\d+/, 'versionCode = ' + ver.code);
  } else if (/defaultConfig\s*\{/.test(gradle)) {
    gradle = gradle.replace(/defaultConfig\s*\{/, 'defaultConfig {\n        versionCode = ' + ver.code);
  }
  console.log('versionName ' + ver.name + ' / versionCode ' + ver.code);
  return gradle;
}

if (fs.existsSync(gradleGroovy)) {
  fs.writeFileSync(gradleGroovy, patchGroovy(fs.readFileSync(gradleGroovy, 'utf8')));
  console.log('patched app/build.gradle');
} else if (fs.existsSync(gradleKts)) {
  fs.writeFileSync(gradleKts, patchKts(fs.readFileSync(gradleKts, 'utf8')));
  console.log('patched app/build.gradle.kts');
} else {
  console.error('لم يُعثر على app/build.gradle');
  process.exit(1);
}

if (!fs.existsSync(srcAndroid)) {
  console.error('resources/android غير موجود. شغّل: python3 scripts/gen-icons.py');
  process.exit(1);
}
copyDir(srcAndroid, resDir);
// Capacitor may already ship values/ic_launcher_background.xml — drop our old alias file if present
const legacyColors = path.join(resDir, 'values', 'ic_launcher_colors.xml');
if (fs.existsSync(legacyColors)) fs.unlinkSync(legacyColors);
console.log('copied launcher and notification icons');
