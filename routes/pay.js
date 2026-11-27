import express from 'express';

// Real online payment (HitPay PayNow). The browser can only ASK to start a payment; a booking is marked paid
// only when HitPay's signed message (or HitPay's own answer when we ask it) says the money arrived.
export default function payRoutes(app, ctx) {
  const { store, engine, mutex, optionalAuth } = ctx;
  const refOf = (code, kind) => code + ':' + kind;
  const baseUrl = req => (process.env.PUBLIC_URL || (req.protocol + '://' + req.get('host'))).replace(/\/+$/, '');

  // Mark the booking paid (one change at a time, like every rule), then send the receipt email.
  async function settle(code, kind, paymentId, amount) {
    const out = await mutex.run(async () => {
      const snapshot = await store.loadAll();
      const res = engine.call(snapshot, [], 'completeOnlinePayment', [code, kind, paymentId, amount]);
      await store.apply(res.changes);
      return res.result;
    });
    if (!out.ok) {
      ctx.log('[payment] ' + code + ' (' + kind + '): ' + out.error + (out.needsRefund ? ' - HitPay payment ' + paymentId + ' needs a manual refund.' : ''));
    } else if (!out.already && kind === 'booking' && ctx.mailer) {
      const snapshot = await store.loadAll();
      const orders = (snapshot.orders || []).filter(o => o.reservation === out.reservation.code);
      await ctx.mailer.paymentReceived(out.reservation, orders);
    }
    return out;
  }

  app.get('/api/pay/config', (req, res) => res.json({ online: !!(ctx.hitpay && ctx.hitpay.enabled) }));

  // The guest pressed "Pay with PayNow": create the HitPay payment and send back the page to open.
  app.post('/api/pay/start', optionalAuth, async (req, res) => {
    if (!ctx.hitpay || !ctx.hitpay.enabled) return res.status(400).json({ ok: false, error: 'Online payment is not switched on.' });
    const user = req.user;
    if (!user || user.role !== 'guest') return res.status(401).json({ ok: false, error: 'Please log in.' });
    const code = String((req.body || {}).code || '');
    const kind = (req.body || {}).kind === 'fee' ? 'fee' : 'booking';
    try {
      const check = await mutex.run(async () => engine.call(await store.loadAll(), [], 'beginOnlinePayment', [code, kind, user.email]).result);
      if (!check.ok) return res.status(400).json({ ok: false, error: check.error });
      const pay = await ctx.hitpay.createPayment({
        amount: check.amount, reference: refOf(code, kind), name: user.name, email: user.email,
        purpose: (kind === 'fee' ? 'Cancellation fee ' : 'Booking ') + code,
        redirectUrl: baseUrl(req) + '/pay.html?code=' + encodeURIComponent(code) + '&back=1',
        webhookUrl: baseUrl(req) + '/api/pay/webhook'
      });
      await mutex.run(async () => {
        const res2 = engine.call(await store.loadAll(), [], 'attachPayRequest', [code, kind, pay.id, check.amount]);
        await store.apply(res2.changes);
      });
      res.json({ ok: true, url: pay.url });
    } catch (err) {
      ctx.log('[payment error] start ' + code + ': ' + err.message);
      res.status(502).json({ ok: false, error: 'We could not reach the payment provider. Please try again in a moment.' });
    }
  });

  // HitPay calls this when a payment finishes. Checked with the salt before anything is believed.
  app.post('/api/pay/webhook', express.urlencoded({ extended: false, limit: '20kb' }), async (req, res) => {
    if (!ctx.hitpay || !ctx.hitpay.enabled) return res.status(404).end();
    const body = req.body || {};
    if (!ctx.hitpay.verifyWebhook(body)) {
      ctx.log('[payment] a webhook with a wrong signature was ignored');
      return res.status(400).json({ ok: false });
    }
    try {
      if (body.status === 'completed') {
        const ref = String(body.reference_number || '');
        const cut = ref.lastIndexOf(':');
        if (cut > 0) await settle(ref.slice(0, cut), ref.slice(cut + 1) === 'fee' ? 'fee' : 'booking', body.payment_id || body.payment_request_id, Number(body.amount));
      }
      res.json({ ok: true });
    } catch (err) {
      ctx.log('[payment error] webhook: ' + err.message);
      res.status(500).json({ ok: false });
    }
  });

  // The pay page asks this after the guest comes back from HitPay. If the webhook has not arrived yet
  // (for example Render was asleep), we ask HitPay ourselves.
  app.get('/api/pay/status', optionalAuth, async (req, res) => {
    const user = req.user;
    if (!user || user.role !== 'guest') return res.status(401).json({ ok: false, error: 'Please log in.' });
    const code = String(req.query.code || '');
    const kind = req.query.kind === 'fee' ? 'fee' : 'booking';
    const find = async () => (await store.loadAll()).reservations.find(r => r.code === code && (r.email || '').toLowerCase() === String(user.email).toLowerCase());
    try {
      let r = await find();
      if (!r) return res.status(404).json({ ok: false, error: 'Booking not found.' });
      const isPaid = x => kind === 'fee' ? !!x.feePaid : !!x.paid;
      if (!isPaid(r) && ctx.hitpay && ctx.hitpay.enabled && r.payRequest && r.payRequest.kind === kind) {
        const state = await ctx.hitpay.getPayment(r.payRequest.id);
        if (state.paid) { await settle(code, kind, state.paymentId, state.amount); r = await find(); }
      }
      res.json({ ok: true, paid: isPaid(r) });
    } catch (err) {
      ctx.log('[payment error] status ' + code + ': ' + err.message);
      res.json({ ok: true, paid: false });
    }
  });
}
