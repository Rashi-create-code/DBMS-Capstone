// Test runner.  Usage:  npm run seed   (fresh sample data)   then   npm test
// Covers valid / invalid / boundary cases, role-based access, NoSQL-injection and transactions.
// Every test cleans up after itself, so the sample data is left untouched.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const http = require('http');
const { connect, mongoose, withTx, state } = require('../src/db');
const M = require('../src/models');
const R = require('../src/rules');
const app = require('../src/server');

const results = [];
async function test(group, name, expected, fn) {
  let actual, pass = false;
  try { const r = await fn(); pass = r.ok; actual = r.msg; } catch (e) { actual = 'Test crashed: ' + e.message; }
  results.push({ group, name, expected, actual, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${group}] ${name}  ->  ${actual}`);
}
let BASE;
async function api(method, url, body, token) {
  const res = await fetch(BASE + url, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const err = (r) => (r.json && r.json.error) || '';
const rejected = (r, text, status = 400) => (r.status === status && (!text || err(r).toLowerCase().includes(text.toLowerCase())) ? { ok: true, msg: `Rejected (HTTP ${r.status}): ${err(r)}` } : { ok: false, msg: `Expected HTTP ${status} "${text || ''}", got HTTP ${r.status} ${err(r)}` });
const accepted = (r, status = 201) => (r.status === status ? { ok: true, msg: `Accepted (HTTP ${r.status})` } : { ok: false, msg: `Expected HTTP ${status}, got HTTP ${r.status} ${err(r)}` });
const login = async (u, p) => (await api('POST', '/api/auth/login', { username: u, password: p })).json?.token;

(async () => {
  await connect();
  const server = http.createServer(app).listen(0); BASE = `http://127.0.0.1:${server.address().port}`;
  const admin = await login('admin', 'Admin@123'), emp3 = await login('emp3', 'Emp@1234');
  const today = R.todayStr(), m0 = R.monthStart(today), lastMonth = R.addMonths(m0, -1).slice(0, 7), thisMonth = m0.slice(0, 7);
  const wd = (await M.Attendance.find({ employee_id: 1, att_date: { $lt: today } }).sort({ att_date: -1 }).limit(1).lean())[0].att_date;   // a recent working day for employee 1
  const lv = await M.LeaveRequest.findOne({ status: 'Approved' }).sort({ leave_id: 1 }).lean();
  const sunday = R.eachDay(R.addDays(today, -7), R.addDays(today, -1)).find(R.isSunday);

  // post an attendance entry for employee 1 on day `wd` after freeing that slot; always restores the original record
  async function tryAtt(body, emp = 1, date = wd) {
    const orig = await M.Attendance.findOne({ employee_id: emp, att_date: date }).lean();
    if (orig) await M.Attendance.deleteOne({ attendance_id: orig.attendance_id });
    try {
      const r = await api('POST', '/api/admin/attendance', { employeeId: emp, date, ...body }, admin);
      if (r.json?.attendanceId) await M.Attendance.deleteOne({ attendance_id: r.json.attendanceId });
      return r;
    } finally { if (orig) await M.Attendance.collection.insertOne(orig); }
  }
  const cleanupLeave = (r) => r.json?.leaveId && M.LeaveRequest.deleteOne({ leave_id: r.json.leaveId });
  const lvTok = await login('emp' + lv.employee_id, 'Emp@1234');

  // ------------------------------------------------------------------ Attendance rules
  await test('Attendance', 'Valid Present entry (on time)', 'Accepted', async () => accepted(await tryAtt({ status: 'Present', checkIn: '08:55', checkOut: '17:10' })));
  await test('Attendance', 'Boundary: check-in exactly 09:15 is Present', 'Accepted', async () => accepted(await tryAtt({ status: 'Present', checkIn: '09:15', checkOut: '17:10' })));
  await test('Attendance', 'Boundary: 09:16 marked Late', 'Accepted', async () => accepted(await tryAtt({ status: 'Late', checkIn: '09:16', checkOut: '17:10' })));
  await test('Attendance', 'Duplicate entry same employee + date', 'Rejected (duplicate)', async () => rejected(await api('POST', '/api/admin/attendance', { employeeId: 1, date: wd, status: 'Present', checkIn: '08:55' }, admin), 'duplicate'));
  await test('Attendance', 'Boundary: 09:16 marked Present', 'Rejected (must be Late)', async () => rejected(await tryAtt({ status: 'Present', checkIn: '09:16' }), 'must be marked Late'));
  await test('Attendance', 'Check-out before check-in', 'Rejected', async () => rejected(await tryAtt({ status: 'Present', checkIn: '09:00', checkOut: '08:00' }), 'check-out must be after'));
  await test('Attendance', 'Absent with check-in time', 'Rejected', async () => rejected(await tryAtt({ status: 'Absent', checkIn: '09:00' }), 'Absent record cannot'));
  await test('Attendance', 'Present without check-in', 'Rejected', async () => rejected(await tryAtt({ status: 'Present' }), 'check-in time is required'));
  await test('Attendance', 'Future date', 'Rejected', async () => rejected(await tryAtt({ status: 'Present', checkIn: '09:00' }, 1, R.addDays(today, 3)), 'future dates'));
  await test('Attendance', 'Sunday (weekly off)', 'Rejected', async () => rejected(await tryAtt({ status: 'Present', checkIn: '09:00' }, 1, sunday), 'Sunday'));
  await test('Attendance', 'Date before joining date', 'Rejected', async () => rejected(await tryAtt({ status: 'Present', checkIn: '09:00' }, 12, '2020-01-06'), 'before joining'));
  await test('Attendance', 'Present on an approved-leave day', 'Rejected', async () => {
    const d = R.eachDay(lv.start_date, lv.end_date).find((x) => !R.isSunday(x));
    return rejected(await tryAtt({ status: 'Present', checkIn: '09:00' }, lv.employee_id, d), 'approved leave');
  });

  // ------------------------------------------------------------------ Leave rules
  const leaveReq = (s, e, tok = lvTok, extra = {}) => api('POST', '/api/me/leaves', { startDate: s, endDate: e, reason: 'Test leave', ...extra }, tok);
  await test('Leave', 'Overlapping request over approved leave', 'Rejected (overlap)', async () => rejected(await leaveReq(lv.start_date, lv.start_date), 'overlap'));
  await test('Leave', 'Boundary: starts the day after approved leave ends', 'Accepted', async () => { const r = await leaveReq(R.addDays(lv.end_date, 1), R.addDays(lv.end_date, 2)); await cleanupLeave(r); return accepted(r); });
  await test('Leave', 'Boundary: overlaps only on the last day', 'Rejected (overlap)', async () => rejected(await leaveReq(lv.end_date, R.addDays(lv.end_date, 2)), 'overlap'));
  await test('Leave', 'End date before start date', 'Rejected', async () => rejected(await leaveReq(today, R.addDays(today, -3)), 'end date is before'));
  await test('Leave', 'Same overlapping dates, different employee', 'Accepted', async () => {
    const other = lv.employee_id === 1 ? 2 : 1; const r = await leaveReq(lv.start_date, lv.end_date, await login('emp' + other, 'Emp@1234')); await cleanupLeave(r); return accepted(r);
  });
  await test('Leave', 'Employee cannot choose the status of own request', 'Saved as Pending', async () => {
    const r = await leaveReq('2027-04-01', '2027-04-02', emp3, { status: 'Approved' });
    const d = await M.LeaveRequest.findOne({ leave_id: r.json?.leaveId || 0 }).lean(); await cleanupLeave(r);
    return { ok: r.status === 201 && d.status === 'Pending', msg: `HTTP ${r.status}, status ${d?.status}` };
  });

  // ------------------------------------------------------------------ Salary / payroll
  const newEmp = (sal, n = 1) => ({ fullName: 'Test Person', phone: '900000000' + n, designationId: 4, propertyId: 1, joiningDate: today, basicSalary: sal, username: 'testuser' + n, password: 'Password1' });
  const removeEmp = async (r) => { if (r.json?.employeeId) { await M.UserAccount.deleteOne({ employee_id: r.json.employeeId }); await M.Employee.deleteOne({ employee_id: r.json.employeeId }); } };
  await test('Payroll', 'Negative basic salary', 'Rejected', async () => rejected(await api('POST', '/api/admin/employees', newEmp(-5000), admin), 'basicSalary'));
  await test('Payroll', 'Negative salary stopped by the schema too (second line of defence)', 'Rejected by database schema', async () => {
    try { await M.Employee.create({ full_name: 'X', phone: '9000000009', designation_id: 1, property_id: 1, joining_date: today, basic_salary: -1 }); return { ok: false, msg: 'NOT rejected' }; }
    catch (e) { return { ok: e.name === 'ValidationError', msg: e.message }; }
  });
  await test('Payroll', 'Boundary: zero basic salary', 'Rejected', async () => rejected(await api('POST', '/api/admin/employees', newEmp(0), admin), 'basicSalary'));
  await test('Payroll', 'Boundary: smallest valid salary 0.01', 'Accepted', async () => { const r = await api('POST', '/api/admin/employees', newEmp(0.01, 2), admin); await removeEmp(r); return accepted(r); });
  await test('Payroll', 'Tax at slab edge (20000/month = 2,40,000/yr)', 'Tax = 0', async () => { const t = await R.monthlyTax(20000); return { ok: t === 0, msg: 'tax = ' + t }; });
  await test('Payroll', 'Tax just above edge (20100/month)', 'Tax = 5.00', async () => { const t = await R.monthlyTax(20100); return { ok: t === 5, msg: 'tax = ' + t }; });
  await test('Payroll', 'Tax for 38000/month (2 slabs)', 'Tax = 900.00', async () => { const t = await R.monthlyTax(38000); return { ok: t === 900, msg: 'tax = ' + t }; });
  await test('Payroll', 'Negative annual income', 'Rejected', async () => { try { await R.annualTax(-1); return { ok: false, msg: 'NOT rejected' }; } catch (e) { return { ok: /negative/.test(e.message), msg: e.message }; } });
  await test('Payroll', 'Generate payroll for current (unfinished) month', 'Rejected', async () => rejected(await api('POST', '/api/admin/payroll/generate', { month: thisMonth }, admin), 'not finished'));
  await test('Payroll', 'Generate again for finished month (no duplicates)', 'rows_generated 0, rows_skipped 12', async () => {
    const r = await api('POST', '/api/admin/payroll/generate', { month: lastMonth }, admin);
    return { ok: r.status === 200 && r.json.rows_generated === 0 && r.json.rows_skipped === 12, msg: JSON.stringify(r.json) };
  });
  await test('Payroll', 'Recalculate with overwrite (same results, still 12 rows)', 'rows_generated 12', async () => {
    const sum = async () => (await M.Payroll.find({ pay_month: lastMonth + '-01' }).lean()).reduce((n, p) => n + p.net_salary, 0);
    const before = R.round2(await sum());
    const r = await api('POST', '/api/admin/payroll/generate', { month: lastMonth, overwrite: true }, admin);
    const after = R.round2(await sum());
    return { ok: r.json.rows_generated === 12 && before === after && (await M.Payroll.countDocuments({ pay_month: lastMonth + '-01' })) === 12, msg: `net total before ${before}, after ${after}` };
  });
  await test('Payroll', 'Net salary never exceeds basic salary', 'No rows violate', async () => { const n = (await M.Payroll.find().lean()).filter((p) => p.net_salary > p.basic_salary).length; return { ok: n === 0, msg: n + ' violating rows' }; });
  await test('Transactions', 'ROLLBACK: valid payroll row followed by an invalid one', 'Nothing saved', async () => {
    const before = await M.Payroll.countDocuments();
    const row = (e, net) => ({ employee_id: e, pay_month: '2019-01-01', basic_salary: 40000, working_days: 26, days_present: 26, approved_leave_days: 0, days_absent: 0, late_marks: 0, absence_deduction: 0, late_deduction: 0, tax_deduction: 0, net_salary: net });
    try { await withTx(async (s) => { await M.Payroll.create([row(1, 40000)], { session: s }); await M.Payroll.create([row(2, -1)], { session: s }); }); } catch {}
    const after = await M.Payroll.countDocuments(); await M.Payroll.deleteMany({ pay_month: '2019-01-01' });
    if (!state.transactions) return { ok: true, msg: 'Skipped: standalone MongoDB has no transactions (Atlas and replica sets do)' };
    return { ok: before === after, msg: `rows before ${before}, after ${after}` };
  });
  await test('Transactions', 'COMMIT: payroll result is persisted', '12 rows exist for last month', async () => { const n = await M.Payroll.countDocuments({ pay_month: lastMonth + '-01' }); return { ok: n === 12, msg: n + ' rows' }; });

  // ------------------------------------------------------------------ Rooms and allocation
  const alloc = (tenantId, roomId) => api('POST', '/api/admin/allocations', { tenantId, roomId, startDate: today }, admin);
  const dropAlloc = (r) => r.json?.allocationId && M.Allocation.deleteOne({ allocation_id: r.json.allocationId });
  await test('Rooms', 'Allocate tenant into a full room', 'Rejected (capacity)', async () => rejected(await alloc(31, 1), 'full capacity'));
  await test('Rooms', 'Tenant who already has an active room', 'Rejected', async () => rejected(await alloc(1, 6), 'already has an active room'));
  await test('Rooms', 'Boundary: last free bed in a 4-sharing room', 'Accepted', async () => { const r = await alloc(31, 6); await dropAlloc(r); return accepted(r); });
  await test('Rooms', 'Boundary: fill the last bed, then one more', 'Rejected', async () => {
    const r1 = await alloc(31, 4); const r = await alloc(30, 4);     // room 4 (3 beds) already has 3 tenants
    await dropAlloc(r1); await dropAlloc(r); return rejected(r, 'full capacity');
  });
  await test('Rooms', 'Two admins take the same last bed at the same time', 'Exactly one succeeds', async () => {
    const [a, b] = await Promise.all([alloc(31, 3), alloc(30, 3)]);   // room 3 holds 2 and has 1 free bed
    await dropAlloc(a); await dropAlloc(b);
    const codes = [a.status, b.status].sort();
    return { ok: codes[0] === 201 && codes[1] === 400, msg: `results: HTTP ${a.status} and HTTP ${b.status}` };
  });
  await test('Rent', 'Duplicate rent record for same month', 'Rejected', async () => {
    const one = await M.RentPayment.findOne().lean();
    try { await M.RentPayment.create({ allocation_id: one.allocation_id, rent_month: one.rent_month, amount: one.amount }); return { ok: false, msg: 'NOT rejected' }; }
    catch (e) { return { ok: e.code === 11000, msg: 'Rejected: duplicate key' }; }
  });
  await test('Rent', 'Record payment without a payment date', 'HTTP 400', async () => { const p = await M.RentPayment.findOne({ status: 'Pending' }).lean(); return rejected(await api('PUT', `/api/admin/rent/${p.rent_id}/pay`, { amount: p.amount, method: 'UPI' }, admin), 'paymentDate'); });
  await test('Rent', 'Pay a rent record that does not exist', 'HTTP 404', async () => rejected(await api('PUT', '/api/admin/rent/999999/pay', { amount: 5000, paymentDate: today, method: 'UPI' }, admin), '', 404));

  // ------------------------------------------------------------------ Authentication + access control
  await test('Access', 'Admin login with correct password', 'HTTP 200 + token', async () => ({ ok: !!admin, msg: admin ? 'token received' : 'no token' }));
  await test('Access', 'Login with wrong password', 'HTTP 401', async () => rejected(await api('POST', '/api/auth/login', { username: 'admin', password: 'wrong' }), '', 401));
  await test('Access', 'Login with empty fields', 'HTTP 400', async () => rejected(await api('POST', '/api/auth/login', {}), '', 400));
  await test('Access', 'NoSQL injection in login ({"$gt":""})', 'HTTP 401, no token', async () => { const r = await api('POST', '/api/auth/login', { username: { $gt: '' }, password: { $gt: '' } }); return { ok: r.status === 401 && !r.json.token, msg: `HTTP ${r.status}` }; });
  await test('Access', 'Admin API without token', 'HTTP 401', async () => rejected(await api('GET', '/api/admin/employees'), '', 401));
  await test('Access', 'Admin API with a forged token', 'HTTP 401', async () => rejected(await api('GET', '/api/admin/employees', null, 'abc.def.ghi'), '', 401));
  await test('Access', 'Employee calls admin employee list', 'HTTP 403', async () => rejected(await api('GET', '/api/admin/employees', null, emp3), '', 403));
  await test('Access', 'Employee calls admin payroll generate', 'HTTP 403', async () => rejected(await api('POST', '/api/admin/payroll/generate', { month: lastMonth }, emp3), '', 403));
  await test('Access', 'Employee tries to approve a leave request', 'HTTP 403', async () => rejected(await api('PUT', '/api/admin/leaves/1/status', { status: 'Approved' }, emp3), '', 403));
  await test('Access', 'Admin calls employee self-service route', 'HTTP 403', async () => rejected(await api('GET', '/api/me/profile', null, admin), '', 403));
  await test('Access', 'Employee sees only own salary slips', 'All rows belong to employee 3', async () => {
    const r = await api('GET', '/api/me/salary-slips', null, emp3);
    return { ok: r.status === 200 && r.json.length === 3 && r.json.every((x) => x.employee_id === 3), msg: `${r.json.length} slips, ids: ${[...new Set(r.json.map((x) => x.employee_id))]}` };
  });
  await test('Access', 'Employee tries ?employeeId=2 to read another slip', 'Still own data only', async () => {
    const r = await api('GET', '/api/me/salary-slips?employeeId=2', null, emp3); return { ok: r.json.every((x) => x.employee_id === 3), msg: 'ids: ' + [...new Set(r.json.map((x) => x.employee_id))] };
  });
  await test('Access', 'Employee reads own attendance', 'HTTP 200, own rows', async () => { const r = await api('GET', `/api/me/attendance?month=${lastMonth}`, null, emp3); return { ok: r.status === 200 && r.json.length > 20, msg: r.json.length + ' rows' }; });
  await test('Access', 'Employee submits a leave request (valid)', 'HTTP 201, status Pending', async () => {
    const r = await leaveReq('2027-03-01', '2027-03-02', emp3); const d = await M.LeaveRequest.findOne({ leave_id: r.json?.leaveId || 0 }).lean(); await cleanupLeave(r);
    return { ok: r.status === 201 && d.status === 'Pending', msg: `HTTP ${r.status}, status ${d?.status}` };
  });

  // ------------------------------------------------------------------ Input validation
  await test('Validation', 'Create employee with invalid phone', 'HTTP 400', async () => rejected(await api('POST', '/api/admin/employees', { ...newEmp(10000, 3), phone: '12345' }, admin), 'phone'));
  await test('Transactions', 'Employee + login are atomic (duplicate username)', 'HTTP 409, no orphan employee', async () => {
    const r = await api('POST', '/api/admin/employees', { ...newEmp(10000, 4), username: 'emp1' }, admin);
    const left = await M.Employee.countDocuments({ phone: '9000000004' });
    return { ok: r.status === 409 && left === 0, msg: `HTTP ${r.status}, employees left behind: ${left}` };
  });
  await test('Validation', 'Duplicate attendance through the API', 'HTTP 400', async () => rejected(await api('POST', '/api/admin/attendance', { employeeId: 1, date: wd, status: 'Present', checkIn: '08:50' }, admin), 'duplicate'));
  await test('Validation', 'Payroll month in bad format', 'HTTP 400', async () => rejected(await api('POST', '/api/admin/payroll/generate', { month: 'October' }, admin), 'month'));
  await test('Validation', 'Room with capacity 7 (above limit)', 'HTTP 400', async () => rejected(await api('POST', '/api/admin/rooms', { propertyId: 1, roomNumber: '999', capacity: 7, monthlyRent: 5000 }, admin), 'capacity'));
  await test('Validation', 'NoSQL injection text in property search', 'HTTP 200, no rows, no error', async () => {
    const r = await api('GET', '/api/public/properties?q[$ne]=x'); const r2 = await api('GET', '/api/public/properties?q=' + encodeURIComponent('.*'));
    return { ok: r.status === 200 && r.json.length === 0 && r2.status === 200 && r2.json.length === 0, msg: `HTTP ${r.status}/${r2.status}, ${r.json.length}/${r2.json.length} rows` };
  });
  await test('Validation', 'Complaint from unknown phone number', 'HTTP 400', async () => rejected(await api('POST', '/api/public/complaints', { phone: '9999999999', category: 'Room', description: 'Window is broken in the room' }), 'No current tenant'));

  // ------------------------------------------------------------------ Enquiry (homepage)
  await test('Enquiry', 'Visitor sends a valid enquiry', 'HTTP 201, status New', async () => {
    const r = await api('POST', '/api/public/enquiries', { propertyId: 1, name: 'Test Visitor', phone: '9876543210', message: 'Is a double room available next month?' });
    const d = await M.Enquiry.findOne({ enquiry_id: r.json?.enquiryId || 0 }).lean(); await M.Enquiry.deleteOne({ enquiry_id: r.json?.enquiryId || 0 });
    return { ok: r.status === 201 && d.status === 'New', msg: `HTTP ${r.status}, status ${d?.status}` };
  });
  await test('Enquiry', 'Enquiry with invalid phone number', 'HTTP 400', async () => rejected(await api('POST', '/api/public/enquiries', { name: 'Bad Phone', phone: '12345', message: 'Hello there' }), 'phone'));
  await test('Enquiry', 'Enquiry with empty message', 'HTTP 400', async () => rejected(await api('POST', '/api/public/enquiries', { name: 'No Msg', phone: '9876543210', message: '' }), 'message'));

  // ------------------------------------------------------------------ Public site + admin lists
  await test('Public', 'Filter "Any" (sharing=0) lists every PG', 'HTTP 200, all 5 properties', async () => {
    const r = await api('GET', '/api/public/properties?sharing=0&availableOnly=1'); return { ok: r.status === 200 && r.json.length === 5 && r.json.every((p) => p.match_min_rent > 0), msg: `HTTP ${r.status}, ${r.json.length} properties` };
  });
  await test('Public', 'Sharing filter returns only matching rooms', 'Every returned room is a Double', async () => {
    const r = await api('GET', '/api/public/properties?sharing=2'); const rooms = r.json.flatMap((p) => p.matching_rooms);
    return { ok: r.json.length > 0 && rooms.every((x) => x.capacity === 2), msg: `${r.json.length} properties, ${rooms.length} double rooms` };
  });
  await test('Public', 'Property search filter: Rohtak + max rent 5000', 'Returns Rohtak property', async () => {
    const r = await api('GET', '/api/public/properties?city=Rohtak&maxRent=5000'); return { ok: r.status === 200 && r.json.length === 1 && r.json[0].city === 'Rohtak', msg: r.json.map((p) => p.name).join(', ') };
  });
  await test('Public', 'Public response has no admin data', 'No salary/phone fields', async () => {
    const r = await api('GET', '/api/public/properties'); const keys = Object.keys(r.json[0]);
    return { ok: !keys.some((k) => /salary|phone|password|email|_id$/.test(k) && k !== 'property_id'), msg: 'fields: ' + keys.join(', ') };
  });
  await test('Public', 'Coordinates come from the database', 'Golf Course Road at 28.4335, 77.103', async () => {
    const r = await api('GET', '/api/public/properties?q=Golf'); const p = r.json[0]; return { ok: p && p.latitude === 28.4335 && p.longitude === 77.103, msg: p ? `${p.name} ${p.latitude}, ${p.longitude}` : 'not found' };
  });
  await test('Tenants', 'Tenant list shows check-in and check-out for past stays', 'Vacated tenant has an end date', async () => {
    const r = await api('GET', '/api/admin/tenants', null, admin); const t = r.json.find((x) => x.stay_status === 'Vacated');
    return { ok: !!t && !!t.end_date && !!t.start_date, msg: t ? `${t.full_name}: ${t.start_date} to ${t.end_date}` : 'no vacated tenant' };
  });
  await test('Admin', 'Dashboard numbers match the data', 'properties 5, tenants 31, employees 12', async () => {
    const r = await api('GET', '/api/admin/stats', null, admin); return { ok: r.json.properties === 5 && r.json.tenants === 31 && r.json.employees === 12, msg: JSON.stringify(r.json) };
  });
  await test('Admin', 'Admin portal has no enquiries page', 'HTTP 404', async () => rejected(await api('GET', '/api/admin/enquiries', null, admin), '', 404));

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} tests passed`);
  const md = ['# SmartStay (MongoDB) - Test Results', '', `Run on ${new Date().toISOString().slice(0, 10)} against MongoDB 7. **${passed} of ${results.length} tests passed.**`, '',
    '| # | Group | Test | Expected | Actual | Result |', '|---|---|---|---|---|---|',
    ...results.map((r, i) => `| ${i + 1} | ${r.group} | ${r.name} | ${r.expected} | ${String(r.actual).replace(/\|/g, '/').replace(/\n/g, ' ')} | ${r.pass ? 'PASS' : '**FAIL**'} |`)].join('\n');
  fs.writeFileSync(path.join(__dirname, '..', '..', 'docs', 'TEST_RESULTS.md'), md + '\n');
  server.close(); await mongoose.disconnect();
  process.exit(passed === results.length ? 0 : 1);
})();
