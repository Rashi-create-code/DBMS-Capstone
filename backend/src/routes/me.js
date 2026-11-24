// Employee self-service. The employee id ALWAYS comes from the signed login token, never from the
// request, so an employee cannot ask for somebody else's data.
const router = require('express').Router();
const M = require('../models');
const R = require('../rules');
const v = require('../validate');
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

router.get('/profile', wrap(async (req, res) => {
  const e = await M.Employee.findOne({ employee_id: req.user.employeeId }).lean();
  const d = await M.Designation.findOne({ designation_id: e.designation_id }).lean();
  res.json({ employee_id: e.employee_id, full_name: e.full_name, phone: e.phone, email: e.email, joining_date: e.joining_date, basic_salary: e.basic_salary, designation: d && d.title });
}));
router.get('/attendance', wrap(async (req, res) => {
  const m = v.month(req.query.month);
  res.json(await M.Attendance.find({ employee_id: req.user.employeeId, att_date: { $gte: m, $lte: R.monthEnd(m) } }).sort({ att_date: 1 }).select('-_id att_date status check_in check_out').lean());
}));
router.get('/leaves', wrap(async (req, res) => {
  res.json(await M.LeaveRequest.find({ employee_id: req.user.employeeId }).sort({ start_date: -1 }).select('-_id leave_id start_date end_date reason status applied_on').lean());
}));
router.post('/leaves', wrap(async (req, res) => {
  const l = { employee_id: req.user.employeeId, start_date: v.date(req.body.startDate, 'startDate'), end_date: v.date(req.body.endDate, 'endDate'),
    reason: v.str(req.body.reason, 'reason', { min: 3, max: 200 }), status: 'Pending', applied_on: R.todayStr() };   // an employee can never choose the status
  await R.validateLeave(l);
  const d = await M.LeaveRequest.create(l);
  res.status(201).json({ leaveId: d.leave_id });
}));
router.get('/salary-slips', wrap(async (req, res) => res.json(await R.salarySlips({ employee_id: req.user.employeeId }))));
router.get('/salary-slips/:month', wrap(async (req, res) => {
  const [s] = await R.salarySlips({ employee_id: req.user.employeeId, pay_month: v.month(req.params.month) });
  if (!s) throw new v.HttpError(404, 'No salary slip for that month');
  res.json(s);
}));
module.exports = router;
