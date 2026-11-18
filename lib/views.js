// =====================================================================
// WHO MAY SEE WHAT
// The website keeps a copy of the data so its pages can show availability straight away.
// This file decides what goes into that copy for each kind of visitor, so nobody receives
// another guest's name, email, phone, payment or booking code.
// =====================================================================
import crypto from 'node:crypto';

// A booking code is a secret (it lets someone look a booking up). Other people get a scrambled stand-in,
// which still tells two bookings apart but cannot be used to look anything up.
const pseudo = (code, salt) => 'x' + crypto.createHash('sha256').update(salt + code).digest('hex').slice(0, 10);

// Only what is needed to work out "is this room, cat or handler free then?"
function publicReservation(r, salt) {
  return { code: pseudo(r.code, salt), sessionId: r.sessionId, session: r.session, roomId: r.roomId, roomCode: r.roomCode, roomName: r.roomName,
           date: r.date, time: r.time, hours: r.hours, guests: r.guests, cats: r.cats || [], handler: r.handler, handlerUsername: r.handlerUsername, status: r.status };
}
function publicReview(v, salt) {
  return { id: pseudo(v.id, salt), code: pseudo(v.code, salt), session: v.session, date: v.date, handler: v.handler, handlerStars: v.handlerStars,
           cats: (v.cats || []).map(c => ({ id: c.id, stars: c.stars })) };
}
const publicLeave = l => ({ id: l.id, handler: l.handler, start: l.start, end: l.end, reason: 'Leave', note: '' });

// user = null for a visitor, otherwise { role, email, username, name }
export function buildView(snapshot, handlers, user, salt) {
  const role = user ? user.role : 'visitor';
  const email = user ? (user.email || '').toLowerCase() : '';
  const list = key => snapshot[key] || [];

  const data = {
    rooms: list('rooms'), sessions: list('sessions'), rates: list('rates'), holidays: list('holidays'), cats: list('cats'),
    events: list('events'), menuItems: list('menuItems'), faq: list('faq'),
    openHours: snapshot.openHours, settings: snapshot.settings
  };

  if (role === 'admin') {
    return { staff: handlers, data: { ...data, reservations: list('reservations'), handlerLeaves: list('handlerLeaves'), reviews: list('reviews'),
             orders: list('orders'), feedbackMessages: list('feedbackMessages'), subscriptions: list('subscriptions') } };
  }

  const mineRes = r => (role === 'guest' && (r.email || '').toLowerCase() === email) || (role === 'handler' && r.handlerUsername === user.username);
  data.reservations = list('reservations').map(r => mineRes(r) ? r : publicReservation(r, salt));
  data.handlerLeaves = list('handlerLeaves').map(l => role === 'handler' && l.handler === user.username ? l : publicLeave(l));
  data.reviews = list('reviews').map(v => (role === 'guest' && (v.email || '').toLowerCase() === email) || (role === 'handler' && v.handler === user.username) ? v : publicReview(v, salt));
  data.orders = role === 'guest' ? list('orders').filter(o => (o.email || '').toLowerCase() === email)
              : role === 'handler' ? list('orders').filter(o => o.handler === user.name) : [];
  data.subscriptions = role === 'guest' ? list('subscriptions').filter(s => s.email === email) : [];
  data.feedbackMessages = [];
  return { staff: handlers, data };
}

// What a booking code shows to anyone who has it (no login): nothing personal.
export function lookupView(r) {
  return { code: r.code, session: r.session, room: r.zone || r.roomName, date: r.date, time: r.time, hours: r.hours || 1, endTime: r.endTime,
           guests: r.guests, cats: r.catNames || [], handler: r.handler, status: r.status };
}
