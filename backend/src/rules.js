// Business rules. In the MySQL version these lived in triggers and stored procedures;
// in MongoDB they live here (the service layer) and run for every write, exactly the same rules.
const M = require('./models');
const { withTx } = require('./db');
const { HttpError } = require('./validate');

const bad = (msg) => { throw new HttpError(400, msg); };
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

// ---------- date helpers (dates are 'YYYY-MM-DD' strings) ----------
const parse = (s) => new Date(s + 'T00:00:00Z');
const fmt = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => fmt(new Date(parse(s).getTime() + n * 86400000));
const isSunday = (s) => parse(s).getUTCDay() === 0;
const monthStart = (s) => s.slice(0, 8) + '01';
const monthEnd = (s) => { const d = parse(monthStart(s)); return fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))); };
const addMonths = (s, n) => { const d = parse(monthStart(s)); return fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))); };
const todayStr = () => fmt(new Date(Date.now() + Number(process.env.TZ_OFFSET_MIN || 330) * 60000));   // India time by default
const eachDay = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };
const esc = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------- attendance (was: trigger trg_attendance_bi/bu) ----------
async function validateAttendance(a, selfId = 0) {
  const emp = await M.Employee.findOne({ employee_id: a.employee_id }).lean();
  if (!emp) bad('Attendance error: employee does not exist');
  if (a.att_date < emp.joining_date) bad('Attendance error: date is before joining date');
  if (a.att_date > todayStr()) bad('Attendance error: future dates are not allowed');
  if (isSunday(a.att_date)) bad('Attendance error: Sunday is the weekly off');
  if (await M.Attendance.exists({ employee_id: a.employee_id, att_date: a.att_date, attendance_id: { $ne: selfId } })) bad('Attendance error: duplicate entry for this employee and date');
  if (a.status === 'Absent' && (a.check_in || a.check_out)) bad('Attendance error: Absent record cannot have check-in/out');
  if (a.status === 'Present' || a.status === 'Late') {
    if (!a.check_in) bad('Attendance error: check-in time is required');
    if (a.check_out && a.check_out <= a.check_in) bad('Attendance error: check-out must be after check-in');
    if (a.status === 'Present' && a.check_in > '09:15:00') bad('Attendance error: check-in after 09:15 must be marked Late');
    if (a.status === 'Late' && a.check_in <= '09:15:00') bad('Attendance error: check-in by 09:15 is not Late');
    if (await M.LeaveRequest.exists({ employee_id: a.employee_id, status: 'Approved', start_date: { $lte: a.att_date }, end_date: { $gte: a.att_date } })) bad('Attendance error: employee is on approved leave that day');
  }
}

// ---------- leave (was: trigger trg_leave_bi/bu) ----------
async function validateLeave(l, selfId = 0) {
  if (l.end_date < l.start_date) bad('Leave error: end date is before start date');
  const emp = await M.Employee.findOne({ employee_id: l.employee_id }).lean();
  if (!emp) bad('Leave error: employee does not exist');
  if (l.start_date < emp.joining_date) bad('Leave error: leave starts before joining date');
  if (l.status === 'Pending' || l.status === 'Approved') {
    if (await M.LeaveRequest.exists({ employee_id: l.employee_id, status: 'Approved', leave_id: { $ne: selfId }, start_date: { $lte: l.end_date }, end_date: { $gte: l.start_date } })) bad('Leave error: dates overlap an already approved leave');
  }
  if (l.status === 'Approved' && await M.Attendance.exists({ employee_id: l.employee_id, att_date: { $gte: l.start_date, $lte: l.end_date }, status: { $in: ['Present', 'Late'] } })) bad('Leave error: employee already has attendance on these dates');
}

