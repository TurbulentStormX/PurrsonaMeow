import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, CAT, DOG } from './rules-harness.mjs';

// The pretend "today" is Monday 4 March 2030, 8:00. TOMORROW is a Tuesday, SAT is the Saturday after.
const DAY = '2030-03-04', TOMORROW = '2030-03-05', SAT = '2030-03-09';
function site() { const s = load(); s.setNow(DAY + 'T08:00:00'); return s; }
const book = (s, user, over = {}) => s.call('createReservation', user, { sessionId: 'ps', roomId: 'P1', date: TOMORROW, time: '14:00', hours: 1, guests: 2, requests: '', cats: ['c1'], ...over });
const rows = s => s.get('loadReservations()');
const setHoliday = (s, date, name, mode = 'open', from = '10:00', to = '18:00') =>
  s.run(`const hl = loadHolidays(); hl.push({ id: 'x${date}', date: '${date}', name: '${name}', mode: '${mode}', from: '${from}', to: '${to}' }); saveHolidays(hl);`);
const leave = (s, who, day = TOMORROW) => s.call('addLeave', who, day, day, 'Sick', '');

// ================= opening hours, holidays, rates =================
test('hours: the weekly hours, lunch as a closed period, and Singapore public holidays from the MOM list', () => {
  const s = site();
  assert.deepEqual(s.call('dayInfo', TOMORROW), { open: true, from: '10:00', to: '20:00', holiday: null, text: 'Open 10:00 AM to 8:00 PM' });
  assert.deepEqual(s.get('loadHours().closedPeriods'), [{ id: 'lunch', name: 'Lunch break', from: '12:00', to: '13:00' }]);
  const holidays = s.get('loadHolidays()');
  assert.equal(holidays.length, 12);
  assert.deepEqual(holidays.map(h => h.date), ['2026-12-25', '2027-01-01', '2027-02-06', '2027-02-07', '2027-03-10', '2027-03-26', '2027-05-01', '2027-05-17', '2027-05-20', '2027-08-09', '2027-10-28', '2027-12-25']);
  assert.equal(holidays.find(h => h.date === '2027-10-28').name, 'Deepavali');
  assert.equal(s.call('dayType', '2026-12-25'), 'holiday');
  assert.equal(s.call('dayType', TOMORROW), 'weekday');
  assert.equal(s.call('dayType', SAT), 'weekend');
});
test('hours: a public holiday can be open with its own hours, or closed; a weekday can be switched off', () => {
  const s = site();
  setHoliday(s, '2030-03-06', 'Test Day', 'open', '11:00', '17:00');
  setHoliday(s, '2030-03-07', 'Closed Day', 'closed');
  assert.deepEqual(s.call('dayInfo', '2030-03-06'), { open: true, from: '11:00', to: '17:00', holiday: s.call('holidayOn', '2030-03-06'), text: 'Public holiday (Test Day): open 11:00 AM to 5:00 PM' });
  const closed = s.call('dayInfo', '2030-03-07');
  assert.deepEqual([closed.open, closed.text], [false, 'Closed: Closed Day']);
  s.run(`const h = loadHours(); h.weekly[2].open = false; saveHours(h);`);                 // Tuesdays closed
  assert.equal(s.call('dayInfo', TOMORROW).open, false);
  assert.match(s.call('dayInfo', TOMORROW).text, /Closed on Tuesdays/);
});
test('rates: the best match wins (public holiday > weekend > every day; the session\'s own rate > a general one)', () => {
  const s = site();
  setHoliday(s, '2030-03-06', 'Test Day');
  const price = (sid, date) => (s.call('rateFor', sid, date) || {}).pricePerHour;
  assert.equal(price('ps', TOMORROW), 30); assert.equal(price('ps', SAT), 36); assert.equal(price('ps', '2030-03-06'), 42);
  assert.equal(price('ys', TOMORROW), 40); assert.equal(price('ys', SAT), 48); assert.equal(price('ys', '2030-03-06'), 56);
  // add a general (all sessions) weekday rate and a switched-off rate
  s.run(`const r = loadRates(); r.push({ id: 'g', name: 'General', sessionId: '', dayType: 'weekday', pricePerHour: 99, active: true }); saveRates(r);`);
  assert.equal(price('ps', TOMORROW), 30, "the session's own 'every day' rate beats a general weekday rate");
  s.run(`const r = loadRates().filter(x => x.id !== 'r1'); saveRates(r);`);
  assert.equal(price('ps', TOMORROW), 99, 'with no rate of its own for weekdays, the general rate is used');
  s.run(`const r = loadRates(); r.find(x => x.id === 'g').active = false; saveRates(r);`);
  assert.equal(s.call('rateFor', 'ps', TOMORROW), null, 'nothing left');
  assert.equal(price('ps', SAT), 36);
});

