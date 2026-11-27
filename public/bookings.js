// ===== The booking rules =====
// Every rule about bookings lives in THIS file. The pages only call these functions and show the answer.
//
// Needs auth.js (accounts and reservations) and data.js (hours, rates, rooms, sessions, cats) loaded first.
//
// How a booking works now (first come, first served):
//   1. The guest picks a session, room, date, start time, number of hours, and cats.
//   2. If the time is free (room, cats AND a cat handler), the booking is confirmed straight away.
//      Nobody has to approve it.
//   3. The cat handler is chosen by the cats: each cat has a handler. If the cats belong to different handlers,
//      the one who is free looks after the session. If both are free, one is picked at random.
//   4. Cats and handlers get a break after every session (see "breakMinutes" in the settings).
//
// Each action returns { ok: true, ... } when it worked, or { ok: false, error: 'a message to show' }.
// In the real project these functions become routes on the server, with the same rules inside.

// ---------- money rules (change the numbers here) ----------
// A guest who cancels gets back this share of what they paid. The first line that fits is used.
const REFUND_RULES = [
  { hours: 24, percent: 100, text: '24 hours or more before the session' },
  { hours: 2,  percent: 50,  text: 'Between 2 and 24 hours before' },
  { hours: 0,  percent: 0,   text: 'Less than 2 hours before' }
];
const PAY_METHODS = ['PayNow', 'Card'];
const LEAVE_REASONS = ['Sick', 'Urgent leave', 'Annual leave', 'Other'];

// ---------- times ----------
// The moment a session starts, as a Date. date = '2030-03-04', time = '14:00'.
function slotStartDate(date, time) {
  const d = parseDate(date);
  d.setHours(Math.floor(toMin(time) / 60), toMin(time) % 60, 0, 0);
  return d;
}
function hoursUntil(date, time, now) {
  return (slotStartDate(date, time) - (now || new Date())) / 3600000;
}
// What share of the payment comes back if the guest cancels now?
function refundPercentFor(date, time, now) {
  const hours = hoursUntil(date, time, now);
  if (hours <= 0) return 0;
  return REFUND_RULES.find(rule => hours >= rule.hours).percent;
}
function round2(n) { return Math.round(n * 100) / 100; }
// An unpaid booking is cancelled by itself if it is still unpaid this many hours before it starts.
const AUTO_CANCEL_HOURS = 24;
// The last moment to pay: 24 hours before the start. A booking made less than a day ahead gets 1 hour to pay
// (but never later than the start), otherwise it would be cancelled the second it was made.
function payDeadline(date, time, now) {
  const start = slotStartDate(date, time);
  const dayBefore = new Date(start.getTime() - AUTO_CANCEL_HOURS * 3600000);
  const hourAfterBooking = new Date((now || new Date()).getTime() + 3600000);
  const later = dayBefore > hourAfterBooking ? dayBefore : hourAfterBooking;
  return later < start ? later : start;
}
function overlaps(aStart, aEnd, bStart, bEnd) { return aStart < aEnd && bStart < bEnd && aStart < bEnd && bStart < aEnd; }   // an empty time span (a session that ended before it began) blocks nothing

// How long a booking lasts (older bookings were one fixed slot: count them as 1 hour)
function bookingHours(r) { return r.hours >= 1 ? r.hours : 1; }
// When does it really end? A session the handler concluded early ends then, so the room, cats and handler are free again.
function bookingEndMin(r) {
  const planned = toMin(r.time) + bookingHours(r) * 60;
  if (r.status === 'Concluded' && r.endedAtMin !== undefined && r.endedAtMin !== null) return Math.max(toMin(r.time), Math.min(planned, r.endedAtMin));
  return planned;
}
function bookingEnd(r) { return fromMin(bookingEndMin(r)); }
function timeRange(r) { return timeLabel(r.time) + ' - ' + timeLabel(bookingEnd(r)); }

// ---------- settings ----------
function loadSettings() {
  const saved = readKey('settings', {});
  const brk = Number(saved.breakMinutes);
  return { breakMinutes: saved.breakMinutes !== undefined && saved.breakMinutes !== null && brk >= 0 ? brk : 60 };
}
function saveSettings(settings) { writeKey('settings', settings); }

// ---------- prices ----------
function sessionById(id) { return loadSessions().find(s => s.id === id); }
// What a booking costs. Older bookings that never saved an amount are worked out from the current rate.
function amountOf(r) {
  if (r.amount !== undefined) return r.amount;
  const rate = rateFor(r.sessionId, r.date);
  return round2((rate ? rate.pricePerHour : 0) * bookingHours(r));
}

// ---------- status names (the saved word "Assigned" is shown as "Confirmed") ----------
function statusText(status) {
  if (status === 'Assigned') return 'Confirmed';
  if (status === 'Requested') return 'Waiting';
  return status;
}

// ---------- rooms: is a room free for these hours? ----------
// Returns { ok, state: 'ok' | 'few' | 'full' | 'closed', left, max, reason }.
// skipHourLimits is used when drawing the schedule (one hour at a time).
function roomCheck(roomId, sessionId, date, start, hours, ignoreCode, skipHourLimits) {
  const room = loadRooms().find(r => r.id === roomId);
  const session = sessionById(sessionId);
  const closed = reason => ({ ok: false, state: 'closed', left: 0, max: 0, reason: reason });
  if (!room || !session || !room.active || !session.active || !session.rooms.includes(roomId)) return closed('That room is not used for this session.');

  const info = dayInfo(date);
  if (!info.open) return closed(info.text + '.');
  const s = toMin(start), e = s + hours * 60;
  let open = toMin(info.from), close = toMin(info.to);
  if (room.from) open = Math.max(open, toMin(room.from));
  if (room.to) close = Math.min(close, toMin(room.to));
  if (s < open || e > close) return closed('On that day this room is open ' + timeLabel(fromMin(open)) + ' to ' + timeLabel(fromMin(close)) + '. Your session must fit inside.');
  const blocked = loadHours().closedPeriods.find(p => overlaps(s, e, toMin(p.from), toMin(p.to)));
  if (blocked) return closed(blocked.name + ' (' + timeLabel(blocked.from) + ' to ' + timeLabel(blocked.to) + ') is closed for sessions.');
  if (!skipHourLimits && !(hours >= session.minHours && hours <= session.maxHours)) {
    return closed(session.name + ' lasts ' + hoursText(session.minHours) + (session.maxHours > session.minHours ? ' to ' + hoursText(session.maxHours) : '') + '.');
  }

  const max = Math.min(session.max, room.capacity);
  const others = loadReservations().filter(b => b.roomId === roomId && b.date === date && b.status !== 'Cancelled' &&
                                                b.code !== ignoreCode && overlaps(s, e, toMin(b.time), bookingEndMin(b)));
  if (others.some(b => b.sessionId !== sessionId)) return { ok: false, state: 'full', left: 0, max: max, reason: 'This room is used for another kind of session then.' };

  let left;
  if (room.type === 'Private') {
    left = others.length > 0 ? 0 : max;                           // a private room holds one booking at a time
  } else {
    // a shared room: the busiest moment during these hours decides how much space is left
    const points = [s].concat(others.map(b => toMin(b.time)).filter(t => t > s && t < e));
    const peak = Math.max.apply(null, points.map(t => others.filter(b => toMin(b.time) <= t && t < bookingEndMin(b)).reduce((sum, b) => sum + b.guests, 0)));
    left = max - peak;
  }
  let state = 'ok';
  if (left <= 0) state = 'full';
  else if (room.type === 'Open' && left <= max / 3) state = 'few';
  return { ok: left > 0, state: state, left: left, max: max, reason: left <= 0 ? 'This room is already booked then.' : '' };
}