// ---------- allocation (was: trigger trg_alloc_bi/bu) ----------
async function validateAllocation(a, selfId = 0, session = null) {
  const room = await M.Room.findOne({ room_id: a.room_id }).session(session).lean();
  if (!room) bad('Allocation error: room does not exist');
  if (!(await M.Tenant.exists({ tenant_id: a.tenant_id }))) bad('A referenced record does not exist');
  if (a.status === 'Vacated' && !a.end_date) bad('Allocation error: vacated stay needs an end date');
  if (a.status === 'Active') {
    if (a.end_date) bad('Allocation error: active stay cannot have an end date');
    if (await M.Allocation.exists({ tenant_id: a.tenant_id, status: 'Active', allocation_id: { $ne: selfId } }).session(session)) bad('Allocation error: tenant already has an active room');
    const used = await M.Allocation.countDocuments({ room_id: a.room_id, status: 'Active', allocation_id: { $ne: selfId } }).session(session);
    if (used >= room.capacity) bad('Allocation error: room is already at full capacity');
  }
}
// Create an allocation safely: lock the room inside a transaction, then re-check capacity
async function createAllocation(a) {
  return withTx(async (session) => {
    await M.Room.updateOne({ room_id: a.room_id }, { $inc: { lock_version: 1 } }, { session });
    await validateAllocation(a, 0, session);
    const [doc] = await M.Allocation.create([a], { session });
    return doc.allocation_id;
  });
}

// ---------- tax + salary (was: functions fn_annual_tax, fn_monthly_tax, fn_working_days, fn_leave_days) ----------
async function annualTax(annual) {
  if (annual == null || annual < 0) bad('Annual income cannot be negative');
  const slabs = await M.TaxSlab.find().lean();
  return round2(slabs.reduce((t, s) => t + Math.max(0, Math.min(annual, s.annual_to == null ? 1e12 : s.annual_to) - s.annual_from) * s.rate_percent / 100, 0));
}
const monthlyTax = async (monthlyEarned) => round2((await annualTax(monthlyEarned * 12)) / 12);
const workingDays = (from, to) => eachDay(from, to).filter((d) => !isSunday(d)).length;
async function leaveDays(empId, from, to) {
  const ls = await M.LeaveRequest.find({ employee_id: empId, status: 'Approved', start_date: { $lte: to }, end_date: { $gte: from } }).lean();
  return eachDay(from, to).filter((d) => !isSunday(d) && ls.some((l) => d >= l.start_date && d <= l.end_date)).length;
}

// ---------- payroll (was: procedure sp_generate_payroll, with COMMIT / ROLLBACK) ----------
async function generatePayroll(month, employeeId = null, overwrite = false) {
  if (!month) bad('Payroll error: month is required');
  const start = monthStart(month), end = monthEnd(month);
  if (end >= todayStr()) bad('Payroll error: month is not finished yet');
  if (employeeId != null && !(await M.Employee.exists({ employee_id: employeeId, is_active: true }))) bad('Payroll error: employee not found or inactive');
  const emps = await M.Employee.find({ is_active: true, joining_date: { $lte: end }, ...(employeeId != null ? { employee_id: employeeId } : {}) }).sort({ employee_id: 1 }).lean();
  const rows = []; let skipped = 0;
  for (const e of emps) {
    if (!overwrite && await M.Payroll.exists({ employee_id: e.employee_id, pay_month: start })) { skipped++; continue; }
    const from = e.joining_date > start ? e.joining_date : start;            // joined mid-month
    const wd = workingDays(from, end), full = workingDays(start, end);
    const att = await M.Attendance.find({ employee_id: e.employee_id, att_date: { $gte: from, $lte: end } }).lean();
    const present = att.filter((x) => x.status === 'Present' || x.status === 'Late').length, late = att.filter((x) => x.status === 'Late').length;
    const leave = await leaveDays(e.employee_id, from, end);
    const absent = Math.max(0, wd - present - leave);
    const perDay = e.basic_salary / full;
    const absDed = round2(absent * perDay), lateDed = round2(Math.floor(late / 3) * perDay);
    const earned = Math.max(0, round2(perDay * wd) - absDed - lateDed);
    const tax = await monthlyTax(earned);
    rows.push({ employee_id: e.employee_id, pay_month: start, basic_salary: e.basic_salary, working_days: wd, days_present: present, approved_leave_days: leave, days_absent: absent,
      late_marks: late, absence_deduction: absDed, late_deduction: lateDed, tax_deduction: tax, net_salary: round2(earned - tax) });
  }
  await withTx(async (session) => {                       // all rows saved together, or none
    if (overwrite) await M.Payroll.deleteMany({ pay_month: start, employee_id: { $in: rows.map((r) => r.employee_id) } }, { session });
    for (const r of rows) await M.Payroll.create([r], { session });
  });
  return { rows_generated: rows.length, rows_skipped: skipped, pay_month: start };
}

