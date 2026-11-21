import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { Mongoose } from 'mongoose';
import { build, STRONG, TOMORROW, SAT } from './helpers.js';
import { buildModels } from '../models/index.js';
import { diffSnapshots, createEngine, ALL_KEYS } from '../lib/rules.js';
import { MemoryStore, MongoStore } from '../lib/stores.js';
import { ensureSeeded } from '../lib/seed.js';
import { FakeUsers, PUBLIC } from './helpers.js';

const envs = [];
const world = async (opts) => { const e = await build(opts); envs.push(e); return e; };
after(() => envs.forEach(e => e.close()));

// ======================================================= seeding and the data model
test('seed: every list gets its starting data, staff accounts are made, and running it again changes nothing', async () => {
  const e = await world();
  const s = await e.store.loadAll();
  assert.deepEqual([s.rooms.length, s.sessions.length, s.rates.length, s.cats.length, s.menuItems.length, s.faq.length, s.holidays.length, s.events.length], [4, 2, 6, 6, 8, 8, 12, 3]);
  assert.equal(s.openHours.weekly.length, 7);
  assert.deepEqual(s.settings, { breakMinutes: 60 });
  assert.deepEqual(['reservations', 'orders', 'reviews', 'feedbackMessages', 'subscriptions', 'handlerLeaves'].map(k => s[k].length), [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(s.meta, { seeded: true });
  assert.deepEqual(e.User.rows.filter(u => u.username && ['admin', 'aisha', 'ben'].includes(u.username)).map(u => [u.username, u.role]), [['admin', 'admin'], ['aisha', 'handler'], ['ben', 'handler']]);
  const again = await ensureSeeded({ store: e.store, engine: createEngine({ publicDir: PUBLIC }), User: e.User, env: {}, log: () => {} });
  assert.deepEqual([again.seededKeys, again.createdStaff], [[], []]);
  assert.deepEqual(await e.store.loadAll(), s);
});
test('seed: a list the admin empties on purpose is NOT filled in again at the next start', async () => {
  const e = await world();
  const engine = createEngine({ publicDir: PUBLIC });
  await e.call('PUT', '/api/collection/rates', { value: [] }, e.tokens.admin);
  const again = await ensureSeeded({ store: e.store, engine, User: e.User, env: {}, log: () => {} });
  assert.deepEqual(again.seededKeys, []);
  assert.deepEqual((await e.store.loadAll()).rates, []);
  // a brand-new database (every list empty, like MongoDB gives for new collections) does get its starting data
  const fresh = new MemoryStore();
  const out = await ensureSeeded({ store: fresh, engine, User: new FakeUsers(), env: {}, log: () => {} });
  assert.ok(out.seededKeys.includes('rooms') && out.seededKeys.includes('cats') && out.seededKeys.includes('settings'));
  assert.equal((await fresh.loadAll()).rooms.length, 4);
});
test('seed: in production the staff passwords must be given and strong; the practice passwords are never used', async () => {
  const run = env => ensureSeeded({ store: new MemoryStore(), engine: createEngine({ publicDir: PUBLIC }), User: new FakeUsers(), env, log: () => {} });
  await assert.rejects(run({ NODE_ENV: 'production' }), /Set ADMIN_PASSWORD/);
  await assert.rejects(run({ NODE_ENV: 'production', ADMIN_PASSWORD: 'weak', AISHA_PASSWORD: STRONG, BEN_PASSWORD: STRONG }), /admin password is too weak/);
  const ok = await run({ NODE_ENV: 'production', ADMIN_PASSWORD: STRONG, AISHA_PASSWORD: 'Aisha#Pass1', BEN_PASSWORD: 'Ben#Pass99' });
  assert.deepEqual(ok.createdStaff, ['admin', 'aisha', 'ben']);
  const logs = [];
  await ensureSeeded({ store: new MemoryStore(), engine: createEngine({ publicDir: PUBLIC }), User: new FakeUsers(), env: {}, log: l => logs.push(l) });
  assert.equal(logs.length, 3);
  assert.match(logs[0], /PRACTICE password/);
});
test('data model: every document the rules create fits the schema exactly (no field is missing or misspelt)', async () => {
  const e = await world();
  const { cat, dog, admin, aisha } = e.tokens;
  // use every feature once so that every kind of document and field appears
  const a = (await e.book(cat, { cats: ['c1', 'c3'], hours: 2, guests: 3, requests: 'birthday' })).data.reservation;
  const b = (await e.book(dog, { roomId: 'P2', cats: ['c4'], time: '10:00' })).data.reservation;
  await e.book(dog, { sessionId: 'ys', roomId: 'L1', cats: [], time: '16:00', hours: 2, guests: 12 });
  await e.act('payReservation', { code: a.code, method: 'Card' }, cat);
  await e.act('editReservation', { code: b.code, changes: { cats: ['c5'] } }, admin);
  const o = (await e.act('placeOrder', { reservationCode: a.code, lines: [{ id: 'd1', qty: 2 }] }, cat)).data.order;
  await e.act('markOrderServed', { code: o.code }, aisha);
  await e.act('subscribe', { tierId: 'parent' }, cat);
  await e.act('submitFeedback', { f: { type: 'Question', name: 'A', email: 'a@b.com', message: 'Hi?' } });
  await e.act('addLeave', { username: 'ben', start: TOMORROW, end: TOMORROW, reason: 'Sick', note: 'x' }, admin);
  await e.act('replaceCatInUpcomingBookings', { catId: 'c5' }, admin);                // b's cat: it gets a swap note
  const clockBefore = e.clock.now; e.clock.now = new Date(TOMORROW + 'T23:00:00').getTime();   // the session is over
  await e.act('concludeReservation', { code: a.code, checkedIn: 2 }, e.tokens.aisha);
  e.clock.now = clockBefore;
  await e.act('addReview', { code: a.code, data: { handlerStars: 5, handlerComment: 'Lovely', cats: [{ id: 'c1', stars: 4, comment: 'Soft' }, { id: 'c3', stars: 5 }] } }, cat);
  const c = (await e.book(cat, { roomId: 'P3', time: '18:00', cats: ['c6'] })).data.reservation;
  await e.act('cancelReservation', { code: c.code }, cat);
  const s = await e.store.loadAll();
  // the strict copy of the models: an unknown field is an ERROR here (in production it would be dropped quietly)
  const strict = buildModels('throw', new Mongoose());
  const seen = {};
  for (const [key, Model] of Object.entries(strict.collections)) {
    for (const doc of s[key]) {
      const m = new Model(doc);
      assert.equal(m.validateSync(), undefined, key + ' ' + JSON.stringify(doc));
      seen[key] = (seen[key] || 0) + 1;
    }
  }
  assert.ok(['reservations', 'orders', 'reviews', 'feedbackMessages', 'subscriptions', 'handlerLeaves', 'cats', 'rooms', 'rates', 'menuItems'].every(k => seen[k] > 0), JSON.stringify(seen));
  assert.ok(s.reservations.some(r => r.paid && r.payment) && s.reservations.some(r => r.status === 'Cancelled') && s.reservations.some(r => r.status === 'Concluded'));
});
test('data model: the menu item "allergens" can be missing (not added yet), which is different from an empty list', async () => {
  const { collections } = buildModels(true, new Mongoose());
  const none = new collections.menuItems({ id: 'x', name: 'Cake', category: 'Snacks', price: 5 });
  assert.equal(none.toObject().allergens, undefined);
  assert.deepEqual(new collections.menuItems({ id: 'y', name: 'Water', category: 'Drinks', price: 1, allergens: [] }).toObject().allergens, []);
  assert.ok(new collections.menuItems({ id: 'z', name: 'Cake', category: 'Snacks', price: 5, allergens: ['Rocks'] }).validateSync());
});
test('stores: changes are worked out per document, and the memory and MongoDB stores apply them', async () => {
  const before = { rooms: [{ id: 'a', n: 1 }, { id: 'b', n: 2 }], openHours: { x: 1 }, settings: { breakMinutes: 60 } };
  const after = { rooms: [{ id: 'a', n: 1 }, { id: 'b', n: 3 }, { id: 'c', n: 4 }], openHours: { x: 1 }, settings: { breakMinutes: 30 } };
  const changes = diffSnapshots(before, after);
  assert.deepEqual(changes, { rooms: { upserts: [{ id: 'b', n: 3 }, { id: 'c', n: 4 }], deletes: [] }, settings: { value: { breakMinutes: 30 } } });
  assert.deepEqual(diffSnapshots(after, { ...after, rooms: [{ id: 'a', n: 1 }] }).rooms, { upserts: [], deletes: ['b', 'c'] });
  const mem = new MemoryStore(before);
  await mem.apply(changes);
  assert.deepEqual((await mem.loadAll()).rooms, after.rooms);
  // the MongoDB store, with a pretend database: checks the exact operations it would send
  const sent = [];
  const fakeModel = key => ({ bulkWrite: async ops => sent.push([key, ops]), find: () => ({ sort: () => ({ lean: async () => [{ _id: 'x', id: 'a', n: 1, extra: true }] }) }) });
  const configs = [];
  const mongo = new MongoStore({ collections: Object.fromEntries(ALL_KEYS.map(k => [k, fakeModel(k)])), Config: { updateOne: async (...args) => configs.push(args), find: () => ({ lean: async () => [{ key: 'settings', value: { breakMinutes: 5 } }] }) } });
  await mongo.apply({ rooms: { upserts: [{ id: 'c', n: 4 }], deletes: ['b'] }, settings: { value: { breakMinutes: 30 } } });
  assert.deepEqual(sent, [['rooms', [{ replaceOne: { filter: { id: 'c' }, replacement: { id: 'c', n: 4 }, upsert: true } }, { deleteMany: { filter: { id: { $in: ['b'] } } } }]]]);
  assert.deepEqual(configs, [[{ key: 'settings' }, { $set: { value: { breakMinutes: 30 } } }, { upsert: true }]]);
  const loaded = await mongo.loadAll();
  assert.deepEqual([loaded.rooms, loaded.settings], [[{ id: 'a', n: 1, extra: true }], { breakMinutes: 5 }]);
  assert.equal('_id' in loaded.rooms[0], false, 'the database id is not passed on to the rules');
});
test('engine: only the allowed rule functions can be run', async () => {
  const engine = createEngine({ publicDir: PUBLIC });
  assert.throws(() => engine.call({}, [], 'loadReservations', []), /Not an allowed rule/);
  assert.throws(() => engine.call({}, [], 'eval', ['1']), /Not an allowed rule/);
  assert.throws(() => engine.call({}, [], 'constructor', []), /Not an allowed rule/);
});

// ======================================================= accounts
test('auth: sign up checks the password rules and fields; login works by email or username; wrong tries lock', async () => {
  const e = await world();
  const signup = over => e.call('POST', '/api/auth/signup', { name: 'Amy Tan', username: 'Amy_T', email: 'Amy@Test.com', phone: '91234567', password: STRONG, ...over });
  const weak = await signup({ password: 'abcdefgh' });
  assert.equal(weak.status, 400); assert.ok(weak.data.errors.join(' ').includes('An uppercase letter'));
  assert.equal((await signup({ name: '', email: 'nope', phone: '1', username: 'a b' })).data.errors.length, 4);
  const ok = await signup({});
  assert.equal(ok.status, 201);
  assert.deepEqual(ok.data.user, { name: 'Amy Tan', email: 'amy@test.com', phone: '91234567', username: 'amy_t', role: 'guest', avatar: { icon: '', color: '' }, savedPayment: { method: '', last4: '' } });
  const row = e.User.rows.find(u => u.email === 'amy@test.com');
  assert.ok(row.passwordHash.startsWith('$2') && !JSON.stringify(row).includes(STRONG), 'only a scrambled password is saved');
  assert.equal((await signup({})).status, 409);
  assert.match((await signup({ email: 'other@test.com' })).data.errors[0], /username is taken/);
  assert.equal((await e.call('POST', '/api/auth/login', { username: 'AMY_t', password: STRONG })).status, 200, 'a guest can log in with the username');
  assert.equal((await e.call('POST', '/api/auth/login', { username: 'AMY@test.com', password: STRONG })).status, 200);
  assert.equal((await e.call('POST', '/api/auth/login', { username: 'admin', password: 'admin123' })).data.user.role, 'admin');
  const wrong = await e.call('POST', '/api/auth/login', { username: 'amy@test.com', password: 'Wrong1234!' });
  const nobody = await e.call('POST', '/api/auth/login', { username: 'nobody@test.com', password: STRONG });
  assert.deepEqual([wrong.status, nobody.status, wrong.data], [401, 401, nobody.data]);
  for (let i = 0; i < 4; i++) await e.call('POST', '/api/auth/login', { username: 'amy@test.com', password: 'Wrong1234!' });
  const locked = await e.call('POST', '/api/auth/login', { username: 'amy@test.com', password: STRONG });
  assert.equal(locked.status, 429); assert.match(locked.data.error, /Too many wrong tries/);
  e.clock.now += 2000;
  assert.equal((await e.call('POST', '/api/auth/login', { username: 'amy@test.com', password: STRONG })).status, 200);
});
test('auth: me needs a good token; a changed token and a removed account are refused; the role comes from the database', async () => {
  const e = await world();
  assert.equal((await e.call('GET', '/api/auth/me', undefined, e.tokens.cat)).data.user.email, 'cat@gmail.com');
  assert.equal((await e.call('GET', '/api/auth/me')).status, 401);
  assert.equal((await e.call('GET', '/api/auth/me', undefined, e.tokens.cat.slice(0, -3) + 'abc')).status, 401);
  e.User.rows.find(u => u.username === 'cat').role = 'admin';                       // the database says admin: the server believes the database
  assert.equal((await e.call('GET', '/api/admin/dashboard', undefined, e.tokens.cat)).status, 200);
  e.User.rows = e.User.rows.filter(u => u.username !== 'dog');
  assert.equal((await e.call('GET', '/api/auth/me', undefined, e.tokens.dog)).status, 401);
});
test('forgot and reset password: same answer for any email, a one-time code, and the page or the log shows it', async () => {
  const e = await world({ resetCodeMode: 'page' });
  const unknown = (await e.call('POST', '/api/auth/forgot', { email: 'nobody@test.com' })).data;
  const known = (await e.call('POST', '/api/auth/forgot', { email: 'CAT@gmail.com' })).data;
  assert.equal(unknown.message, known.message); assert.equal(unknown.practiceCode, undefined); assert.match(known.practiceCode, /^\d{6}$/);
  const reset = (code, password) => e.call('POST', '/api/auth/reset', { email: 'cat@gmail.com', code, password });
  assert.match((await reset('000000', 'NewPass1!')).data.error, /not correct/);
  assert.match((await reset(known.practiceCode, 'weak')).data.error, /Your password needs/);
  assert.equal((await reset(known.practiceCode, 'NewPass1!')).status, 200);
  assert.equal((await e.call('POST', '/api/auth/login', { username: 'cat@gmail.com', password: 'NewPass1!' })).status, 200);
  assert.match((await reset(known.practiceCode, 'Another1!')).data.error, /No reset was requested/);
  const c = await world({ resetCodeMode: 'console' });
  const out = (await c.call('POST', '/api/auth/forgot', { email: 'dog@gmail.com' })).data;
  assert.equal(out.practiceCode, undefined);
  assert.match(c.logs[0], /\[reset code\] dog@gmail\.com : \d{6}/);
});

// ======================================================= who sees what
test('privacy: nobody receives another person\'s details, and booking codes are scrambled for everyone else', async () => {
  const e = await world();
  const a = (await e.book(e.tokens.cat, { cats: ['c1'], requests: 'private note' })).data.reservation;               // Aisha
  await e.act('payReservation', { code: a.code, method: 'PayNow' }, e.tokens.cat);
  await e.act('addLeave', { username: 'ben', start: '2030-03-10', end: '2030-03-10', reason: 'Sick', note: 'fever' }, e.tokens.admin);
  const o = (await e.act('placeOrder', { reservationCode: a.code, lines: [{ id: 'd1', qty: 1 }] }, e.tokens.cat)).data.order;
  await e.act('submitFeedback', { f: { type: 'Question', name: 'A', email: 'a@b.com', message: 'Hi?' } });
  await e.act('subscribe', { tierId: 'friend' }, e.tokens.dog);
  const get = async token => (await e.call('GET', '/api/data', undefined, token)).data;
  const secrets = ['cat@gmail.com', '91234501', 'private note', 'PayNow', a.code, 'fever', 'a@b.com', 'dog@gmail.com'];

  const visitor = await get();
  assert.equal(visitor.data.reservations.length, 1);
  const text = JSON.stringify(visitor);
  for (const s of secrets) assert.ok(!text.includes(s), 'a visitor must not receive: ' + s);
  assert.match(visitor.data.reservations[0].code, /^x[0-9a-f]{10}$/);
  assert.deepEqual([visitor.data.orders, visitor.data.subscriptions, visitor.data.feedbackMessages], [[], [], []]);
  assert.equal(visitor.data.handlerLeaves[0].reason, 'Leave');
  assert.deepEqual(visitor.staff.map(s => s.username), ['aisha', 'ben']);

  const dog = await get(e.tokens.dog);                                                           // another guest: the same as a visitor, plus their own subscription
  for (const s of secrets.filter(x => x !== 'dog@gmail.com')) assert.ok(!JSON.stringify(dog.data.reservations).includes(s), 'a guest must not receive: ' + s);
  assert.deepEqual(dog.data.subscriptions.map(s => s.tier), ['friend']);

  const cat = await get(e.tokens.cat);                                                           // the owner: everything of their own
  assert.deepEqual([cat.data.reservations[0].code, cat.data.reservations[0].email, cat.data.reservations[0].requests, cat.data.reservations[0].payment.method], [a.code, 'cat@gmail.com', 'private note', 'PayNow']);
  assert.deepEqual(cat.data.orders.map(x => x.code), [o.code]);

  const aisha = await get(e.tokens.aisha);                                                       // the handler of that session sees it in full; their orders
  assert.equal(aisha.data.reservations[0].name, 'Cat');
  assert.deepEqual(aisha.data.orders.map(x => x.code), [o.code]);
  assert.equal((await get(e.tokens.ben)).data.reservations[0].name, undefined, 'another handler gets the scrambled copy');
  assert.equal((await get(e.tokens.ben)).data.orders.length, 0);

  const admin = await get(e.tokens.admin);
  assert.deepEqual([admin.data.reservations[0].code, admin.data.feedbackMessages.length, admin.data.subscriptions.length, admin.data.handlerLeaves[0].reason], [a.code, 1, 1, 'Sick']);
});
test('privacy: reviews show only stars to others, and a guest sees their own in full', async () => {
  const e = await world();
  const a = (await e.book(e.tokens.cat, { cats: ['c1'] })).data.reservation;
  const clockBefore = e.clock.now; e.clock.now = new Date(TOMORROW + 'T23:00:00').getTime();   // the session is over
  await e.act('concludeReservation', { code: a.code, checkedIn: 2 }, e.tokens.aisha);
  e.clock.now = clockBefore;
  await e.act('addReview', { code: a.code, data: { handlerStars: 4, handlerComment: 'Kind', cats: [{ id: 'c1', stars: 5, comment: 'So soft' }] } }, e.tokens.cat);
  const get = async token => (await e.call('GET', '/api/data', undefined, token)).data.data.reviews[0];
  const visitor = await get();
  assert.deepEqual([visitor.handlerStars, visitor.cats, visitor.email, visitor.handlerComment], [4, [{ id: 'c1', stars: 5 }], undefined, undefined]);
  assert.match(visitor.code, /^x/);
  const own = await get(e.tokens.cat);
  assert.deepEqual([own.code, own.email, own.handlerComment, own.cats[0].comment], [a.code, 'cat@gmail.com', 'Kind', 'So soft']);
  assert.equal((await get(e.tokens.aisha)).handlerComment, 'Kind', 'a handler sees comments about themselves');
  assert.equal((await get(e.tokens.ben)).handlerComment, undefined);
});
test('lookup by code: no login, nothing personal, and five wrong codes lock it for a while', async () => {
  const e = await world();
  const a = (await e.book(e.tokens.cat, { cats: ['c1'], requests: 'private note' })).data.reservation;
  const ok = await e.call('GET', '/api/reservations/' + a.code.toLowerCase());
  assert.equal(ok.status, 200);
  assert.deepEqual([ok.data.session, ok.data.cats, ok.data.handler, ok.data.status], ['Private Cat Session', ['Fluffy'], 'Aisha', 'Assigned']);
  const text = JSON.stringify(ok.data);
  for (const s of ['cat@gmail.com', '91234501', 'private note', 'Cat"']) assert.ok(!text.includes(s), s);
  for (let i = 0; i < 5; i++) assert.equal((await e.call('GET', '/api/reservations/CC-WRONG' + i)).status, 404);
  const locked = await e.call('GET', '/api/reservations/' + a.code);
  assert.equal(locked.status, 429); assert.match(locked.data.error, /Too many wrong codes/);
  e.clock.now += 2000;
  assert.equal((await e.call('GET', '/api/reservations/' + a.code)).status, 200);
});

// ======================================================= actions: who may do what, and the rules still hold
test('actions: only the right kind of account may use each action', async () => {
  const e = await world();
  const f = { sessionId: 'ps', roomId: 'P1', date: TOMORROW, time: '14:00', hours: 1, guests: 2, cats: ['c1'] };
  assert.equal((await e.act('createReservation', { f })).status, 401);
  assert.equal((await e.act('createReservation', { f }, e.tokens.admin)).status, 403);
  assert.equal((await e.act('createReservation', { f }, e.tokens.aisha)).status, 403);
  assert.equal((await e.act('editReservation', { code: 'CC-X', changes: {} }, e.tokens.cat)).status, 403);
  assert.equal((await e.act('clearPracticeData', {}, e.tokens.aisha)).status, 403);
  assert.equal((await e.act('concludeReservation', { code: 'CC-X', checkedIn: 1 }, e.tokens.admin)).status, 403);
  assert.equal((await e.act('removeLeave', { id: 'l' }, e.tokens.aisha)).status, 403);
  for (const name of ['loadReservations', 'constructor', '__proto__', 'eval', 'toString']) assert.equal((await e.act(name, {}, e.tokens.admin)).status, 404, name);
  assert.equal((await e.act('submitFeedback', { f: { type: 'Question', name: 'A', email: 'a@b.com', message: 'Hi?' } })).data.ok, true, 'anyone may send feedback');
});
test('actions: who the booking is for comes from the login, never from the request', async () => {
  const e = await world();
  const r = (await e.book(e.tokens.cat, { name: 'Someone Else', email: 'victim@x.com', phone: '81111111' })).data.reservation;
  assert.deepEqual([r.name, r.email, r.phone], ['Cat', 'cat@gmail.com', '91234501']);
  const other = await e.act('cancelReservation', { code: r.code }, e.tokens.dog);
  assert.match(other.data.error, /not yours/);
  assert.equal((await e.act('payReservation', { code: r.code, method: 'Card' }, e.tokens.dog)).data.ok, false);
  assert.equal((await e.act('addReview', { code: r.code, data: {} }, e.tokens.dog)).data.ok, false);
  assert.equal((await e.act('placeOrder', { reservationCode: r.code, lines: [{ id: 'd1', qty: 1 }] }, e.tokens.dog)).data.ok, false);
  assert.equal((await e.store.loadAll()).reservations[0].status, 'Assigned');
});
test('actions: a handler can only record leave for themselves, the admin for anyone', async () => {
  const e = await world();
  const asAisha = await e.act('addLeave', { username: 'ben', start: TOMORROW, end: TOMORROW, reason: 'Sick' }, e.tokens.aisha);
  assert.equal(asAisha.data.leave.handler, 'aisha', 'the username in the request is ignored for a handler');
  const asAdmin = await e.act('addLeave', { username: 'ben', start: TOMORROW, end: TOMORROW, reason: 'Urgent leave' }, e.tokens.admin);
  assert.equal(asAdmin.data.leave.handler, 'ben');
  assert.deepEqual((await e.store.loadAll()).handlerLeaves.map(l => l.handler), ['aisha', 'ben']);
});
test('actions: two guests booking the same room at the same moment - exactly one gets it', async () => {
  const e = await world({ storeDelayMs: 5 });
  const results = await Promise.all([e.book(e.tokens.cat, { cats: ['c1'] }), e.book(e.tokens.dog, { cats: ['c2'] }), e.book(e.tokens.cat, { cats: ['c3'] }), e.book(e.tokens.dog, { cats: ['c4'] })]);
  assert.equal(results.filter(r => r.data.ok).length, 1);
  assert.ok(results.filter(r => !r.data.ok).every(r => /already booked/.test(r.data.error)));
  assert.equal((await e.store.loadAll()).reservations.length, 1);
  // and one cat cannot be in two rooms at once
  const e2 = await world({ storeDelayMs: 5 });
  const two = await Promise.all([e2.book(e2.tokens.cat, { roomId: 'P1', cats: ['c1'] }), e2.book(e2.tokens.dog, { roomId: 'P2', cats: ['c1'] })]);
  assert.equal(two.filter(r => r.data.ok).length, 1);
});
test('actions: the whole booking life - book, pay, cancel with a refund, finish, review, order, serve', async () => {
  const e = await world();
  const { cat, aisha, admin } = e.tokens;
  const a = (await e.book(cat, { cats: ['c1', 'c3'], hours: 2, time: '14:00' })).data.reservation;
  assert.deepEqual([a.status, a.amount, a.handlerUsername, a.zone], ['Assigned', 60, 'aisha', 'P1 - Private Room 1']);
  assert.equal((await e.act('payReservation', { code: a.code, method: 'Card' }, cat)).data.reservation.payment.amount, 60);
  const o = (await e.act('placeOrder', { reservationCode: a.code, lines: [{ id: 'd1', qty: 2 }, { id: 's1', qty: 1 }] }, cat)).data.order;
  assert.deepEqual([o.total, o.handler], [17.5, 'Aisha']);
  assert.match((await e.act('markOrderServed', { code: o.code }, e.tokens.ben)).data.error, /not for one of your rooms/);
  assert.equal((await e.act('markOrderServed', { code: o.code }, aisha)).data.order.status, 'Served');
  const clockBefore = e.clock.now; e.clock.now = new Date(TOMORROW + 'T23:00:00').getTime();   // the session is over
  assert.equal((await e.act('concludeReservation', { code: a.code, checkedIn: 2 }, aisha)).data.reservation.status, 'Concluded');
  e.clock.now = clockBefore;
  assert.equal((await e.act('addReview', { code: a.code, data: { handlerStars: 5, cats: [{ id: 'c1', stars: 4 }, { id: 'c3', stars: 5 }] } }, cat)).data.ok, true);
  const b = (await e.book(cat, { roomId: 'P2', cats: ['c4'], time: '10:00', hours: 2 })).data.reservation;
  await e.act('payReservation', { code: b.code, method: 'PayNow' }, cat);
  e.clock.now = new Date('2030-03-05T08:00:00').getTime();                                       // 2 hours before: 50% back
  const c = await e.act('cancelReservation', { code: b.code }, cat);
  assert.deepEqual([c.data.refund, c.data.percent], [30, 50]);
  const d = (await e.book(e.tokens.dog, { roomId: 'P3', cats: ['c5'], time: '18:00' })).data.reservation;
  await e.act('payReservation', { code: d.code, method: 'PayNow' }, e.tokens.dog);
  const byAdmin = await e.act('cancelReservation', { code: d.code }, admin);
  assert.deepEqual([byAdmin.data.percent, byAdmin.data.reservation.cancelledBy], [100, 'admin']);
});
test('actions: bad input gives a clear message, never a crash', async () => {
  const e = await world();
  assert.equal((await e.act('createReservation', { f: null }, e.tokens.cat)).status, 400);
  assert.equal((await e.act('createReservation', {}, e.tokens.cat)).status, 400);
  assert.match((await e.book(e.tokens.cat, { hours: 9 })).data.error, /lasts 1 hour to 3 hours/);
  assert.match((await e.book(e.tokens.cat, { date: '2020-01-01' })).data.error, /already passed/);
  assert.match((await e.book(e.tokens.cat, { cats: [] })).data.error, /at least 1 cat/);
  const big = await fetch(e.base + '/api/action/submitFeedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ f: { message: 'x'.repeat(200000) } }) });
  assert.equal(big.status, 413);
  assert.equal((await e.store.loadAll()).reservations.length, 0);
});
test('actions: the server uses its own clock (cafe time), so a time that has passed is refused', async () => {
  const e = await world();
  e.clock.now = new Date('2030-03-05T15:00:00').getTime();
  assert.match((await e.book(e.tokens.cat, { date: TOMORROW, time: '14:00' })).data.error, /already passed/);
  assert.equal((await e.book(e.tokens.cat, { date: TOMORROW, time: '16:00' })).data.ok, true);
});
test('actions: feedback is limited per person so the inbox cannot be flooded', async () => {
  const e = await world({ feedbackPerHour: 3 });
  const send = () => e.act('submitFeedback', { f: { type: 'Feedback', name: 'A', email: 'a@b.com', message: 'Hi' } });
  for (let i = 0; i < 3; i++) assert.equal((await send()).status, 200);
  assert.equal((await send()).status, 429);
});

// ======================================================= admin edits
test('admin edits: only the admin, the data model is enforced, and unknown fields are thrown away', async () => {
  const e = await world();
  const put = (key, value, token = e.tokens.admin) => e.call('PUT', '/api/collection/' + key, { value }, token);
  const rates = (await e.call('GET', '/api/data')).data.data.rates;
  assert.equal((await put('rates', rates, e.tokens.cat)).status, 403);
  assert.equal((await put('rates', rates, null)).status, 401);
  assert.equal((await put('users', [])).status, 404);
  assert.equal((await put('rates', 'nope')).status, 400);
  assert.equal((await put('rates', [{ id: 'r9', name: 'x', sessionId: '', dayType: 'sometimes', pricePerHour: 5 }])).status, 400);
  assert.equal((await put('rates', [{ id: 'r9', name: 'x', sessionId: '', dayType: 'all', pricePerHour: -5 }])).status, 400);
  assert.equal((await put('rates', [rates[0], rates[0]])).status, 400, 'two items with the same id');
  assert.equal((await put('rates', [{ id: 'r9', name: 'x', sessionId: 'nope', dayType: 'all', pricePerHour: 5 }])).status, 400, 'a rate for a session that does not exist');
  const ok = await put('rates', [{ ...rates[0], pricePerHour: 31, hacked: 'yes' }, rates[1]]);
  assert.equal(ok.status, 200);
  const saved = (await e.store.loadAll()).rates;
  assert.deepEqual(saved.map(r => [r.id, r.pricePerHour]), [['r1', 31], ['r2', 36]]);
  assert.equal('hacked' in saved[0], false);
  // the change reaches the booking rules at once
  assert.equal((await e.book(e.tokens.cat, { cats: ['c1'] })).data.reservation.pricePerHour, 31);
});
test('admin edits: opening hours and the break length are checked, and they change what can be booked', async () => {
  const e = await world();
  const put = (key, value) => e.call('PUT', '/api/collection/' + key, { value }, e.tokens.admin);
  const hours = (await e.call('GET', '/api/data')).data.data.openHours;
  assert.equal((await put('openHours', { weekly: [], closedPeriods: [] })).status, 400);
  assert.equal((await put('openHours', { ...hours, weekly: hours.weekly.map(d => ({ ...d, to: '09:00' })) })).status, 400);
  assert.equal((await put('openHours', { ...hours, closedPeriods: [{ id: 'x', name: 'Bad', from: '14:00', to: '13:00' }] })).status, 400);
  assert.equal((await put('settings', { breakMinutes: 999 })).status, 400);
  assert.equal((await put('settings', { breakMinutes: 'a lot' })).status, 400);
  const tuesdayShut = hours.weekly.map((d, i) => i === 2 ? { ...d, open: false } : d);
  assert.equal((await put('openHours', { ...hours, weekly: tuesdayShut })).status, 200);
  assert.match((await e.book(e.tokens.cat, { cats: ['c1'] })).data.error, /Closed on Tuesdays/);
  assert.equal((await put('openHours', hours)).status, 200);
  assert.equal((await put('settings', { breakMinutes: 0 })).status, 200);
  await e.book(e.tokens.cat, { cats: ['c1'], time: '14:00' });
  assert.equal((await e.book(e.tokens.dog, { roomId: 'P2', cats: ['c1'], time: '15:00' })).data.ok, true, 'with no break, back to back is fine');
});
test('admin edits: a room, session or cat that is in use cannot be deleted, and cats need an existing handler', async () => {
  const e = await world();
  const get = async () => (await e.call('GET', '/api/data', undefined, e.tokens.admin)).data.data;
  const put = (key, value) => e.call('PUT', '/api/collection/' + key, { value }, e.tokens.admin);
  await e.book(e.tokens.cat, { cats: ['c1'] });
  let d = await get();
  const noRoom = await put('rooms', d.rooms.filter(r => r.id !== 'P1'));
  assert.equal(noRoom.status, 409); assert.match(noRoom.data.error, /has bookings/);
  assert.equal((await put('rooms', d.rooms.filter(r => r.id !== 'P3'))).status, 409, 'P3 is used by a session');
  assert.equal((await put('sessions', d.sessions.filter(s => s.id !== 'ps'))).status, 409);
  assert.equal((await put('sessions', d.sessions.map(s => ({ ...s, rooms: ['ZZ'] })))).status, 400);
  const noCat = await put('cats', d.cats.filter(c => c.id !== 'c1'));
  assert.equal(noCat.status, 409); assert.match(noCat.data.error, /coming booking/);
  assert.equal((await put('cats', d.cats.map(c => c.id === 'c2' ? { ...c, handler: 'nobody' } : c))).status, 400);
  assert.equal((await put('cats', d.cats.filter(c => c.id !== 'c6'))).status, 200, 'a cat nobody booked can be deleted');
  assert.equal((await put('cats', [...d.cats.filter(c => c.id !== 'c6'), { id: 'cNew', name: 'Mimi', handler: 'ben', notes: ['Sleepy'], active: true }])).status, 200);
  d = await get();
  assert.deepEqual([d.cats.length, d.cats.find(c => c.id === 'cNew').handler], [6, 'ben']);
  assert.equal((await put('rooms', [...d.rooms, { id: 'P4', code: 'P4', name: 'Room 4', type: 'Garden', capacity: 3 }])).status, 400);
});
test('admin edits: a cat switched off swaps into coming bookings, and the guest is told', async () => {
  const e = await world();
  const a = (await e.book(e.tokens.cat, { cats: ['c1'] })).data.reservation;
  const cats = (await e.call('GET', '/api/data')).data.data.cats;
  await e.call('PUT', '/api/collection/cats', { value: cats.map(c => c.id === 'c1' ? { ...c, active: false, note: 'Vet visit' } : c) }, e.tokens.admin);
  const out = (await e.act('replaceCatInUpcomingBookings', { catId: 'c1' }, e.tokens.admin)).data;
  assert.equal(out.replaced.length, 1);
  const mine = (await e.call('GET', '/api/data', undefined, e.tokens.cat)).data.data.reservations[0];
  assert.deepEqual([mine.code, mine.cats[0] !== 'c1'], [a.code, true]);
  assert.match(mine.changeNote, /Fluffy is unwell, so .* will be with you instead/);
});
test('admin edits: photos fit, but a huge one is refused', async () => {
  const e = await world();
  const cats = (await e.call('GET', '/api/data')).data.data.cats;
  const photo = 'data:image/jpeg;base64,' + 'A'.repeat(1000);
  assert.equal((await e.call('PUT', '/api/collection/cats', { value: cats.map((c, i) => i ? c : { ...c, photo }) }, e.tokens.admin)).status, 200);
  assert.equal((await e.store.loadAll()).cats[0].photo, photo);
  const huge = (await e.call('PUT', '/api/collection/cats', { value: cats.map((c, i) => i ? c : { ...c, photo: 'A'.repeat(400000) }) }, e.tokens.admin));
  assert.equal(huge.status, 400);
});
test('clear practice data: only the admin; reservations, orders and reviews go, the setup stays', async () => {
  const e = await world();
  await e.book(e.tokens.cat, { cats: ['c1'] });
  assert.equal((await e.act('clearPracticeData', {}, e.tokens.cat)).status, 403);
  assert.equal((await e.act('clearPracticeData', {}, e.tokens.admin)).data.ok, true);
  const s = await e.store.loadAll();
  assert.deepEqual([s.reservations.length, s.cats.length, s.rates.length], [0, 6, 6]);
});

// ======================================================= dashboard and static files
test('dashboard feed: totals, bookings by month and session, room status now, and reviews (admin only)', async () => {
  const e = await world();
  assert.equal((await e.call('GET', '/api/admin/dashboard', undefined, e.tokens.cat)).status, 403);
  assert.equal((await e.call('GET', '/api/admin/dashboard')).status, 401);
  const a = (await e.book(e.tokens.cat, { cats: ['c1'], hours: 2 })).data.reservation;                       // tomorrow 14:00-16:00, S$60
  await e.act('payReservation', { code: a.code, method: 'Card' }, e.tokens.cat);
  const b = (await e.book(e.tokens.dog, { sessionId: 'ys', roomId: 'L1', cats: [], time: '10:00', guests: 5 })).data.reservation;
  await e.act('cancelReservation', { code: b.code }, e.tokens.dog);
  const clockBefore = e.clock.now; e.clock.now = new Date(TOMORROW + 'T23:00:00').getTime();   // the session is over
  await e.act('concludeReservation', { code: a.code, checkedIn: 2 }, e.tokens.aisha);
  e.clock.now = clockBefore;
  await e.act('addReview', { code: a.code, data: { handlerStars: 5, handlerComment: 'Lovely', cats: [{ id: 'c1', stars: 3, comment: 'Shy' }] } }, e.tokens.cat);
  e.clock.now = new Date('2030-03-05T14:30:00').getTime();
  const d = (await e.call('GET', '/api/admin/dashboard', undefined, e.tokens.admin)).data;
  assert.deepEqual(d.totals, { bookings: 2, confirmed: 0, concluded: 1, cancelled: 1, revenue: 60, customers: 2, orders: 0, supporters: 0 });
  assert.deepEqual(d.byStatus, [{ name: 'Confirmed', value: 0 }, { name: 'Concluded', value: 1 }, { name: 'Cancelled', value: 1 }]);
  assert.deepEqual(d.bySession, [{ name: 'Private Cat Session', value: 1 }]);
  assert.deepEqual(d.byMonth, [{ month: '2030-03', bookings: 1, revenue: 60 }]);
  assert.equal(d.rooms.find(r => r.name === 'Private Room 1').status, 'Occupied');
  assert.equal(d.rooms.find(r => r.name === 'Private Room 2').status, 'Available');
  assert.deepEqual(d.reviews, [{ id: d.reviews[0].id, name: 'Cat', session: 'Private Cat Session', rating: 4, message: 'Lovely | Shy' }]);
  assert.deepEqual(d.ratings.handlers, [{ name: 'Aisha', avg: 5, count: 1 }]);
  assert.deepEqual(d.ratings.cats.find(c => c.name === 'Fluffy'), { name: 'Fluffy', avg: 3, count: 1 });
});
test('website files are served, API mistakes are clean JSON, and the built dashboard is served at /dashboard when present', async () => {
  const e = await world();
  const home = await fetch(e.base + '/');
  assert.equal(home.status, 200); assert.match(await home.text(), /PURRSONA MEOW/);
  assert.equal((await fetch(e.base + '/layout.css')).status, 200);
  assert.equal((await fetch(e.base + '/images/latte.jpg')).headers.get('content-type'), 'image/jpeg');
  assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(home.headers.get('x-powered-by'), null);
  const nope = await e.call('GET', '/api/nothing');
  assert.deepEqual([nope.status, nope.data], [404, { error: 'Not found.' }]);
  const noDash = await world({ dashboardDir: '/does/not/exist' });          // the real dashboard folder is built now, so point at an empty place
  const notBuilt = await fetch(noDash.base + '/dashboard/');
  assert.equal(notBuilt.status, 200);
  assert.match(await (await fetch(e.base + '/dashboard/')).text(), /<div id="root">/, 'the built React dashboard is served');
  assert.match(await notBuilt.text(), /dashboard has not been built yet/);
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<html>React dashboard</html>');
  const d = await world({ dashboardDir: dir });
  assert.match(await (await fetch(d.base + '/dashboard/')).text(), /React dashboard/);
  assert.match(await (await fetch(d.base + '/dashboard/charts/sales')).text(), /React dashboard/, 'the dashboard handles its own addresses');
  assert.equal((await fetch(d.base + '/')).status, 200);
});
test('data copy: the same address works with and without a login, and is never cached across users', async () => {
  const e = await world();
  const anon = await fetch(e.base + '/api/data');
  assert.equal(anon.headers.get('cache-control'), 'no-cache');
  assert.equal(anon.headers.get('vary'), 'Authorization');
  const data = await anon.json();
  assert.ok(data.data.rooms.length && data.data.openHours && data.data.settings);
  assert.equal((await e.call('GET', '/api/data', undefined, 'garbage.token.value')).status, 200, 'a bad token just means a visitor');
  assert.equal((await e.call('GET', '/api/data', undefined, 'garbage.token.value')).data.me, null);
  assert.deepEqual((await e.call('GET', '/api/data', undefined, e.tokens.cat)).data.me, { name: 'Cat', email: 'cat@gmail.com', phone: '91234501', username: 'cat', role: 'guest', avatar: { icon: '', color: '' }, savedPayment: { method: '', last4: '' } });
  assert.equal(data.me, null);
});

// ======================================================= booking emails
test('emails: a booking and a payment each ask the mailer once, and a mailer that is off changes nothing', async () => {
  const sent = [];
  const mailer = { bookingConfirmed: r => sent.push(['booked', r.code, r.email]), paymentReceived: r => sent.push(['paid', r.code, r.email]) };
  const e = await world({ mailer });
  const a = (await e.book(e.tokens.cat, { cats: ['c1'] })).data.reservation;
  assert.deepEqual(sent, [['booked', a.code, 'cat@gmail.com']]);
  assert.equal((await e.act('payReservation', { code: a.code, method: 'Card' }, e.tokens.cat)).data.ok, true);
  assert.deepEqual(sent[1], ['paid', a.code, 'cat@gmail.com']);
  assert.equal((await e.act('payReservation', { code: a.code, method: 'Card' }, e.tokens.cat)).data.ok, false);
  assert.equal(sent.length, 2, 'a failed payment sends no email');
  const quiet = await world();                                    // no mailer set: booking still works
  assert.equal((await quiet.book(quiet.tokens.cat, { cats: ['c1'] })).data.ok, true);
});

test('emails (EmailJS): off without keys; with keys it sends the booking and the receipt (food orders included); a refusal is only logged', async () => {
  const { createMailer } = await import('../lib/mailer.js');
  assert.equal(createMailer({}, () => {}).enabled, false, 'no keys: off, and nothing breaks');
  assert.equal(await createMailer({}, () => {}).bookingConfirmed({ email: 'a@b.c' }), false);

  const sent = [], logs = [];
  let refuse = false;
  const client = { send: async (service, template, params, keys) => { sent.push({ service, template, params, keys }); if (refuse) throw { text: 'The Public Key is invalid' }; return { text: 'OK' }; } };
  const env = { EMAILJS_SERVICE_ID: 'svc', EMAILJS_BOOKING_TEMPLATE_ID: 'tpl_book', EMAILJS_PAYMENT_TEMPLATE_ID: 'tpl_pay', EMAILJS_PUBLIC_KEY: 'pub', EMAILJS_PRIVATE_KEY: 'priv' };
  const m = createMailer(env, l => logs.push(l), client);
  assert.equal(m.enabled, true);
  const r = { name: 'Tom & Jerry', email: 'cat@gmail.com', code: 'CC-1', session: 'Nap', date: '2030-03-05', time: '14:00', guests: 2, roomName: 'Zone A', handler: 'Aisha', amount: 20, payment: { method: 'Card', ref: 'PAY-9' } };

  assert.equal(await m.bookingConfirmed(r), true);
  assert.deepEqual([sent[0].service, sent[0].template, sent[0].keys], ['svc', 'tpl_book', { publicKey: 'pub', privateKey: 'priv' }]);
  assert.equal(sent[0].params.email, 'cat@gmail.com');
  assert.equal(sent[0].params.amount, 'S$20.00');
  assert.equal(sent[0].params.name, 'Tom &amp; Jerry', 'values are escaped before they go into the email');

  const orders = [{ code: 'OR-1001', total: 9, items: [{ name: 'Latte', qty: 2, price: 4.5 }] }];
  assert.equal(await m.paymentReceived(r, orders), true);
  const pay = sent[1].params;
  assert.equal(sent[1].template, 'tpl_pay');
  assert.deepEqual([pay.food_items, pay.food_total, pay.food_order_codes, pay.grand_total], ['Latte x 2 - S$9.00', 'S$9.00', 'OR-1001', 'S$29.00']);
  assert.equal((await m.paymentReceived(r)).valueOf(), true);
  assert.equal(sent[2].params.food_items, 'No food orders');

  refuse = true;
  assert.equal(await m.bookingConfirmed(r), false, 'a refusal never throws');
  assert.ok(logs.some(l => /\[email error\] The Public Key is invalid/.test(l)));
  assert.equal(await m.bookingConfirmed({ ...r, email: '' }), false, 'no address: nothing sent');
});

// ======================================================= cancellation fee, automation, settings
test('cancel fee: free a day ahead, half within a day, all of it within 2 hours; unpaid guests owe it and can pay it later', async () => {
  const e = await world();
  const { cat } = e.tokens;
  // 1. cancelled more than 24 hours ahead: no fee
  const a = (await e.book(cat, { time: '14:00', date: '2030-03-07' })).data.reservation;
  const free = (await e.act('cancelReservation', { code: a.code }, cat)).data;
  assert.deepEqual([free.fee, free.feeDue, free.reservation.feePaid], [0, 0, true]);
  // 2. paid, cancelled 10 hours ahead: the fee (half) is kept from the payment
  const b = (await e.book(cat, { time: '18:00', date: TOMORROW, roomId: 'P2', cats: ['c4'] })).data.reservation;     // 34 hours ahead of 08:00 Mon
  await e.act('payReservation', { code: b.code, method: 'PayNow' }, cat);
  e.clock.now = new Date('2030-03-05T08:00:00').getTime();                                        // 10 hours before 18:00
  const half = (await e.act('cancelReservation', { code: b.code }, cat)).data;
  assert.deepEqual([half.fee, half.refund, half.feeDue], [15, 15, 0]);
  // 3. unpaid, cancelled with 1 hour left: the whole price is owed, and paying it later works once
  const c = (await e.book(cat, { time: '10:00', date: TOMORROW, roomId: 'P3', cats: ['c5'] })).data;
  assert.equal(c.ok, true);
  e.clock.now = new Date('2030-03-05T09:00:00').getTime();
  const full = (await e.act('cancelReservation', { code: c.reservation.code }, cat)).data;
  assert.deepEqual([full.fee, full.feeDue, full.refund, full.reservation.feePaid], [30, 30, 0, false]);
  assert.match((await e.act('payCancellationFee', { code: c.reservation.code, method: 'Card' }, e.tokens.dog)).data.error, /not yours/);
  assert.equal((await e.act('payCancellationFee', { code: c.reservation.code, method: 'Bitcoin' }, cat)).data.ok, false);
  const paid = (await e.act('payCancellationFee', { code: c.reservation.code, method: 'Card' }, cat)).data.reservation;
  assert.deepEqual([paid.feePaid, paid.feePayment.amount], [true, 30]);
  assert.match((await e.act('payCancellationFee', { code: c.reservation.code, method: 'Card' }, cat)).data.error, /no cancellation fee/);
  // the cafe cancelling never charges a fee
  const d = (await e.book(e.tokens.dog, { time: '15:00', date: '2030-03-06', roomId: 'P1', cats: ['c2'] })).data.reservation;
  assert.equal((await e.act('cancelReservation', { code: d.code }, e.tokens.admin)).data.fee, 0);
});

test('automation: unpaid bookings cancel themselves; finished sessions conclude themselves; paid ones are left alone', async () => {
  const e = await world();
  const { cat, dog } = e.tokens;
  const unpaid = (await e.book(cat, { time: '14:00', date: TOMORROW })).data.reservation;                    // pay by Mon 14:00
  const paid = (await e.book(dog, { time: '10:00', date: TOMORROW, roomId: 'P2', cats: ['c4'] })).data.reservation;
  await e.act('payReservation', { code: paid.code, method: 'PayNow' }, dog);
  assert.equal(unpaid.payBy, new Date('2030-03-04T14:00:00').toISOString());
  e.clock.now = new Date('2030-03-04T13:00:00').getTime();
  await e.call('GET', '/api/data');                                                                           // looking at the data also runs the sweep
  assert.equal((await e.store.loadAll()).reservations.find(r => r.code === unpaid.code).status, 'Assigned');
  e.clock.now = new Date('2030-03-04T14:01:00').getTime();
  await e.call('GET', '/api/data');
  const after = (await e.store.loadAll()).reservations;
  const u = after.find(r => r.code === unpaid.code);
  assert.deepEqual([u.status, u.cancelledBy, u.cancelReason, u.cancelFee], ['Cancelled', 'system', 'Not paid in time', 0]);
  assert.equal(after.find(r => r.code === paid.code).status, 'Assigned');
  // the room is free again for someone else
  assert.equal((await e.book(dog, { time: '14:00', date: TOMORROW })).data.ok, true);
  // the paid session finishes: concluded by itself, everybody counted as checked in
  e.clock.now = new Date('2030-03-05T11:01:00').getTime();
  await e.call('GET', '/api/data');
  const done = (await e.store.loadAll()).reservations.find(r => r.code === paid.code);
  assert.deepEqual([done.status, done.checkedIn, done.autoConcluded], ['Concluded', done.guests, true]);
  // a booking made with less than a day to go is not cancelled in the same second
  const late = (await e.book(cat, { time: '15:00', date: '2030-03-05', roomId: 'P3', cats: ['c5'] })).data.reservation;
  assert.ok(new Date(late.payBy) > new Date(e.clock.now) && new Date(late.payBy) <= new Date('2030-03-05T15:00:00'));
});

test('cats: a handler can mark their own cat unavailable or available, nobody else can', async () => {
  const e = await world();
  assert.equal((await e.act('setCatStatus', { catId: 'c1', active: false, note: 'Vet visit' }, e.tokens.aisha)).data.cat.note, 'Vet visit');
  assert.equal((await e.store.loadAll()).cats.find(c => c.id === 'c1').active, false);
  assert.match((await e.book(e.tokens.cat, { cats: ['c1'] })).data.error, /./);
  assert.match((await e.act('setCatStatus', { catId: 'c1', active: true }, e.tokens.ben)).data.error, /not one of your cats/);
  assert.equal((await e.act('setCatStatus', { catId: 'c1', active: true }, e.tokens.cat)).status, 403);
  assert.equal((await e.act('setCatStatus', { catId: 'c1', active: true }, e.tokens.aisha)).data.cat.active, true);
});

test('settings: everyone edits their own profile and avatar, guests keep a saved payment method, the password changes', async () => {
  const e = await world();
  const { cat, admin, aisha } = e.tokens;
  assert.equal((await e.call('PUT', '/api/auth/profile', { name: 'X' })).status, 401);
  assert.deepEqual((await e.call('PUT', '/api/auth/profile', { name: ' Kitty Tan ', phone: '81234567' }, cat)).data.user.name, 'Kitty Tan');
  assert.equal((await e.call('PUT', '/api/auth/profile', { name: 'Kitty', phone: '123' }, cat)).status, 400);
  assert.equal((await e.call('PUT', '/api/auth/profile', { name: 'Chief Admin' }, admin)).data.user.name, 'Chief Admin');
  assert.deepEqual((await e.call('PUT', '/api/auth/avatar', { icon: 'paw', color: '#79523f' }, admin)).data.user.avatar, { icon: 'paw', color: '#79523f' });
  assert.equal((await e.call('PUT', '/api/auth/avatar', { icon: 'skull', color: '#79523f' }, aisha)).status, 400);
  assert.equal((await e.call('PUT', '/api/auth/avatar', { icon: 'cat', color: 'red' }, aisha)).status, 400);
  // it comes back in the login and in the data copy
  assert.equal((await e.call('GET', '/api/data', undefined, admin)).data.me.avatar.icon, 'paw');
  // saved payment: guests only, card needs 4 digits and nothing longer is ever kept
  assert.equal((await e.call('PUT', '/api/auth/payment-method', { method: 'Card', last4: '4242' }, aisha)).status, 403);
  assert.equal((await e.call('PUT', '/api/auth/payment-method', { method: 'Card', last4: '4242424242424242' }, cat)).status, 400);
  assert.deepEqual((await e.call('PUT', '/api/auth/payment-method', { method: 'Card', last4: '4242' }, cat)).data.user.savedPayment, { method: 'Card', last4: '4242' });
  assert.deepEqual((await e.call('PUT', '/api/auth/payment-method', { method: '' }, cat)).data.user.savedPayment, { method: '', last4: '' });
  // password
  assert.match((await e.call('POST', '/api/auth/password', { current: 'wrong', password: STRONG }, cat)).data.error, /current password/);
  assert.equal((await e.call('POST', '/api/auth/password', { current: 'cat123', password: 'weak' }, cat)).status, 400);
  assert.equal((await e.call('POST', '/api/auth/password', { current: 'cat123', password: STRONG }, cat)).data.ok, true);
  assert.ok(await e.login('cat', STRONG));
});
