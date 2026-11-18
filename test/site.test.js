import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { build, TOMORROW, SAT, STRONG } from './helpers.js';
import { Device, until, wait, idle, $, $$, text, set, click, send, navLabels, buttonByText, linkByText, row } from './ui.js';

const envs = [], devices = [];
async function world(opts) { const e = await build(opts); envs.push(e); return e; }
const device = env => { const d = new Device(env); devices.push(d); return d; };
const as = async (env, username) => (await device(env).signedInAs(username));
after(() => { devices.forEach(d => d.closeAll()); envs.forEach(e => e.close()); });
const noErrors = (...ds) => ds.forEach(d => assert.deepEqual(d.errors, [], 'script errors on the pages'));
const store = async env => env.store.loadAll();
const star = (w, key, n) => $(w, '.stars-input[data-key="' + key + '"]').querySelectorAll('button')[n - 1].click();

// ======================================================= every page loads for every kind of user
test('every page loads without a script error for the right kind of user (including About us)', async () => {
  const e = await world();
  const visitor = device(e);
  for (const p of ['index.html', 'menu.html', 'cats.html', 'rate.html', 'hours.html', 'sessions.html', 'events.html', 'aboutus.html', 'faq.html', 'rules.html', 'terms.html', 'support.html',
                   'login.html', 'signup.html', 'forgot.html', 'reset.html', 'booking.html', 'admin.html', 'handler.html', 'cat-schedule.html', 'pay.html', 'review.html']) {
    const w = await visitor.open(p);
    assert.ok(text(w, 'main').trim().length > 0, p);
  }
  const guest = await as(e, 'cat');
  for (const p of ['index.html', 'booking.html', 'menu.html', 'cats.html', 'rate.html', 'sessions.html', 'aboutus.html', 'faq.html', 'support.html', 'pay.html?code=CC-NONE1', 'review.html?code=CC-NONE1']) assert.ok(text(await guest.open(p), 'main').trim().length > 0, p);
  const handler = await as(e, 'ben');
  for (const p of ['index.html', 'handler.html', 'cat-schedule.html', 'menu.html', 'cats.html', 'aboutus.html']) assert.ok(text(await handler.open(p), 'main').trim().length > 0, p);
  const admin = await as(e, 'admin');
  for (const p of ['index.html', 'admin.html', 'admin-orders.html', 'admin-menu.html', 'admin-rooms.html', 'admin-sessions.html', 'admin-rates.html', 'admin-hours.html', 'admin-cats.html',
                   'admin-staff.html', 'cat-schedule.html', 'admin-reviews.html', 'admin-faq.html', 'admin-events.html']) assert.ok(text(await admin.open(p), 'main').trim().length > 0, p);
  noErrors(visitor, guest, handler, admin);
});
test('menus, About us, search and the dashboard link (which tells the dashboard where to come back to)', async () => {
  const e = await world();
  let w = await device(e).open('index.html');
  assert.deepEqual(navLabels(w), ['Home', 'Menu', 'Meet our cats', 'Rates', 'Opening hours', 'Sessions', 'Events', 'About Us', 'FAQ', 'Support us']);
  assert.ok(text(w, '#site-footer').includes('About Us') && text(w, '#site-footer').includes('\u00a9 2030'));
  set(w, 'navSearch', 'about');
  assert.deepEqual($$(w, '#navResults a').map(a => a.textContent), ['About Us']);
  const admin = await as(e, 'admin');
  w = await admin.open('admin.html');
  assert.deepEqual(navLabels(w).slice(0, 4), ['Home', 'Dashboard', 'Reservations', 'Orders']);
  const url = new URL($$(w, '#side-nav a').find(a => a.textContent === 'Dashboard').getAttribute('href'), e.base);
  assert.deepEqual([url.origin, url.pathname, url.searchParams.get('back')], [e.base, '/dashboard/', e.base + '/index.html']);
  const h = await as(e, 'aisha');
  assert.deepEqual(navLabels(await h.open('handler.html')).slice(0, 3), ['Home', 'Dashboard', 'My Sessions']);
  noErrors(admin, h);
});
test('About us page (yours) is shown with the same menu and footer as every page', async () => {
  const e = await world();
  const w = await device(e).open('aboutus.html');
  assert.ok(text(w, 'main').includes('About Us') && text(w, 'main').includes('Welcome to Purrsona Meow'));
  assert.equal($(w, '#side-nav a.active').textContent, 'About Us');
});

