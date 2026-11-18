# Working together

## Where the data is
The data is in **Atlas (the cloud)**, not on anyone's laptop and not in the zip. Anyone who has (1) the code, (2) the connection string in their own `.env`, and (3) an IP address allowed in Atlas runs the server and sees the **same** data.

## Choose one way
1. **One shared test database.** Simple, but you overwrite each other's test bookings.
2. **One database each (recommended).** Same cluster and connection string, but each person adds `MONGODB_DB=catcafe_irene` (their own name) to `.env`. A fresh database fills itself with starting data on first start.
3. **Testers use the live site.** Only whoever changes server code needs to run it locally.

## Share code with Git, not zips
```
git clone <the repository link>
npm install
copy .env.example .env      (then fill it in)
npm run dev
```
`.env` is never committed. Send the connection string privately. If it leaks, reset the Atlas password.

## Atlas settings for teammates
**Network Access** must allow each person's IP. Home and campus Wi-Fi change often, which causes "Could not connect". For development, temporarily allow 0.0.0.0/0 with a strong database password.

## Editing the pages
Run `npm run dev` and open **http://localhost:5000**. Edit files in `public/`, then refresh. There is no build step. Live Server will not work because pages call `/api` on the same address.

## Rules vs pages
Booking rules are in `public/data.js` and `public/bookings.js`. Changing them changes the browser and the server together. After a change, run `npm test`.

## The email backend (Nodemailer) and the dashboard
They are separate for now. Keep `backend/.env` out of Git. The dashboard is covered in `docs/REACT.md`; the email backend can later be merged into this server to send reset codes.
