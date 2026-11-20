import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { makeAuth } from './lib/security.js';
import { makeLimiter } from './lib/limiter.js';
import { Mutex } from './lib/rules.js';
import authRoutes from './routes/auth.js';
import dataRoutes from './routes/data.js';
import actionRoutes from './routes/actions.js';
import collectionRoutes from './routes/collections.js';
import dashboardRoutes from './routes/dashboard.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// The whole server in one place:
//   /api/...        the data and the rules (login, the data copy, actions, admin edits)
//   everything else the website files in "public" (and the React dashboard at /dashboard if it has been built)
export function createApp({ store, models, User, engine, secret, options = {} }) {
  const { sign, optionalAuth, requireAuth } = makeAuth({ secret, User });
  const ctx = {
    store, models, User, engine, sign, optionalAuth, requireAuth,
    mutex: new Mutex(),
    clock: options.clock || (() => Date.now()),
    log: options.log || console.log,
    resetCodeMode: options.resetCodeMode || 'console',      // 'console' = the code appears in the server log, 'page' = on the web page
    salt: secret,
    mailer: options.mailer || null,                          // booking emails (only the real server turns them on)
    loginLimiter: makeLimiter({ max: 5, lockSeconds: options.lockSeconds ?? 60, now: options.clock }),
    lookupLimiter: makeLimiter({ max: 5, lockSeconds: options.lockSeconds ?? 60, now: options.clock }),
    feedbackLimiter: makeLimiter({ max: options.feedbackPerHour ?? 10, lockSeconds: 3600, now: options.clock })
  };

  // The cafe's own housekeeping (auto-cancel unpaid bookings, auto-conclude finished sessions). One change at a time, like every action.
  ctx.sweep = () => ctx.mutex.run(async () => {
    const snapshot = await store.loadAll();
    const out = engine.call(snapshot, [], 'sweepBookings', []);
    await store.apply(out.changes);
    return out.result;
  });

  const app = express();
  app.locals.sweep = ctx.sweep;
  if (options.trustProxy) app.set('trust proxy', 1);          // behind Render's proxy, so req.ip is the real visitor
  app.disable('x-powered-by');
  app.use((req, res, next) => {                                // a few safe browser settings
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    res.set('X-Frame-Options', 'SAMEORIGIN');
    next();
  });
  if (options.corsOrigin) app.use('/api', cors({ origin: options.corsOrigin.split(',').map(s => s.trim()) }));   // only for local development of a separate dashboard
  app.use('/api/collection', express.json({ limit: '4mb' }));     // the admin's lists can hold photos, so they may be larger
  app.use(express.json({ limit: '100kb' }));                       // everything else is small

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  authRoutes(app, ctx);
  dataRoutes(app, ctx);
  actionRoutes(app, ctx);
  collectionRoutes(app, ctx);
  dashboardRoutes(app, ctx);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // the React dashboard, once built with: npm run build (in the dashboard folder) and copied to ./dashboard
  const dashboardDir = options.dashboardDir || path.join(here, 'dashboard');
  if (fs.existsSync(path.join(dashboardDir, 'index.html'))) {
    app.use('/dashboard', express.static(dashboardDir));
    app.get('/dashboard/*splat', (req, res) => res.sendFile(path.join(dashboardDir, 'index.html')));
  }
  else {
    app.get(['/dashboard', '/dashboard/*splat'], (req, res) => res.type('html').send(
      '<!DOCTYPE html><meta charset="utf-8"><title>Dashboard</title><body style="font-family:sans-serif;max-width:560px;margin:60px auto">' +
      '<h1>The dashboard has not been built yet</h1><p>Build the React dashboard and copy it into the <code>dashboard</code> folder (steps in <code>docs/REACT.md</code>).</p>' +
      '<p><a href="/index.html">Back to the website</a></p></body>'));
  }
  app.use(express.static(options.publicDir || path.join(here, 'public')));

  app.use((err, req, res, next) => {
    ctx.log('[server error] ' + (err && err.message));
    res.status(err && err.type === 'entity.too.large' ? 413 : 500).json({ error: err && err.type === 'entity.too.large' ? 'That is too large to save.' : 'Something went wrong on the server.' });
  });
  return app;
}