// ======================================================= accounts through the pages
test('login page: wrong details give a message; guests and staff log in; log out forgets the login', async () => {
  const e = await world();
  const d = device(e);
  let w = await d.open('login.html');
  set(w, 'username', 'cat'); set(w, 'password', 'wrong'); await send(w, 'loginForm');
  assert.ok(text(w, '#error').includes('Wrong email/username or password.'));
  assert.equal(d.local.catcafe_auth, undefined);
  set(w, 'password', 'cat123'); await send(w, 'loginForm');
  await until(() => d.local.catcafe_auth, 'login saved');
  assert.equal(JSON.parse(d.local.catcafe_auth).user.role, 'guest');
  const a = device(e);
  assert.equal((await a.loginAs('admin', 'admin123')).role, 'admin');
  w = await d.open('index.html');
  assert.ok(text(w, '.header-right').includes('Logged in as Cat'));
  $$(w, '.header-right a').find(x => x.textContent === 'Log out').click();
  assert.equal(d.local.catcafe_auth, undefined);
});
test('login page: five wrong passwords lock it for a minute, and the right one works again afterwards', async () => {
  const e = await world();
  const d = device(e);
  const w = await d.open('login.html');
  for (let i = 0; i < 5; i++) { set(w, 'username', 'cat'); set(w, 'password', 'wrong' + i); await send(w, 'loginForm'); }
  set(w, 'password', 'cat123'); await send(w, 'loginForm');
  assert.ok(text(w, '#error').includes('Too many wrong tries'));
  e.clock.now += 2000;
  await send(w, 'loginForm');
  await until(() => d.local.catcafe_auth, 'login after the lock');
});
test('sign up page: weak password, a missing tick and mismatched passwords never reach the server; a good one creates the account', async () => {
  const e = await world();
  const d = device(e);
  const w = await d.open('signup.html');
  assert.equal($$(w, '.pw-rules li').length, 6);
  for (const [id, v] of [['name', 'Amy Tan'], ['email', 'Amy@Test.com'], ['phone', '91234567']]) set(w, id, v);
  set(w, 'password', 'abcdefgh'); set(w, 'confirm', 'abcdefgh');
  w.document.getElementById('agree').checked = true;
  await send(w, 'signupForm');
  assert.ok(text(w, '#errors').includes('An uppercase letter'));
  set(w, 'password', STRONG); set(w, 'confirm', STRONG);
  w.document.getElementById('agree').checked = false;
  await send(w, 'signupForm');
  assert.ok(text(w, '#errors').includes('agree to the Terms'));
  w.document.getElementById('agree').checked = true;
  set(w, 'confirm', 'Different1!'); await send(w, 'signupForm');
  assert.ok(text(w, '#errors').includes('do not match'));
  assert.equal(e.User.rows.filter(u => u.email === 'amy@test.com').length, 0, 'nothing was saved yet');
  set(w, 'confirm', STRONG); await send(w, 'signupForm');
  await until(() => d.local.catcafe_auth, 'the new guest to be logged in');
  const row0 = e.User.rows.find(u => u.email === 'amy@test.com');
  assert.ok(row0.role === 'guest' && row0.passwordHash.startsWith('$2'));
  await send(w, 'signupForm');                                                  // the same email again
  assert.ok(text(w, '#errors').includes('already registered'));
});
test('forgot and reset password through the pages', async () => {
  const e = await world();
  const d = device(e);
  let w = await d.open('forgot.html');
  set(w, 'email', 'Cat@Gmail.com'); await send(w, 'forgotForm');
  assert.ok(text(w, '#result').includes('reset code has been sent'));
  const code = text(w, '#result .practice-box strong');
  assert.match(code, /^\d{6}$/);
  assert.equal($(w, '#result a.cta').getAttribute('href'), 'reset.html?email=cat%40gmail.com');
  w = await d.open('reset.html?email=cat%40gmail.com');
  assert.equal($(w, '#email').value, 'cat@gmail.com');
  set(w, 'code', code); set(w, 'password', 'weakpass'); set(w, 'confirm', 'weakpass'); await send(w, 'resetForm');
  assert.ok(text(w, '#error').includes('Your password needs'));
  set(w, 'password', 'NewPass1!'); set(w, 'confirm', 'NewPass1!'); await send(w, 'resetForm');
  await until(() => $(w, '#done').style.display === 'block', 'success card');
  assert.equal((await e.call('POST', '/api/auth/login', { username: 'cat@gmail.com', password: 'NewPass1!' })).status, 200);
});

// ======================================================= the data comes from the server
test('public pages show the server\'s data, and an admin\'s change is seen by everyone else', async () => {
  const e = await world();
  const visitor = device(e), admin = await as(e, 'admin');
  let w = await visitor.open('menu.html');
  assert.equal($$(w, '.menu-item').length, 8);
  assert.ok(row(w, '.menu-item', 'Latte').textContent.includes('Contains: Dairy'));
  assert.equal($$(await visitor.open('cats.html'), '.cat-card').length, 6);
  assert.ok(text(await visitor.open('hours.html'), '#holidayRows').includes('No public holidays are listed right now'));
  // the admin adds a rate; a different device sees it on the next page load
  w = await admin.open('admin-rates.html');
  set(w, 'rateName', 'Private - evening'); set(w, 'rateSession', 'ps'); set(w, 'rateDayType', 'weekday'); set(w, 'ratePrice', '27.5');
  await send(w, 'rateForm');
  await idle(w);
  assert.ok((await store(e)).rates.some(r => r.name === 'Private - evening' && r.pricePerHour === 27.5), 'saved in the database');
  w = await visitor.open('rate.html');
  assert.ok(text(w, '.rate-card').includes('Private - evening') && text(w, '.rate-card').includes('S$27.50'));
  noErrors(visitor, admin);
});
test('privacy: the copy of the data in a visitor\'s browser has nobody\'s name, email or phone', async () => {
  const e = await world();
  await e.book(e.tokens.cat, { cats: ['c1'], requests: 'private note' });
  const visitor = device(e);
  const w = await visitor.open('booking.html');
  const copy = w.eval('JSON.stringify(DATA)');
  for (const secret of ['cat@gmail.com', '91234501', 'private note', '"name":"Cat"']) assert.ok(!copy.includes(secret), secret);
  const guest = await as(e, 'cat');
  const mine = (await guest.open('sessions.html')).eval('JSON.stringify(DATA.reservations)');
  assert.ok(mine.includes('cat@gmail.com') && mine.includes('private note'), 'the guest has their own details');
});

