import express from 'express';
import { diffSnapshots } from '../lib/rules.js';

// The admin pages (Manage Cats, Rates, Rooms, Hours, ...) save a whole list at once.
// Every item is checked against the data model (models/index.js), fields we do not know are thrown away,
// and a few links between collections are protected (you cannot delete a room that has bookings).
const LIST_KEYS = ['rooms', 'sessions', 'rates', 'holidays', 'cats', 'events', 'menuItems', 'faq', 'feedbackMessages'];
const HH_MM = /^\d{2}:\d{2}$/;
const active = r => r.status === 'Requested' || r.status === 'Assigned';

function checkOpenHours(v) {
  if (!v || !Array.isArray(v.weekly) || v.weekly.length !== 7) return 'Opening hours need all 7 days.';
  for (const d of v.weekly) {
    if (typeof d.open !== 'boolean' || !HH_MM.test(d.from || '') || !HH_MM.test(d.to || '')) return 'Each day needs open/closed and opening and closing times.';
    if (d.open && d.to <= d.from) return 'A day must close after it opens.';
  }
  const periods = v.closedPeriods;
  if (!Array.isArray(periods) || periods.length > 20) return 'The closed periods are not valid.';
  for (const p of periods) {
    if (typeof p.id !== 'string' || typeof p.name !== 'string' || !HH_MM.test(p.from || '') || !HH_MM.test(p.to || '') || p.to <= p.from) return 'A closed period must end after it starts.';
  }
  return '';
}
const checkSettings = v => (v && typeof v.breakMinutes === 'number' && v.breakMinutes >= 0 && v.breakMinutes <= 240) ? '' : 'The break must be from 0 to 240 minutes.';

export default function collectionRoutes(app, ctx) {
  const { store, models, User, mutex, requireAuth } = ctx;

  app.put('/api/collection/:key', express.json({ limit: '4mb' }), requireAuth('admin'), async (req, res) => {
    const key = req.params.key;
    const input = req.body ? req.body.value : undefined;
    const bad = (status, error) => res.status(status).json({ ok: false, error });

    // single documents
    if (key === 'openHours' || key === 'settings') {
      const problem = key === 'openHours' ? checkOpenHours(input) : checkSettings(input);
      if (problem) return bad(400, problem);
      const clean = key === 'openHours'
        ? { weekly: input.weekly.map(d => ({ open: d.open, from: d.from, to: d.to })), closedPeriods: input.closedPeriods.map(p => ({ id: p.id, name: p.name.slice(0, 80), from: p.from, to: p.to })) }
        : { breakMinutes: input.breakMinutes };
      await mutex.run(async () => {
        const before = await store.loadAll();
        await store.apply(diffSnapshots(before, { ...before, [key]: clean }));
      });
      return res.json({ ok: true });
    }

    if (!LIST_KEYS.includes(key)) return bad(404, 'Unknown list.');
    if (!Array.isArray(input) || input.length > 300) return bad(400, 'Please send a list of up to 300 items.');

    // check every item against the data model; keep only the fields it knows
    const Model = models.collections[key];
    const idField = 'id';
    const clean = [];
    const seen = new Set();
    for (const item of input) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return bad(400, 'Every item must be an object.');
      const doc = new Model(item);
      const error = doc.validateSync();
      if (error) return bad(400, Object.values(error.errors).map(e => e.message)[0]);
      const plain = doc.toObject();
      delete plain._id;
      if (seen.has(plain[idField])) return bad(400, 'Two items have the same id.');
      seen.add(plain[idField]);
      clean.push(plain);
    }

    try {
      const out = await mutex.run(async () => {
        const snapshot = await store.loadAll();
        const old = snapshot[key] || [];
        const removed = old.map(d => d[idField]).filter(id => !seen.has(id));
        const reservations = snapshot.reservations || [];
        const today = new Date(ctx.clock()).toLocaleDateString('en-CA');   // the server runs on cafe time (see server.js)

        // links between collections that must not break
        if (key === 'rooms') {
          const used = reservations.find(r => r.status !== 'Cancelled' && removed.includes(r.roomId));
          if (used) return { status: 409, error: 'A room that has bookings cannot be deleted. Switch it off (Active) instead.' };
          const inSession = (snapshot.sessions || []).find(s => (s.rooms || []).some(id => removed.includes(id)));
          if (inSession) return { status: 409, error: 'A room used by "' + inSession.name + '" cannot be deleted. Remove it from that session first.' };
        }
        if (key === 'sessions') {
          const roomIds = new Set((snapshot.rooms || []).map(r => r.id));
          const missing = clean.find(s => (s.rooms || []).some(id => !roomIds.has(id)));
          if (missing) return { status: 400, error: '"' + missing.name + '" uses a room that does not exist.' };
          if (reservations.find(r => r.status !== 'Cancelled' && removed.includes(r.sessionId))) return { status: 409, error: 'A session that has bookings cannot be deleted. Switch it off (Active) instead.' };
        }
        if (key === 'cats') {
          const handlers = new Set((await User.find({ role: 'handler' })).map(h => h.username));
          const nobody = clean.find(c => !handlers.has(c.handler));
          if (nobody) return { status: 400, error: nobody.name + ' needs a handler who exists.' };
          if (reservations.find(r => active(r) && r.date >= today && (r.cats || []).some(id => removed.includes(id)))) return { status: 409, error: 'A cat in a coming booking cannot be deleted. Switch it off (Available) instead.' };
        }
        if (key === 'rates') {
          const sessionIds = new Set((snapshot.sessions || []).map(s => s.id));
          const orphan = clean.find(r => r.sessionId !== '' && !sessionIds.has(r.sessionId));
          if (orphan) return { status: 400, error: '"' + orphan.name + '" is for a session that does not exist.' };
        }
        await store.apply(diffSnapshots({ [key]: old }, { [key]: clean }));
        return { status: 200 };
      });
      if (out.status !== 200) return bad(out.status, out.error);
      res.json({ ok: true });
    } catch (err) {
      ctx.log('[collection error] ' + key + ': ' + err.message);
      bad(400, 'That could not be saved.');
    }
  });
}
