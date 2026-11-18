# Put it online (free): Atlas + GitHub + Render

You need: your Atlas cluster (already made), a GitHub account, a Render account.

## 1. Atlas: make the database safe to reach from the internet
1. **Database Access**: reset the password of your database user (it was pasted in chat before). Use a long random password, letters and numbers only.
2. **Network Access**: Render's free service does not have one fixed address (check Render's docs for current outbound addresses), so you will most likely need "Allow access from anywhere" (0.0.0.0/0). Then **the database password is your only protection**: keep it long, and never put it in GitHub.
3. **Connect, Drivers**: copy the connection string, put `/catcafe` before the `?`.

## 2. GitHub
```
git init
git add .
git commit -m "Cat cafe"
```
Create a **private** repository on GitHub and push (GitHub shows the two commands). Check on GitHub that `.env` is NOT there (`.gitignore` blocks it) and that `node_modules` is not either.

## 3. Render
1. render.com, **New, Web Service** (or **New, Blueprint** to use `render.yaml`), connect the repository.
2. Runtime Node, build `npm install`, start `npm start`, plan **Free**, health check path `/api/health`.
3. Environment variables:

| Name | Value |
|---|---|
| `MONGODB_URI` | the Atlas string |
| `JWT_SECRET` | long random text (Render can generate it) |
| `NODE_ENV` | `production` |
| `CAFE_TIMEZONE` | `Asia/Singapore` (the rules work out "today" and "open now" with it) |
| `ADMIN_PASSWORD`, `AISHA_PASSWORD`, `BEN_PASSWORD` | strong passwords, used once when the staff accounts are created. **Production refuses to start without them.** |
| `RESET_CODE_MODE` | `console` |

4. Deploy. Open `https://YOUR-NAME.onrender.com`, sign up, make a booking, log in as `admin`.
5. Send friends the link. Every push to GitHub redeploys.

## What to expect
- Render says a free service goes to sleep after 15 minutes without visitors and takes about a minute to wake, with 750 free hours a month. An always-on service costs about $7 a month (check Render's pricing).
- Render's disk is temporary. Nothing is saved on it: all data and the photos admins upload are saved in Atlas.
- **Forgot password does not work for friends yet.** The code is written to Render's **Logs**, not emailed. Until your teammate's Nodemailer backend is connected, reset someone's password yourself: on your computer, with the production `MONGODB_URI` in `.env`, run `node set-password.js friend@email.com "NewPass1!"`.
- Staff passwords: `node set-password.js admin "NewPass1!"` the same way.

## Safety checklist
- Staff passwords strong; Atlas password reset and never shared in chat or GitHub.
- No real money: payment and subscriptions are pretend.
- You store guests' names, emails and phone numbers. If real customers will use it, check what Singapore's data protection rules (PDPA) require, and have the Terms checked.
