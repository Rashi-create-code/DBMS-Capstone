// Admin: complaints, visitors, reports, dashboard
const router = require('express').Router();
const M = require('../models');
const R = require('../rules');
const v = require('../validate');
const id = (req) => v.num(req.params.id, 'id', { int: true, min: 1 });
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
const byName = async (Model, key, val) => Object.fromEntries((await Model.find().lean()).map((x) => [x[key], val(x)]));

router.get('/complaints', wrap(async (req, res) => {
  const filter = req.query.status ? { status: v.oneOf(req.query.status, 'status', ['Open', 'In Progress', 'Resolved']) } : {};
  const rows = await M.Complaint.find(filter).select('-_id').lean();
  const tenants = Object.fromEntries((await M.Tenant.find().lean()).map((t) => [t.tenant_id, t]));
  const active = Object.fromEntries((await M.Allocation.find({ status: 'Active' }).lean()).map((a) => [a.tenant_id, a]));
  const rooms = Object.fromEntries((await M.Room.find().lean()).map((r) => [r.room_id, r]));
  const props = await byName(M.Property, 'property_id', (p) => p.name);
  res.json(rows.map((c) => { const t = tenants[c.tenant_id], a = active[c.tenant_id], r = a && rooms[a.room_id];
    return { ...c, tenant_name: t.full_name, phone: t.phone, property_name: r ? props[r.property_id] : null, room_number: r ? r.room_number : null }; })
    .sort((a, b) => (a.status === 'Resolved') - (b.status === 'Resolved') || new Date(b.created_at) - new Date(a.created_at)));
}));
router.put('/complaints/:id/status', wrap(async (req, res) => {
  const status = v.oneOf(req.body.status, 'status', ['Open', 'In Progress', 'Resolved']);
  const r = await M.Complaint.updateOne({ complaint_id: id(req) }, { $set: { status, resolved_at: status === 'Resolved' ? new Date() : null } });
  if (!r.matchedCount) throw new v.HttpError(404, 'Complaint not found');
  res.json({ ok: true });
}));

router.get('/visitors', wrap(async (req, res) => {
  const filter = req.query.propertyId ? { property_id: v.num(req.query.propertyId, 'propertyId', { int: true, min: 1 }) } : {};
  const rows = await M.Visitor.find(filter).sort({ visit_datetime: -1 }).limit(200).select('-_id').lean();
  const tenants = await byName(M.Tenant, 'tenant_id', (t) => t.full_name), props = await byName(M.Property, 'property_id', (p) => p.name);
  res.json(rows.map((r) => ({ ...r, tenant_name: tenants[r.tenant_id], property_name: props[r.property_id] })));
}));
router.post('/visitors', wrap(async (req, res) => {
  const f = { visitor_name: v.str(req.body.visitorName, 'visitorName', { max: 100 }), phone: v.phone(req.body.phone),
    tenant_id: v.num(req.body.tenantId, 'tenantId', { int: true, min: 1 }), property_id: v.num(req.body.propertyId, 'propertyId', { int: true, min: 1 }),
    visit_datetime: new Date(), purpose: v.str(req.body.purpose, 'purpose', { max: 150 }) };
  if (!(await M.Tenant.exists({ tenant_id: f.tenant_id })) || !(await M.Property.exists({ property_id: f.property_id }))) throw new v.HttpError(400, 'A referenced record does not exist');
  const d = await M.Visitor.create(f); res.status(201).json({ visitorId: d.visitor_id });
}));