// ---------- cats and handlers need a break after every session ----------
// Looks for a booking that blocks this person (cat or handler) for the given hours.
// The block of a booking is its session PLUS the break after it. Returns { booking, breakOnly } or null.
function personBlocked(kind, id, date, start, hours, ignoreCode, roomId) {
  const brk = loadSettings().breakMinutes;
  const s = toMin(start), e = s + hours * 60;
  const room = roomId ? loadRooms().find(r => r.id === roomId) : null;
  const mine = loadReservations().filter(b => b.status !== 'Cancelled' && b.date === date && b.code !== ignoreCode &&
    (kind === 'cat' ? (b.cats || []).includes(id) : handlerUsernameOf(b) === id));
  for (const b of mine) {
    const bs = toMin(b.time), be = bookingEndMin(b);
    const sessionOverlap = overlaps(s, e, bs, be);
    // one handler can look after several bookings in the same shared room at the same time
    if (kind === 'handler' && sessionOverlap && room && room.type === 'Open' && b.roomId === roomId) continue;
    if (overlaps(s, e + brk, bs, be + brk)) return { booking: b, breakOnly: !sessionOverlap };
  }
  return null;
}

// ---------- cats ----------
// state: 'free', 'booked' (in a session then), 'break' (resting after a session) or 'resting' (switched off by the admin)
function catState(cat, date, start, hours, ignoreCode) {
  if (!cat.active) return { state: 'resting', booking: null };
  const blocked = personBlocked('cat', cat.id, date, start, hours, ignoreCode, '');
  if (blocked) return { state: blocked.breakOnly ? 'break' : 'booked', booking: blocked.booking };
  return { state: 'free', booking: null };
}
// The cats of a booking, by name (names are saved with the booking, so they survive a cat being renamed or deleted)
function catNamesOf(r) {
  const cats = loadCats();
  return (r.cats || []).map(function (id, i) {
    const cat = cats.find(c => c.id === id);
    return cat ? cat.name : ((r.catNames || [])[i] || 'a cat');
  });
}
// Bookings that still need this cat in the future
function upcomingBookingsForCat(catId) {
  const today = todayString();
  return loadReservations().filter(r => (r.status === 'Requested' || r.status === 'Assigned') &&
                                        r.date >= today && (r.cats || []).includes(catId));
}
// Checks a list of cats for a booking. Returns '' if fine, otherwise a message.
function whyCatsNotOk(session, catIds, date, start, hours, ignoreCode) {
  if (!session.catChoice) return catIds.length ? session.name + ' does not use chosen cats.' : '';
  if (catIds.length < 1) return 'Please choose at least 1 cat.';
  if (catIds.length > session.maxCats) return 'You can choose up to ' + session.maxCats + ' cat(s) for ' + session.name + '.';
  const cats = loadCats();
  for (const id of catIds) {
    const cat = cats.find(c => c.id === id);
    if (!cat) return 'One of the chosen cats does not exist any more. Please choose again.';
    const st = catState(cat, date, start, hours, ignoreCode);
    if (st.state === 'resting') return cat.name + ' is resting and cannot be booked.';
    if (st.state === 'booked') return cat.name + ' is already booked at that time.';
    if (st.state === 'break') return cat.name + ' is having a break then (cats rest after every session).';
  }
  return '';
}

// ---------- handlers and their leave ----------
function allHandlers() { return USERS.filter(u => u.role === 'handler'); }
function handlerUsernameOf(r) {                  // older bookings only saved the handler's name
  if (r.handlerUsername) return r.handlerUsername;
  const h = allHandlers().find(x => x.name === r.handler);
  return h ? h.username : '';
}
function handlerName(username) {
  const h = allHandlers().find(x => x.username === username);
  return h ? h.name : username;
}
function loadLeaves() { return readKey('handlerLeaves', []); }
function saveLeaves(list) { writeKey('handlerLeaves', list); }
function leaveOn(username, date) {
  return loadLeaves().find(l => l.handler === username && l.start <= date && date <= l.end) || null;
}

// '' if this handler can look after a session in this room at these hours, otherwise the reason why not
function whyHandlerCannot(username, roomId, date, start, hours, ignoreCode) {
  const handler = allHandlers().find(u => u.username === username);
  if (!handler) return 'Please choose a valid handler.';
  const leave = leaveOn(username, date);
  if (leave) return handler.name + ' is on leave (' + leave.reason + ') on ' + formatDate(date) + '.';
  const blocked = personBlocked('handler', username, date, start, hours, ignoreCode, roomId);
  if (blocked) {
    return blocked.breakOnly
      ? handler.name + ' is having a break then (handlers rest after every session).'
      : handler.name + ' is already looking after another session then (' + blocked.booking.code + ').';
  }
  return '';
}
function randomPick(list) { return list[Math.floor(Math.random() * list.length)]; }