// ======================================================= booking through the page
test('booking page: flexible hours, per-hour price, cats, handler preview, terms, and confirmed on the server straight away', async () => {
  const e = await world();
  const g = await as(e, 'cat');
  const w = await g.open('booking.html');
  await until(() => $$(w, '#session option').length === 2, 'sessions');
  assert.ok($(w, '#session').options[0].textContent.includes('from S$30.00 per hour'));
  set(w, 'date', TOMORROW); set(w, 'hours', '2');
  assert.deepEqual($$(w, '#time option').filter(o => o.disabled).map(o => o.value), ['11:00', '12:00', '19:00'], 'a 2-hour session cannot run into lunch or past closing');
  set(w, 'time', '14:00');
  assert.ok(text(w, '#priceLine').includes('S$30.00 per hour x 2 hours = S$60.00. The same for any number of guests.'));
  $$(w, '.cat-option')[0].click(); $$(w, '.cat-option')[2].click();                  // Fluffy and Madinah, both Aisha's
  assert.equal(text(w, '#handlerLine'), 'Your cat handler will be Aisha.');
  set(w, 'guests', '4'); set(w, 'requests', 'birthday');
  await send(w, 'reserveForm');
  assert.ok(w.__alerts.some(m => m.includes('agree to the Terms')));
  assert.equal((await store(e)).reservations.length, 0);
  w.document.getElementById('agree').checked = true;
  await send(w, 'reserveForm');
  assert.ok(w.__confirms[0].includes('Total: S$60.00 (S$30.00 per hour)') && w.__confirms[0].includes('Cats: Fluffy, Madinah'));
  const r = (await store(e)).reservations[0];
  assert.deepEqual([r.status, r.time, r.endTime, r.amount, r.handlerUsername, r.zone, r.email, r.requests, r.guests], ['Assigned', '14:00', '16:00', 60, 'aisha', 'P1 - Private Room 1', 'cat@gmail.com', 'birthday', 4]);
  assert.ok(w.__alerts.some(m => m.includes('Your booking is confirmed!') && m.includes('Your cat handler is Aisha') && m.includes(r.code)));
  const p1 = row(w, '#scheduleTable tr', 'Private Room 1');
  assert.deepEqual([...p1.cells].slice(1).map(c => c.textContent), ['Free', 'Free', 'Lunch', 'Free', 'Booked', 'Booked', 'Free', 'Free', 'Free', 'Free'], 'the schedule already shows the new booking');
  noErrors(g);
});
test('booking page: the guest\'s name, email and phone come from the login, not from the page', async () => {
  const e = await world();
  const g = await as(e, 'cat');
  const w = await g.open('booking.html');
  await until(() => $$(w, '#session option').length === 2, 'sessions');
  w.document.getElementById('name').value = 'Someone Else';                          // editing the page changes nothing
  set(w, 'date', TOMORROW); $$(w, '.cat-option')[0].click();
  w.document.getElementById('agree').checked = true;
  await send(w, 'reserveForm');
  const r = (await store(e)).reservations[0];
  assert.deepEqual([r.name, r.email, r.phone], ['Cat', 'cat@gmail.com', '91234501']);
});
test('booking page, live: another device books, and this page shows the slot as booked without a refresh', async () => {
  const e = await world();
  const a = await as(e, 'cat');
  const w = await a.open('booking.html', { pollMs: 100 });
  await until(() => $$(w, '#session option').length === 2, 'sessions');
  set(w, 'date', TOMORROW);
  const cell = () => row(w, '#scheduleTable tr', 'Private Room 1').cells[5].textContent;     // the 2 PM hour
  assert.equal(cell(), 'Free');
  await e.book(e.tokens.dog, { cats: ['c4'], time: '14:00' });                               // someone else, on another device
  await until(() => cell() === 'Booked', 'the schedule to show the other booking');
  set(w, 'room', 'P1'); set(w, 'time', '14:00');
  assert.ok(text(w, '#time').includes('(not possible)') || text(w, '#availability').includes('already booked'));
});
test('two guests press Book at the same moment on the same slot: one is confirmed, the other is told and the page updates', async () => {
  const e = await world();
  const a = await as(e, 'cat'), b = await as(e, 'dog');
  const wa = await a.open('booking.html'), wb = await b.open('booking.html');
  for (const w of [wa, wb]) {
    await until(() => $$(w, '#session option').length === 2, 'sessions');
    set(w, 'date', TOMORROW); set(w, 'time', '14:00'); $$(w, '.cat-option')[w === wa ? 0 : 3].click();
    w.document.getElementById('agree').checked = true;
  }
  await Promise.all([send(wa, 'reserveForm'), send(wb, 'reserveForm')]);
  const all = (await store(e)).reservations;
  assert.equal(all.length, 1);
  const loser = wa.__alerts.some(m => m.includes('Your booking is confirmed')) ? wb : wa;
  assert.ok(loser.__alerts.some(m => /already booked/.test(m)));
  noErrors(a, b);
});
test('booking page: a visitor and a handler cannot book; a closed day and no handler are explained', async () => {
  const e = await world();
  assert.ok(text(await device(e).open('booking.html'), 'main').includes('Please log in'));
  assert.ok(text(await (await as(e, 'aisha')).open('booking.html'), 'main').includes('This page is not for your account'));
  await e.act('addLeave', { username: 'aisha', start: TOMORROW, end: TOMORROW, reason: 'Sick' }, e.tokens.admin);
  await e.act('addLeave', { username: 'ben', start: TOMORROW, end: TOMORROW, reason: 'Sick' }, e.tokens.admin);
  const g = await as(e, 'cat');
  const w = await g.open('booking.html');
  await until(() => $$(w, '#session option').length === 2, 'sessions');
  set(w, 'date', TOMORROW); $$(w, '.cat-option')[0].click();
  assert.equal(text(w, '#handlerLine'), 'No cat handler is free then, so this time cannot be booked.');
  w.document.getElementById('agree').checked = true;
  await send(w, 'reserveForm');
  assert.ok(w.__alerts.some(m => m.includes('none of our cat handlers is free')));
});

