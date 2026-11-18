// Shared practice data kept in the browser: hours, holidays, rates, rooms, sessions, cats, menu, events, FAQ and more.
// In the real project all of this lives in the database.

// ---------- dates ----------
function dateString(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function todayString() { return dateString(new Date()); }
function daysFromToday(n) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return dateString(d);
}
function parseDate(s) {
  const p = s.split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}
function formatDate(s) {
  return parseDate(s).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
}
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ---------- clock times ('14:00' <-> minutes since midnight) ----------
function toMin(t) { const p = t.split(':'); return Number(p[0]) * 60 + Number(p[1] || 0); }
function fromMin(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
function timeLabel(t) {                                   // '14:00' -> '2:00 PM'
  const m = toMin(t), h = Math.floor(m / 60), mm = m % 60;
  return (h % 12 === 0 ? 12 : h % 12) + ':' + String(mm).padStart(2, '0') + ' ' + (h >= 12 ? 'PM' : 'AM');
}
function slotLabel(t) { return timeLabel(t); }            // the name older pages use
function hoursText(n) { return n + (n === 1 ? ' hour' : ' hours'); }

// ---------- saving and loading lists ----------
// Everything is read with readKey(key, fallback) and written with writeKey(key, value). They are defined elsewhere:
//   - in the browser (storage.js): they work on a copy of the server's data
//   - on the server (lib/rules.js): they work on the data loaded from MongoDB
// So the rules in this file and in bookings.js are the SAME code in both places.
function loadSeeded(key, makeDefaults) {
  const saved = readKey(key, undefined);
  if (saved !== undefined) return saved;
  const defaults = makeDefaults();
  writeKey(key, defaults);
  return JSON.parse(JSON.stringify(defaults));
}
function saveList(key, list) {
  writeKey(key, list);
}

// ---------- opening hours, closed periods (lunch) and public holidays ----------
// weekly[0] is Sunday ... weekly[6] is Saturday. closedPeriods are closed EVERY day (for example lunch).
function loadHours() {
  return loadSeeded('openHours', () => ({
    weekly: [0, 1, 2, 3, 4, 5, 6].map(() => ({ open: true, from: '10:00', to: '20:00' })),
    closedPeriods: [{ id: 'lunch', name: 'Lunch break', from: '12:00', to: '13:00' }]
  }));
}
function saveHours(hours) { saveList('openHours', hours); }

// Singapore public holidays from the Ministry of Manpower list (checked June 2026). The admin can change every line.
// mode 'open' = open with the hours shown, 'closed' = closed all day.
function loadHolidays() {
  const h = (id, date, name) => ({ id: id, date: date, name: name, mode: 'open', from: '10:00', to: '18:00' });
  return loadSeeded('holidays', () => [
    h('h1', '2026-12-25', 'Christmas Day'),
    h('h2', '2027-01-01', "New Year's Day"),
    h('h3', '2027-02-06', 'Chinese New Year'),
    h('h4', '2027-02-07', 'Chinese New Year'),
    h('h5', '2027-03-10', 'Hari Raya Puasa'),
    h('h6', '2027-03-26', 'Good Friday'),
    h('h7', '2027-05-01', 'Labour Day'),
    h('h8', '2027-05-17', 'Hari Raya Haji'),
    h('h9', '2027-05-20', 'Vesak Day'),
    h('h10', '2027-08-09', 'National Day'),
    h('h11', '2027-10-28', 'Deepavali'),
    h('h12', '2027-12-25', 'Christmas Day')
  ]);
}
function saveHolidays(list) { saveList('holidays', list); }
function holidayOn(date) { return loadHolidays().find(h => h.date === date) || null; }
// 'holiday', 'weekend' or 'weekday' (used to choose the rate)
function dayType(date) {
  if (holidayOn(date)) return 'holiday';
  const d = parseDate(date).getDay();
  return d === 0 || d === 6 ? 'weekend' : 'weekday';
}
// Is the cafe open on this date, and from when to when?  { open, from, to, holiday, text }
function dayInfo(date) {
  const holiday = holidayOn(date);
  if (holiday) {
    if (holiday.mode === 'closed') return { open: false, from: '', to: '', holiday: holiday, text: 'Closed: ' + holiday.name };
    return { open: true, from: holiday.from, to: holiday.to, holiday: holiday, text: 'Public holiday (' + holiday.name + '): open ' + timeLabel(holiday.from) + ' to ' + timeLabel(holiday.to) };
  }
  const day = loadHours().weekly[parseDate(date).getDay()];
  if (!day || !day.open) return { open: false, from: '', to: '', holiday: null, text: 'Closed on ' + DAY_NAMES[parseDate(date).getDay()] + 's' };
  return { open: true, from: day.from, to: day.to, holiday: null, text: 'Open ' + timeLabel(day.from) + ' to ' + timeLabel(day.to) };
}

// ---------- rates (price PER HOUR, the same however many guests) ----------
// dayType: 'all', 'weekday', 'weekend' or 'holiday'.  sessionId '' means every session.
function loadRates() {
  return loadSeeded('rates', () => [
    { id: 'r1', name: 'Private Cat Session - standard', sessionId: 'ps', dayType: 'all',     pricePerHour: 30, active: true },
    { id: 'r2', name: 'Private Cat Session - weekend',  sessionId: 'ps', dayType: 'weekend', pricePerHour: 36, active: true },
    { id: 'r3', name: 'Private Cat Session - public holiday', sessionId: 'ps', dayType: 'holiday', pricePerHour: 42, active: true },
    { id: 'r4', name: 'Cat Yoga Session - standard',    sessionId: 'ys', dayType: 'all',     pricePerHour: 40, active: true },
    { id: 'r5', name: 'Cat Yoga Session - weekend',     sessionId: 'ys', dayType: 'weekend', pricePerHour: 48, active: true },
    { id: 'r6', name: 'Cat Yoga Session - public holiday', sessionId: 'ys', dayType: 'holiday', pricePerHour: 56, active: true }
  ]);
}
function saveRates(list) { saveList('rates', list); }
// The rate that applies to a session on a date: a rate for that kind of day beats "all days", and a rate for
// the session beats a rate for every session. Returns null when nothing is set.
function rateFor(sessionId, date) {
  const type = dayType(date);
  const rates = loadRates().filter(r => r.active && (r.sessionId === sessionId || r.sessionId === ''));
  const pick = (kind, forSession) => rates.find(r => r.dayType === kind && (forSession ? r.sessionId === sessionId : r.sessionId === ''));
  return pick(type, true) || pick('all', true) || pick(type, false) || pick('all', false) || null;
}
const DAY_TYPE_LABELS = { all: 'Every day', weekday: 'Weekdays', weekend: 'Weekends', holiday: 'Public holidays' };

// ---------- rooms ----------
// type 'Private': one booking at a time (the whole room).  type 'Open': guests share the space.
// "from" and "to" (optional) are the room's own opening hours inside the cafe hours.
function loadRooms() {
  return loadSeeded('rooms', () => [
    { id: 'P1', code: 'P1', name: 'Private Room 1', type: 'Private', capacity: 6,  from: '', to: '', active: true },
    { id: 'P2', code: 'P2', name: 'Private Room 2', type: 'Private', capacity: 6,  from: '', to: '', active: true },
    { id: 'P3', code: 'P3', name: 'Private Room 3', type: 'Private', capacity: 6,  from: '', to: '', active: true },
    { id: 'L1', code: 'L1', name: 'Open Lounge',    type: 'Open',    capacity: 20, from: '', to: '', active: true }
  ]);
}
function saveRooms(list) { saveList('rooms', list); }
function roomLabel(room) { return room.code + ' - ' + room.name; }

// ---------- sessions (session types) ----------
// "rooms" says which rooms the session can be held in. "max" is the most people per booking.
// Guests choose how many hours (minHours to maxHours). "catChoice" = guests choose cats (up to "maxCats").
function loadSessions() {
  const sessions = loadSeeded('sessions', () => [
    { id: 'ps', name: 'Private Cat Session', rooms: ['P1', 'P2', 'P3'], max: 6,  active: true, catChoice: true,  maxCats: 2, minHours: 1, maxHours: 3 },
    { id: 'ys', name: 'Cat Yoga Session',    rooms: ['L1'],             max: 20, active: true, catChoice: false, maxCats: 0, minHours: 1, maxHours: 2 }
  ]);
  // sessions saved by an older version get sensible values for the newer settings
  sessions.forEach(function (s) {
    if (s.catChoice === undefined) s.catChoice = s.id !== 'ys';
    if (s.maxCats === undefined) s.maxCats = s.catChoice ? 2 : 0;
    if (!(s.minHours >= 1)) s.minHours = 1;
    if (!(s.maxHours >= s.minHours)) s.maxHours = s.id === 'ys' ? 2 : 3;
  });
  return sessions;
}
function saveSessions(list) { saveList('sessions', list); }

// ---------- cats ----------
// "active" = available for sessions (untick when a cat is resting or unwell). "note" says why.
// "handler" = the staff member who looks after this cat (the admin can change it).
function loadCats() {
  const cats = loadSeeded('cats', () => [
    { id: 'c1', name: 'Fluffy',   relation: "Moody's Brother",   photo: 'images/fluffy.png',   active: true, note: '', handler: 'aisha',
      notes: ['Loves to eat, pets', 'May scratch if too overstimulated.'] },
    { id: 'c2', name: 'Moody',    relation: "Fluffy's Brother",  photo: 'images/moody.png',    active: true, note: '', handler: 'aisha',
      notes: ['Loves to clean (his brother)', 'Will lick the spot where you last petted.'] },
    { id: 'c3', name: 'Madinah',  relation: "Mozza's Sister",    photo: 'images/madinah.png',  active: true, note: '', handler: 'aisha',
      notes: ['Shy Girl, ADHD', 'Surprisingly can play fetch... We think...'] },
    { id: 'c4', name: 'Mozza',    relation: "Madinah's Brother", photo: 'images/mozza.png',    active: true, note: '', handler: 'ben',
      notes: ['Lazy Fluff', 'Loves to hide unless there is food.'] },
    { id: 'c5', name: 'Kitty',    relation: 'little kitten',     photo: 'images/kitty.png',    active: true, note: '', handler: 'ben',
      notes: ['tiny cat', 'Loves to play'] },
    { id: 'c6', name: 'Whiskers', relation: 'big kitten',        photo: 'images/whiskers.png', active: true, note: '', handler: 'ben',
      notes: ['big cat', 'Loves to sleep'] }
  ]);
  // cats saved by an older version had no handler: share them out between Aisha and Ben
  cats.forEach(function (c, i) {
    if (c.handler === undefined) c.handler = i < Math.ceil(cats.length / 2) ? 'aisha' : 'ben';
    if (c.note === undefined) c.note = '';
  });
  return cats;
}
function saveCats(list) { saveList('cats', list); }

// ---------- events ----------
function loadEvents() {
  return loadSeeded('events', () => [
    { id: 'e1', title: 'Cat Yoga Weekend', start: daysFromToday(-1), end: daysFromToday(1),
      text: 'A relaxed yoga class with the cats around.', guest: 'Special guest: visiting yoga instructor', offer: '10% off for groups of 4 or more' },
    { id: 'e2', title: 'Kitten Cuddle Night', start: daysFromToday(5), end: daysFromToday(5),
      text: 'An evening of cuddles with the youngest cats.', guest: 'Special guest: a pet photographer taking free photos', offer: 'Free drink with every booking' },
    { id: 'e3', title: 'Cat Adoption Day', start: daysFromToday(12), end: daysFromToday(13),
      text: 'Meet cats looking for a home and learn how to care for them.', guest: 'Special guests: volunteers from a local animal shelter', offer: 'Free entry for first-time visitors' }
  ]);
}
function saveEvents(list) { saveList('events', list); }

// ---------- menu (with descriptions and allergens) ----------
// "allergens" is the list of allergens in the item. If an item has no "allergens" at all, nobody has filled it in yet.
const ALLERGENS = ['Dairy', 'Eggs', 'Gluten', 'Peanuts', 'Tree nuts', 'Soy', 'Fish', 'Shellfish', 'Sesame'];
function loadMenu() {
  return loadSeeded('menuItems', () => [
    { id: 'd1', name: 'Latte',                 category: 'Drinks', price: 5.50, available: true,  photo: '', description: 'Espresso with steamed milk.',                allergens: ['Dairy'] },
    { id: 'd2', name: 'Iced Lemon Tea',        category: 'Drinks', price: 4.50, available: true,  photo: '', description: 'Black tea with fresh lemon, served cold.',   allergens: [] },
    { id: 'd3', name: 'Hot Chocolate',         category: 'Drinks', price: 5.00, available: true,  photo: '', description: 'Cocoa with steamed milk.',                   allergens: ['Dairy'] },
    { id: 'd4', name: 'Matcha Latte',          category: 'Drinks', price: 6.00, available: true,  photo: '', description: 'Japanese green tea with steamed milk.',      allergens: ['Dairy'] },
    { id: 's1', name: 'Cheese Fries',          category: 'Snacks', price: 6.50, available: true,  photo: '', description: 'Crispy fries with melted cheese sauce.',     allergens: ['Dairy', 'Gluten'] },
    { id: 's2', name: 'Butter Cookies',        category: 'Snacks', price: 4.00, available: true,  photo: '', description: 'Buttery cookies baked in-house.',            allergens: ['Gluten', 'Dairy', 'Eggs'] },
    { id: 's3', name: 'Waffle with Ice Cream', category: 'Snacks', price: 7.50, available: true,  photo: '', description: 'Warm waffle with vanilla ice cream.',        allergens: ['Gluten', 'Dairy', 'Eggs'] },
    { id: 's4', name: 'Chicken Sandwich',      category: 'Snacks', price: 6.00, available: false, photo: '', description: 'Grilled chicken in a toasted bun.',          allergens: ['Gluten', 'Eggs'] }
  ]);
}
function saveMenu(list) { saveList('menuItems', list); }

// ---------- reservations ----------
function loadReservations() { return readKey('reservations', []); }
function saveReservations(list) { writeKey('reservations', list); }

// ---------- orders ----------
function loadOrders() { return readKey('orders', []); }
function saveOrders(list) { saveList('orders', list); }

function money(n) { return 'S$' + Number(n).toFixed(2); }
function orderItemsText(order) {
  return order.items.map(i => i.qty + ' x ' + i.name).join(', ');
}

// ---------- FAQ, feedback, supporters, reviews ----------
function loadFaq() {
  return loadSeeded('faq', () => [
    { id: 'f1', q: 'How does booking work?', a: 'Choose a session, a room, a date, your start time and how many hours you want, then pick your cats. The first guest to book a time gets it, and your booking is confirmed straight away with a cat handler.' },
    { id: 'f2', q: 'How much does a session cost?', a: 'We charge per hour, not per guest. The price per hour depends on the session and on the day (weekday, weekend or public holiday). See the Rates page.' },
    { id: 'f3', q: 'Can I cancel?', a: 'Yes, any time before your session starts. If you have paid, the refund depends on how early you cancel (see Rates). Your room and cats are then free for other guests.' },
    { id: 'f4', q: 'Why is there no session at lunchtime?', a: 'Our cats and staff have a lunch break from 12:00 PM to 1:00 PM. They also get a one-hour break after every session.' },
    { id: 'f5', q: 'Can I choose which cats I meet?', a: 'Yes, for sessions where cat choice is on (for example the Private Cat Session). Cats that are booked or resting at your time cannot be chosen.' },
    { id: 'f6', q: 'I have a food allergy. What should I do?', a: 'Every menu item lists its allergens. Tick your allergy on the Menu page to see which items to avoid, and tell our staff when you arrive. Our kitchen handles common allergens, so we cannot promise any item is completely free of traces.' },
    { id: 'f7', q: 'Are children welcome?', a: 'Yes, with an adult at all times. Please read our Rules so that everyone, and the cats, stay happy and safe.' },
    { id: 'f8', q: 'Are you open on public holidays?', a: 'Our Opening hours page lists every public holiday and whether we are open, with the hours.' }
  ]);
}
function saveFaq(list) { saveList('faq', list); }
function loadFeedback() { return readKey('feedbackMessages', []); }
function saveFeedback(list) { saveList('feedbackMessages', list); }

// "Support us" memberships (practice only: no real payment)
const SUPPORT_TIERS = [
  { id: 'friend',   name: 'Cat Friend',   price: 5,  text: 'Helps pay for cat food.' },
  { id: 'parent',   name: 'Cat Parent',   price: 15, text: 'Helps pay for vet visits, plus your name on our supporters wall.' },
  { id: 'guardian', name: 'Cat Guardian', price: 30, text: 'Helps care for cats looking for a home, plus a free drink each month.' }
];
function loadSubscriptions() { return readKey('subscriptions', []); }
function saveSubscriptions(list) { saveList('subscriptions', list); }

function loadReviews() { return readKey('reviews', []); }
function saveReviews(list) { saveList('reviews', list); }

// ---------- photos ----------
// Shrinks a chosen photo so it can be saved in the browser. Calls done(dataUrl) or fail(message).
// In the real project the photo is uploaded to the server instead.
function resizeImage(file, maxSize, done, fail) {
  if (!file || !file.type || file.type.indexOf('image/') !== 0) { fail('Please choose an image file.'); return; }
  const reader = new FileReader();
  reader.onerror = function () { fail('Could not read that file.'); };
  reader.onload = function () {
    const img = new Image();
    img.onerror = function () { fail('That image could not be opened.'); };
    img.onload = function () {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      done(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

// ---------- booking codes ----------
// Short random codes (like CC-K7Q2M) so nobody can guess another guest's code.
function newReservationCode(existing) {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';     // no 0, O, 1 or I, which look alike
  let code;
  do {
    code = 'CC-';
    for (let i = 0; i < 5; i++) code += letters.charAt(Math.floor(Math.random() * letters.length));
  } while (existing.some(r => r.code === code));
  return code;
}
