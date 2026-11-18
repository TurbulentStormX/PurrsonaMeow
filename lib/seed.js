import bcrypt from 'bcryptjs';
import { passwordProblem } from './security.js';

// Fills in anything missing (rooms, sessions, rates, cats, menu, ...) and creates the staff accounts.
// Safe to run again: it never overwrites anything that exists.
export async function ensureSeeded({ store, engine, User, env = process.env, log = console.log }) {
  const snapshot = await store.loadAll();
  const staffNow = (await User.find({ role: 'handler' })).map(h => ({ username: h.username, name: h.name, role: 'handler', contact: h.contact || '' }));

  // The starting data is added ONCE, on a brand-new database. (An empty list in MongoDB looks the same as a list
  // nobody has filled in yet, so we write down that seeding happened. Then an admin can empty a list on purpose.)
  let changes = {};
  if (!snapshot.meta || !snapshot.meta.seeded) {
    const seedable = ['rooms', 'sessions', 'rates', 'holidays', 'cats', 'events', 'menuItems', 'faq'];
    const fresh = { ...snapshot };
    for (const key of seedable) if ((fresh[key] || []).length === 0) delete fresh[key];
    changes = engine.seed(fresh, staffNow).changes;
    changes.meta = { value: { seeded: true } };
    await store.apply(changes);
  }

  const production = env.NODE_ENV === 'production';
  const staff = [
    { username: 'admin', name: 'Admin', role: 'admin',   contact: env.ADMIN_EMAIL || 'admin@example.com', pw: env.ADMIN_PASSWORD, dev: 'Admin@1234' },
    { username: 'aisha', name: 'Aisha', role: 'handler', contact: env.AISHA_EMAIL || 'aisha@example.com', pw: env.AISHA_PASSWORD, dev: 'Aisha@1234' },
    { username: 'ben',   name: 'Ben',   role: 'handler', contact: env.BEN_EMAIL || 'ben@example.com',     pw: env.BEN_PASSWORD,   dev: 'Ben@12345' }
  ];
  const created = [];
  for (const s of staff) {
    if (await User.findOne({ username: s.username })) continue;
    if (!s.pw && production) throw new Error('Set ' + s.username.toUpperCase() + '_PASSWORD (a strong password) before the first start, so the staff accounts are not created with a known password.');
    const password = s.pw || s.dev;
    const problem = passwordProblem(password);
    if (problem) throw new Error('The ' + s.username + ' password is too weak. ' + problem);
    await User.create({ name: s.name, username: s.username, role: s.role, contact: s.contact, passwordHash: await bcrypt.hash(password, 10) });
    created.push(s.username);
    if (!s.pw) log('[seed] ' + s.username + ' was created with the PRACTICE password ' + s.dev + '. Change it before anyone else can reach this site.');
  }
  return { seededKeys: Object.keys(changes).filter(k => k !== 'meta'), createdStaff: created };
}
