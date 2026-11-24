const router = require('express').Router();
const bcrypt = require('bcryptjs');
const M = require('../models');
const { sign, requireAuth } = require('../middleware/auth');
const { HttpError, str } = require('../validate');

router.post('/login', async (req, res, next) => {
  try {
    const username = str(req.body.username, 'username', { max: 50 });
    const password = str(req.body.password, 'password', { max: 100 });
    const u = await M.UserAccount.findOne({ username }).lean();
    // same message for unknown user and wrong password (does not reveal which usernames exist)
    if (!u || !(await bcrypt.compare(password, u.password_hash))) throw new HttpError(401, 'Wrong username or password');
    const e = u.employee_id != null ? await M.Employee.findOne({ employee_id: u.employee_id }).lean() : null;
    if (u.role === 'EMPLOYEE' && !(e && e.is_active)) throw new HttpError(403, 'This account is deactivated');
    res.json({ token: sign(u), user: { username: u.username, role: u.role, employeeId: u.employee_id, name: e ? e.full_name : 'Admin / HR' } });
  } catch (e) { next(e); }
});
router.get('/me', requireAuth, (req, res) => res.json(req.user));
module.exports = router;
