#!/usr/bin/env node
'use strict';
const fs = require('node:fs'), path = require('node:path'), root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error('Expected major.minor.patch');
const appFile = path.join(root, 'www/js/app.js'), source = fs.readFileSync(appFile, 'utf8');
if (!/var APP_VERSION = '[^']+';/.test(source)) throw new Error('Version field missing');
const next = source.replace(/var APP_VERSION = '[^']+';/, "var APP_VERSION = '" + pkg.version + "';");
if (next !== source) fs.writeFileSync(appFile, next);
const lockFile = path.join(root, 'package-lock.json'), lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
if (lock.version !== pkg.version || lock.packages[''].version !== pkg.version) {
  lock.version = pkg.version; lock.packages[''].version = pkg.version;
  fs.writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n');
}
