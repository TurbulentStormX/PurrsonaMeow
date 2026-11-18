// npm run seed: connects, adds any starting data that is missing, and creates the staff accounts.
// (The server does the same every time it starts, so you only need this to check your setup.)
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { buildModels } from './models/index.js';
import { MongoStore } from './lib/stores.js';
import { createEngine } from './lib/rules.js';
import { ensureSeeded } from './lib/seed.js';

process.env.TZ = process.env.CAFE_TIMEZONE || 'Asia/Singapore';
try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000, dbName: process.env.MONGODB_DB || undefined });
} catch (err) {
  console.error('Could not connect to MongoDB. Most likely your IP address is not allowed in Atlas (Network Access).');
  process.exit(1);
}
const models = buildModels(true);
await Promise.all([...Object.values(models.collections), models.Config, models.User].map(m => m.init()));
const result = await ensureSeeded({
  store: new MongoStore(models), User: models.User,
  engine: createEngine({ publicDir: path.join(path.dirname(fileURLToPath(import.meta.url)), 'public') })
});
console.log(result.seededKeys.length ? 'Added: ' + result.seededKeys.join(', ') : 'Nothing to add: the data is already there.');
if (result.createdStaff.length) console.log('Created staff accounts: ' + result.createdStaff.join(', '));
await mongoose.disconnect();
