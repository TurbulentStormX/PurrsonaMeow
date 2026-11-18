// Change a password:   node set-password.js <username or email> "<new password>"
// Example:             node set-password.js admin "MyNew@Pass1"
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { buildModels } from './models/index.js';
import { passwordProblem } from './lib/security.js';

const [who, password] = process.argv.slice(2);
if (!who || !password) { console.error('Usage: node set-password.js <username or email> "<new password>"'); process.exit(1); }
const problem = passwordProblem(password);
if (problem) { console.error(problem); process.exit(1); }
try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000, dbName: process.env.MONGODB_DB || undefined });
} catch (err) {
  console.error('Could not connect to MongoDB. Most likely your IP address is not allowed in Atlas (Network Access).');
  process.exit(1);
}
const { User } = buildModels(true);
const id = who.trim().toLowerCase();
const user = (await User.findOne({ username: id })) || (await User.findOne({ email: id }));
if (!user) { console.error('No account found for "' + who + '".'); await mongoose.disconnect(); process.exit(1); }
user.passwordHash = await bcrypt.hash(password, 10);
user.resetCodeHash = ''; user.resetExpires = 0; user.resetTries = 0;
await user.save();
console.log('Password changed for ' + (user.username || user.email) + '.');
await mongoose.disconnect();