// ======================================================= sessions, pay, cancel, review, lookup
test('sessions, pay and cancel: the guest pays on the server and cancels with a refund; the room is free again', async () => {
  const e = await world();
  const booked = (await e.book(e.tokens.cat, { cats: ['c1', 'c3'], time: '14:00', hours: 2, guests: 3 })).data.reservation;
  const g = await as(e, 'cat');
  let w = await g.open('sessions.html');
  let r = row(w, '#myReservations tr', booked.code);
  assert.ok(r.textContent.includes('2:00 PM - 4:00 PM (2 hours)') && r.textContent.includes('Fluffy, Madinah') && r.textContent.includes('S$60.00') && r.textContent.includes('Confirmed') && r.textContent.includes('Unpaid'));
  assert.ok(r.textContent.includes('Aisha (aisha@example.com)'));
  w = await g.open('pay.html?code=' + booked.code);
  assert.ok(text(w, '#payBox').includes('S$60.00 (S$30.00 per hour x 2 hours') && text(w, '#payBox').includes('PRACTICE ONLY'));
  $$(w, 'input[name=method]')[1].click();
  await click($(w, '#payBtn'));
  assert.ok(/Paid\. Thank you!/.test(text(w, '#payBox')) && /PAY-[A-Z0-9]{5} \| Card \(practice\) \| S\$60\.00/.test(text(w, '#payBox')));
  assert.equal((await store(e)).reservations[0].paid, true);
  w = await g.open('sessions.html');
  await click(buttonByText(row(w, '#myReservations tr', booked.code), 'Cancel'));
  assert.ok(w.__confirms[0].includes('You paid S$60.00') && w.__confirms[0].includes('gives you back 100% (S$60.00)'));
  assert.ok(w.__alerts.some(m => m.includes('Refund: S$60.00 (100%)')));
  assert.ok(row(w, '#myReservations tr', booked.code).textContent.includes('Refunded'));
  assert.equal((await e.book(e.tokens.dog, { cats: ['c1'], time: '14:00' })).data.ok, true, 'the room and cat are free for someone else');
  noErrors(g);
});
test('pay and cancel: only your own booking (the server refuses the rest), and a visitor must log in', async () => {
  const e = await world();
  const booked = (await e.book(e.tokens.cat, { cats: ['c1'] })).data.reservation;
  const d = await as(e, 'dog');
  assert.ok(text(await d.open('pay.html?code=' + booked.code), '#payBox').includes('could not find that booking'));
  assert.ok(text(await device(e).open('pay.html?code=' + booked.code), 'main').includes('Please log in'));
  const direct = await e.act('payReservation', { code: booked.code, method: 'Card' }, e.tokens.dog);
  assert.match(direct.data.error, /not yours/);
});
test('lookup by code on the Sessions page: no login, nothing personal, and five wrong codes lock it', async () => {
  const e = await world();
  const booked = (await e.book(e.tokens.cat, { cats: ['c1'], requests: 'private note' })).data.reservation;
  const v = device(e);
  const w = await v.open('sessions.html');
  assert.ok(text(w, '#myReservations').includes('Log in or create a free account'));
  set(w, 'lookupCode', booked.code.toLowerCase()); await click($(w, '#lookupBtn'));
  const shown = text(w, '#lookupResult');
  assert.ok(shown.includes('Private Cat Session') && shown.includes('Fluffy') && shown.includes('Aisha') && shown.includes('Confirmed'));
  for (const secret of ['cat@gmail.com', '91234501', 'private note']) assert.ok(!shown.includes(secret), secret);
  set(w, 'lookupCode', ''); await click($(w, '#lookupBtn'));
  assert.ok(text(w, '#lookupResult').includes('Please type your booking code'));
  for (let i = 0; i < 5; i++) { set(w, 'lookupCode', 'CC-NOPE' + i); await click($(w, '#lookupBtn')); }
  assert.ok(text(w, '#lookupResult').includes('No booking found'), 'the 5th wrong try is still just wrong');
  set(w, 'lookupCode', booked.code); await click($(w, '#lookupBtn'));
  assert.ok(text(w, '#lookupResult').includes('Too many wrong codes'), 'locked even for the right code');
  e.clock.now += 2000;
  await click($(w, '#lookupBtn'));
  assert.ok(text(w, '#lookupResult').includes('Private Cat Session'));
  noErrors(v);
});
test('reviews: guest reviews each cat and the handler; others see stars only; the handler and admin see the words', async () => {
  const e = await world();
  const booked = (await e.book(e.tokens.cat, { cats: ['c1', 'c2'] })).data.reservation;
  const g = await as(e, 'cat');
  let w = await g.open('review.html?code=' + booked.code);
  assert.ok(text(w, '#reviewBox').includes('You can review a session after it has finished'));
  await e.act('concludeReservation', { code: booked.code, checkedIn: 2 }, e.tokens.aisha);
  w = await g.open('sessions.html');
  assert.equal(linkByText(row(w, '#myReservations tr', booked.code), 'Review your session').getAttribute('href'), 'review.html?code=' + booked.code);
  w = await g.open('review.html?code=' + booked.code);
  await click($(w, '#sendReview'));
  assert.ok(text(w, '#reviewError').includes('rate your cat handler'));
  star(w, 'handler', 5); star(w, 'cat:c1', 4); star(w, 'cat:c2', 5);
  $(w, '[data-comment="handler"]').value = 'Very kind and patient'; $(w, '[data-comment="cat:c1"]').value = 'So soft';
  await click($(w, '#sendReview'));
  assert.ok(text(w, '#reviewBox').includes('You already reviewed this session'));
  const saved = (await store(e)).reviews[0];
  assert.deepEqual([saved.handlerStars, saved.cats.map(c => c.stars), saved.name, saved.handlerComment], [5, [4, 5], 'Cat', 'Very kind and patient']);
  const visitor = device(e);
  w = await visitor.open('cats.html');
  assert.ok($$(w, '.cat-card')[0].textContent.includes('\u2605\u2605\u2605\u2605\u2606 4 (1 review)'));
  assert.ok(!w.eval('JSON.stringify(DATA.reviews)').includes('So soft'), 'a visitor does not receive the comments');
  const h = await as(e, 'aisha');
  w = await h.open('handler.html');
  assert.ok(text(w, '#myRating').includes('Your average: \u2605\u2605\u2605\u2605\u2605 5 from 1 review(s).') && text(w, '#myRating').includes('"Very kind and patient"'));
  const a = await as(e, 'admin');
  assert.ok(text(await a.open('admin-reviews.html'), '#allReviews').includes('"So soft"'));
  noErrors(g, visitor, h, a);
});

