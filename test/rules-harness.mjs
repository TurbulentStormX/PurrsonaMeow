// Loads the site's own rule files (data.js, bookings.js) into a pretend memory, with a clock the tests can set.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// the website folder: the rules in it are the same files the browser and the server use
export const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
export const STAFF = [
  { username: 'admin', role: 'admin', name: 'Admin', contact: 'admin@example.com' },
  { username: 'aisha', role: 'handler', name: 'Aisha', contact: 'aisha@example.com' },
  { username: 'ben', role: 'handler', name: 'Ben', contact: 'ben@example.com' }
];
export function load() {
  const RealDate = Date;
  let fixed = null;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0 && fixed !== null) super(fixed); else super(...a); }
    static now() { return fixed !== null ? fixed : RealDate.now(); }
  }
  const ctx = vm.createContext({ console, Date: FakeDate, JSON, Math, Number, String, window: { location: {} } });
  // the same two storage functions the browser and the server provide
  vm.runInContext(`
    var __mem = {};
    function readKey(key, fallback) { return __mem[key] === undefined ? fallback : JSON.parse(JSON.stringify(__mem[key])); }
    function writeKey(key, value) { __mem[key] = JSON.parse(JSON.stringify(value)); }
    var localStorage = { getItem: k => __mem[k] === undefined ? null : JSON.stringify(__mem[k]), setItem: (k, v) => { __mem[k] = JSON.parse(v); }, removeItem: k => { delete __mem[k]; } };
    const USERS = ${JSON.stringify(STAFF)};
  `, ctx);
  for (const f of ['data.js', 'bookings.js']) vm.runInContext(fs.readFileSync(`${SITE}/${f}`, 'utf8'), ctx, { filename: f });
  const run = code => vm.runInContext(/^\s*(const|let)\s/.test(code) ? '{' + code + '\n}' : code, ctx);
  return {
    run,
    ctx,
    setNow(text) { fixed = new RealDate(text).getTime(); },
    pick(which) { run(which === 'last' ? 'randomPick = list => list[list.length - 1]' : 'randomPick = list => list[0]'); },
    call(fn, ...args) { ctx.__args = JSON.stringify(args); return JSON.parse(run(`JSON.stringify(${fn}(...JSON.parse(__args)))`) ?? 'null'); },
    get(expr) { return JSON.parse(run(`JSON.stringify(${expr})`) ?? 'null'); }
  };
}
export const CAT = { name: 'Cat', email: 'cat@gmail.com', phone: '91234501' };
export const DOG = { name: 'Dog', email: 'dog@gmail.com', phone: '91234502' };
