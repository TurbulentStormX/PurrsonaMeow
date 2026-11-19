
import express from 'express';

// Every action the website can ask for. For each one: who may ask, and how the logged-in person
// (never the web page) fills in who they are. The rules themselves are in public/bookings.js.
const guestInfo = u => ({ name: u.name, email: u.email, phone: u.phone || '' });

const ACTIONS = {
  createReservation:            { roles: ['guest'],            args: (u, a) => [guestInfo(u), a.f] },
  cancelReservation:            { roles: ['guest', 'admin'],   args: (u, a) => u.role === 'admin' ? [a.code, 'admin'] : [a.code, 'guest', u.email] },
  payReservation:               { roles: ['guest'],            args: (u, a) => [a.code, a.method, u.email] },
  editReservation:              { roles: ['admin'],            args: (u, a) => [a.code, a.changes] },
  addLeave:                     { roles: ['admin', 'handler'], args: (u, a) => [u.role === 'handler' ? u.username : a.username, a.start, a.end, a.reason, a.note] },
  removeLeave:                  { roles: ['admin'],            args: (u, a) => [a.id] },
  replaceCatInUpcomingBookings: { roles: ['admin'],            args: (u, a) => [a.catId] },
  addReview:                    { roles: ['guest'],            args: (u, a) => [a.code, u.email, a.data] },
  concludeReservation:           { roles: ['handler'],          args: (u, a) => [a.code, u.username, a.checkedIn] },
  placeOrder:                   { roles: ['guest'],            args: (u, a) => [guestInfo(u), a.reservationCode, a.lines] },
  markOrderServed:              { roles: ['handler', 'admin'], args: (u, a) => [a.code, { role: u.role, name: u.name }] },
  subscribe:                    { roles: ['guest'],            args: (u, a) => [guestInfo(u), a.tierId] },
  cancelSubscription:           { roles: ['guest'],            args: u => [u.email] },
  submitFeedback:               { roles: null,                 args: (u, a) => [a.f] },
  clearPracticeData:            { roles: ['admin'],            args: () => [] }
};

export default function actionRoutes(app, ctx) {
  const { store, engine, mutex, User, optionalAuth, feedbackLimiter } = ctx;

  app.post('/api/action/:name', express.json({ limit: '100kb' }), optionalAuth, async (req, res) => {
    const action = Object.prototype.hasOwnProperty.call(ACTIONS, req.params.name)
      ? ACTIONS[req.params.name]
      : null;

    if (!action) {
      return res.status(404).json({ ok: false, error: 'Unknown action.' });
    }

    const user = req.user;

    if (action.roles) {
      if (!user) {
        return res.status(401).json({ ok: false, error: 'Please log in.' });
      }

      if (!action.roles.includes(user.role)) {
        return res.status(403).json({ ok: false, error: 'This is not available for your account.' });
      }
    }

    if (req.params.name === 'submitFeedback') {
      const wait = feedbackLimiter.wait(req.ip);

      if (wait) {
        return res.status(429).json({
          ok: false,
          error: 'You have sent a lot of messages. Please try again later.'
        });
      }

      feedbackLimiter.fail(req.ip);
    }

    try {
      // One change at a time: load, run the rule, save what it changed.
      const result = await mutex.run(async () => {
        const snapshot = await store.loadAll();

        const staff = (await User.find({ role: 'handler' })).map(h => ({
          username: h.username,
          name: h.name,
          role: 'handler',
          contact: h.contact || ''
        }));

        const out = engine.call(
          snapshot,
          staff,
          req.params.name,
          action.args(user || {}, req.body || {})
        );

        await store.apply(out.changes);

        return out.result;
      });

      if (result && result.ok && result.reservation && ctx.mailer) {

        // Booking confirmation email
        if (req.params.name === 'createReservation') {
          await ctx.mailer.bookingConfirmed(result.reservation);
        }

        // Payment receipt email, including food orders for this reservation
        if (req.params.name === 'payReservation') {
          const snapshot = await store.loadAll();

          const relatedOrders = (snapshot.orders || []).filter(
            order => order.reservation === result.reservation.code
          );

          await ctx.mailer.paymentReceived(
            result.reservation,
            relatedOrders
          );
        }
      }

      res.json(result);

    } catch (err) {
      ctx.log('[action error] ' + req.params.name + ': ' + err.message);
      res.status(400).json({
        ok: false,
        error: 'That request was not understood.'
      });
    }
  });
}