// Chooses the cat handler for a booking. The cats decide:
//   - each cat has a handler (the admin sets it)
//   - if the handlers of the chosen cats are different people, the one who is FREE looks after the session
//   - if both are free, one of them is picked at random
//   - if none of them is free (or no cats were chosen), any free handler is picked at random
// Returns { username, by } or null when nobody is free. "by" is 'cat', 'random' or 'fallback'.
function chooseHandler(roomId, date, start, hours, catIds, ignoreCode, exclude) {
  const free = allHandlers().map(h => h.username)
    .filter(u => u !== exclude && whyHandlerCannot(u, roomId, date, start, hours, ignoreCode) === '');
  if (free.length === 0) return null;
  const cats = loadCats();
  const catHandlers = [];
  catIds.forEach(function (id) {
    const cat = cats.find(c => c.id === id);
    if (cat && cat.handler && !catHandlers.includes(cat.handler)) catHandlers.push(cat.handler);
  });
  const preferred = catHandlers.filter(u => free.includes(u));
  if (preferred.length === 1) return { username: preferred[0], by: 'cat' };
  if (preferred.length > 1) return { username: randomPick(preferred), by: 'random' };
  return { username: randomPick(free), by: catHandlers.length ? 'fallback' : 'random' };
}

// What the booking page shows BEFORE the guest books: who would look after the session?
// Returns { names: [...], text }. It follows the same rules as chooseHandler (the real pick is made when booking).
function handlerPreview(roomId, date, start, hours, catIds) {
  const free = allHandlers().filter(h => whyHandlerCannot(h.username, roomId, date, start, hours, '') === '');
  if (free.length === 0) return { names: [], text: 'No cat handler is free then, so this time cannot be booked.' };
  const cats = loadCats();
  const owners = [];
  catIds.forEach(function (id) {
    const cat = cats.find(c => c.id === id);
    if (cat && cat.handler && !owners.includes(cat.handler)) owners.push(cat.handler);
  });
  const preferred = owners.filter(u => free.some(h => h.username === u));
  const names = (preferred.length ? preferred : free.map(h => h.username)).map(handlerName);
  return {
    names: names,
    text: names.length === 1
      ? 'Your cat handler will be ' + names[0] + '.'
      : 'Your cat handler will be ' + names.join(' or ') + ' (whoever is free; if both are free, one is picked at random).'
  };
}

// ---------- making a booking ----------
// f = { sessionId, roomId, date, time, hours, guests, requests, cats: [catIds] }
// First check everything. Returns { ok: false, error } or { ok: true, session, room, hours, catIds, rate, handler }.
function checkBooking(f, now) {
  now = now || new Date();
  const fail = error => ({ ok: false, error: error });
  const session = sessionById(f.sessionId);
  const room = loadRooms().find(r => r.id === f.roomId);
  if (!session || !session.active || !room || !room.active) return fail('There are no sessions available to book right now.');
  if (!f.date) return fail('Please choose a date.');
  if (!f.time) return fail('Please choose a start time.');
  const hours = Number(f.hours);
  if (!Number.isInteger(hours) || hours < session.minHours || hours > session.maxHours) {
    return fail(session.name + ' lasts ' + hoursText(session.minHours) + (session.maxHours > session.minHours ? ' to ' + hoursText(session.maxHours) : '') + '. Please choose the number of hours.');
  }
  if (!(f.guests >= 1)) return fail('Please enter the number of guests.');
  if (slotStartDate(f.date, f.time) <= now) return fail('That time has already passed. Please choose a later time or date.');

  const check = roomCheck(room.id, session.id, f.date, f.time, hours, '');
  if (check.state === 'closed') return fail(check.reason);
  if (check.left <= 0) return fail('Sorry, this room is already booked then. Please choose another room or time.');
  if (f.guests > check.left) return fail('Sorry, only ' + check.left + ' spot(s) left then. Please choose another time.');

  const catIds = session.catChoice ? (f.cats || []) : [];
  const catProblem = whyCatsNotOk(session, catIds, f.date, f.time, hours, '');
  if (catProblem) return fail(catProblem);

  const rate = rateFor(session.id, f.date);
  if (!rate) return fail('No rate has been set for ' + session.name + ' on that day, so it cannot be booked yet. Please contact us.');

  const handler = chooseHandler(room.id, f.date, f.time, hours, catIds, '', '');
  if (!handler) return fail('Sorry, none of our cat handlers is free then (they are busy, on a break or on leave). Please choose another time.');
  return { ok: true, session: session, room: room, hours: hours, catIds: catIds, rate: rate, handler: handler };
}
// Then save it. The booking is confirmed straight away, with the room and the handler.
function createReservation(user, f, now) {
  now = now || new Date();
  const check = checkBooking(f, now);
  if (!check.ok) return check;
  const session = check.session, room = check.room, catIds = check.catIds;

  const list = loadReservations();
  const cats = loadCats();
  const reservation = {
    code: newReservationCode(list),
    name: user.name, email: (user.email || '').trim().toLowerCase(), phone: user.phone || '',
    sessionId: session.id, session: session.name,
    roomId: room.id, roomCode: room.code, roomName: room.name, zone: roomLabel(room),
    date: f.date, time: f.time, hours: check.hours, endTime: fromMin(toMin(f.time) + check.hours * 60),
    guests: f.guests, requests: f.requests || '',
    cats: catIds, catNames: catIds.map(id => cats.find(c => c.id === id).name),
    handler: handlerName(check.handler.username), handlerUsername: check.handler.username, handlerBy: check.handler.by,
    rateName: check.rate.name, pricePerHour: check.rate.pricePerHour, amount: round2(check.rate.pricePerHour * check.hours),
    paid: false, payment: null,
    payBy: payDeadline(f.date, f.time, now).toISOString(),
    status: 'Assigned', createdAt: now.toISOString()
  };
  list.push(reservation);
  saveReservations(list);
  return { ok: true, reservation: reservation };
}

