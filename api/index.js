// Vercel entry point: every /api/* request lands here (see vercel.json).
// The same Express app is used; the database connection is opened on demand and re-used between requests.
const { connect } = require('../backend/src/db');
const app = require('../backend/src/server');

module.exports = async (req, res) => {
  try { await connect(); } catch (e) { return res.status(503).json({ error: 'Database is not reachable: ' + e.message }); }
  return app(req, res);
};
