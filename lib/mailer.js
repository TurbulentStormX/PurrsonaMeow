
import emailjs from '@emailjs/nodejs';

// Escape values before inserting them into HTML email templates.
const esc = value =>
  String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

const money = amount => 'S$' + Number(amount || 0).toFixed(2);

export function createMailer(env = process.env, log = console.log, client = emailjs) {   // 'client' is only replaced by the tests
  const serviceId = env.EMAILJS_SERVICE_ID;
  const bookingTemplateId = env.EMAILJS_BOOKING_TEMPLATE_ID;
  const paymentTemplateId = env.EMAILJS_PAYMENT_TEMPLATE_ID;
  const publicKey = env.EMAILJS_PUBLIC_KEY;
  const privateKey = env.EMAILJS_PRIVATE_KEY;

  // EmailJS is optional. Missing settings should not break bookings.
  if (!serviceId || !publicKey || !privateKey) {
    log('[email] EmailJS is not configured. Emails are disabled.');

    return {
      enabled: false,
      send: async () => false,
      bookingConfirmed: async () => false,
      paymentReceived: async () => false
    };
  }

  // Send an email using the selected EmailJS template.
  async function send(templateId, to, params) {
    if (!templateId) {
      log('[email error] EmailJS template ID is missing.');
      return false;
    }

    if (!to) {
      log('[email error] Recipient email is missing.');
      return false;
    }

    try {
      const response = await client.send(
        serviceId,
        templateId,
        {
          ...params,
          email: to
        },
        {
          publicKey,
          privateKey
        }
      );

      log('[email] Successfully sent to ' + to);
      log('[email] EmailJS response: ' + response.text);

      return true;

    } catch (error) {
      log('[email error] ' + (error.text || error.message || error));
      return false;
    }
  }

  return {
    enabled: true,
    send,

    // Booking confirmation email
    async bookingConfirmed(r) {
      return await send(
        bookingTemplateId,
        r.email,
        {
          name: esc(r.name),
          code: esc(r.code),
          session: esc(r.session),
          date: esc(r.date),
          time: esc(r.time),
          guests: esc(r.guests),
          room: esc(r.roomName || r.room || ''),
          handler: esc(r.handler || ''),
          amount: esc(money(r.amount))
        }
      );
    },

    // Payment receipt email, including linked food orders
    async paymentReceived(r, orders = []) {
      const foodItems = orders.flatMap(order =>
        (order.items || []).map(item => {
          const lineTotal = Number(item.price || 0) * Number(item.qty || 0);

          return (
            esc(item.name) +
            ' x ' + esc(item.qty) +
            ' - ' + esc(money(lineTotal))
          );
        })
      );

      const foodTotal = orders.reduce(
        (sum, order) => sum + Number(order.total || 0),
        0
      );

      const grandTotal = Number(r.amount || 0) + foodTotal;

      return await send(
        paymentTemplateId,
        r.email,
        {
          name: esc(r.name),
          code: esc(r.code),
          session: esc(r.session),
          date: esc(r.date),
          time: esc(r.time),
          method: esc(r.payment?.method || ''),
          reference: esc(r.payment?.ref || ''),
          amount: esc(money(r.amount)),

          food_items: foodItems.length
            ? foodItems.join('\n')
            : 'No food orders',

          food_total: esc(money(foodTotal)),

          food_order_codes: orders.length
            ? esc(orders.map(o => o.code).join(', '))
            : 'None',

          grand_total: esc(money(grandTotal))
        }
      );
    }
  };
}