// ======================================================= handlers
test('handler page: sessions arrive through the cats, the handler finishes them, records leave, and serves orders', async () => {
  const e = await world();
  const a = (await e.book(e.tokens.cat, { roomId: 'P1', cats: ['c1'], time: '14:00' })).data.reservation;          // Fluffy -> Aisha
  const b = (await e.book(e.tokens.dog, { roomId: 'P2', cats: ['c4'], time: '14:00' })).data.reservation;          // Mozza -> Ben
  const o = (await e.act('placeOrder', { reservationCode: a.code, lines: [{ id: 'd1', qty: 1 }] }, e.tokens.cat)).data.order;
  const h = await as(e, 'aisha');
  let w = await h.open('handler.html');
  assert.ok(text(w, '#rows').includes(a.code) && !text(w, '#rows').includes(b.code) && !text(w, 'main').includes('Take this session'));
  assert.deepEqual($$(w, '#myCats .who-card strong').map(x => x.textContent), ['Fluffy', 'Moody', 'Madinah']);
  $(w, '#rows tr input').value = '9';
  await click(buttonByText($(w, '#rows tr'), 'Check in & conclude'));
  assert.ok(w.__alerts.some(m => m.includes('from 0 to 2')));
  await click(buttonByText($(w, '#orderRows'), 'Mark served'));
  assert.equal((await store(e)).orders[0].status, 'Served');
  $(w, '#rows tr input').value = '1';
  await click(buttonByText($(w, '#rows tr'), 'Check in & conclude'));
  assert.ok(row(w, '#rows tr', a.code).textContent.includes('Concluded') && row(w, '#rows tr', a.code).textContent.includes('1 checked in'));
  set(w, 'leaveStart', TOMORROW); set(w, 'leaveEnd', TOMORROW); set(w, 'leaveReason', 'Sick');
  await send(w, 'leaveForm');
  assert.ok(text(w, '#leaveResult').includes('Your leave is recorded.'));
  assert.ok(text(w, '#leaveNotice').includes('You are on leave (Sick)'));
  const ben = await as(e, 'ben');
  w = await ben.open('handler.html');
  assert.ok(text(w, '#rows').includes(b.code) && !text(w, '#rows').includes(a.code));
  assert.equal(text(w, '#orderRows').includes(o.code), false, 'another handler does not see that order');
  noErrors(h, ben);
});
test('handler page, live: a booking made on another device appears, and a guest\'s cancellation is shown', async () => {
  const e = await world();
  const h = await as(e, 'aisha');
  const w = await h.open('handler.html', { pollMs: 100 });
  assert.ok(text(w, '#rows').includes('You have no sessions yet'));
  const booked = (await e.book(e.tokens.cat, { cats: ['c1'] })).data.reservation;
  await until(() => text(w, '#rows').includes(booked.code), 'the new session to appear');
  await e.act('cancelReservation', { code: booked.code }, e.tokens.cat);
  await until(() => text(w, '#cancelledBox').includes('Cancelled by guest: ' + booked.code), 'the cancellation notice');
  noErrors(h);
});

