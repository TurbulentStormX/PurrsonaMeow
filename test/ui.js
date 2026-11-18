// A pretend browser for the website. Each Device has its OWN browser memory (like a real phone or computer),
// and all devices talk to the same server, so what one device saves, the others can see.
import { JSDOM, VirtualConsole } from 'jsdom';

export const wait = ms => new Promise(r => setTimeout(r, ms));
export async function until(fn, label, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { const v = fn(); if (v) return v; } catch (e) { /* not ready yet */ } await wait(20); }
  throw new Error('Timed out waiting for: ' + label);
}

export class Device {
  constructor(env) { this.env = env; this.local = {}; this.windows = []; this.errors = []; this.inflight = 0; }
  async open(page, { pollMs = 150 } = {}) {
    const device = this, env = this.env;
    const vc = new VirtualConsole();
    vc.on('jsdomError', e => { if (!/Not implemented: (navigation|window\.scrollTo)|fonts\.googleapis\.com/.test(e.message + ' ' + (e.detail || '')))  device.errors.push(page + ': ' + e.message + (e.detail ? ' ' + e.detail : '')); });
    const dom = await JSDOM.fromURL(env.base + '/' + page, {
      runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
      beforeParse(w) {
        for (const [k, v] of Object.entries(device.local)) w.localStorage.setItem(k, v);
        const proto = w.Storage.prototype, set = proto.setItem, rem = proto.removeItem;     // keep this device's memory between pages
        proto.setItem = function (k, v) { set.call(this, k, v); device.local[k] = String(v); };
        proto.removeItem = function (k) { rem.call(this, k); delete device.local[k]; };
        w.fetch = (url, options) => {
          if (device.failApi && String(url).startsWith('/api')) return Promise.reject(new TypeError('network down'));
          w.__inflight = (w.__inflight || 0) + 1;
          return fetch(new URL(url, env.base).href, options).finally(() => { w.__inflight--; });
        };
        const RealDate = w.Date;
        w.Date = class extends RealDate { constructor(...a) { if (a.length === 0) super(env.clock.now); else super(...a); } static now() { return env.clock.now; } };
        w.CATCAFE_POLL_MS = pollMs;
        w.HTMLElement.prototype.scrollIntoView = function () {};
        w.__alerts = []; w.__confirms = []; w.__confirmAnswer = true; w.__promptAnswer = '';
        w.alert = m => w.__alerts.push(String(m));
        w.confirm = m => { w.__confirms.push(String(m)); return w.__confirmAnswer; };
        w.prompt = () => w.__promptAnswer;
      }
    });
    await new Promise(r => dom.window.addEventListener('load', () => setTimeout(r, 50)));
    this.windows.push(dom.window);
    this.w = dom.window;
    await idle(this.w);
    return this.w;
  }
  // logs in the way a person does: on the login page
  async loginAs(username, password) {
    const w = await this.open('login.html');
    set(w, 'username', username); set(w, 'password', password);
    await send(w, 'loginForm');
    await until(() => this.local.catcafe_auth, 'the login to be remembered');
    return JSON.parse(this.local.catcafe_auth).user;
  }
  // the quick way: use a token the test already has (for tests that are not about logging in)
  async signedInAs(username) {
    const env = this.env;
    const token = env.tokens[username];
    const me = (await env.call('GET', '/api/auth/me', undefined, token)).data.user;
    this.local.catcafe_auth = JSON.stringify({ token, user: me });
    return this;
  }
  closeAll() { this.windows.forEach(w => w.close()); }
}

// waits until the page has no requests in flight (twice in a row, so one request that starts the next is covered)
export async function idle(w, ms = 5000) {
  const end = Date.now() + ms;
  let calm = 0;
  while (Date.now() < end) {
    const saving = (() => { try { return w.eval('Object.keys(saveTimers).length') > 0; } catch (e) { return false; } })();     // an admin change waiting to be sent
    if ((w.__inflight || 0) === 0 && !saving) { if (++calm >= 3) return; } else calm = 0;
    await wait(15);
  }
  throw new Error('The page kept talking to the server');
}

export const $ = (w, sel) => w.document.querySelector(sel);
export const $$ = (w, sel) => [...w.document.querySelectorAll(sel)];
export const text = (w, sel) => ($(w, sel) ? $(w, sel).textContent : '');
export function set(w, id, value) {
  const el = w.document.getElementById(id);
  el.value = value;
  el.dispatchEvent(new w.Event('input', { bubbles: true }));
  el.dispatchEvent(new w.Event('change', { bubbles: true }));
}
export async function click(el) { el.click(); await idle(el.ownerDocument.defaultView); }
export async function send(w, formId) { w.document.getElementById(formId).dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true })); await idle(w); }
export const navLabels = w => $$(w, '#side-nav a').map(a => a.textContent);
export const buttonByText = (root, label) => [...root.querySelectorAll('button')].find(b => b.textContent === label);
export const linkByText = (root, label) => [...root.querySelectorAll('a')].find(a => a.textContent === label);
export const row = (w, sel, needle) => $$(w, sel).find(r => r.textContent.includes(needle));
