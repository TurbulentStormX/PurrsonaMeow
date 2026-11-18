import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { Mongoose } from 'mongoose';
import { buildModels } from '../models/index.js';
import { MemoryStore } from '../lib/stores.js';

// A memory store that takes a little time on every call, like a real database over the network.
// (Without this, requests never overlap in a test, and a missing lock would go unnoticed.)
class SlowStore extends MemoryStore {
  constructor(ms) { super(); this.ms = ms; }
  async loadAll() { await new Promise(r => setTimeout(r, this.ms)); return super.loadAll(); }
  async apply(changes) { await new Promise(r => setTimeout(r, this.ms)); return super.apply(changes); }
}
import { createEngine } from '../lib/rules.js';
import { ensureSeeded } from '../lib/seed.js';
import { createApp } from '../app.js';

export const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

// A tiny stand-in for the users collection (an array in memory), used only by the tests
export class FakeUsers {
  constructor() { this.rows = []; this.n = 0; }
  match(row, filter) { return Object.entries(filter).every(([k, v]) => row[k] === v); }
  async find(filter = {}) { return this.rows.filter(r => this.match(r, filter)); }
  async findOne(filter = {}) { return this.rows.find(r => this.match(r, filter)) || null; }
  async create(doc) {
    const row = { resetCodeHash: '', resetExpires: 0, resetTries: 0, ...doc, _id: String(++this.n) };
    Object.defineProperty(row, 'save', { value: async () => {}, enumerable: false });
    this.rows.push(row);
    return row;
  }
}

export const SECRET = 'test-secret-1234567890';
export const STRONG = 'Meow2cats!';
export const T0 = '2030-03-04T08:00:00';          // the pretend "now": Monday 4 March 2030, 8:00
export const TOMORROW = '2030-03-05', SAT = '2030-03-09';

// A whole server with a memory store: seeded, with the staff accounts, and two guests (cat and dog).
export async function build(options = {}) {
  const clock = { now: new Date(T0).getTime() };
  const logs = [];
  const models = buildModels(true, new Mongoose());          // its own Mongoose, so several test servers can exist at once
  const store = options.storeDelayMs ? new SlowStore(options.storeDelayMs) : new MemoryStore();
  const User = new FakeUsers();
  const engine = createEngine({ publicDir: PUBLIC, clock: () => clock.now });
  await ensureSeeded({ store, engine, User, env: {}, log: () => {} });
  // easy passwords for the tests (the real accounts must follow the password rules)
  const hash = bcrypt.hashSync('cat123', 4);
  for (const u of User.rows) u.passwordHash = u.username === 'admin' ? bcrypt.hashSync('admin123', 4) : hash;
  for (const [username, name, phone] of [['cat', 'Cat', '91234501'], ['dog', 'Dog', '91234502']]) {
    await User.create({ name, email: username + '@gmail.com', username, phone, role: 'guest', passwordHash: hash });
  }
  const app = createApp({ store, models, User, engine, secret: SECRET,
    options: { clock: () => clock.now, log: line => logs.push(line), resetCodeMode: 'page', lockSeconds: 1, ...options } });
  const server = app.listen(0);
  const base = 'http://localhost:' + server.address().port;
  const call = async (method, p, body, token) => {
    const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  const login = async (username, password) => (await call('POST', '/api/auth/login', { username, password })).data.token;
  const tokens = {
    admin: await login('admin', 'admin123'), aisha: await login('aisha', 'cat123'), ben: await login('ben', 'cat123'),
    cat: await login('cat', 'cat123'), dog: await login('dog', 'cat123')
  };
  const act = (name, args, token) => call('POST', '/api/action/' + name, args, token);
  const book = (token, over = {}) => act('createReservation', { f: { sessionId: 'ps', roomId: 'P1', date: TOMORROW, time: '14:00', hours: 1, guests: 2, requests: '', cats: ['c1'], ...over } }, token);
  return { base, server, store, User, models, clock, logs, call, act, book, tokens, login, close: () => server.close() };
}
