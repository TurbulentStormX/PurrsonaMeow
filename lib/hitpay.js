import crypto from 'node:crypto';

// HitPay PayNow. The server creates a payment request, the guest pays on HitPay's page (a PayNow QR),
// and HitPay tells the server it was paid (the "webhook"). Docs: https://docs.hitpayapp.com
//
// Settings (in .env on your computer, and in Render's Environment tab online):
//   HITPAY_API_KEY   the API key       (HitPay dashboard > Developers)
//   HITPAY_SALT      the salt          (same page; used to check that a webhook really came from HitPay)
//   HITPAY_BASE_URL  https://api.sandbox.hit-pay.com/v1   (testing; the live one is https://api.hit-pay.com/v1)
// Leave them out and online payment is off: the pay page keeps its practice buttons.
export function createHitpay(env = process.env, log = console.log, fetchImpl = globalThis.fetch) {
  const apiKey = env.HITPAY_API_KEY;
  const salt = env.HITPAY_SALT;
  const base = String(env.HITPAY_BASE_URL || 'https://api.sandbox.hit-pay.com/v1').replace(/\/+$/, '');

  if (!apiKey || !salt) {
    log('[payment] HitPay is not configured. Payments stay in practice mode.');
    return { enabled: false };
  }

  async function call(method, path, form) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    try {
      const res = await fetchImpl(base + path, {
        method,
        signal: ctl.signal,
        headers: {
          'X-BUSINESS-API-KEY': apiKey,
          'X-Requested-With': 'XMLHttpRequest',
          ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
        },
        body: form ? form.toString() : undefined
      });
      let data = null;
      try { data = await res.json(); } catch (e) { /* no body */ }
      if (!res.ok) throw new Error('HitPay answered ' + res.status + (data && data.message ? ': ' + data.message : ''));
      return data;
    } finally { clearTimeout(timer); }
  }

  return {
    enabled: true,

    // Start a PayNow payment. Returns { id, url }: send the guest to url.
    async createPayment({ amount, reference, name, email, purpose, redirectUrl, webhookUrl }) {
      const form = new URLSearchParams();
      form.set('amount', Number(amount).toFixed(2));
      form.set('currency', 'SGD');
      form.append('payment_methods[]', 'paynow_online');
      form.set('reference_number', reference);
      if (email) form.set('email', email);
      if (name) form.set('name', name);
      if (purpose) form.set('purpose', purpose);
      form.set('redirect_url', redirectUrl);
      form.set('webhook', webhookUrl);
      const data = await call('POST', '/payment-requests', form);
      if (!data || !data.id || !data.url) throw new Error('HitPay did not return a payment page.');
      return { id: String(data.id), url: data.url };
    },

    // Ask HitPay how a payment request is doing (used when the webhook was missed, for example while Render was asleep).
    async getPayment(id) {
      const data = await call('GET', '/payment-requests/' + encodeURIComponent(id));
      const payments = Array.isArray(data && data.payments) ? data.payments : [];
      const done = payments.find(p => p && (p.status === 'succeeded' || p.status === 'completed'));
      const paid = (data && data.status === 'completed') || !!done;
      return {
        paid,
        amount: Number((done && done.amount) || (data && data.amount)),
        paymentId: String((done && done.id) || (data && data.id) || id),
        reference: data && data.reference_number
      };
    },

    // HitPay signs every webhook: sort the fields by name, join them as name+value, HMAC-SHA256 with the salt.
    verifyWebhook(fields) {
      const body = fields || {};
      const given = String(body.hmac || '');
      if (!given) return false;
      const text = Object.keys(body).filter(k => k !== 'hmac').sort().map(k => k + body[k]).join('');
      const want = crypto.createHmac('sha256', salt).update(text).digest('hex');
      const a = Buffer.from(want), b = Buffer.from(given);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    },

    // used by tests to build a correctly signed webhook
    sign(fields) {
      const text = Object.keys(fields).sort().map(k => k + fields[k]).join('');
      return crypto.createHmac('sha256', salt).update(text).digest('hex');
    }
  };
}
