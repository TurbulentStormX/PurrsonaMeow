// =====================================================================
// WHERE THE DATA LIVES
// A store loads everything as one object and saves a list of changes.
//   MongoStore  = the real database (MongoDB Atlas)
//   MemoryStore = a copy in memory, used by the tests so they need no database
// =====================================================================
import { ID_KEYS, CONFIG_KEYS, ALL_KEYS } from './rules.js';

const clone = x => JSON.parse(JSON.stringify(x));

export class MemoryStore {
  constructor(initial = {}) { this.data = clone(initial); }
  // like MongoDB, every list comes back as a list (empty if nothing is saved yet)
  async loadAll() {
    const all = clone(this.data);
    for (const key of Object.keys(ID_KEYS)) all[key] = all[key] || [];
    return all;
  }
  async apply(changes) {
    for (const [key, change] of Object.entries(changes)) {
      if (CONFIG_KEYS.includes(key)) { this.data[key] = clone(change.value); continue; }
      const idField = ID_KEYS[key];
      const list = this.data[key] || (this.data[key] = []);
      for (const doc of change.upserts) {
        const i = list.findIndex(d => d[idField] === doc[idField]);
        if (i >= 0) list[i] = clone(doc); else list.push(clone(doc));
      }
      this.data[key] = list.filter(d => !change.deletes.includes(d[idField]));
    }
  }
}

export class MongoStore {
  constructor({ collections, Config }) { this.collections = collections; this.Config = Config; }

  async loadAll() {
    const data = {};
    await Promise.all(Object.keys(ID_KEYS).map(async key => {
      const docs = await this.collections[key].find({}).sort({ _id: 1 }).lean();      // oldest first, like the order they were saved
      data[key] = docs.map(d => { delete d._id; return d; });
    }));
    for (const c of await this.Config.find({}).lean()) data[c.key] = c.value;
    return data;
  }

  async apply(changes) {
    for (const [key, change] of Object.entries(changes)) {
      if (CONFIG_KEYS.includes(key)) {
        await this.Config.updateOne({ key }, { $set: { value: change.value } }, { upsert: true });
        continue;
      }
      const idField = ID_KEYS[key];
      const ops = change.upserts.map(doc => ({ replaceOne: { filter: { [idField]: doc[idField] }, replacement: doc, upsert: true } }));
      if (change.deletes.length) ops.push({ deleteMany: { filter: { [idField]: { $in: change.deletes } } } });
      if (ops.length) await this.collections[key].bulkWrite(ops);
    }
  }
}

export { ALL_KEYS };
