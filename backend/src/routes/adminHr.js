// Admin/HR: employees, attendance, leave, payroll
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const M = require('../models');
const R = require('../rules');
const v = require('../validate');
const id = (req) => v.num(req.params.id, 'id', { int: true, min: 1 });
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

// ---------- Employees ----------
const empFields = (b) => ({
  full_name: v.str(b.fullName, 'fullName', { max: 100 }), phone: v.phone(b.phone), email: v.email(b.email),
  designation_id: v.num(b.designationId, 'designationId', { int: true, min: 1 }), property_id: v.num(b.propertyId, 'propertyId', { int: true, min: 1 }),
  joining_date: v.date(b.joiningDate, 'joiningDate'),
  basic_salary: v.num(b.basicSalary, 'basicSalary', { min: 0.01, max: 1000000 })     // negative / zero salary rejected here AND by the schema
});
const refsExist = async (f) => {
  if (!(await M.Designation.exists({ designation_id: f.designation_id })) || !(await M.Property.exists({ property_id: f.property_id }))) throw new v.HttpError(400, 'A referenced record does not exist');
};
router.get('/designations', wrap(async (_req, res) => res.json(await M.Designation.find().sort({ title: 1 }).select('-_id').lean())));
router.get('/employees', wrap(async (_req, res) => {
  const emps = await M.Employee.find().select('-_id').lean();
  const des = Object.fromEntries((await M.Designation.find().lean()).map((d) => [d.designation_id, d.title]));
  const props = Object.fromEntries((await M.Property.find().lean()).map((p) => [p.property_id, p.name]));
  const users = Object.fromEntries((await M.UserAccount.find({ employee_id: { $ne: null } }).lean()).map((u) => [u.employee_id, u.username]));
  res.json(emps.map((e) => ({ ...e, designation: des[e.designation_id], property_name: props[e.property_id], username: users[e.employee_id] || null }))
    .sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.full_name.localeCompare(b.full_name)));
}));
router.post('/employees', wrap(async (req, res) => {
  const f = empFields(req.body);
  const username = v.str(req.body.username, 'username', { min: 3, max: 50 });
  const password = v.str(req.body.password, 'password', { min: 8, max: 100 });
  await refsExist(f);
  if (await M.UserAccount.exists({ username })) throw new v.HttpError(409, 'Duplicate entry: that record already exists');
  const e = await M.Employee.create(f);
  try {                                                   // employee + login together, or neither
    await M.UserAccount.create({ username, password_hash: await bcrypt.hash(password, 10), role: 'EMPLOYEE', employee_id: e.employee_id });
  } catch (err) { await M.Employee.deleteOne({ employee_id: e.employee_id }); throw err; }
  res.status(201).json({ employeeId: e.employee_id });
}));
router.put('/employees/:id', wrap(async (req, res) => {
  const f = { ...empFields(req.body), is_active: req.body.isActive !== false };
  await refsExist(f);
  const r = await M.Employee.updateOne({ employee_id: id(req) }, { $set: f }, { runValidators: true });
  if (!r.matchedCount) throw new v.HttpError(404, 'Employee not found');
  res.json({ ok: true });
}));

// ---------- Attendance (validation lives in rules.js) ----------
router.get('/attendance', wrap(async (req, res) => {
  const filter = {};
  if (req.query.employeeId) filter.employee_id = v.num(req.query.employeeId, 'employeeId', { int: true, min: 1 });
  if (req.query.date) filter.att_date = v.date(req.query.date, 'date');
  if (req.query.month) { const m = v.month(req.query.month); filter.att_date = { $gte: m, $lte: R.monthEnd(m) }; }
  const rows = await M.Attendance.find(filter).sort({ att_date: -1 }).limit(500).select('-_id').lean();
  const names = Object.fromEntries((await M.Employee.find().lean()).map((e) => [e.employee_id, e.full_name]));
  res.json(rows.map((r) => ({ ...r, full_name: names[r.employee_id] })).sort((a, b) => (a.att_date < b.att_date ? 1 : a.att_date > b.att_date ? -1 : 0) || a.full_name.localeCompare(b.full_name)));
}));
const attFields = (b) => ({ employee_id: v.num(b.employeeId, 'employeeId', { int: true, min: 1 }), att_date: v.date(b.date, 'date'),
  status: v.oneOf(b.status, 'status', ['Present', 'Absent', 'Late']), check_in: v.time(b.checkIn, 'checkIn'), check_out: v.time(b.checkOut, 'checkOut') });
router.post('/attendance', wrap(async (req, res) => {
  const a = attFields(req.body); await R.validateAttendance(a);
  const d = await M.Attendance.create(a); res.status(201).json({ attendanceId: d.attendance_id });
}));
router.put('/attendance/:id', wrap(async (req, res) => {
  const a = attFields(req.body), aid = id(req);
  if (!(await M.Attendance.exists({ attendance_id: aid }))) throw new v.HttpError(404, 'Attendance record not found');
  await R.validateAttendance(a, aid);
  await M.Attendance.updateOne({ attendance_id: aid }, { $set: a });
  res.json({ ok: true });
}));

// ---------- Leave ----------
router.get('/leaves', wrap(async (req, res) => {
  const filter = req.query.status ? { status: v.oneOf(req.query.status, 'status', ['Pending', 'Approved', 'Rejected']) } : {};
  const rows = await M.LeaveRequest.find(filter).select('-_id').lean();
  const names = Object.fromEntries((await M.Employee.find().lean()).map((e) => [e.employee_id, e.full_name]));
  res.json(rows.map((r) => ({ ...r, full_name: names[r.employee_id] })).sort((a, b) => (b.status === 'Pending') - (a.status === 'Pending') || (a.start_date < b.start_date ? 1 : -1)));
}));
router.put('/leaves/:id/status', wrap(async (req, res) => {
  const status = v.oneOf(req.body.status, 'status', ['Approved', 'Rejected']);
  const l = await M.LeaveRequest.findOne({ leave_id: id(req), status: 'Pending' }).lean();
  if (!l) throw new v.HttpError(404, 'No pending leave request with this id');
  await R.validateLeave({ ...l, status }, l.leave_id);                      // overlap check runs here
  await M.LeaveRequest.updateOne({ leave_id: l.leave_id }, { $set: { status } });
  res.json({ ok: true });
}));

// ---------- Payroll ----------
router.get('/tax-slabs', wrap(async (_req, res) => res.json(await M.TaxSlab.find().sort({ annual_from: 1 }).select('-_id').lean())));
router.post('/payroll/generate', wrap(async (req, res) => {
  const m = v.month(req.body.month);
  const emp = req.body.employeeId ? v.num(req.body.employeeId, 'employeeId', { int: true, min: 1 }) : null;
  res.json(await R.generatePayroll(m, emp, !!req.body.overwrite));         // saved in one transaction
}));
router.get('/payroll', wrap(async (req, res) => {
  const filter = {};
  if (req.query.month) filter.pay_month = v.month(req.query.month);
  if (req.query.employeeId) filter.employee_id = v.num(req.query.employeeId, 'employeeId', { int: true, min: 1 });
  res.json(await R.salarySlips(filter));
}));
router.get('/payroll/slip/:employeeId/:month', wrap(async (req, res) => {
  const [s] = await R.salarySlips({ employee_id: v.num(req.params.employeeId, 'employeeId', { int: true, min: 1 }), pay_month: v.month(req.params.month) });
  if (!s) throw new v.HttpError(404, 'No salary slip for that employee and month');
  res.json(s);
}));
module.exports = router;