// ================= flexible hours, prices per hour =================
test('booking: the guest chooses the start and the hours; the price is per HOUR, the same for any number of guests', () => {
  const s = site();
  const a = book(s, CAT, { time: '14:00', hours: 2, guests: 1, cats: ['c1'] });
  assert.equal(a.ok, true);
  assert.deepEqual([a.reservation.time, a.reservation.endTime, a.reservation.hours, a.reservation.pricePerHour, a.reservation.amount, a.reservation.rateName],
                   ['14:00', '16:00', 2, 30, 60, 'Private Cat Session - standard']);
  const b = book(s, DOG, { roomId: 'P2', time: '14:00', hours: 2, guests: 6, cats: ['c4'] });
  assert.equal(b.reservation.amount, 60, '6 guests pay the same as 1 guest');
  const c = book(s, CAT, { roomId: 'P3', date: SAT, time: '13:00', hours: 3, guests: 2, cats: ['c5'] });
  assert.deepEqual([c.reservation.pricePerHour, c.reservation.amount], [36, 108]);
  assert.equal(s.call('timeRange', a.reservation), '2:00 PM - 4:00 PM');
});
test('booking: it is confirmed straight away, with the room and a handler (no admin step)', () => {
  const s = site();
  const b = book(s, CAT).reservation;
  assert.deepEqual([b.status, b.zone, b.paid], ['Assigned', 'P1 - Private Room 1', false]);
  assert.ok(b.handlerUsername && b.handler);
  assert.equal(s.call('statusText', 'Assigned'), 'Confirmed');
  assert.equal(s.call('statusText', 'Cancelled'), 'Cancelled');
});
test('booking: the number of hours must be a whole number inside the session\'s limits', () => {
  const s = site();
  assert.match(book(s, CAT, { hours: 4 }).error, /lasts 1 hour to 3 hours/);
  assert.match(book(s, CAT, { hours: 0 }).error, /lasts 1 hour to 3 hours/);
  assert.match(book(s, CAT, { hours: 1.5 }).error, /lasts 1 hour to 3 hours/);
  assert.match(book(s, DOG, { sessionId: 'ys', roomId: 'L1', hours: 3, cats: [] }).error, /lasts 1 hour to 2 hours/);
  assert.equal(rows(s).length, 0);
});
test('booking: it must fit inside opening hours, and cannot overlap the lunch break', () => {
  const s = site();
  assert.match(book(s, CAT, { time: '09:00' }).error, /open 10:00 AM to 8:00 PM/);
  assert.match(book(s, CAT, { time: '19:00', hours: 2 }).error, /Your session must fit inside/);
  assert.match(book(s, CAT, { time: '11:00', hours: 2 }).error, /Lunch break \(12:00 PM to 1:00 PM\) is closed/);
  assert.match(book(s, CAT, { time: '12:00' }).error, /Lunch break/);
  assert.equal(book(s, CAT, { time: '11:00', hours: 1 }).ok, true, 'ending exactly at lunch is fine');
  assert.equal(book(s, DOG, { roomId: 'P2', time: '13:00', hours: 1, cats: ['c4'] }).ok, true, 'starting exactly after lunch is fine');
  assert.equal(book(s, CAT, { roomId: 'P3', time: '19:00', hours: 1, cats: ['c5'] }).ok, true, 'ending exactly at closing time is fine');
});
test('booking: a closed day and a shorter public-holiday day are respected, and the holiday rate is charged', () => {
  const s = site();
  setHoliday(s, '2030-03-06', 'Test Day', 'open', '11:00', '17:00');
  setHoliday(s, '2030-03-07', 'Closed Day', 'closed');
  assert.match(book(s, CAT, { date: '2030-03-07' }).error, /Closed: Closed Day/);
  assert.match(book(s, CAT, { date: '2030-03-06', time: '16:00', hours: 2 }).error, /open 11:00 AM to 5:00 PM/);
  const ok = book(s, CAT, { date: '2030-03-06', time: '13:00', hours: 2 });
  assert.equal(ok.ok, true);
  assert.deepEqual([ok.reservation.pricePerHour, ok.reservation.amount], [42, 84]);
});
test('booking: a room can have its own shorter opening hours', () => {
  const s = site();
  s.run(`const rs = loadRooms(); rs[0].from = '14:00'; rs[0].to = '18:00'; saveRooms(rs);`);
  assert.match(book(s, CAT, { time: '10:00' }).error, /open 2:00 PM to 6:00 PM/);
  assert.equal(book(s, CAT, { time: '14:00', hours: 2 }).ok, true);
});
test('booking: no rate for the session means it cannot be booked; past times are refused; later today is fine', () => {
  const s = site(); s.setNow(DAY + 'T11:00:00');
  assert.match(book(s, CAT, { date: DAY, time: '10:00' }).error, /already passed/);
  assert.equal(book(s, CAT, { date: DAY, time: '14:00' }).ok, true, 'later today is fine');
  s.run(`saveRates([])`);
  assert.match(book(s, DOG, { roomId: 'P2', cats: ['c4'] }).error, /No rate has been set for Private Cat Session/);
});

// ================= first come, first served: rooms =================
test('rooms: a private room takes one booking at a time (overlap refused, back to back is fine)', () => {
  const s = site();
  assert.equal(book(s, CAT, { time: '14:00', hours: 2, cats: ['c1'] }).ok, true);
  assert.match(book(s, DOG, { time: '15:00', hours: 1, cats: ['c4'] }).error, /already booked/);
  assert.match(book(s, DOG, { time: '13:00', hours: 2, cats: ['c4'] }).error, /already booked/);
  assert.equal(book(s, DOG, { time: '16:00', hours: 1, cats: ['c4'] }).ok, true, 'starts when the first one ends');
  assert.equal(book(s, DOG, { roomId: 'P2', time: '14:00', cats: ['c4'] }).ok, true, 'another room is free');
});
test('rooms: the shared lounge counts the busiest moment, so partly overlapping bookings add up only where they overlap', () => {
  const s = site();
  s.pick('first');                                           // yoga has no chosen cats, so its handler is random: fix it so the test is the same every run
  const yoga = (u, over) => book(s, u, { sessionId: 'ys', roomId: 'L1', cats: [], ...over });
  assert.equal(yoga(CAT, { time: '14:00', hours: 2, guests: 12 }).ok, true);          // 14-16: 12 people
  assert.equal(yoga(DOG, { time: '15:00', hours: 2, guests: 6 }).ok, true);           // 15-17: peak 18 at 15-16
  assert.match(yoga(CAT, { time: '14:30', hours: 1, guests: 4 }).error, /only 2 spot/);   // 14:30-15:30 would be 22
  assert.equal(yoga(CAT, { time: '14:30', hours: 1, guests: 2 }).ok, true);           // exactly 20
  assert.equal(yoga(DOG, { time: '16:00', hours: 1, guests: 14 }).ok, true, 'after the first one ends only 6 are left, so 14 fit');
  assert.match(yoga(DOG, { time: '16:00', hours: 1, guests: 1 }).error, /already booked|only|full/);
});
test('rooms: a cancelled booking frees the room, the cats and the handler for others straight away', () => {
  const s = site();
  const a = book(s, CAT, { cats: ['c1'] }).reservation;
  assert.equal(book(s, DOG, { cats: ['c2'] }).ok, false, 'room taken');
  assert.equal(book(s, DOG, { roomId: 'P2', cats: ['c1'] }).ok, false, 'cat taken');
  assert.equal(s.call('cancelReservation', a.code, 'guest', 'cat@gmail.com').ok, true);
  assert.equal(book(s, DOG, { cats: ['c1'] }).ok, true, 'the same room and the same cat can now be booked');
});