// ---------- the admin changes a booking (a handler is sick, a cat is unwell, ...) ----------
// changes = { roomId, handler (username), cats: [ids] }. Anything left out stays as it is. Everything is checked first.
function editReservation(code, changes) {
  const list = loadReservations();
  const r = list.find(x => x.code === code);
  if (!r) return { ok: false, error: 'Booking not found.' };
  if (r.status !== 'Requested' && r.status !== 'Assigned') return { ok: false, error: 'Only a booking that has not finished can be changed.' };
  const session = sessionById(r.sessionId);
  const hours = bookingHours(r);
  const roomId = changes.roomId || r.roomId;

  if (roomId !== r.roomId) {
    const check = roomCheck(roomId, r.sessionId, r.date, r.time, hours, r.code);
    if (check.state === 'closed') return { ok: false, error: check.reason };
    if (check.left < r.guests) return { ok: false, error: 'Not enough space in that room for ' + r.guests + ' guest(s) then.' };
  }
  if (changes.cats) {
    if (!session) return { ok: false, error: 'This booking has no session, so its cats cannot be changed.' };
    const problem = whyCatsNotOk(session, changes.cats, r.date, r.time, hours, r.code);
    if (problem) return { ok: false, error: problem };
  }
  const handlerUsername = changes.handler !== undefined ? changes.handler : handlerUsernameOf(r);
  if (changes.handler !== undefined || roomId !== r.roomId) {
    if (handlerUsername) {
      const problem = whyHandlerCannot(handlerUsername, roomId, r.date, r.time, hours, r.code);
      if (problem) return { ok: false, error: problem };
    }
  }

  const room = loadRooms().find(x => x.id === roomId);
  const cats = loadCats();
  r.roomId = room.id; r.roomCode = room.code; r.roomName = room.name; r.zone = roomLabel(room);
  if (changes.cats) {
    r.cats = changes.cats;
    r.catNames = changes.cats.map(id => cats.find(c => c.id === id).name);
    r.needsAttention = '';
    r.changeNote = '';
  }
  if (handlerUsername) {
    r.handler = handlerName(handlerUsername); r.handlerUsername = handlerUsername;
    r.needsHandler = false; r.handlerBy = 'admin';
    if (changes.handler !== undefined) r.needsAttention = '';
  }
  r.status = 'Assigned';
  saveReservations(list);
  return { ok: true, reservation: r };
}

// ---------- cancelling (the room, the cats and the handler are free for other guests straight away) ----------
// by = 'guest' (needs the guest's email) or 'admin'. A cancelled booking no longer counts anywhere.
function cancelReservation(code, by, userEmail, now) {
  now = now || new Date();
  const list = loadReservations();
  const r = list.find(x => x.code === code);
  if (!r) return { ok: false, error: 'Booking not found.' };
  if (by === 'guest' && (r.email || '').toLowerCase() !== (userEmail || '').toLowerCase()) return { ok: false, error: 'That booking is not yours.' };
  if (r.status === 'Cancelled') return { ok: false, error: 'This booking is already cancelled.' };
  if (r.status === 'Concluded') return { ok: false, error: 'This session has already finished.' };
  if (by === 'guest' && hoursUntil(r.date, r.time, now) <= 0) return { ok: false, error: 'This session has already started, so it cannot be cancelled online.' };

  const percent = by === 'admin' ? 100 : refundPercentFor(r.date, r.time, now);    // the cafe cancelling = full refund
  const price = amountOf(r);
  const fee = round2(price * (100 - percent) / 100);                               // the cancellation fee: 0, 50% or 100% of the price
  r.refundPercent = r.paid ? percent : 0;
  r.cancelFee = fee;
  if (r.paid) {
    r.refund = round2(price - fee);                                                // the fee is kept from what was paid
    r.feePaid = true;
  } else {
    r.refund = 0;
    r.feePaid = fee === 0;                                                         // not paid yet: the guest owes the fee
  }
  r.status = 'Cancelled';
  r.cancelledBy = by;
  r.cancelledAt = now.toISOString();
  saveReservations(list);
  return { ok: true, reservation: r, refund: r.refund, percent: r.refundPercent, fee: fee, feeDue: r.paid ? 0 : fee };
}

// A guest who cancelled late and had not paid owes the fee. They can pay it later (practice: no real money).
function payCancellationFee(code, method, userEmail) {
  const list = loadReservations();
  const r = list.find(x => x.code === code);
  if (!r) return { ok: false, error: 'Booking not found.' };
  if ((r.email || '').toLowerCase() !== (userEmail || '').toLowerCase()) return { ok: false, error: 'That booking is not yours.' };
  if (r.status !== 'Cancelled' || !(r.cancelFee > 0) || r.feePaid) return { ok: false, error: 'There is no cancellation fee to pay for this booking.' };
  if (!PAY_METHODS.includes(method)) return { ok: false, error: 'Please choose a payment method.' };
  r.feePaid = true;
  r.feePayment = { method: method, ref: 'FEE-' + newReservationCode([]).slice(3), amount: r.cancelFee, paidAt: new Date().toISOString() };
  saveReservations(list);
  return { ok: true, reservation: r };
}

