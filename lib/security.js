import jwt from 'jsonwebtoken';

// The password rules. The server checks them, so they cannot be skipped by editing a web page.
export const PASSWORD_RULES = [
  { text: '8 to 12 characters',                          test: p => p.length >= 8 && p.length <= 12 },
  { text: 'An uppercase letter (A-Z)',                   test: p => /[A-Z]/.test(p) },
  { text: 'A lowercase letter (a-z)',                    test: p => /[a-z]/.test(p) },
  { text: 'A number (0-9)',                              test: p => /[0-9]/.test(p) },
  { text: 'A special character, for example ! @ # $ %',  test: p => /[^A-Za-z0-9\s]/.test(p) },
  { text: 'No spaces',                                   test: p => !/\s/.test(p) }
];
// '' when the password is strong enough, otherwise what is missing
export function passwordProblem(password) {
  const missing = PASSWORD_RULES.filter(r => !r.test(password)).map(r => r.text);
  return missing.length === 0 ? '' : 'Your password needs: ' + missing.join('; ') + '.';
}

// Login tokens: after login the server gives the browser a signed token. The browser sends it back with every
// request, and the server checks it was not changed. The token only says WHO; the role is read from the database.
export function makeAuth({ secret, User }) {
  const sign = user => jwt.sign({ id: String(user._id), role: user.role, name: user.name }, secret, { expiresIn: '8h' });

  async function authenticate(req) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return null;
    try {
      const payload = jwt.verify(token, secret);
      const user = await User.findOne({ _id: payload.id });
      return user ? { id: String(user._id), role: user.role, name: user.name, email: user.email, phone: user.phone, username: user.username } : null;
    } catch (err) {
      return null;
    }
  }
  // Works for anyone; req.user is the logged-in person, or null
  const optionalAuth = async (req, res, next) => { req.user = await authenticate(req); next(); };
  // Only the listed roles get through. requireAuth() with no roles = any logged-in person.
  const requireAuth = (...roles) => async (req, res, next) => {
    req.user = await authenticate(req);
    if (!req.user) return res.status(401).json({ error: 'Please log in.' });
    if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({ error: 'This is not available for your account.' });
    next();
  };
  return { sign, optionalAuth, requireAuth };
}
