# Booking and payment emails (EmailJS)

The server sends two emails through EmailJS, over HTTPS, so it works on Render's free plan
(Render blocks the normal Gmail ports, EmailJS does not):

- a booking confirmation, when a guest books (`lib/mailer.js` > `bookingConfirmed`)
- a payment receipt with any food orders, when a guest pays (`paymentReceived`)

If the EMAILJS_ settings are missing, nothing is sent and bookings still work. A failed email is only written to the log.

## The five settings (in `.env` on your computer, in Render > Environment online)
| Name | Where to find it in EmailJS |
|---|---|
| EMAILJS_SERVICE_ID | Email Services > your service |
| EMAILJS_BOOKING_TEMPLATE_ID | Email Templates > the booking template |
| EMAILJS_PAYMENT_TEMPLATE_ID | Email Templates > the payment template |
| EMAILJS_PUBLIC_KEY | Account > General > Public Key |
| EMAILJS_PRIVATE_KEY | Account > General > Private Key |

## One switch you must turn on
EmailJS refuses calls from a server unless you allow them:
Account > Security > turn on **Allow EmailJS API for non-browser applications**.
Without it the log shows `[email error] ... API calls are disabled for non-browser applications`.

## What the templates can use
In the template, the **To email** field must be `{{email}}`. The values the server sends:

- Booking template: `name code session date time guests room handler amount`
- Payment template: `name code session date time method reference amount food_items food_total food_order_codes grand_total`

## Check it works
After changing a setting in Render, wait for the redeploy, make a booking with an email you can open, then check Render > Logs.
`[email] Successfully sent to ...` means it worked. `[email error] ...` says why not.
Never upload `.env` to GitHub, and never paste the private key into a chat.