// ================= cats: one at a time, and a break after every session =================
test('cats: a cat is in one session at a time, and rests for one hour after it', () => {
  const s = site();
  assert.equal(book(s, CAT, { roomId: 'P1', time: '14:00', hours: 1, cats: ['c1'] }).ok, true);   // 14-15, cat rests until 16:00
  assert.match(book(s, DOG, { roomId: 'P2', time: '14:00', cats: ['c1'] }).error, /Fluffy is already booked/);
  assert.match(book(s, DOG, { roomId: 'P2', time: '15:00', cats: ['c1'] }).error, /Fluffy is having a break/);
  assert.equal(book(s, DOG, { roomId: 'P2', time: '16:00', cats: ['c1'] }).ok, true, 'the break is over at 16:00');
  assert.match(book(s, CAT, { roomId: 'P3', time: '13:00', cats: ['c1'] }).error, /Fluffy is having a break/, 'a session right BEFORE would leave no break either');
  assert.equal(book(s, CAT, { roomId: 'P3', time: '10:00', cats: ['c1'] }).ok, true);
});
test('cats: the break length is a setting (0 means back to back)', () => {
  const s = site();
  assert.equal(s.call('loadSettings').breakMinutes, 60);
  s.call('saveSettings', { breakMinutes: 0 });
  assert.equal(s.call('loadSettings').breakMinutes, 0);
  assert.equal(book(s, CAT, { time: '14:00', cats: ['c1'] }).ok, true);
  assert.equal(book(s, DOG, { roomId: 'P2', time: '15:00', cats: ['c1'] }).ok, true, 'no break needed');
  s.call('saveSettings', { breakMinutes: 90 });
  assert.match(book(s, DOG, { roomId: 'P3', time: '17:00', cats: ['c1'] }).error, /break/, '90 minutes: 15:00 + 90 = 16:30 is still busy');
});
test('cats: 1 to 2 cats are needed, they must exist and not be resting', () => {
  const s = site();
  assert.match(book(s, CAT, { cats: [] }).error, /at least 1 cat/);
  assert.match(book(s, CAT, { cats: ['c1', 'c2', 'c3'] }).error, /up to 2/);
  assert.match(book(s, CAT, { cats: ['nope'] }).error, /does not exist/);
  s.run(`const cs = loadCats(); cs[0].active = false; saveCats(cs);`);
  assert.match(book(s, CAT, { cats: ['c1'] }).error, /Fluffy is resting/);
  const y = book(s, CAT, { sessionId: 'ys', roomId: 'L1', cats: ['c1'], guests: 4 });
  assert.deepEqual([y.ok, y.reservation.cats], [true, []], 'the yoga session ignores chosen cats');
});

// ================= the cat handler is chosen by the cats =================
test('handler: cats of the same handler -> that handler', () => {
  const s = site();
  const b = book(s, CAT, { cats: ['c1', 'c2'] }).reservation;                 // both are Aisha's cats
  assert.deepEqual([b.handlerUsername, b.handler, b.handlerBy], ['aisha', 'Aisha', 'cat']);
  const d = book(s, DOG, { roomId: 'P2', time: '16:00', cats: ['c4'] }).reservation;    // Ben's cat
  assert.deepEqual([d.handlerUsername, d.handlerBy], ['ben', 'cat']);
});
test('handler: cats of different handlers and both free -> picked at random', () => {
  const s = site();
  s.pick('first');
  assert.equal(book(s, CAT, { roomId: 'P1', cats: ['c1', 'c4'] }).reservation.handlerUsername, 'aisha');
  s.pick('last');
  const second = book(s, DOG, { roomId: 'P2', time: '17:00', cats: ['c2', 'c5'] }).reservation;
  assert.deepEqual([second.handlerUsername, second.handlerBy], ['ben', 'random']);
});
test('handler: cats of different handlers and only one is free -> the free one', () => {
  const s = site();
  leave(s, 'aisha');
  const b = book(s, CAT, { cats: ['c1', 'c4'] }).reservation;                 // Aisha (on leave) and Ben
  assert.deepEqual([b.handlerUsername, b.handlerBy], ['ben', 'cat']);
  const s2 = site();
  leave(s2, 'ben');
  assert.equal(book(s2, CAT, { cats: ['c1', 'c4'] }).reservation.handlerUsername, 'aisha');
});
test('handler: busy with another session, or on a break, then the other free handler steps in', () => {
  const s = site();
  assert.equal(book(s, CAT, { roomId: 'P1', time: '14:00', cats: ['c1'] }).reservation.handlerUsername, 'aisha');
  const busy = book(s, DOG, { roomId: 'P2', time: '14:00', cats: ['c2'] }).reservation;        // Aisha's cat, but Aisha is busy
  assert.deepEqual([busy.handlerUsername, busy.handlerBy], ['ben', 'fallback']);
  const t = site();
  assert.equal(book(t, CAT, { roomId: 'P1', time: '14:00', cats: ['c1'] }).reservation.handlerUsername, 'aisha');      // 14-15
  const onBreak = book(t, DOG, { roomId: 'P2', time: '15:00', cats: ['c2'] }).reservation;                              // Aisha rests until 16:00
  assert.deepEqual([onBreak.handlerUsername, onBreak.handlerBy], ['ben', 'fallback']);
  const after = book(t, CAT, { roomId: 'P3', time: '17:00', cats: ['c3'] }).reservation;                                // everyone is free again
  assert.deepEqual([after.handlerUsername, after.handlerBy], ['aisha', 'cat']);
});
test('handler: when every handler is busy, on a break or on leave, the booking is refused', () => {
  const s = site();
  assert.equal(book(s, CAT, { roomId: 'P1', time: '14:00', cats: ['c1'] }).ok, true);          // Aisha
  assert.equal(book(s, DOG, { roomId: 'P2', time: '14:00', cats: ['c4'] }).ok, true);          // Ben
  assert.match(book(s, CAT, { roomId: 'P3', time: '14:00', cats: ['c5'] }).error, /none of our cat handlers is free/);
  assert.match(book(s, CAT, { roomId: 'P3', time: '15:00', cats: ['c5'] }).error, /none of our cat handlers is free/, 'both are on their break');
  assert.equal(book(s, CAT, { roomId: 'P3', time: '16:00', cats: ['c5'] }).ok, true);
  const t = site(); leave(t, 'aisha'); leave(t, 'ben');
  assert.match(book(t, CAT, {}).error, /none of our cat handlers is free/);
});
test('handler: one handler can look after several bookings in the same shared lounge at once', () => {
  const s = site();
  const y1 = book(s, CAT, { sessionId: 'ys', roomId: 'L1', cats: [], time: '14:00', hours: 2, guests: 8 });
  assert.equal(y1.ok, true);
  const first = y1.reservation.handlerUsername;
  s.run(`window.__first = '${first}'`);
  // make the other handler unavailable so the same handler must take the second booking
  const other = first === 'aisha' ? 'ben' : 'aisha';
  leave(s, other);
  const y2 = book(s, DOG, { sessionId: 'ys', roomId: 'L1', cats: [], time: '15:00', hours: 1, guests: 6 });
  assert.equal(y2.ok, true);
  assert.equal(y2.reservation.handlerUsername, first);
});

