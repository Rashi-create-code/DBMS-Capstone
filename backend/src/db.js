// MongoDB connection + a transaction helper
require('dotenv').config();
const mongoose = require('mongoose');

mongoose.set('strictQuery', true);

let pending = null;                      // one shared connection attempt (important on serverless hosts like Vercel)
async function connect(uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smartstay') {
  if (mongoose.connection.readyState === 0) pending = null;
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!pending) pending = mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, maxPoolSize: 10 }).then(() => mongoose.connection).catch((e) => { pending = null; throw e; });
  return pending;
}

// Run fn(session) inside a transaction: COMMIT when it finishes, ROLLBACK (nothing saved) on any error.
// Atlas and replica sets support transactions. A plain standalone mongod does not: then we run
// without one (a warning is printed once) so local development still works.
let warned = false;
const state = { transactions: true };
async function withTx(fn) {
  const session = await mongoose.startSession();
  try {
    let out;
    await session.withTransaction(async () => { out = await fn(session); });
    return out;
  } catch (e) {
    if (e && (e.code === 20 || /replica set|Transaction numbers/i.test(e.message || ''))) {
      state.transactions = false;
      if (!warned) { console.warn('MongoDB is standalone: running without transactions. Use Atlas or a replica set in production.'); warned = true; }
      return fn(null);
    }
    throw e;
  } finally { session.endSession(); }
}
module.exports = { connect, mongoose, withTx, state };
