// Runs the unmodified browser scripts with a small DOM/bridge substitute.
// This verifies handlers and stored data, not browser layout or Android delivery.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const E = require('../../www/js/engine.js');
const TODAY = E.parseDay('2026-11-11');
const NOW = { day: TODAY, min: 480 };
function fixture(settings, options) {
  const s = E.newState();
  Object.assign(s.settings, { dayMin: Array(7).fill(180) }, settings);
  const sub = E.createSubject(Object.assign({ name: 'مادة', mode: 'self', backlog: 1, lessonMin: 60, deadline: E.fmtDay(TODAY + 20) }, options), TODAY);
  s.subjects.push(sub);
  return { s, sub };
}
function harness(input, opts = {}) {
  const events = {}, windowEvents = {}, nodes = {}, syncs = [], values = new Map();
  let failWrites = !!opts.failWrites;
  if (input !== undefined) values.set('bacplanner.v1', typeof input === 'string' ? input : JSON.stringify(input));
  if (opts.backup) values.set('bacplanner.v1.backup', JSON.stringify(opts.backup));
  for (const id of ['app', 'tabs', 'sheet-root', 'toast']) nodes[id] = { innerHTML: '', className: '' };
  const location = { hash: opts.hash || '#/today', replace(x) { this.hash = x; } };
  const history = { length: 1, pushes: 0, backs: 0, pushState() { this.pushes++; }, back() { this.backs++; } };
  const document = {
    getElementById: id => nodes[id] || null,
    body: { className: '', appendChild() {} }, hidden: false,
    addEventListener: (n, f) => { events[n] = f; },
    createElement: () => ({ click() {}, remove() {} })
  };
  const window = {
    Engine: { ...E, nowInfo: () => ({ ...NOW }) },
    Notify: { sync: async state => { syncs.push(JSON.parse(JSON.stringify(state))); return { status: 'empty' }; }, status: async () => 'unavailable' },
    addEventListener: (n, f) => { windowEvents[n] = f; }, scrollTo() {}, pageYOffset: 0
  };
  const localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { if (failWrites) throw new Error('QUOTA'); values.set(key, value); },
    removeItem: key => { if (failWrites) throw new Error('QUOTA'); values.delete(key); }
  };
  class Reader {
    readAsText(file) { this.result = file.contents; this.onload(); }
  }
  const context = { window, document, location, history, localStorage, console, Blob,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} }, FileReader: Reader,
    setInterval() {}, setTimeout: () => 1, clearTimeout() {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../www/js/app.js'), 'utf8'), context);
  const element = (attrs, rest = {}) => ({ getAttribute: k => attrs[k] ?? null, closest() { return this; }, ...rest });
  return {
    window, context, events, nodes, values, syncs, history, location,
    get state() { return window.__bac.state; },
    failWrites(value) { failWrites = value; },
    click(action, attrs = {}) { events.click({ target: element({ 'data-act': action, ...attrs }), preventDefault() {} }); },
    input(attrs, value) { events.input({ target: element(attrs, { value }) }); },
    import(raw) { events.change({ target: element({ 'data-import': '1' }, { value: '', files: [{ size: raw.length, contents: raw }] }) }); },
    route(hash) { location.hash = hash; windowEvents.hashchange(); }
  };
}
module.exports = { E, TODAY, NOW, fixture, harness };