// ================= the admin edits a booking =================
test('admin edit: change the handler (leave and break are respected), the room and the cats', () => {
  const s = site();
  const a = book(s, CAT, { roomId: 'P1', cats: ['c1'] }).reservation;                // Aisha
  const b = book(s, DOG, { roomId: 'P2', cats: ['c4'], time: '14:00' }).reservation;   // Ben
  assert.match(s.call('editReservation', a.code, { handler: 'ben' }).error, /already looking after another session/);
  assert.match(s.call('editReservation', a.code, { cats: ['c4'] }).error, /Mozza is already booked/);
  assert.match(s.call('editReservation', a.code, { roomId: 'L1' }).error, /not used for this session/);
  assert.equal(s.call('editReservation', a.code, { roomId: 'P3', cats: ['c3'] }).ok, true);
  const row = rows(s).find(r => r.code === a.code);
  assert.deepEqual([row.zone, row.catNames, row.handlerUsername], ['P3 - Private Room 3', ['Madinah'], 'aisha']);
  leave(s, 'ben', TOMORROW);
  assert.match(s.call('editReservation', a.code, { handler: 'ben' }).error, /on leave/);
  assert.equal(s.call('editReservation', 'CC-NOPE1', {}).ok, false);
  assert.ok(b);
});
test('admin edit: a change that is not allowed changes nothing at all', () => {
  const s = site();
  const a = book(s, CAT, { roomId: 'P1', cats: ['c1'] }).reservation;
  book(s, DOG, { roomId: 'P2', cats: ['c4'], time: '14:00' });
  const before = JSON.stringify(rows(s));
  assert.equal(s.call('editReservation', a.code, { roomId: 'P3', cats: ['c4'] }).ok, false);   // the room would be fine, the cat is not
  assert.equal(JSON.stringify(rows(s)), before);
});

// ================= staff leave and unwell cats =================
test('leave: upcoming sessions move to the other free handler; sessions nobody can cover are flagged', () => {
  const s = site();
  const a = book(s, CAT, { roomId: 'P1', cats: ['c1'], time: '14:00' }).reservation;      // Aisha 14-15
  const b = book(s, DOG, { roomId: 'P2', cats: ['c2'], time: '17:00' }).reservation;      // Aisha 17-18
  const r = leave(s, 'aisha');
  assert.deepEqual(r.moved.map(x => [x.code, x.to]).sort(), [[a.code, 'Ben'], [b.code, 'Ben']].sort());
  assert.deepEqual(r.uncovered, []);
  assert.ok(rows(s).every(x => x.handlerUsername === 'ben' && x.handlerBy === 'leave'));
  // now Ben is busy at 14:00 in another room too: a new leave for Ben cannot be covered
  const c = book(s, CAT, { roomId: 'P3', cats: ['c5'], time: '10:00' }).reservation;      // Ben 10-11 (Aisha is on leave)
  const r2 = leave(s, 'ben');
  assert.equal(r2.uncovered.length, 3);
  const flagged = rows(s).find(x => x.code === c.code);
  assert.deepEqual([flagged.handlerUsername, flagged.needsHandler], ['', true]);
  assert.match(flagged.needsAttention, /Ben is on leave \(Sick\) and no other handler is free/);
  // the admin fixes it: Aisha's leave is removed, then she is chosen
  s.call('removeLeave', s.get('loadLeaves()')[0].id);
  assert.equal(s.call('editReservation', c.code, { handler: 'aisha' }).ok, true);
  const fixed = rows(s).find(x => x.code === c.code);
  assert.deepEqual([fixed.handlerUsername, fixed.needsHandler, fixed.needsAttention], ['aisha', false, '']);
});
test('leave: only upcoming sessions inside the leave dates move, and the inputs are checked', () => {
  const s = site();
  const keep = book(s, CAT, { cats: ['c1'], date: '2030-03-06' }).reservation;
  const gone = book(s, DOG, { roomId: 'P2', cats: ['c2'], date: TOMORROW }).reservation;
  leave(s, 'aisha', TOMORROW);
  assert.equal(rows(s).find(x => x.code === keep.code).handlerUsername, 'aisha');
  assert.equal(rows(s).find(x => x.code === gone.code).handlerUsername, 'ben');
  assert.equal(s.call('addLeave', 'nobody', DAY, DAY, 'Sick').ok, false);
  assert.match(s.call('addLeave', 'ben', TOMORROW, DAY, 'Sick').error, /cannot be before/);
  assert.match(s.call('addLeave', 'ben', DAY, DAY, 'Holiday!').error, /reason/);
  assert.equal(s.call('addLeave', 'ben', '', DAY, 'Sick').ok, false);
  const id = s.call('addLeave', 'ben', DAY, TOMORROW, 'Sick').leave.id;
  s.call('removeLeave', id);
  assert.equal(s.get('loadLeaves()').filter(l => l.id === id).length, 0);
});
test('unwell cat: coming bookings get another free cat (same handler preferred); a booking with no free cat is flagged', () => {
  const s = site();
  const a = book(s, CAT, { roomId: 'P1', cats: ['c1'], time: '14:00' }).reservation;      // Fluffy (Aisha)
  const b = book(s, DOG, { roomId: 'P2', cats: ['c1'], time: '17:00' }).reservation;      // Fluffy again, later
  s.run(`const cs = loadCats(); cs[0].active = false; cs[0].note = 'Vet visit'; saveCats(cs);`);
  const out = s.call('replaceCatInUpcomingBookings', 'c1');
  assert.deepEqual(out.stuck, []);
  assert.equal(out.replaced.length, 2);
  const now = rows(s);
  const catA = now.find(x => x.code === a.code), catB = now.find(x => x.code === b.code);
  assert.ok(['c2', 'c3'].includes(catA.cats[0]), "Aisha's other cats come first");
  assert.match(catA.changeNote, /Fluffy is unwell, so (Moody|Madinah) will be with you instead/);
  assert.notEqual(catA.cats[0], 'c1'); assert.notEqual(catB.cats[0], 'c1');
  // all the other cats are busy at 17:00 too: nothing to swap in
  const s2 = site();
  const x = book(s2, CAT, { roomId: 'P1', cats: ['c1'], time: '14:00' }).reservation;
  s2.run(`const cs = loadCats(); cs.forEach(c => { if (c.id !== 'c1') c.active = false; }); cs[0].active = false; saveCats(cs);`);
  const none = s2.call('replaceCatInUpcomingBookings', 'c1');
  assert.deepEqual([none.replaced.length, none.stuck], [0, [x.code]]);
  const flagged = rows(s2)[0];
  assert.match(flagged.needsAttention, /Fluffy is unwell and no other cat is free/);
  assert.equal(s2.call('editReservation', x.code, { cats: ['c4'] }).ok, false, 'c4 is resting too');
});
test('unwell cat: two bookings at the same time never get the same replacement cat', () => {
  const s = site();
  book(s, CAT, { roomId: 'P1', cats: ['c1'], time: '14:00' });
  book(s, DOG, { roomId: 'P2', cats: ['c2'], time: '14:00' });
  s.run(`const cs = loadCats(); cs[0].active = false; cs[1].active = false; saveCats(cs);`);
  s.call('replaceCatInUpcomingBookings', 'c1'); s.call('replaceCatInUpcomingBookings', 'c2');
  const used = rows(s).flatMap(r => r.cats);
  assert.equal(new Set(used).size, used.length, 'no cat is in both sessions');
  assert.ok(used.every(id => !['c1', 'c2'].includes(id)));
});

