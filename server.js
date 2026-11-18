import 'dotenv/config';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { buildModels } from './models/index.js';
import { MongoStore } from './lib/stores.js';
import { createEngine } from './lib/rules.js';
import { ensureSeeded } from './lib/seed.js';
import { createApp } from './app.js';
import { createMailer } from './lib/mailer.js';

// The cafe runs on Singapore time. The rules work out "today" and "is it open now" from the server's clock,
// so the server must use the cafe's time zone, not the hosting company's (which is usually UTC).
process.env.TZ = process.env.CAFE_TIMEZONE || 'Asia/Singapore';

const here = path.dirname(fileURLToPath(import.meta.url));
const uri = process.env.MONGODB_URI;
const secret = process.env.JWT_SECRET || '';
if (!uri) { console.error('MONGODB_URI is missing. Copy .env.example to .env and put your Atlas connection string in it.'); process.exit(1); }
if (secret.length < 16 || secret.startsWith('change-me')) { console.error('JWT_SECRET is missing or too short. Set it to a long random text (at least 16 characters).'); process.exit(1); }

try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000, dbName: process.env.MONGODB_DB || undefined });
  console.log('Connected to MongoDB (' + mongoose.connection.name + ')');
} catch (err) {
  console.error('Could not connect to MongoDB:', err.message);
  console.error('Check: the password in MONGODB_URI, and that your IP address is allowed in Atlas (Network Access).');
  process.exit(1);
}

const models = buildModels(true);
await Promise.all([...Object.values(models.collections), models.Config, models.User].map(m => m.init()));   // creates the unique indexes
const store = new MongoStore(models);
const engine = createEngine({ publicDir: path.join(here, 'public') });

try {
  const seeded = await ensureSeeded({ store, engine, User: models.User });
  if (seeded.seededKeys.length) console.log('Added the starting data:', seeded.seededKeys.join(', '));
  if (seeded.createdStaff.length) console.log('Created staff accounts:', seeded.createdStaff.join(', '));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const app = createApp({
  store, models, User: models.User, engine, secret,
  options: { resetCodeMode: process.env.RESET_CODE_MODE, trustProxy: !!process.env.RENDER || process.env.TRUST_PROXY === '1', corsOrigin: process.env.DASHBOARD_ORIGIN, mailer: createMailer(process.env) }
});
const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log('\nCat Cafe is running!');
  console.log('  On this computer:           http://localhost:' + port);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) console.log('  On a phone (same Wi-Fi):    http://' + net.address + ':' + port);
    }
  }
  console.log('');
});
