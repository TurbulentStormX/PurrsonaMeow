import { createRequire } from 'node:module';
const { chromium } = createRequire('/usr/lib/node_modules/')('playwright');
import { build, TOMORROW } from './helpers.js';
const out = process.argv[2];
const e = await build();
await e.book(e.tokens.cat, { roomId: 'P1', cats: ['c1'], time: '14:00' });
const browser = await chromium.launch();
async function shot(who, page, name, w, h) {
  const r = await e.call('POST', '/api/auth/login', { username: who, password: who === 'admin' ? 'admin123' : 'cat123' });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await ctx.addInitScript(v => localStorage.setItem('catcafe_auth', JSON.stringify(v)), { token: r.data.token, user: r.data.user });
  const p = await ctx.newPage();
  await p.goto(e.base + '/' + page, { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  await p.screenshot({ path: out + '/' + name + '.png' });
  await ctx.close();
}
await shot('admin', 'dashboard.html', 'shell-admin-dash', 1366, 800);
await shot('admin', 'admin.html', 'shell-admin-res', 1366, 800);
await shot('aisha', 'handler.html', 'shell-handler', 1366, 800);
await shot('aisha', 'staff-status.html', 'shell-status', 1366, 800);
await shot('aisha', 'handler.html', 'shell-phone', 390, 800);
await browser.close(); e.close();