// ======================================================= admin
test('admin reservations: no Assign; edit, cancel with refund and clear data all go through the server; live updates', async () => {
  const e = await world();
  const admin = await as(e, 'admin');
  const w = await admin.open('admin.html', { pollMs: 100 });
  assert.equal($$(w, '#rows tr').length, 0);
  const one = (await e.book(e.tokens.cat, { roomId: 'P1', cats: ['c1'], time: '14:00' })).data.reservation;
  await until(() => text(w, '#rows').includes(one.code), 'the new booking to appear by itself');
  assert.ok(!$$(w, 'button').some(b => b.textContent === 'Assign'));
  assert.ok(row(w, '#rows tr', one.code).textContent.includes('Confirmed') && row(w, '#rows tr', one.code).textContent.includes('chosen by the cats'));
  await e.act('payReservation', { code: one.code, method: 'PayNow' }, e.tokens.cat);
  await until(() => row(w, '#rows tr', one.code).textContent.includes('Paid'), 'payment to show');
  buttonByText(row(w, '#rows tr', one.code), 'Edit').click();
  const panel = $(w, '.edit-row');
  const boxes = [...panel.querySelectorAll('input[type=checkbox]')];
  boxes[0].checked = false; boxes[2].checked = true;
  panel.querySelectorAll('select')[0].value = 'P3';
  await click(buttonByText(panel, 'Save changes'));
  assert.ok(row(w, '#rows tr', one.code).textContent.includes('P3 - Private Room 3') && row(w, '#rows tr', one.code).textContent.includes('Madinah'));
  buttonByText(row(w, '#rows tr', one.code), 'Edit').click();
  await click(buttonByText($(w, '.edit-row'), 'Cancel this booking (full refund)'));
  const saved = (await store(e)).reservations[0];
  assert.deepEqual([saved.status, saved.cancelledBy, saved.refund], ['Cancelled', 'admin', 30]);
  await click($(w, '#resetBtn'));
  assert.equal((await store(e)).reservations.length, 0);
  noErrors(admin);
});
test('manage cats: a new cat with a handler, a changed handler, and an unwell cat swapped out of a booking', async () => {
  const e = await world();
  const booked = (await e.book(e.tokens.cat, { cats: ['c1'], time: '14:00' })).data.reservation;
  const admin = await as(e, 'admin');
  let w = await admin.open('admin-cats.html');
  set(w, 'catName', 'Mimi'); set(w, 'catNotes', 'Loves boxes\n\nLikes naps'); set(w, 'catHandler', 'ben');
  await send(w, 'catForm'); await idle(w);
  const mimi = (await store(e)).cats.find(c => c.name === 'Mimi');
  assert.deepEqual([mimi.handler, mimi.notes, mimi.active], ['ben', ['Loves boxes', 'Likes naps'], true]);
  const sel = $(w, '#rows tr .handler-select');
  sel.value = 'ben'; sel.dispatchEvent(new w.Event('change')); await wait(300); await idle(w);
  assert.equal((await store(e)).cats[0].handler, 'ben');
  buttonByText($$(w, '#rows tr')[0], 'Edit').click();
  $(w, '#catActive').checked = false; set(w, 'catNote', 'Vet visit');
  await send(w, 'catForm');
  await until(() => text(w, '#notice').includes(booked.code + ': Fluffy was replaced by'), 'the swap notice');
  const s = await store(e);
  assert.deepEqual([s.cats[0].active, s.cats[0].note, s.reservations[0].cats[0] !== 'c1'], [false, 'Vet visit', true]);
  const g = await as(e, 'cat');
  assert.ok(row(await g.open('sessions.html'), '#myReservations tr', booked.code).textContent.includes('Fluffy is unwell, so'));
  noErrors(admin, g);
});
test('the server, not the page, protects the data: deleting a room that has bookings is refused with a clear message', async () => {
  const e = await world();
  await e.book(e.tokens.cat, { cats: ['c1'] });
  const admin = await as(e, 'admin');
  const w = await admin.open('admin-rooms.html');
  await click(buttonByText(row(w, '#rows tr', 'P1'), 'Delete'));                      // the page itself blocks this with its own check...
  assert.ok(w.__alerts.some(m => m.includes('has bookings')));
  assert.ok((await store(e)).rooms.some(r => r.id === 'P1'));
  // ...and so does the server, even if someone skips the page
  const rooms = (await e.call('GET', '/api/data', undefined, e.tokens.admin)).data.data.rooms;
  const direct = await e.call('PUT', '/api/collection/rooms', { value: rooms.filter(r => r.id !== 'P1') }, e.tokens.admin);
  assert.equal(direct.status, 409);
});
test('manage hours, sessions and staff: weekly hours, a holiday, the hours a guest can book, and the break', async () => {
  const e = await world();
  const admin = await as(e, 'admin');
  let w = await admin.open('admin-hours.html');
  w.document.querySelector('.day-open[data-day="2"]').checked = false;
  await click($(w, '#saveWeek'));
  assert.ok(text(w, '#weekResult').includes('Saved.'));
  assert.equal((await store(e)).openHours.weekly[2].open, false);
  w.document.querySelector('.day-open[data-day="2"]').checked = true;
  w.document.querySelector('.day-from[data-day="1"]').value = '18:00'; w.document.querySelector('.day-to[data-day="1"]').value = '10:00';
  await click($(w, '#saveWeek'));
  assert.ok(text(w, '#weekResult').includes('Monday: the closing time must be after the opening time'));
  set(w, 'holidayDate', TOMORROW); set(w, 'holidayName', 'Staff Day'); set(w, 'holidayMode', 'closed');
  await send(w, 'holidayForm'); await idle(w);
  assert.ok((await store(e)).holidays.some(h => h.date === TOMORROW && h.mode === 'closed'));
  const g = await as(e, 'cat');
  const bw = await g.open('booking.html');
  await until(() => $$(bw, '#session option').length === 2, 'sessions');
  set(bw, 'date', TOMORROW);
  assert.ok(text(bw, '#time').includes('Closed on this day'));
  w = await admin.open('admin-sessions.html');
  buttonByText($$(w, '#rows tr')[0], 'Edit').click();
  set(w, 'sessionMinHours', '2'); await send(w, 'sessionForm'); await idle(w);
  assert.equal((await store(e)).sessions[0].minHours, 2);
  w = await admin.open('admin-staff.html');
  set(w, 'breakMinutes', '30'); await click($(w, '#saveBreak')); await idle(w);
  assert.deepEqual((await store(e)).settings, { breakMinutes: 30 });
  noErrors(admin, g);
});
test('a save the server refuses is explained to the admin (an invalid opening hours list)', async () => {
  const e = await world();
  const admin = await as(e, 'admin');
  const w = await admin.open('admin-rates.html');
  w.eval("writeKey('rates', [{ id: 'r1', name: 'Bad', sessionId: 'ps', dayType: 'sometimes', pricePerHour: 5 }])");     // what a buggy page could send
  await wait(400); await idle(w);
  assert.ok(w.__alerts.some(m => m.includes('That could not be saved')));
  assert.equal((await store(e)).rates.length, 6, 'the database was not changed');
});