// ================= cancelling and paying =================
test('cancel: only the owner, only before the start, never twice, and a finished session cannot be cancelled', () => {
  const s = site();
  const a = book(s, CAT).reservation;
  assert.match(s.call('cancelReservation', a.code, 'guest', 'dog@gmail.com').error, /not yours/);
  assert.match(s.call('cancelReservation', 'CC-NOPE1', 'guest', 'cat@gmail.com').error, /not found/);
  s.setNow(TOMORROW + 'T14:30:00');
  assert.match(s.call('cancelReservation', a.code, 'guest', 'cat@gmail.com').error, /already started/);
  s.setNow(DAY + 'T08:00:00');
  assert.equal(s.call('cancelReservation', a.code, 'guest', 'cat@gmail.com').ok, true);
  assert.match(s.call('cancelReservation', a.code, 'guest', 'cat@gmail.com').error, /already cancelled/);
  const b = book(s, DOG, { cats: ['c4'], roomId: 'P2' }).reservation;
  s.run(`const l = loadReservations(); l.find(r => r.code === '${b.code}').status = 'Concluded'; saveReservations(l);`);
  assert.match(s.call('cancelReservation', b.code, 'guest', 'dog@gmail.com').error, /already finished/);
});
test('payment and refunds: the amount is rate x hours; 100% at 24 hours or more, 50% from 2 to 24 hours, 0% under 2; the cafe cancelling is 100%', () => {
  for (const [now, percent, refund] of [['2030-03-04T14:00:00', 100, 90], ['2030-03-04T14:01:00', 50, 45], ['2030-03-05T11:59:00', 50, 45], ['2030-03-05T12:01:00', 0, 0]]) {
    const s = site(); const b = book(s, CAT, { time: '14:00', hours: 3, cats: ['c1'] }).reservation;       // 3 hours x S$30 = S$90
    assert.equal(b.amount, 90);
    assert.equal(s.call('payReservation', b.code, 'PayNow', 'cat@gmail.com').ok, true);
    s.setNow(now);
    const c = s.call('cancelReservation', b.code, 'guest', 'cat@gmail.com');
    assert.deepEqual([c.percent, c.refund], [percent, refund], now);
  }
  const s = site(); const b = book(s, CAT, { hours: 2 }).reservation;
  s.call('payReservation', b.code, 'Card', 'cat@gmail.com'); s.setNow('2030-03-05T13:59:00');
  assert.deepEqual([s.call('cancelReservation', b.code, 'admin').percent, rows(s)[0].refund, rows(s)[0].cancelledBy], [100, 60, 'admin']);
  const u = site(); const ub = book(u, CAT).reservation;                                      // never paid
  assert.equal(u.call('cancelReservation', ub.code, 'guest', 'cat@gmail.com').refund, 0);
});
test('payment: only the owner, once, with a valid method; and the labels', () => {
  const s = site();
  const b = book(s, CAT, { hours: 2 }).reservation;
  assert.match(s.call('payReservation', b.code, 'PayNow', 'dog@gmail.com').error, /not yours/);
  assert.match(s.call('payReservation', b.code, 'Bitcoin', 'cat@gmail.com').error, /payment method/);
  const p = s.call('payReservation', b.code, 'Card', 'cat@gmail.com');
  assert.deepEqual([p.ok, p.reservation.payment.method, p.reservation.payment.amount], [true, 'Card', 60]);
  assert.match(p.reservation.payment.ref, /^PAY-[A-HJ-NP-Z2-9]{5}$/);
  assert.match(s.call('payReservation', b.code, 'Card', 'cat@gmail.com').error, /already paid/);
  const label = r => s.call('paymentLabel', r).text;
  assert.equal(label({ status: 'Assigned', paid: false, amount: 50 }), 'Unpaid');
  assert.equal(label({ status: 'Assigned', paid: true, amount: 50 }), 'Paid');
  assert.equal(label({ status: 'Cancelled', paid: true, amount: 50, refund: 50 }), 'Refunded');
  assert.equal(label({ status: 'Cancelled', paid: true, amount: 50, refund: 25 }), 'Part refund');
  assert.equal(label({ status: 'Cancelled', paid: true, amount: 50, refund: 0 }), 'Paid, no refund');
  assert.equal(label({ status: 'Cancelled', paid: false, amount: 50, refund: 0 }), '-');
});

