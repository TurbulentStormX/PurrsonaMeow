import { buildView, lookupView } from '../lib/views.js';

export default function dataRoutes(app, ctx) {
  const { store, User, optionalAuth, lookupLimiter } = ctx;

  const staffList = async () => (await User.find({ role: 'handler' })).map(h => ({ username: h.username, name: h.name, role: 'handler', contact: h.contact || '' }));

  // A copy of the data for the website, filtered for who is asking (see lib/views.js)
  app.get('/api/data', optionalAuth, async (req, res) => {
    const snapshot = await store.loadAll();
    res.set('Cache-Control', 'no-cache');
    res.set('Vary', 'Authorization');
    const me = req.user ? { name: req.user.name, email: req.user.email, phone: req.user.phone, username: req.user.username, role: req.user.role } : null;
    res.json({ me, ...buildView(snapshot, await staffList(), req.user, ctx.salt) });     // "me" lets the page notice a login that has expired
  });

  // Check a booking with its code, no login. Nothing personal is shown. Too many wrong codes locks it for a minute.
  app.get('/api/reservations/:code', async (req, res) => {
    const wait = lookupLimiter.wait(req.ip);
    if (wait) return res.status(429).json({ error: 'Too many wrong codes. Please wait ' + wait + ' seconds and try again.' });
    const code = String(req.params.code || '').trim().toUpperCase();
    const found = ((await store.loadAll()).reservations || []).find(r => r.code.toUpperCase() === code);
    if (!found) { lookupLimiter.fail(req.ip); return res.status(404).json({ error: 'No booking found for that code. Please check it and try again.' }); }
    lookupLimiter.ok(req.ip);
    res.json(lookupView(found));
  });
}
