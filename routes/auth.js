import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { passwordProblem } from '../lib/security.js';

const sha = text => crypto.createHash('sha256').update(String(text)).digest('hex');
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);       // so a wrong username takes as long as a wrong password
const publicUser = u => ({ name: u.name, email: u.email, phone: u.phone, username: u.username, role: u.role });

export default function authRoutes(app, ctx) {
  const { User, sign, requireAuth, loginLimiter } = ctx;
  const logIn = u => ({ token: sign(u), user: publicUser(u) });

  // ---- sign up (guests only) ----
  app.post('/api/auth/signup', async (req, res) => {
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    const errors = [];
    if (!b.name || !String(b.name).trim()) errors.push('Name is required.');
    if (!/^\S+@\S+\.\S+$/.test(email)) errors.push('A valid email is required.');
    if (!/^[689]\d{7}$/.test(b.phone || '')) errors.push('Phone must be 8 digits starting with 6, 8 or 9.');
    const weak = passwordProblem(String(b.password || ''));
    if (weak) errors.push(weak);
    if (errors.length) return res.status(400).json({ errors });

    if ((await User.findOne({ email })) || (await User.findOne({ username: email }))) {
      return res.status(409).json({ errors: ['This email is already registered. Please log in.'] });
    }
    const user = await User.create({ name: String(b.name).trim().slice(0, 80), email, phone: b.phone, role: 'guest', passwordHash: await bcrypt.hash(b.password, 10) });
    res.status(201).json(logIn(user));
  });

  // ---- log in (guests use their email, staff use their username). Too many wrong tries locks it for a minute. ----
  app.post('/api/auth/login', async (req, res) => {
    const b = req.body || {};
    const id = String(b.username || '').trim().toLowerCase();
    const key = req.ip + '|' + id;
    const wait = loginLimiter.wait(key);
    if (wait) return res.status(429).json({ error: 'Too many wrong tries. Please wait ' + wait + ' seconds and try again.' });
    const user = (await User.findOne({ email: id })) || (await User.findOne({ username: id }));
    const ok = await bcrypt.compare(String(b.password || ''), user ? user.passwordHash : DUMMY_HASH);
    if (!user || !ok) { loginLimiter.fail(key); return res.status(401).json({ error: 'Wrong email/username or password.' }); }
    loginLimiter.ok(key);
    res.json(logIn(user));
  });

  app.get('/api/auth/me', requireAuth(), (req, res) => res.json({ user: publicUser(req.user) }));

  // ---- forgot password, step 1 (the answer is the same whether or not the email has an account) ----
  app.post('/api/auth/forgot', async (req, res) => {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    const out = { message: 'If that email belongs to a guest account, a reset code has been sent. It works for 15 minutes.' };
    const user = await User.findOne({ email });
    if (user && user.role === 'guest') {
      const code = String(crypto.randomInt(100000, 1000000));
      user.resetCodeHash = sha(code);
      user.resetExpires = Date.now() + 15 * 60000;
      user.resetTries = 0;
      await user.save();
      // There is no email service yet. 'console' prints the code in the server log, 'page' shows it on the page
      // (only safe when you are the only user). The real version emails it (Nodemailer) and does neither.
      if (ctx.resetCodeMode === 'page') out.practiceCode = code;
      else ctx.log('[reset code] ' + email + ' : ' + code);
    }
    res.json(out);
  });

  // ---- forgot password, step 2 ----
  app.post('/api/auth/reset', async (req, res) => {
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    const fail = message => res.status(400).json({ error: message });
    const user = await User.findOne({ email });
    const clear = () => { user.resetCodeHash = ''; user.resetExpires = 0; user.resetTries = 0; };
    if (!user || !user.resetCodeHash) return fail('No reset was requested for this email, or the code was already used. Please request a new code.');
    if (Date.now() > user.resetExpires) { clear(); await user.save(); return fail('This code has expired. Please request a new one.'); }
    if (sha(String(b.code || '').trim()) !== user.resetCodeHash) {
      user.resetTries++;
      if (user.resetTries >= 5) { clear(); await user.save(); return fail('Too many wrong codes. Please request a new code.'); }
      await user.save();
      return fail('That code is not correct.');
    }
    const weak = passwordProblem(String(b.password || ''));
    if (weak) return fail(weak);
    user.passwordHash = await bcrypt.hash(b.password, 10);
    clear();
    await user.save();
    res.json({ ok: true });
  });
}
