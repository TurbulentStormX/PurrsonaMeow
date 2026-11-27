import test from 'node:test';
import assert from 'node:assert/strict';
import { build, TOMORROW } from './helpers.js';
import { createHitpay } from '../lib/hitpay.js';

// A pretend HitPay: records what the server asks, and lets a test decide whether a request counts as paid.
function fakeHitpay() {
  const calls = [], paidIds = new Set();
  let n = 0;
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body ? Object.fromEntries(new URLSearchParams(init.body)) : null });
    if (init.method === 'POST') { n++; return { ok: true, status: 200, json: async () => ({ id: 'req-' + n, url: 'https://securecheckout.sandbox.hit-pay.com/pay/req-' + n, status: 'pending' }) }; }
    const id = url.split('/').pop();
    const amount = calls.filter(c => c.method === 'POST')[Number(id.split('-')[1]) - 1].body.amount;
    return { ok: true, status: 200, json: async () => paidIds.has(id) ? { id, status: 'completed', amount, payments: [{ id: 'pay-' + id, status: 'succeeded', amount }] } : { id, status: 'pending', amount, payments: [] } };
  };
  const env = { HITPAY_API_KEY: 'test_key', HITPAY_SALT: 'test_salt', HITPAY_BASE_URL: 'https://api.sandbox.hit-pay.com/v1/' };
  const hitpay = createHitpay(env, () => {}, fetchImpl);
  return { hitpay, calls, paidIds };
}

const envs = [];
const world = async hit => { const e = await build(hit ? { hitpay: hit.hitpay } : {}); envs.push(e); return e; };
test.after(() => envs.forEach(e => e.close()));

const webhook = (e, hit, fields) => fetch(e.base + '/api/pay/webhook', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ ...fields, hmac: fields.hmac ?? hit.hitpay.sign(fields) }).toString()
}).then(async r => ({ status: r.status, data: await r.json().catch(() => null) }));

test('HitPay is off without keys: practice payment still works and the page is told online payment is off', async () => {
  assert.equal(createHitpay({}, () => {}).enabled, false);
  const e = await world();
  assert.deepEqual((await e.call('GET', '/api/pay/config')).data, { online: false });
  const b = (await e.book(e.tokens.cat)).data.reservation;
  assert.equal((await e.call('POST', '/api/pay/start', { code: b.code }, e.tokens.cat)).status, 400);
  assert.equal((await e.act('payReservation', { code: b.code, method: 'PayNow' }, e.tokens.cat)).data.ok, true);
});

test('HitPay on: the practice pay buttons are refused, so a booking cannot be paid for free', async () => {
  const hit = fakeHitpay(), e = await world(hit);
  assert.deepEqual((await e.call('GET', '/api/pay/config')).data, { online: true });
  const b = (await e.book(e.tokens.cat)).data.reservation;
  const free = await e.act('payReservation', { code: b.code, method: 'PayNow' }, e.tokens.cat);
  assert.equal(free.status, 400);
  assert.equal((await e.store.loadAll()).reservations.find(r => r.code === b.code).paid, false);
});