// ---------- read helpers (were: SQL views) ----------
const sharingType = (c) => (c === 1 ? 'Single' : c === 2 ? 'Double' : c === 3 ? 'Triple' : `${c}-sharing`);
async function roomAvailability(filter = {}) {                 // v_room_availability
  const rooms = await M.Room.find(filter).select('-_id -lock_version').lean();
  const occ = await M.Allocation.aggregate([{ $match: { status: 'Active' } }, { $group: { _id: '$room_id', n: { $sum: 1 } } }]);
  const map = Object.fromEntries(occ.map((o) => [o._id, o.n]));
  return rooms.map((r) => ({ ...r, sharing_type: sharingType(r.capacity), occupied: map[r.room_id] || 0, available_beds: r.capacity - (map[r.room_id] || 0) }));
}
async function propertyPublic(filter = {}) {                  // v_property_public
  const props = await M.Property.find(filter).select('-_id').lean();
  const rooms = await roomAvailability();
  const facs = Object.fromEntries((await M.Facility.find().lean()).map((f) => [f.facility_id, f.name]));
  return props.map(({ facility_ids, ...p }) => {
    const rs = rooms.filter((r) => r.property_id === p.property_id);
    return { ...p, min_rent: rs.length ? Math.min(...rs.map((r) => r.monthly_rent)) : null, max_rent: rs.length ? Math.max(...rs.map((r) => r.monthly_rent)) : null,
      total_beds: rs.reduce((n, r) => n + r.capacity, 0), available_beds: rs.reduce((n, r) => n + r.available_beds, 0),
      facilities: (facility_ids || []).map((id) => facs[id]).filter(Boolean).sort().join(', ') || null };
  }).sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
}
async function salarySlips(filter = {}) {                      // v_salary_slip
  const pays = await M.Payroll.find(filter).select('-_id').lean();
  const emps = Object.fromEntries((await M.Employee.find().lean()).map((e) => [e.employee_id, e]));
  const des = Object.fromEntries((await M.Designation.find().lean()).map((d) => [d.designation_id, d.title]));
  const props = Object.fromEntries((await M.Property.find().lean()).map((p) => [p.property_id, p.name]));
  return pays.map((p) => {
    const e = emps[p.employee_id] || {};
    return { payroll_id: p.payroll_id, employee_id: p.employee_id, full_name: e.full_name, designation: des[e.designation_id], property_name: props[e.property_id], pay_month: p.pay_month,
      basic_salary: p.basic_salary, payable_basic: round2(p.basic_salary * p.working_days / workingDays(p.pay_month, monthEnd(p.pay_month))),
      working_days: p.working_days, days_present: p.days_present, approved_leave_days: p.approved_leave_days, days_absent: p.days_absent, late_marks: p.late_marks,
      absence_deduction: p.absence_deduction, late_deduction: p.late_deduction, tax_deduction: p.tax_deduction,
      total_deductions: round2(p.absence_deduction + p.late_deduction + p.tax_deduction), net_salary: p.net_salary, generated_at: p.generated_at };
  }).sort((a, b) => (a.pay_month < b.pay_month ? 1 : a.pay_month > b.pay_month ? -1 : (a.full_name || '').localeCompare(b.full_name || '')));
}

module.exports = { round2, parse, fmt, addDays, isSunday, monthStart, monthEnd, addMonths, todayStr, eachDay, esc,
  validateAttendance, validateLeave, validateAllocation, createAllocation, annualTax, monthlyTax, workingDays, leaveDays, generatePayroll,
  sharingType, roomAvailability, propertyPublic, salarySlips };
