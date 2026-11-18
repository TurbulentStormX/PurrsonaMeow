// Booking emails. They are OPTIONAL: if nothing is set, nothing is sent and nothing breaks.
// A failed email never stops a booking or a payment, it is only written to the log.
// Two ways to send (the first one that is set up wins):
//   1. BREVO_API_KEY + EMAIL_USER  -> sends over HTTPS with Brevo. Use this on Render's FREE plan,
//      because Render's free plan blocks the SMTP ports that Gmail needs.
//      EMAIL_USER is the sender address you verified in Brevo (Senders, domains & dedicated IPs).
//   2. EMAIL_USER + EMAIL_PASS     -> Gmail with an "App password". Works on your computer and on paid hosting.
import nodemailer from 'nodemailer';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => 'S$' + Number(n || 0).toFixed(2);

export function createMailer(env = process.env, log = console.log, fetchFn = globalThis.fetch) {
  const user = env.EMAIL_USER, pass = env.EMAIL_PASS, brevoKey = env.BREVO_API_KEY;
  if (!user || !(pass || brevoKey)) return { enabled: false, send: async () => false, bookingConfirmed() {}, paymentReceived() {} };
  const transporter = brevoKey ? null : nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });

  const frame = (title, intro, r, extra) => `
  <div style="font-family:Arial,sans-serif;background:#F8F4EC;padding:30px 12px;color:#5C5048">
    <div style="max-width:540px;margin:auto;background:#FFFDF9;border:1px solid #EADFD2;border-radius:16px;overflow:hidden">
      <div style="background:#EADFD2;text-align:center;padding:24px 16px">
        <h1 style="margin:0;color:#A96F5F;font-size:26px;letter-spacing:2px">PURRSONA MEOW</h1>
        <p style="margin:6px 0 0;color:#77675C;font-size:13px">Sipping Happiness, Purrfectly Brewed.</p>
      </div>
      <div style="padding:26px">
        <h2 style="text-align:center;color:#C9826D;margin-top:0">${esc(title)}</h2>
        <p>Hello ${esc(r.name)}!</p><p style="line-height:1.6">${esc(intro)}</p>
        <div style="border:1px dashed #C9826D;border-radius:12px;padding:14px;text-align:center;margin:20px 0">
          <div style="font-size:12px;color:#8C8178">YOUR RESERVATION CODE</div>
          <div style="font-size:24px;letter-spacing:2px;color:#C9826D;font-weight:bold">${esc(r.code)}</div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:5px 0;color:#8C8178">Session</td><td>${esc(r.session)}</td></tr>
          <tr><td style="padding:5px 0;color:#8C8178">Date</td><td>${esc(r.date)}</td></tr>
          <tr><td style="padding:5px 0;color:#8C8178">Time</td><td>${esc(r.time)}${r.endTime ? ' - ' + esc(r.endTime) : ''}</td></tr>
          <tr><td style="padding:5px 0;color:#8C8178">Guests</td><td>${esc(r.guests)}</td></tr>
          <tr><td style="padding:5px 0;color:#8C8178">Room</td><td>${esc(r.roomName || '')}</td></tr>
          <tr><td style="padding:5px 0;color:#8C8178">Cat handler</td><td>${esc(r.handler || '')}</td></tr>
          <tr><td style="padding:5px 0;color:#8C8178">Total</td><td>${esc(money(r.amount))}</td></tr>${extra}
        </table>
        <p style="margin-top:22px">With love,<br>The Purrsona Meow Team</p>
      </div>
    </div></div>`;

  async function send(to, subject, html, text) {
    if (!to) return false;
    try {
      if (brevoKey) {
        const res = await fetchFn('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': brevoKey, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ sender: { name: 'Purrsona Meow', email: user }, to: [{ email: to }], subject, htmlContent: html, textContent: text })
        });
        if (!res.ok) throw new Error('Brevo said ' + res.status + ' ' + (await res.text()).slice(0, 200));
        return true;
      }
      await transporter.sendMail({ from: '"Purrsona Meow" <' + user + '>', to, subject, html, text });
      return true;
    } catch (e) { log('[email error] ' + e.message); return false; }
  }
  return {
    enabled: true, send,
    bookingConfirmed(r) {      // not awaited: the guest should not wait for the email
      send(r.email, 'Purrsona Meow - Your booking is confirmed',
        frame('Your booking is confirmed', 'Thank you for choosing Purrsona Meow. Your reservation is confirmed. You can pay on the Sessions page.', r,
          '<tr><td style="padding:5px 0;color:#8C8178">Payment</td><td>' + (r.paid ? 'Paid' : 'Unpaid') + '</td></tr>'),
        `Hello ${r.name}, your booking ${r.code} on ${r.date} at ${r.time} is confirmed. Total ${money(r.amount)}.`);
    },
    paymentReceived(r) {
      send(r.email, 'Purrsona Meow - Payment received',
        frame('Payment received', 'Thank you! We have received your payment. This email is your receipt.', r,
          '<tr><td style="padding:5px 0;color:#8C8178">Method</td><td>' + esc(r.payment?.method || '') + '</td></tr><tr><td style="padding:5px 0;color:#8C8178">Reference</td><td>' + esc(r.payment?.ref || '') + '</td></tr>'),
        `Hello ${r.name}, we received your payment of ${money(r.amount)} for booking ${r.code}. Ref ${r.payment?.ref || ''}.`);
    }
  };
}