// ======================================================= orders, support, FAQ
test('orders: the guest orders from the Menu (the server sets the prices); the admin sees it and serves it', async () => {
  const e = await world();
  const booked = (await e.book(e.tokens.cat, { cats: ['c1'] })).data.reservation;
  const g = await as(e, 'cat');
  let w = await g.open('menu.html');
  const dairy = [...w.document.querySelectorAll('#allergyChecks input')].find(i => i.value === 'Dairy');
  dairy.checked = true; dairy.dispatchEvent(new w.Event('change'));
  assert.equal($$(w, '.menu-item.allergy-warning').length, 6);
  w.__confirmAnswer = false;
  buttonByText(row(w, '.menu-item', 'Latte'), 'Add').click();
  assert.ok(w.__confirms[0].includes('Latte contains Dairy'));
  w.__confirmAnswer = true;
  buttonByText(row(w, '.menu-item', 'Latte'), 'Add').click();
  buttonByText(row(w, '.menu-item', 'Latte'), 'Add').click();
  buttonByText(row(w, '.menu-item', 'Iced Lemon Tea'), 'Add').click();
  assert.ok(w.document.getElementById('orderReservation').textContent.includes(booked.code));
  await click([...w.document.querySelectorAll('#cartBox button')].find(x => /place/i.test(x.textContent)));
  const order = (await store(e)).orders[0];
  assert.deepEqual([order.total, order.handler, order.items.map(i => [i.name, i.qty, i.price])], [15.5, 'Aisha', [['Latte', 2, 5.5], ['Iced Lemon Tea', 1, 4.5]]]);
  assert.ok(w.__alerts.some(m => m.includes('Order placed!') && m.includes('P1 - Private Room 1')));
  const a = await as(e, 'admin');
  w = await a.open('admin-orders.html');
  await click(buttonByText($(w, '#rows tr'), 'Mark served'));
  assert.equal((await store(e)).orders[0].status, 'Served');
  noErrors(g, a);
});
test('support us: subscribe, switch and cancel on the server; the admin sees the supporters', async () => {
  const e = await world();
  const g = await as(e, 'cat');
  let w = await g.open('support.html');
  await click(buttonByText($$(w, '#tiers .tier')[1], 'Subscribe'));
  assert.ok(text(w, '#current').includes('You support us as a Cat Parent (S$15.00 a month)'));
  await click(buttonByText($$(w, '#tiers .tier')[2], 'Switch to this plan'));
  assert.deepEqual((await store(e)).subscriptions.map(s => [s.tier, s.status]), [['parent', 'cancelled'], ['guardian', 'active']]);
  const d = await as(e, 'dog');
  w = await d.open('support.html');
  await click(buttonByText($$(w, '#tiers .tier')[0], 'Subscribe'));
  const a = await as(e, 'admin');
  w = await a.open('admin-faq.html');
  assert.ok(text(w, '#supportSummary').includes('2 active supporter(s), S$35.00 a month'));
  w = await g.open('support.html');
  await click(buttonByText($(w, '#current'), 'Cancel my subscription'));
  assert.ok(!text(w, '#current').includes('You support us'));
  assert.ok(text(await device(e).open('support.html'), '#current').includes('Log in or sign up to subscribe'));
  noErrors(g, d, a);
});
test('FAQ and feedback: anyone can send feedback, the admin turns a question into a published answer', async () => {
  const e = await world({ feedbackPerHour: 3 });
  const v = device(e);
  let w = await v.open('faq.html');
  assert.equal($$(w, '.faq-item').length, 8);
  set(w, 'fbType', 'Question'); set(w, 'fbName', 'Visitor'); set(w, 'fbEmail', 'v@x.com'); set(w, 'fbMessage', 'Can we bring a birthday cake?');
  await send(w, 'feedbackForm');
  assert.ok(text(w, '#fbResult').includes('Thank you'));
  set(w, 'fbEmail', 'nope'); set(w, 'fbMessage', 'Hi'); await send(w, 'feedbackForm');
  assert.ok(text(w, '#fbResult').includes('valid email'));
  const a = await as(e, 'admin');
  w = await a.open('admin-faq.html');
  assert.equal($$(w, '#feedbackRows tr').length, 1);
  w.__promptAnswer = 'Yes, please tell us when you book.';
  buttonByText($(w, '#feedbackRows tr'), 'Answer and publish to FAQ').click();
  await wait(400); await idle(w);
  assert.ok(text(w, '#faqRows').includes('Can we bring a birthday cake?'));
  const s = await store(e);
  assert.deepEqual([s.faq.length, s.feedbackMessages[0].status], [9, 'Published']);
  assert.equal($$(await v.open('faq.html'), '.faq-item').length, 9);
  noErrors(v, a);
});