// ================= reviews of cats and staff =================
test('reviews: only after the session, only the guest, once; every cat and the handler need 1-5 stars', () => {
  const s = site();
  const b = book(s, CAT, { cats: ['c1', 'c2'] }).reservation;
  const good = { handlerStars: 5, handlerComment: 'Lovely', cats: [{ id: 'c1', stars: 5, comment: 'Soft' }, { id: 'c2', stars: 4, comment: '' }] };
  assert.match(s.call('addReview', b.code, 'cat@gmail.com', good).error, /after it has finished/);
  s.run(`const l = loadReservations(); l[0].status = 'Concluded'; saveReservations(l);`);
  assert.equal(s.call('canReview', rows(s)[0]), true);
  assert.match(s.call('addReview', b.code, 'dog@gmail.com', good).error, /not yours/);
  assert.match(s.call('addReview', b.code, 'cat@gmail.com', { ...good, handlerStars: 0 }).error, /rate your cat handler/);
  assert.match(s.call('addReview', b.code, 'cat@gmail.com', { ...good, cats: [{ id: 'c1', stars: 5 }] }).error, /rate each cat/);
  assert.match(s.call('addReview', b.code, 'cat@gmail.com', { ...good, cats: [{ id: 'c1', stars: 6 }, { id: 'c2', stars: 3 }] }).error, /rate each cat/);
  const long = 'x'.repeat(400);
  const ok = s.call('addReview', b.code, 'cat@gmail.com', { ...good, handlerComment: long });
  assert.equal(ok.ok, true);
  assert.deepEqual([ok.review.handler, ok.review.handlerName, ok.review.name, ok.review.handlerComment.length, ok.review.cats.map(c => c.name)], ['aisha', 'Aisha', 'Cat', 300, ['Fluffy', 'Moody']]);
  assert.match(s.call('addReview', b.code, 'cat@gmail.com', good).error, /already reviewed/);
  assert.equal(s.call('canReview', rows(s)[0]), false);
});
test('reviews: averages for each cat and each handler', () => {
  const s = site();
  const make = (user, over, stars) => {
    const b = book(s, user, over).reservation;
    s.run(`const l = loadReservations(); l.find(r => r.code === '${b.code}').status = 'Concluded'; saveReservations(l);`);
    assert.equal(s.call('addReview', b.code, user.email, { handlerStars: stars[0], cats: [{ id: 'c1', stars: stars[1] }] }).ok, true);
  };
  assert.deepEqual(s.call('catRating', 'c1'), { avg: 0, count: 0 });
  make(CAT, { roomId: 'P1', time: '10:00', cats: ['c1'] }, [5, 5]);
  make(DOG, { roomId: 'P2', time: '16:00', cats: ['c1'] }, [4, 3]);
  assert.deepEqual(s.call('catRating', 'c1'), { avg: 4, count: 2 });
  assert.deepEqual(s.call('handlerRating', 'aisha'), { avg: 4.5, count: 2 });
  assert.deepEqual(s.call('handlerRating', 'ben'), { avg: 0, count: 0 });
  assert.equal(s.call('starsText', 4), '\u2605\u2605\u2605\u2605\u2606');
});

// ================= who is busy now (the main page) =================
test('status now: cats and handlers (in a session, on a break, free, on leave, resting) and the cafe itself', () => {
  const s = site();
  book(s, CAT, { time: '14:00', hours: 2, cats: ['c1'] });                                  // Fluffy and Aisha, tomorrow 14:00-16:00
  s.setNow(TOMORROW + 'T14:30:00');
  const st = (kind, id) => s.call('personStatusNow', kind, id);
  assert.deepEqual(st('cat', 'c1'), { state: 'session', text: 'In a session until 4:00 PM' });
  assert.deepEqual(st('handler', 'aisha'), { state: 'session', text: 'In a session until 4:00 PM' });
  assert.deepEqual(st('cat', 'c4'), { state: 'free', text: 'Free' });
  s.setNow(TOMORROW + 'T16:20:00');
  assert.deepEqual(st('cat', 'c1'), { state: 'break', text: 'On a break until 5:00 PM' });
  s.setNow(TOMORROW + 'T17:00:00');
  assert.equal(st('cat', 'c1').state, 'free');
  s.setNow(TOMORROW + 'T13:30:00');
  assert.deepEqual(st('handler', 'aisha'), { state: 'free', text: 'Free until 2:00 PM' });
  s.run(`const cs = loadCats(); cs[1].active = false; cs[1].note = 'Vet visit'; saveCats(cs);`);
  assert.deepEqual(st('cat', 'c2'), { state: 'resting', text: 'Resting: Vet visit' });
  leave(s, 'ben');
  assert.deepEqual(st('handler', 'ben'), { state: 'leave', text: 'On leave' });
  s.setNow(TOMORROW + 'T12:30:00');
  assert.deepEqual(s.call('cafeStatusNow'), { open: false, text: 'Lunch break until 1:00 PM' });
  s.setNow(TOMORROW + 'T09:00:00');
  assert.deepEqual(s.call('cafeStatusNow'), { open: false, text: 'Opens today at 10:00 AM' });
  s.setNow(TOMORROW + 'T15:00:00');
  assert.deepEqual(s.call('cafeStatusNow'), { open: true, text: 'Open now until 8:00 PM' });
  s.setNow(TOMORROW + 'T20:30:00');
  assert.equal(s.call('cafeStatusNow').text, 'Closed for today');
  setHoliday(s, TOMORROW, 'Test Day', 'open', '11:00', '17:00');
  s.setNow(TOMORROW + 'T15:00:00');
  assert.equal(s.call('cafeStatusNow').text, 'Open now until 5:00 PM (public holiday: Test Day)');
  setHoliday(s, '2030-03-06', 'Shut Day', 'closed'); s.setNow('2030-03-06T15:00:00');
  assert.deepEqual(s.call('cafeStatusNow'), { open: false, text: 'Closed: Shut Day' });
});

