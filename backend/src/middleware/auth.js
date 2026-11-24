const jwt = require('jsonwebtoken');
const { HttpError } = require('../validate');

const SECRET = process.env.JWT_SECRET || 'dev-secret';
const sign = (u) => jwt.sign({ uid: u.user_id, role: u.role, employeeId: u.employee_id }, SECRET, { expiresIn: '8h' });

function requireAuth(req, _res, next) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return next(new HttpError(401, 'Please log in'));
  try { req.user = jwt.verify(h.slice(7), SECRET); next(); }
  catch { next(new HttpError(401, 'Session expired, please log in again')); }
}
// Role gate. 401 = not logged in, 403 = logged in but not allowed
const requireRole = (role) => (req, _res, next) =>
  req.user && req.user.role === role ? next() : next(new HttpError(403, 'You are not allowed to do this'));

module.exports = { sign, requireAuth, requireRole };