// ---------- real online payment (HitPay PayNow) ----------
// The server starts a HitPay payment, and only HitPay's own message (the webhook) can mark a booking as paid.
// kind is 'booking' (the session price) or 'fee' (a late-cancellation fee that is still owed).
// Step 1: is this guest allowed to pay this now, and how much?
function beginOnlinePayment(code, kind, userEmail) {
  const r = loadReservations().find(x => x.code === code);
  if (!r) return { ok: false, error: 'Booking not found.' };
  if ((r.email || '').toLowerCase() !== (userEmail || '').toLowerCase()) return { ok: false, error: 'That booking is not yours.' };
  if (kind === 'fee') {
    if (r.status !== 'Cancelled' || !(r.cancelFee > 0) || r.feePaid) return { ok: false, error: 'There is no cancellation fee to pay for this booking.' };
    return { ok: true, amount: r.cancelFee, reservation: r };
  }
  if (r.status !== 'Assigned') return { ok: false, error: 'This booking cannot be paid now.' };
  if (r.paid) return { ok: false, error: 'This booking is already paid.' };
  return { ok: true, amount: amountOf(r), reservation: r };
}
// Step 2: remember which HitPay payment request belongs to the booking (so "check my payment" can ask HitPay)
function attachPayRequest(code, kind, requestId, amount) {
  const list = loadReservations();
  const r = list.find(x => x.code === code);
  if (!r) return { ok: false, error: 'Booking not found.' };
  r.payRequest = { id: String(requestId), kind: kind === 'fee' ? 'fee' : 'booking', amount: amount, createdAt: new Date().toISOString() };
  saveReservations(list);
  return { ok: true };
}
// Step 3: HitPay says it was paid. The amount must match what we asked for. A payment that arrives twice is ignored.
function completeOnlinePayment(code, kind, paymentId, amountPaid) {
  const list = loadReservations();
  const r = list.find(x => x.code === code);
  if (!r) return { ok: false, error: 'Booking not found.' };
  const ref = 'HP-' + String(paymentId || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase();
  const now = new Date().toISOString();
  if (kind === 'fee') {
    if (r.feePaid) return { ok: true, already: true, reservation: r };
    if (r.status !== 'Cancelled' || !(r.cancelFee > 0)) return { ok: false, error: 'No fee is owed on this booking.', needsRefund: true };
    if (Math.abs(Number(amountPaid) - r.cancelFee) > 0.005) return { ok: false, error: 'The amount paid does not match the fee.', needsRefund: true };
    r.feePaid = true;
    r.feePayment = { method: 'PayNow', ref: ref, amount: r.cancelFee, paidAt: now };
    saveReservations(list);
    return { ok: true, reservation: r };
  }
  if (r.paid) return { ok: true, already: true, reservation: r };
  if (r.status !== 'Assigned') return { ok: false, error: 'The booking was no longer open when the payment arrived.', needsRefund: true };
  const due = amountOf(r);
  if (Math.abs(Number(amountPaid) - due) > 0.005) return { ok: false, error: 'The amount paid does not match the price.', needsRefund: true };
  r.amount = due;
  r.paid = true;
  r.payment = { method: 'PayNow', ref: ref, amount: due, paidAt: now };
  saveReservations(list);
  return { ok: true, reservation: r };
}

// ---------- things the cafe does by itself (the server runs this every minute) ----------
//  1. An unpaid booking that is still unpaid 24 hours before it starts is cancelled (no fee: nothing was paid).
//  2. A confirmed session whose time is over is concluded without the handler. Everyone booked counts as checked in
//     unless the handler had already concluded it.
function sweepBookings(now) {
  now = now || new Date();
  const list = loadReservations();
  const cancelled = [], concluded = [];
  list.forEach(function (r) {
    if (r.status !== 'Assigned') return;
    const start = slotStartDate(r.date, r.time);
    const end = new Date(start.getTime() + bookingHours(r) * 3600000);
    if (end <= now) {
      r.status = 'Concluded';
      r.checkedIn = r.checkedIn !== undefined ? r.checkedIn : r.guests;
      r.autoConcluded = true;
      r.concludedAt = now.toISOString();
      r.concludedBy = 'auto';
      r.noShow = r.checkedIn === 0;
      concluded.push(r.code);
    } else if (!r.paid && start > now && new Date(r.payBy || payDeadline(r.date, r.time, new Date(r.createdAt || now))) <= now) {
      r.status = 'Cancelled';
      r.cancelledBy = 'system';
      r.cancelReason = 'Not paid in time';
      r.cancelledAt = now.toISOString();
      r.refund = 0; r.refundPercent = 0; r.cancelFee = 0; r.feePaid = true;
      cancelled.push(r.code);
    }
  });
  if (cancelled.length || concluded.length) saveReservations(list);
  return { ok: true, cancelled: cancelled, concluded: concluded };
}

// ---------- a handler changes the status of one of their cats ----------
function setCatStatus(catId, active, note, username) {
  const cats = loadCats();
  const cat = cats.find(c => c.id === catId);
  if (!cat) return { ok: false, error: 'Cat not found.' };
  if (cat.handler !== username) return { ok: false, error: 'That is not one of your cats.' };
  cat.active = !!active;
  cat.note = active ? '' : String(note || '').slice(0, 200);
  saveCats(cats);
  return { ok: true, cat: cat };
}

// ---------- payment (practice: no real money, no card details) ----------
function payReservation(code, method, userEmail) {
  const list = loadReservations();
  const r = list.find(x => x.code === code);
  if (!r) return { ok: false, error: 'Booking not found.' };
  if ((r.email || '').toLowerCase() !== (userEmail || '').toLowerCase()) return { ok: false, error: 'That booking is not yours.' };
  if (r.status !== 'Assigned') return { ok: false, error: 'This booking cannot be paid now.' };
  if (r.paid) return { ok: false, error: 'This booking is already paid.' };
  if (!PAY_METHODS.includes(method)) return { ok: false, error: 'Please choose a payment method.' };
  r.amount = amountOf(r);
  r.paid = true;
  r.payment = { method: method, ref: 'PAY-' + newReservationCode([]).slice(3), amount: r.amount, paidAt: new Date().toISOString() };
  saveReservations(list);
  return { ok: true, reservation: r };
}
// A short label for the payment column: kind is used for the colour
function paymentLabel(r) {
  if (r.status === 'Cancelled') {
    if (!r.paid) return r.cancelFee > 0 ? (r.feePaid ? { text: 'Fee paid', kind: 'Paid' } : { text: 'Fee due', kind: 'Unpaid' }) : { text: '-', kind: 'none' };
    if (r.refund >= amountOf(r)) return { text: 'Refunded', kind: 'Refunded' };
    return r.refund > 0 ? { text: 'Part refund', kind: 'Refunded' } : { text: 'Paid, no refund', kind: 'none' };
  }
  if (r.paid) return { text: 'Paid', kind: 'Paid' };
  if (r.status === 'Assigned' || r.status === 'Concluded') return { text: 'Unpaid', kind: 'Unpaid' };
  return { text: 'Not due yet', kind: 'none' };
}

// ---------- staff leave (sick, urgent leave, ...) ----------
// Records the leave, then moves that handler's upcoming sessions to another free handler.
// A session nobody can cover is flagged for the admin. Returns { ok, leave, moved: [{code, to}], uncovered: [code] }.
function addLeave(username, start, end, reason, note) {
  const handler = allHandlers().find(u => u.username === username);
  if (!handler) return { ok: false, error: 'Please choose a handler.' };
  if (!start || !end) return { ok: false, error: 'Please choose the first and last day of the leave.' };
  if (end < start) return { ok: false, error: 'The last day cannot be before the first day.' };
  if (!LEAVE_REASONS.includes(reason)) return { ok: false, error: 'Please choose a reason.' };

  const leaves = loadLeaves();
  const leave = { id: 'l' + Date.now() + Math.floor(Math.random() * 1000), handler: username, start: start, end: end, reason: reason, note: note || '', createdAt: new Date().toISOString() };
  leaves.push(leave);
  saveLeaves(leaves);                                          // saved first, so this handler counts as unavailable below

  const moved = [], uncovered = [];
  const codes = loadReservations().filter(r => r.status === 'Assigned' && handlerUsernameOf(r) === username &&
                                              r.date >= start && r.date <= end && hoursUntil(r.date, r.time) > 0).map(r => r.code);
  codes.forEach(function (code) {
    const list = loadReservations();
    const r = list.find(x => x.code === code);
    const pick = chooseHandler(r.roomId, r.date, r.time, bookingHours(r), r.cats || [], r.code, username);
    if (pick) {
      r.handler = handlerName(pick.username); r.handlerUsername = pick.username; r.handlerBy = 'leave'; r.needsHandler = false;
      moved.push({ code: code, to: r.handler });
    } else {
      r.handler = ''; r.handlerUsername = ''; r.needsHandler = true;
      r.needsAttention = handler.name + ' is on leave (' + reason + ') and no other handler is free. Please choose a handler.';
      uncovered.push(code);
    }
    saveReservations(list);
  });
  return { ok: true, leave: leave, moved: moved, uncovered: uncovered };
}
function removeLeave(id) { saveLeaves(loadLeaves().filter(l => l.id !== id)); }

// ---------- a cat is unwell or resting ----------
// Call this after switching a cat off. Every coming booking with that cat gets another free cat if there is one
// (preferably one with the same handler). Bookings with no free cat to swap in are flagged for the admin.
// Returns { replaced: [{code, from, to}], stuck: [code] }.
function replaceCatInUpcomingBookings(catId) {
  const result = { replaced: [], stuck: [] };
  const sick = loadCats().find(c => c.id === catId);
  if (!sick) return result;
  const codes = loadReservations().filter(r => r.status === 'Assigned' && (r.cats || []).includes(catId) && hoursUntil(r.date, r.time) > 0).map(r => r.code);
  codes.forEach(function (code) {
    const list = loadReservations();                           // reload each time so a cat just used is no longer free
    const r = list.find(x => x.code === code);
    const cats = loadCats();
    const options = cats.filter(c => c.id !== catId && c.active && !(r.cats || []).includes(c.id) &&
                                     catState(c, r.date, r.time, bookingHours(r), r.code).state === 'free');
    options.sort((a, b) => (b.handler === sick.handler ? 1 : 0) - (a.handler === sick.handler ? 1 : 0));
    if (options.length > 0) {
      const replacement = options[0];
      r.cats = r.cats.map(id => id === catId ? replacement.id : id);
      r.catNames = r.cats.map(id => cats.find(c => c.id === id).name);
      r.changeNote = sick.name + ' is unwell, so ' + replacement.name + ' will be with you instead.';
      result.replaced.push({ code: code, from: sick.name, to: replacement.name });
    } else {
      r.needsAttention = sick.name + ' is unwell and no other cat is free then. Please contact the guest, or cancel with a full refund.';
      result.stuck.push(code);
    }
    saveReservations(list);
  });
  return result;
}

// ---------- reviews of cats and staff after a session ----------
function reviewOf(code) { return loadReviews().find(v => v.code === code) || null; }
function canReview(r) { return r.status === 'Concluded' && !reviewOf(r.code); }
// data = { handlerStars, handlerComment, cats: [{ id, stars, comment }] }
function addReview(code, email, data) {
  const r = loadReservations().find(x => x.code === code);
  const fail = error => ({ ok: false, error: error });
  if (!r) return fail('Booking not found.');
  if ((r.email || '').toLowerCase() !== (email || '').toLowerCase()) return fail('That booking is not yours.');
  if (r.status !== 'Concluded') return fail('You can review a session after it has finished.');
  if (reviewOf(code)) return fail('You have already reviewed this session. Thank you!');
  const stars = n => Number.isInteger(n) && n >= 1 && n <= 5;
  const text = t => String(t || '').trim().slice(0, 300);

  const handlerUsername = handlerUsernameOf(r);
  if (handlerUsername && !stars(data.handlerStars)) return fail('Please rate your cat handler from 1 to 5 stars.');
  const cats = loadCats();
  const catReviews = (r.cats || []).map(function (id, i) {
    const given = (data.cats || []).find(c => c.id === id) || {};
    const cat = cats.find(c => c.id === id);
    return { id: id, name: cat ? cat.name : ((r.catNames || [])[i] || 'a cat'), stars: given.stars, comment: text(given.comment) };
  });
  if (catReviews.some(c => !stars(c.stars))) return fail('Please rate each cat from 1 to 5 stars.');

  const list = loadReviews();
  const review = {
    id: 'v' + Date.now() + Math.floor(Math.random() * 1000), code: code, email: r.email, name: String(r.name || '').split(' ')[0],
    session: r.session, date: r.date,
    handler: handlerUsername, handlerName: handlerUsername ? handlerName(handlerUsername) : '',
    handlerStars: handlerUsername ? data.handlerStars : 0, handlerComment: text(data.handlerComment),
    cats: catReviews, createdAt: new Date().toISOString()
  };
  list.push(review);
  saveReviews(list);
  return { ok: true, review: review };
}
// { avg, count } (avg is 0 when there are no reviews yet)
function averageOf(values) {
  if (values.length === 0) return { avg: 0, count: 0 };
  return { avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10, count: values.length };
}
function catRating(catId) {
  const values = [];
  loadReviews().forEach(v => v.cats.forEach(c => { if (c.id === catId) values.push(c.stars); }));
  return averageOf(values);
}
function handlerRating(username) {
  return averageOf(loadReviews().filter(v => v.handler === username && v.handlerStars > 0).map(v => v.handlerStars));
}
function starsText(n) {                                       // 4 -> '★★★★☆'
  const full = Math.round(n);
  return '\u2605'.repeat(full) + '\u2606'.repeat(5 - full);
}

// ---------- who is busy right now (for the main page) ----------
// kind = 'cat' or 'handler'. Returns { state: 'session' | 'break' | 'free' | 'leave' | 'resting', text }.
function personStatusNow(kind, id, now) {
  now = now || new Date();
  const date = dateString(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const brk = loadSettings().breakMinutes;
  if (kind === 'cat') {
    const cat = loadCats().find(c => c.id === id);
    if (!cat || !cat.active) return { state: 'resting', text: cat && cat.note ? 'Resting: ' + cat.note : 'Resting today' };
  } else {
    const leave = leaveOn(id, date);
    if (leave) return { state: 'leave', text: 'On leave' };                // the reason is private (admin only)
  }
  const mine = loadReservations().filter(b => b.status !== 'Cancelled' && b.date === date &&
    (kind === 'cat' ? (b.cats || []).includes(id) : handlerUsernameOf(b) === id));
  const inSession = mine.find(b => toMin(b.time) <= nowMin && nowMin < bookingEndMin(b));
  if (inSession) return { state: 'session', text: 'In a session until ' + timeLabel(bookingEnd(inSession)) };
  const resting = mine.find(b => bookingEndMin(b) <= nowMin && nowMin < bookingEndMin(b) + brk);
  if (resting) return { state: 'break', text: 'On a break until ' + timeLabel(fromMin(bookingEndMin(resting) + brk)) };
  const next = mine.filter(b => toMin(b.time) > nowMin).sort((a, b) => toMin(a.time) - toMin(b.time))[0];
  return { state: 'free', text: next ? 'Available until ' + timeLabel(next.time) : 'Available' };
}
// What is a staff member doing right now? One word for the Staff status screen:
//  'session' (working with guests), 'break' (resting after a session), 'lunch', 'free' (on shift, available), 'leave', 'off' (off duty, at home).
function staffStatusNow(username, now) {
  now = now || new Date();
  const date = dateString(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const leave = leaveOn(username, date);
  if (leave) return { state: 'leave', label: 'On leave', detail: 'Back after ' + formatDate(leave.end) };
  const info = dayInfo(date);
  if (!info.open) return { state: 'off', label: 'Off duty', detail: info.text };
  if (nowMin < toMin(info.from)) return { state: 'off', label: 'Off duty', detail: 'Shift starts at ' + timeLabel(info.from) };
  if (nowMin >= toMin(info.to)) return { state: 'off', label: 'Off duty', detail: 'Shift ended at ' + timeLabel(info.to) };
  const base = personStatusNow('handler', username, now);
  if (base.state === 'session') return { state: 'session', label: 'Working', detail: base.text };
  if (base.state === 'break') return { state: 'break', label: 'On a break', detail: base.text };
  const lunch = (loadHours().closedPeriods || []).find(p => toMin(p.from) <= nowMin && nowMin < toMin(p.to));
  if (lunch) return { state: 'lunch', label: lunch.name, detail: 'Back at ' + timeLabel(lunch.to) };
  return { state: 'free', label: 'On shift', detail: base.text };
}
// What is this person doing during one hour of a day? (used by the cat schedule)
// kind = 'cat' or 'handler', hourMin = the hour in minutes (14:00 = 840). Returns { state: 'booked' | 'break' | 'free', booking }.
function personHourState(kind, id, date, hourMin) {
  const brk = loadSettings().breakMinutes;
  const mine = loadReservations().filter(b => b.status !== 'Cancelled' && b.date === date &&
    (kind === 'cat' ? (b.cats || []).includes(id) : handlerUsernameOf(b) === id));
  const inSession = mine.find(b => overlaps(hourMin, hourMin + 60, toMin(b.time), bookingEndMin(b)));
  if (inSession) return { state: 'booked', booking: inSession };
  const resting = mine.find(b => overlaps(hourMin, hourMin + 60, bookingEndMin(b), bookingEndMin(b) + brk));
  if (resting) return { state: 'break', booking: resting };
  return { state: 'free', booking: null };
}

// Is the cafe open right now? { open, text }
function cafeStatusNow(now) {
  now = now || new Date();
  const date = dateString(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const info = dayInfo(date);
  if (!info.open) return { open: false, text: info.text };
  const holiday = info.holiday ? ' (public holiday: ' + info.holiday.name + ')' : '';
  if (nowMin < toMin(info.from)) return { open: false, text: 'Opens today at ' + timeLabel(info.from) + holiday };
  if (nowMin >= toMin(info.to)) return { open: false, text: 'Closed for today' + holiday };
  const lunch = loadHours().closedPeriods.find(p => toMin(p.from) <= nowMin && nowMin < toMin(p.to));
  if (lunch) return { open: false, text: lunch.name + ' until ' + timeLabel(lunch.to) };
  return { open: true, text: 'Open now until ' + timeLabel(info.to) + holiday };
}

// ---------- bookings saved by an older version ----------
// A booking that was only "Requested" (waiting for the admin) is confirmed now, like any new booking.
function upgradeOldBookings() {
  const codes = loadReservations().filter(r => r.status === 'Requested').map(r => r.code);
  codes.forEach(function (code) {
    const list = loadReservations();
    const r = list.find(x => x.code === code);
    const pick = chooseHandler(r.roomId, r.date, r.time, bookingHours(r), r.cats || [], r.code, '');
    if (!pick) {
      if (!r.needsHandler) { r.needsHandler = true; saveReservations(list); }
      return;
    }
    const room = loadRooms().find(x => x.id === r.roomId);
    if (room) { r.roomCode = room.code; r.roomName = room.name; r.zone = roomLabel(room); }
    r.handler = handlerName(pick.username); r.handlerUsername = pick.username; r.handlerBy = pick.by;
    r.needsHandler = false;
    r.status = 'Assigned';
    saveReservations(list);
  });
}

// ---------- finishing a session (the cat handler) ----------
function concludeReservation(code, username, checkedIn) {
  const list = loadReservations();
  const r = list.find(x => x.code === code);
  if (!r || handlerUsernameOf(r) !== username) return { ok: false, error: 'That is not one of your sessions.' };
  if (r.status !== 'Assigned') return { ok: false, error: 'Only a confirmed session can be concluded.' };
  if (!Number.isInteger(checkedIn) || checkedIn < 0 || checkedIn > r.guests) {
    return { ok: false, error: 'Guests checked in must be a number from 0 to ' + r.guests + '.' };
  }
  const now = new Date();
  const start = slotStartDate(r.date, r.time);
  if (now < start) return { ok: false, error: 'This session has not started yet. You can conclude it once it starts (for example if the guests did not come).' };
  const plannedEnd = new Date(start.getTime() + bookingHours(r) * 3600000);
  r.checkedIn = checkedIn;
  r.noShow = checkedIn === 0;                                   // nobody came
  r.status = 'Concluded';
  r.concludedAt = now.toISOString();
  r.concludedBy = 'staff';
  if (now < plannedEnd) {                                       // finished early: the room and the cats are free for the rest of the time
    r.endedEarly = true;
    r.endedAtMin = now.getHours() * 60 + now.getMinutes();
  }
  saveReservations(list);
  return { ok: true, reservation: r };
}

// ---------- food and drink orders ----------
// lines = [{ id: 'd1', qty: 2 }]. The prices come from the menu, never from the guest.
function placeOrder(user, reservationCode, lines) {
  const r = loadReservations().find(x => x.code === reservationCode);
  if (!r || (r.email || '').toLowerCase() !== (user.email || '').toLowerCase()) return { ok: false, error: 'That booking is not yours.' };
  if (r.status !== 'Assigned') return { ok: false, error: 'You can order for a booking that is confirmed and not finished.' };
  const menu = loadMenu();
  const items = [];
  let total = 0;
  for (const line of lines || []) {
    const item = menu.find(i => i.id === line.id);
    if (!item) return { ok: false, error: 'One of the items is not on the menu any more.' };
    if (!item.available) return { ok: false, error: item.name + ' is sold out.' };
    if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > 20) return { ok: false, error: 'Please choose 1 to 20 of each item.' };
    items.push({ name: item.name, qty: line.qty, price: item.price });
    total += item.price * line.qty;
  }
  if (items.length === 0) return { ok: false, error: 'Your order is empty.' };
  const orders = loadOrders();
  let n = 1001 + orders.length;
  while (orders.some(o => o.code === 'OR-' + n)) n++;
  const order = { code: 'OR-' + n, reservation: r.code, zone: r.zone, handler: r.handler, email: r.email, items: items,
                  total: round2(total), status: 'Ordered', placed: new Date().toISOString() };
  orders.push(order);
  saveOrders(orders);
  return { ok: true, order: order };
}
// by = { role: 'handler' | 'admin', name }. A handler can only serve orders for their own rooms.
function markOrderServed(orderCode, by) {
  const orders = loadOrders();
  const o = orders.find(x => x.code === orderCode);
  if (!o) return { ok: false, error: 'Order not found.' };
  if (by.role === 'handler' && o.handler !== by.name) return { ok: false, error: 'That order is not for one of your rooms.' };
  if (o.status !== 'Ordered') return { ok: false, error: 'This order is already served.' };
  o.status = 'Served';
  saveOrders(orders);
  return { ok: true, order: o };
}

// ---------- "Support us" subscriptions (practice: no real payment) ----------
function subscribe(user, tierId) {
  const tier = SUPPORT_TIERS.find(t => t.id === tierId);
  if (!tier) return { ok: false, error: 'Please choose a plan.' };
  const list = loadSubscriptions();
  const email = (user.email || '').toLowerCase();
  const old = list.find(s => s.email === email && s.status === 'active');
  if (old && old.tier === tierId) return { ok: false, error: 'You already have this plan.' };
  if (old) { old.status = 'cancelled'; old.cancelledAt = new Date().toISOString(); }
  const sub = { id: 'sub' + Date.now() + Math.floor(Math.random() * 1000), email: email, name: user.name, tier: tier.id, price: tier.price,
                startedAt: new Date().toISOString(), status: 'active' };
  list.push(sub);
  saveSubscriptions(list);
  return { ok: true, subscription: sub };
}
function cancelSubscription(email) {
  const list = loadSubscriptions();
  const sub = list.find(s => s.email === (email || '').toLowerCase() && s.status === 'active');
  if (!sub) return { ok: false, error: 'You have no active subscription.' };
  sub.status = 'cancelled';
  sub.cancelledAt = new Date().toISOString();
  saveSubscriptions(list);
  return { ok: true };
}

// ---------- feedback and questions from guests ----------
const FEEDBACK_TYPES = ['Feedback', 'Question', 'Complaint', 'Compliment'];
function submitFeedback(f) {
  const name = String(f.name || '').trim(), email = String(f.email || '').trim().toLowerCase(), message = String(f.message || '').trim();
  if (!FEEDBACK_TYPES.includes(f.type)) return { ok: false, error: 'Please choose the type of message.' };
  if (!name) return { ok: false, error: 'Please enter your name.' };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, error: 'Please enter a valid email.' };
  if (!message) return { ok: false, error: 'Please write your message.' };
  const list = loadFeedback();
  const entry = { id: 'fb' + Date.now() + Math.floor(Math.random() * 1000), type: f.type, name: name.slice(0, 80), email: email,
                  message: message.slice(0, 1000), sent: new Date().toISOString(), status: 'New' };
  list.push(entry);
  saveFeedback(list);
  return { ok: true, feedback: entry };
}

// ---------- the admin clears the practice data ----------
function clearPracticeData() {
  writeKey('reservations', []);
  writeKey('orders', []);
  writeKey('reviews', []);
  return { ok: true };
}

// ---------- small helpers for the pages ----------
function pillElement(text, className) {
  const span = document.createElement('span');
  span.className = 'status-pill ' + className;
  span.textContent = text;
  return span;
}
function statusPill(status) { return pillElement(statusText(status), 'status-' + status); }
function paymentPill(r) {
  const p = paymentLabel(r);
  return pillElement(p.text, 'pay-' + p.kind);
}
// "Aisha (aisha@example.com)" for showing a handler to a guest
function handlerContact(name) {
  const h = USERS.find(u => u.role === 'handler' && u.name === name);
  return h ? name + ' (' + h.contact + ')' : name;
}
// A small row of cat photos and names, for the admin and handler pages
function catChips(r) {
  const wrap = document.createElement('span');
  const cats = loadCats();
  const ids = r.cats || [];
  if (ids.length === 0) { wrap.textContent = '-'; return wrap; }
  ids.forEach(function (id, i) {
    const cat = cats.find(c => c.id === id);
    const chip = document.createElement('span');
    chip.className = 'cat-chip';
    if (cat && cat.photo) {
      const img = document.createElement('img');
      img.className = 'thumb';
      img.src = cat.photo;
      img.alt = '';
      chip.appendChild(img);
    }
    const name = document.createElement('span');
    name.textContent = cat ? cat.name : ((r.catNames || [])[i] || 'a cat');
    chip.appendChild(name);
    wrap.appendChild(chip);
  });
  return wrap;
}
