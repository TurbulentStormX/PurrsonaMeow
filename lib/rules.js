// =====================================================================
// THE RULES ENGINE
// The booking rules live in public/data.js and public/bookings.js. They are the SAME files the website
// loads in the browser. Here the server runs them too: it loads the data from the database, runs one
// rule function, and saves whatever the rule changed. So the browser can show what is possible,
// but only the server decides what is allowed.
// =====================================================================
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';

// For each list in the database, which field is its id. (openHours and settings are single documents.)
export const ID_KEYS = {
  reservations: 'code', orders: 'code', rooms: 'id', sessions: 'id', rates: 'id', holidays: 'id', cats: 'id', events: 'id',
  menuItems: 'id', faq: 'id', feedbackMessages: 'id', subscriptions: 'id', reviews: 'id', handlerLeaves: 'id'
};
export const CONFIG_KEYS = ['openHours', 'settings', 'meta'];            // single documents ('meta' remembers that the starting data was added)
export const ALL_KEYS = [...Object.keys(ID_KEYS), ...CONFIG_KEYS];

// The only rule functions the server will run when a browser asks.
export const RULE_FUNCTIONS = new Set([
  'createReservation', 'cancelReservation', 'payReservation', 'editReservation', 'addLeave', 'removeLeave',
  'replaceCatInUpcomingBookings', 'addReview', 'concludeReservation', 'placeOrder', 'markOrderServed',
  'subscribe', 'cancelSubscription', 'submitFeedback', 'clearPracticeData', 'payCancellationFee', 'sweepBookings', 'setCatStatus',
  'beginOnlinePayment', 'attachPayRequest', 'completeOnlinePayment'     // used by the server's HitPay routes only (not in the browser's action list)
]);

// What changed between two copies of the data: for each list the documents to save and the ids to delete.
export function diffSnapshots(before, after) {
  const changes = {};
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const key of ALL_KEYS) {
    const b = before[key], a = after[key];
    if (a === undefined || same(a, b)) continue;
    if (CONFIG_KEYS.includes(key)) { changes[key] = { value: a }; continue; }
    const idField = ID_KEYS[key];
    const old = new Map((b || []).map(d => [d[idField], d]));
    const seen = new Set();
    const upserts = [];
    for (const d of a) {
      seen.add(d[idField]);
      if (!old.has(d[idField]) || !same(old.get(d[idField]), d)) upserts.push(d);
    }
    const deletes = [...old.keys()].filter(id => !seen.has(id));
    if (upserts.length || deletes.length) changes[key] = { upserts, deletes };
  }
  return changes;
}

// Only one thing changes the data at a time, so two guests can never take the same slot.
export class Mutex {
  constructor() { this.tail = Promise.resolve(); }
  run(task) {
    const result = this.tail.then(task);
    this.tail = result.catch(() => {});
    return result;
  }
}

export function createEngine({ publicDir, clock }) {
  const scripts = ['data.js', 'bookings.js'].map(f => new vm.Script(fs.readFileSync(path.join(publicDir, f), 'utf8'), { filename: f }));

  // Runs some source code inside a fresh sandbox that holds a copy of the data.
  // Returns { result, after } where after is the data once the code has run.
  function execute(snapshot, staff, source, args = []) {
    const sandbox = { console, JSON, Math, Number, String, __snapshotJson: JSON.stringify(snapshot), __staffJson: JSON.stringify(staff), __args: JSON.stringify(args) };
    if (clock) sandbox.__clockNow = () => clock();
    const ctx = vm.createContext(sandbox);
    // the two storage functions the rules use (the browser has its own version of these)
    vm.runInContext(`
      var __store = JSON.parse(__snapshotJson);
      function readKey(key, fallback) { return __store[key] === undefined ? fallback : JSON.parse(JSON.stringify(__store[key])); }
      function writeKey(key, value) { __store[key] = JSON.parse(JSON.stringify(value)); }
      const USERS = JSON.parse(__staffJson);
      ${clock ? 'const __RealDate = Date; Date = class extends __RealDate { constructor(...a) { if (a.length === 0) super(__clockNow()); else super(...a); } static now() { return __clockNow(); } };' : ''}
    `, ctx);
    scripts.forEach(s => s.runInContext(ctx));
    const out = vm.runInContext(`JSON.stringify((function () { ${source} })())`, ctx);
    return { result: out === undefined ? undefined : JSON.parse(out), after: JSON.parse(vm.runInContext('JSON.stringify(__store)', ctx)) };
  }

  return {
    // Runs one rule function, for example call(snapshot, staff, 'cancelReservation', ['CC-ABCDE', 'guest', 'a@b.com'])
    call(snapshot, staff, fn, args) {
      if (!RULE_FUNCTIONS.has(fn)) throw new Error('Not an allowed rule: ' + fn);
      const { result, after } = execute(snapshot, staff, 'return ' + fn + '.apply(null, JSON.parse(__args));', args);
      return { result, changes: diffSnapshots(snapshot, after) };
    },
    // Adds the starting data (rooms, sessions, rates, cats, menu, ...) for any list the snapshot does not have. Never overwrites.
    seed(snapshot, staff) {
      const source = `
        loadRooms(); loadSessions(); loadRates(); loadHours(); loadHolidays(); loadCats(); loadEvents(); loadMenu(); loadFaq();
        if (readKey('settings', undefined) === undefined) writeKey('settings', { breakMinutes: 60 });
        return true;`;
      const { after } = execute(snapshot, staff, source);
      return { changes: diffSnapshots(snapshot, after) };
    }
  };
}