test('HitPay on: start, a forged webhook is ignored, the signed webhook marks it paid once, and the receipt is emailed', async () => {
  const hit = fakeHitpay();
  const sentMail = [];
  const e = await build({ hitpay: hit.hitpay, mailer: { enabled: true, paymentReceived: async (r, orders) => { sentMail.push(r.code); return true; }, bookingConfirmed: async () => true, bookingCancelled: async () => true } });
  envs.push(e);
  const { cat, dog } = e.tokens;
  const b = (await e.book(cat)).data.reservation;

  assert.equal((await e.call('POST', '/api/pay/start', { code: b.code }, undefined)).status, 401, 'login needed');
  assert.match((await e.call('POST', '/api/pay/start', { code: b.code }, dog)).data.error, /not yours/);
  const start = await e.call('POST', '/api/pay/start', { code: b.code, kind: 'booking' }, cat);
  assert.equal(start.data.ok, true);
  assert.match(start.data.url, /^https:\/\/securecheckout\.sandbox\.hit-pay\.com\//);
  const asked = hit.calls[0];
  assert.equal(asked.url, 'https://api.sandbox.hit-pay.com/v1/payment-requests', 'the base address is cleaned up');
  assert.equal(asked.headers['X-BUSINESS-API-KEY'], 'test_key');
  assert.deepEqual([asked.body.amount, asked.body.currency, asked.body.reference_number, asked.body['payment_methods[]']], ['30.00', 'SGD', b.code + ':booking', 'paynow_online']);
  assert.match(asked.body.webhook, /\/api\/pay\/webhook$/);
  assert.match(asked.body.redirect_url, /pay\.html\?code=/);
  assert.equal((await e.store.loadAll()).reservations.find(r => r.code === b.code).payRequest.id, 'req-1');

  const fields = { payment_id: 'abcd1234-0000', payment_request_id: 'req-1', phone: '', amount: '30.00', currency: 'SGD', status: 'completed', reference_number: b.code + ':booking' };
  assert.equal((await webhook(e, hit, { ...fields, hmac: 'f'.repeat(64) })).status, 400, 'wrong signature');
  assert.equal((await webhook(e, hit, { ...fields, amount: '1.00', hmac: hit.hitpay.sign(fields) })).status, 400, 'changed after signing');
  assert.equal((await e.store.loadAll()).reservations.find(r => r.code === b.code).paid, false);

  assert.equal((await webhook(e, hit, fields)).status, 200);
  const paid = (await e.store.loadAll()).reservations.find(r => r.code === b.code);
  assert.deepEqual([paid.paid, paid.payment.method, paid.payment.ref, paid.payment.amount], [true, 'PayNow', 'HP-ABCD1234', 30]);
  assert.deepEqual(sentMail, [b.code]);
  assert.equal((await webhook(e, hit, fields)).status, 200, 'HitPay may repeat itself');
  assert.deepEqual(sentMail, [b.code], 'no second receipt');
});

test('HitPay on: a payment of the wrong amount, or for a booking that is no longer open, is not accepted and is logged for a refund', async () => {
  const hit = fakeHitpay(), e = await world(hit);
  const b = (await e.book(e.tokens.cat)).data.reservation;
  await e.call('POST', '/api/pay/start', { code: b.code }, e.tokens.cat);
  const f = { payment_id: 'p1', payment_request_id: 'req-1', amount: '5.00', currency: 'SGD', status: 'completed', reference_number: b.code + ':booking' };
  await webhook(e, hit, f);
  assert.equal((await e.store.loadAll()).reservations.find(r => r.code === b.code).paid, false);
  assert.ok(e.logs.some(l => /does not match the price.*manual refund/.test(l)));
  await e.act('cancelReservation', { code: b.code }, e.tokens.cat);
  await webhook(e, hit, { ...f, amount: '30.00' });
  assert.equal((await e.store.loadAll()).reservations.find(r => r.code === b.code).paid, false);
  assert.ok(e.logs.some(l => /no longer open.*manual refund/.test(l)));
});

test('HitPay on: if the webhook never arrives, the pay page asks HitPay and the booking is still marked paid', async () => {
  const hit = fakeHitpay(), e = await world(hit);
  const { cat, dog } = e.tokens;
  const b = (await e.book(cat)).data.reservation;
  await e.call('POST', '/api/pay/start', { code: b.code }, cat);
  assert.equal((await e.call('GET', '/api/pay/status?code=' + b.code + '&kind=booking', undefined, cat)).data.paid, false);
  assert.equal((await e.call('GET', '/api/pay/status?code=' + b.code + '&kind=booking', undefined, dog)).status, 404, 'another guest cannot look');
  hit.paidIds.add('req-1');
  assert.equal((await e.call('GET', '/api/pay/status?code=' + b.code + '&kind=booking', undefined, cat)).data.paid, true);
  assert.equal((await e.store.loadAll()).reservations.find(r => r.code === b.code).payment.ref, 'HP-PAYREQ1');
});

test('HitPay on: a late-cancellation fee is paid the same way', async () => {
  const hit = fakeHitpay(), e = await world(hit);
  const { cat } = e.tokens;
  const c = (await e.book(cat, { time: '10:00', date: TOMORROW, roomId: 'P3', cats: ['c5'] })).data.reservation;
  e.clock.now = new Date('2030-03-05T09:00:00').getTime();
  const out = (await e.act('cancelReservation', { code: c.code }, cat)).data;
  assert.equal(out.feeDue, 30);
  const start = await e.call('POST', '/api/pay/start', { code: c.code, kind: 'fee' }, cat);
  assert.equal(hit.calls[0].body.amount, '30.00');
  assert.equal(hit.calls[0].body.reference_number, c.code + ':fee');
  await webhook(e, hit, { payment_id: 'fee99999', payment_request_id: 'req-1', amount: '30.00', currency: 'SGD', status: 'completed', reference_number: c.code + ':fee' });
  const r = (await e.store.loadAll()).reservations.find(x => x.code === c.code);
  assert.deepEqual([r.feePaid, r.feePayment.method, r.feePayment.ref], [true, 'PayNow', 'HP-FEE99999']);
  assert.equal(start.data.ok, true);
});
