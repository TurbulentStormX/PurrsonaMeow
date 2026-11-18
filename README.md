# Cat Café (server version)

One Node server + MongoDB (Atlas) + the website. The booking rules run on the server, so nobody can skip them by editing a web page.

## Run it on your computer
1. Install Node 20 or newer. In this folder: `npm install`
2. Copy `.env.example` to `.env` and fill in `MONGODB_URI` (your Atlas connection string, ending `/catcafe?...`) and `JWT_SECRET` (any long random text).
3. `npm run dev`, then open **http://localhost:5000** (not Live Server: the pages call `/api` on the same address).
4. First start: the starting data (rooms, sessions, rates, cats, menu, holidays...) is added once, and the staff accounts are created. Without `ADMIN_PASSWORD` etc. in `.env` they get PRACTICE passwords (`Admin@1234`, `Aisha@1234`, `Ben@12345`) and a warning is printed. Change them: `node set-password.js admin "NewPass1!"`.
5. Phones on the same Wi-Fi: use the address the server prints.

If it cannot connect: check the password in `MONGODB_URI` (letters and numbers only is easiest) and that your IP is allowed in Atlas, Network Access.

## How the pieces fit
```
browser pages (public/)  --/api-->  server (app.js, routes/)  --->  MongoDB (models/index.js)
   read a copy of the data             runs the SAME rule files
   (filtered by who you are)           (public/data.js, bookings.js) on the real data, one change at a time
```
- `public/` the website. `api.js` talks to the server, `auth.js` remembers the login, `storage.js` holds the data copy, `actions.js` asks the server to book, pay, cancel...
- `public/data.js` and `public/bookings.js` are the rules. **Edit rules here; both the browser and the server use them.**
- `lib/rules.js` runs the rules on the server. `lib/views.js` decides who may see what. `lib/stores.js` is MongoDB (and a memory copy for tests).
- `models/index.js` is the data model. `docs/DATA-MODEL.md` explains it.

## Docs
- `docs/DATA-MODEL.md` collections, fields, relations
- `docs/DEPLOY.md` put it online for friends (Atlas + GitHub + Render)
- `docs/TEAM.md` how teammates work on it and see the data
- `docs/REACT.md` should the frontend be React, and the dashboard

## Tests
`npm test` runs the rules tests, the server tests and the end-to-end tests (your real pages in a pretend browser, several devices at once). They use a memory copy of the database, so they do not touch Atlas.
**Not covered by the tests:** a real MongoDB (the first start on Atlas is the real test), real browsers, and a live deployment.

## Limits to know
- Payments and "Support us" are pretend (no money is taken).
- Forgot-password codes are printed in the server log (`RESET_CODE_MODE=console`) because there is no email service yet. Do not use `page` mode on a public site.
- Terms, rules and allergen tags are sample text. Prices and refund numbers are placeholders.
- The server loads all data for every booking action. That is fine for a café; a huge database would need smarter queries.

## v9: friends' designs, dashboard and emails
- The new page designs (`*-design.css`, About us page, images) are merged into `public/`.
- The React dashboard (Qistina's) is built into the `dashboard` folder and opens at `/dashboard/` after logging in as admin or handler. It now reads live data from `/api/data`. To change it, edit the source in your `dashboard-react` folder, then run `npx vite build --base=/dashboard/` and copy `dist` into `dashboard`.
- Booking and payment emails (`lib/mailer.js`) are sent only when `EMAIL_USER` and `EMAIL_PASS` (a Gmail app password) are set in `.env` or in Render's Environment. Without them, nothing is sent and nothing breaks.
- The old `backend` folder (port 3000) is no longer needed. Never upload its `.env`.