// ======================================================= when things go wrong
test('an expired or invalid login is noticed by the page: it acts as a visitor again', async () => {
  const e = await world();
  const d = device(e);
  d.local.catcafe_auth = JSON.stringify({ token: 'not-a-real-token', user: { name: 'Cat', email: 'cat@gmail.com', role: 'guest' } });
  const w = await d.open('booking.html');
  assert.ok(text(w, 'main').includes('Please log in'));
  assert.equal(d.local.catcafe_auth, undefined);
  assert.ok(text(w, '.header-right').includes('Login'));
});
test('if the server cannot be reached, the page says so instead of staying blank', async () => {
  const e = await world();
  const d = device(e);
  d.failApi = true;
  const w = await d.open('menu.html');
  assert.ok(text(w, 'main').includes('Could not reach the server'));
});
test('a role written into the browser\'s memory changes what the page shows, but never what the server allows', async () => {
  const e = await world();
  const d = device(e);
  d.local.catcafe_auth = JSON.stringify({ token: e.tokens.cat, user: { name: 'Cat', role: 'admin', username: 'cat' } });      // a guest pretending to be the admin
  const w = await d.open('admin.html');
  assert.ok(!text(w, '#summary').includes('Confirmed: 1'));
  assert.equal(w.eval('JSON.stringify(DATA.feedbackMessages)'), '[]', 'the server still treats this person as a guest');
  assert.equal((await e.act('clearPracticeData', {}, e.tokens.cat)).status, 403);
  assert.equal((await e.call('GET', '/api/admin/dashboard', undefined, e.tokens.cat)).status, 403);
});