// ================= data saved by an older version =================
test('older data: waiting (Requested) bookings are confirmed with a handler; old bookings keep working', () => {
  const s = site();
  s.run(`saveReservations([
    { code: 'CC-OLD11', name: 'Cat', email: 'cat@gmail.com', phone: '1', sessionId: 'ps', session: 'Private Cat Session', roomId: 'P1', roomCode: 'P1', roomName: 'Private Room 1', date: '${TOMORROW}', time: '14:00', guests: 3, requests: '', status: 'Requested', cats: ['c4'], catNames: ['Mozza'] },
    { code: 'CC-OLD22', name: 'Dog', email: 'dog@gmail.com', phone: '2', sessionId: 'ps', session: 'Private Cat Session', roomId: 'P2', roomCode: 'P2', roomName: 'Private Room 2', date: '${TOMORROW}', time: '14:00', guests: 3, requests: '', status: 'Assigned', zone: 'P2 - Private Room 2', handler: 'Aisha' }
  ])`);
  s.call('upgradeOldBookings');
  const [old1, old2] = rows(s);
  assert.deepEqual([old1.status, old1.handlerUsername, old1.zone, old1.needsHandler], ['Assigned', 'ben', 'P1 - Private Room 1', false]);
  assert.equal(s.call('handlerUsernameOf', old2), 'aisha');
  assert.equal(s.call('amountOf', old2), 30, 'an old booking counts as 1 hour at the current rate');
  assert.equal(s.call('bookingHours', old2), 1);
  assert.equal(s.call('payReservation', 'CC-OLD22', 'PayNow', 'dog@gmail.com').reservation.payment.amount, 30);
  // nobody free: the waiting booking is flagged instead
  const t = site(); leave(t, 'aisha'); leave(t, 'ben');
  t.run(`saveReservations([{ code: 'CC-OLD33', name: 'Cat', email: 'cat@gmail.com', phone: '1', sessionId: 'ps', session: 'x', roomId: 'P1', date: '${TOMORROW}', time: '14:00', guests: 2, status: 'Requested' }])`);
  t.call('upgradeOldBookings');
  assert.deepEqual([rows(t)[0].status, rows(t)[0].needsHandler], ['Requested', true]);
});
test('older data: cats saved before handlers existed are shared out between Aisha and Ben; sessions get hour limits', () => {
  const s = site();
  s.run(`localStorage.setItem('cats', JSON.stringify([{ id: 'c1', name: 'A', active: true }, { id: 'c2', name: 'B', active: true }, { id: 'c3', name: 'C', active: true }, { id: 'c4', name: 'D', active: true }]))`);
  assert.deepEqual(s.get('loadCats()').map(c => c.handler), ['aisha', 'aisha', 'ben', 'ben']);
  s.run(`localStorage.setItem('sessions', JSON.stringify([{ id: 'ps', name: 'P', rooms: ['P1'], max: 6, active: true, price: 25 }]))`);
  const ps = s.get('loadSessions()')[0];
  assert.deepEqual([ps.minHours, ps.maxHours, ps.catChoice, ps.maxCats], [1, 3, true, 2]);
});

test('handler preview: who would look after the session, before the guest books', () => {
  const s = site();
  const prev = (cats, over = {}) => s.call('handlerPreview', over.room || 'P1', over.date || TOMORROW, over.time || '14:00', over.hours || 1, cats);
  assert.deepEqual(prev(['c1', 'c2']), { names: ['Aisha'], text: 'Your cat handler will be Aisha.' });
  assert.deepEqual(prev(['c4']).names, ['Ben']);
  assert.deepEqual(prev(['c1', 'c4']).names, ['Aisha', 'Ben']);
  assert.match(prev(['c1', 'c4']).text, /Aisha or Ben \(whoever is free; if both are free, one is picked at random\)/);
  leave(s, 'aisha');
  assert.deepEqual(prev(['c1', 'c4']).names, ['Ben'], 'only the free one is named');
  assert.deepEqual(prev(['c1']).names, ['Ben'], 'Aisha is away, so Ben steps in');
  leave(s, 'ben');
  assert.deepEqual(prev(['c1']), { names: [], text: 'No cat handler is free then, so this time cannot be booked.' });
});

test('hour by hour: in a session, on a break after it, or free (for the cat schedule)', () => {
  const s = site();
  const b = book(s, CAT, { time: '14:00', hours: 2, cats: ['c1'] }).reservation;                      // 14:00-16:00, break until 17:00
  const st = (kind, id, hour) => s.call('personHourState', kind, id, TOMORROW, hour * 60).state;
  assert.deepEqual([13, 14, 15, 16, 17, 18].map(h => st('cat', 'c1', h)), ['free', 'booked', 'booked', 'break', 'free', 'free']);
  assert.deepEqual([13, 14, 16, 17].map(h => st('handler', b.handlerUsername, h)), ['free', 'booked', 'break', 'free']);
  assert.equal(st('cat', 'c4', 14), 'free');
  assert.equal(s.call('personHourState', 'cat', 'c1', TOMORROW, 14 * 60).booking.code, b.code);
  s.call('cancelReservation', b.code, 'guest', 'cat@gmail.com');
  assert.equal(st('cat', 'c1', 14), 'free');
});

