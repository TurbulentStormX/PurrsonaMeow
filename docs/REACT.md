# Should the whole frontend be React?

**Not now.** The 33 pages work, they are plain HTML and JavaScript that all three of you can read, and the booking rules live on the server, not in the pages. A React rewrite would repeat all that work for no new feature. If you ever want React everywhere, the server API stays the same: `/api/data`, `/api/action/:name`, `/api/collection/:key`.

**Use React for the dashboard**, where charts help.

## Put the dashboard on the same server
1. In `dashboard-react`, build it for the `/dashboard/` address: `npx vite build --base=/dashboard/`
2. Copy the contents of `dist` into a folder called `dashboard` next to `app.js`.
3. The server now serves it at `/dashboard/`. The **Dashboard** link in the website menu goes there, with `?back=` so your back-button patch returns to the right page.

Until you build it, the link shows a "not built yet" page.

## Real numbers instead of sample data
`GET /api/admin/dashboard` (admin only) returns:
`totals` (bookings, confirmed, concluded, cancelled, revenue, customers, orders, supporters), `byStatus`, `bySession`, `byMonth`, `rooms` (name and Occupied/Available/Maintenance now), `reviews` (`id, name, session, rating, message`), `ratings`.

Because the built dashboard is on the same address as the website, it can read the login the website saved:
```js
const auth = JSON.parse(localStorage.getItem('catcafe_auth') || 'null');
const res = await fetch('/api/admin/dashboard', { headers: { Authorization: 'Bearer ' + auth.token } });
const data = await res.json();
```
If there is no `auth`, show a "please log in" message with a link to `/login.html`.

## While developing the dashboard on its own (port 5173)
Set `DASHBOARD_ORIGIN=http://localhost:5173` in `.env`, restart the server, and log in from the dashboard with `POST http://localhost:5000/api/auth/login` (`{ username, password }`), then send the returned `token` as shown above.