// ---------- Reports ----------
router.get('/reports/attendance-summary', wrap(async (req, res) => {
  const m = v.month(req.query.month);
  const att = await M.Attendance.find({ att_date: { $gte: m, $lte: R.monthEnd(m) } }).lean();
  const emps = Object.fromEntries((await M.Employee.find().lean()).map((e) => [e.employee_id, e]));
  const des = await byName(M.Designation, 'designation_id', (d) => d.title), props = await byName(M.Property, 'property_id', (p) => p.name);
  const by = {};
  att.forEach((a) => { const r = by[a.employee_id] ||= { present_days: 0, late_days: 0, absent_days: 0, days_recorded: 0 };
    r[a.status === 'Present' ? 'present_days' : a.status === 'Late' ? 'late_days' : 'absent_days']++; r.days_recorded++; });
  res.json(Object.entries(by).map(([eid, r]) => { const e = emps[eid];
    return { employee_id: e.employee_id, full_name: e.full_name, designation: des[e.designation_id], property_name: props[e.property_id], att_month: m, ...r }; })
    .sort((a, b) => a.property_name.localeCompare(b.property_name) || a.full_name.localeCompare(b.full_name)));
}));
router.get('/reports/late-marks', wrap(async (req, res) => {
  const m = v.month(req.query.month);
  const late = await M.Attendance.find({ att_date: { $gte: m, $lte: R.monthEnd(m) }, status: 'Late' }).select('-_id').lean();
  const emps = Object.fromEntries((await M.Employee.find().lean()).map((e) => [e.employee_id, e]));
  const props = await byName(M.Property, 'property_id', (p) => p.name);
  const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) - 540;     // minutes after 09:00
  const detail = late.map((a) => ({ attendance_id: a.attendance_id, employee_id: a.employee_id, full_name: emps[a.employee_id].full_name, property_name: props[emps[a.employee_id].property_id],
    att_date: a.att_date, check_in: a.check_in, minutes_late: mins(a.check_in) })).sort((a, b) => (a.att_date < b.att_date ? -1 : a.att_date > b.att_date ? 1 : 0) || a.full_name.localeCompare(b.full_name));
  const g = {};
  detail.forEach((d) => { (g[d.employee_id] ||= []).push(d); });
  const summary = Object.values(g).map((l) => ({ employee_id: l[0].employee_id, full_name: l[0].full_name, property_name: l[0].property_name, late_count: l.length,
    worst_minutes: Math.max(...l.map((x) => x.minutes_late)), avg_minutes: Math.round(l.reduce((n, x) => n + x.minutes_late, 0) / l.length) }))
    .sort((a, b) => b.late_count - a.late_count || a.full_name.localeCompare(b.full_name));
  res.json({ summary, detail });
}));
router.get('/reports/payroll-summary', wrap(async (req, res) => {
  const slips = await R.salarySlips({ pay_month: v.month(req.query.month) });
  const g = {};
  slips.forEach((s) => { const r = g[s.property_name] ||= { property_name: s.property_name, employees: 0, gross: 0, deductions: 0, tax: 0, net: 0 };
    r.employees++; r.gross += s.payable_basic; r.deductions += s.total_deductions; r.tax += s.tax_deduction; r.net += s.net_salary; });
  res.json(Object.values(g).map((r) => ({ ...r, gross: R.round2(r.gross), deductions: R.round2(r.deductions), tax: R.round2(r.tax), net: R.round2(r.net) })).sort((a, b) => a.property_name.localeCompare(b.property_name)));
}));

router.get('/stats', wrap(async (_req, res) => {
  const [properties, rooms, occupied, tenants, pending, employees, openComplaints, pendingLeaves] = await Promise.all([
    M.Property.countDocuments(), M.Room.find().lean(), M.Allocation.countDocuments({ status: 'Active' }), M.Tenant.countDocuments(),
    M.RentPayment.aggregate([{ $match: { status: 'Pending' } }, { $group: { _id: null, t: { $sum: '$amount' } } }]),
    M.Employee.countDocuments({ is_active: true }), M.Complaint.countDocuments({ status: { $ne: 'Resolved' } }), M.LeaveRequest.countDocuments({ status: 'Pending' })]);
  res.json({ properties, beds: rooms.reduce((n, r) => n + r.capacity, 0), occupied, tenants, pendingRent: pending[0] ? R.round2(pending[0].t) : 0, employees, openComplaints, pendingLeaves });
}));
module.exports = router;