// ================= actions that used to be written inside the pages =================
test('conclude: only the handler of that session, only when confirmed, with a sensible check-in number', () => {
  const s = site();
  const b = book(s, CAT, { cats: ['c1'] }).reservation;                              // Aisha
  assert.match(s.call('concludeReservation', b.code, 'ben', 1).error, /not one of your sessions/);
  assert.match(s.call('concludeReservation', 'CC-NOPE1', 'aisha', 1).error, /not one of your sessions/);
  assert.match(s.call('concludeReservation', b.code, 'aisha', 9).error, /from 0 to 2/);
  assert.match(s.call('concludeReservation', b.code, 'aisha', 'x').error, /from 0 to 2/);
  assert.match(s.call('concludeReservation', b.code, 'aisha', -1).error, /from 0 to 2/);
  const ok = s.call('concludeReservation', b.code, 'aisha', 1);
  assert.deepEqual([ok.ok, ok.reservation.status, ok.reservation.checkedIn], [true, 'Concluded', 1]);
  assert.match(s.call('concludeReservation', b.code, 'aisha', 1).error, /Only a confirmed session/);
});
test('orders: prices come from the menu, the booking must be yours and confirmed, items must be available', () => {
  const s = site();
  const b = book(s, CAT, { cats: ['c1'] }).reservation;
  const order = (user, code, lines) => s.call('placeOrder', user, code, lines);
  assert.match(order(DOG, b.code, [{ id: 'd1', qty: 1 }]).error, /not yours/);
  assert.match(order(CAT, 'CC-NOPE1', [{ id: 'd1', qty: 1 }]).error, /not yours/);
  assert.match(order(CAT, b.code, []).error, /empty/);
  assert.match(order(CAT, b.code, [{ id: 'zzz', qty: 1 }]).error, /not on the menu/);
  assert.match(order(CAT, b.code, [{ id: 's4', qty: 1 }]).error, /Chicken Sandwich is sold out/);
  assert.match(order(CAT, b.code, [{ id: 'd1', qty: 0 }]).error, /1 to 20/);
  assert.match(order(CAT, b.code, [{ id: 'd1', qty: 99 }]).error, /1 to 20/);
  const ok = order(CAT, b.code, [{ id: 'd1', qty: 2 }, { id: 's1', qty: 1 }, { price: 0.01, id: 'd2', qty: 1 }]);
  assert.equal(ok.ok, true);
  assert.deepEqual([ok.order.code, ok.order.total, ok.order.status, ok.order.zone, ok.order.handler, ok.order.items.map(i => i.price)], ['OR-1001', 22, 'Ordered', 'P1 - Private Room 1', 'Aisha', [5.5, 6.5, 4.5]]);
  assert.equal(order(CAT, b.code, [{ id: 'd1', qty: 1 }]).order.code, 'OR-1002');
  s.call('cancelReservation', b.code, 'guest', 'cat@gmail.com');
  assert.match(order(CAT, b.code, [{ id: 'd1', qty: 1 }]).error, /confirmed and not finished/);
});
test('orders: a handler serves only the orders for their own rooms; the admin can serve any', () => {
  const s = site();
  const b = book(s, CAT, { cats: ['c1'] }).reservation;                              // Aisha
  const o = s.call('placeOrder', CAT, b.code, [{ id: 'd1', qty: 1 }]).order;
  assert.match(s.call('markOrderServed', o.code, { role: 'handler', name: 'Ben' }).error, /not for one of your rooms/);
  assert.match(s.call('markOrderServed', 'OR-9999', { role: 'admin', name: 'Admin' }).error, /not found/);
  assert.equal(s.call('markOrderServed', o.code, { role: 'handler', name: 'Aisha' }).order.status, 'Served');
  assert.match(s.call('markOrderServed', o.code, { role: 'admin', name: 'Admin' }).error, /already served/);
});
test('subscriptions: subscribe, switch plan, cancel; one active plan per guest', () => {
  const s = site();
  assert.match(s.call('subscribe', CAT, 'platinum').error, /choose a plan/);
  assert.equal(s.call('subscribe', CAT, 'parent').ok, true);
  assert.match(s.call('subscribe', CAT, 'parent').error, /already have this plan/);
  assert.equal(s.call('subscribe', CAT, 'guardian').ok, true);
  s.call('subscribe', DOG, 'friend');
  const subs = s.get('loadSubscriptions()');
  assert.deepEqual(subs.map(x => [x.email, x.tier, x.status]), [['cat@gmail.com', 'parent', 'cancelled'], ['cat@gmail.com', 'guardian', 'active'], ['dog@gmail.com', 'friend', 'active']]);
  assert.equal(s.call('cancelSubscription', 'cat@gmail.com').ok, true);
  assert.match(s.call('cancelSubscription', 'cat@gmail.com').error, /no active subscription/);
  assert.equal(s.get("loadSubscriptions().filter(x => x.status === 'active').length"), 1);
});
test('feedback: needs a valid type, name, email and message, and is trimmed', () => {
  const s = site();
  const send = over => s.call('submitFeedback', { type: 'Question', name: ' Amy ', email: ' Amy@Test.com ', message: ' Can we bring a cake? ', ...over });
  assert.match(send({ type: 'Spam' }).error, /type/);
  assert.match(send({ name: ' ' }).error, /name/);
  assert.match(send({ email: 'nope' }).error, /valid email/);
  assert.match(send({ message: '   ' }).error, /message/);
  const ok = send({});
  assert.deepEqual([ok.ok, ok.feedback.name, ok.feedback.email, ok.feedback.message, ok.feedback.status], [true, 'Amy', 'amy@test.com', 'Can we bring a cake?', 'New']);
  assert.equal(send({ message: 'x'.repeat(2000) }).feedback.message.length, 1000);
  assert.equal(s.get('loadFeedback().length'), 2);
});
test('clear practice data: reservations, orders and reviews are emptied, the setup stays', () => {
  const s = site();
  const b = book(s, CAT, { cats: ['c1'] }).reservation;
  s.call('placeOrder', CAT, b.code, [{ id: 'd1', qty: 1 }]);
  assert.equal(s.call('clearPracticeData').ok, true);
  assert.deepEqual([s.get('loadReservations().length'), s.get('loadOrders().length'), s.get('loadReviews().length'), s.get('loadCats().length')], [0, 0, 0, 6]);
});
