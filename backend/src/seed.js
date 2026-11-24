// Loads realistic sample data into MongoDB (5 properties, 30 rooms, 31 tenants, 12 employees,
// 3 months of attendance and payroll). Dates are relative to today.   Run:  npm run seed
// Logins:  admin / Admin@123      emp1 ... emp12 / Emp@1234
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { connect, mongoose } = require('./db');
const M = require('./models');
const R = require('./rules');

async function seed() {
  await connect();
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(M.models).map((m) => m.syncIndexes()));

  const m0 = R.monthStart(R.todayStr());
  const m3 = R.addMonths(m0, -1), m2 = R.addMonths(m0, -2), m1 = R.addMonths(m0, -3);
  const back = (d, n) => R.addDays(d, -n), fwd = (d, n) => R.addDays(d, n);
  const put = async (Model, idField, docs) => { docs.forEach((d, i) => { d[idField] = i + 1; }); await Model.insertMany(docs); await M.Counter.updateOne({ _id: Model.collection.name }, { $set: { seq: docs.length } }, { upsert: true }); };

  await put(M.Facility, 'facility_id', ['WiFi', 'AC', 'Meals', 'Laundry', 'Power Backup', 'CCTV', 'Parking', 'Gym', 'RO Water', 'Housekeeping'].map((name) => ({ name })));
  const P = (name, address, area, city, pin_code, latitude, longitude, description, facility_ids) => ({ name, address, area, city, state: 'Haryana', pin_code, latitude, longitude, description, facility_ids });
  await put(M.Property, 'property_id', [
    P('SmartStay Sohna Heights', 'Plot 14, Sector 2, Near Bus Stand', 'Sohna', 'Gurugram', '122103', 28.2476, 77.0661, 'Quiet PG close to Sohna bus stand and Raisina University shuttle.', [1, 3, 5, 6, 9, 10]),
    P('SmartStay Sohna Greens', 'Plot 52, Sector 5, Sohna-Palwal Road', 'Sohna', 'Gurugram', '122103', 28.2395, 77.072, 'Family-run hostel with home-style meals, 5 minutes from the highway.', [1, 3, 5, 6, 9]),
    P('SmartStay Golf Course Road', 'C-31, Sector 54, Golf Course Road', 'Golf Course Road', 'Gurugram', '122011', 28.4335, 77.103, 'Premium PG for working professionals near Rapid Metro.', [1, 2, 4, 5, 6, 7, 8, 9, 10]),
    P('SmartStay Cyber Hub', '88, Sector 24, DLF Phase 3', 'DLF Phase 3', 'Gurugram', '122002', 28.494, 77.089, 'Walking distance to Cyber Hub offices and Millennium City Centre metro.', [1, 2, 4, 5, 6, 9, 10]),
    P('SmartStay Rohtak MDU', '27, Model Town, Near MDU Gate 1', 'Model Town', 'Rohtak', '124001', 28.8742, 76.618, 'Student-friendly hostel next to Maharshi Dayanand University.', [1, 3, 5, 6, 9])]);

  const layout = [['101', 1], ['102', 2], ['103', 2], ['201', 3], ['202', 3], ['203', 4]];
  const base = { 1: 13000, 2: 9500, 3: 7500, 4: 6000 }, factor = { 1: 1.0, 2: 0.95, 3: 1.35, 4: 1.25, 5: 0.8 };
  const rooms = [];
  for (let p = 1; p <= 5; p++) layout.forEach(([room_number, capacity]) => rooms.push({ property_id: p, room_number, capacity, monthly_rent: Math.round(base[capacity] * factor[p] / 100) * 100 }));
  await put(M.Room, 'room_id', rooms);

  const T = (full_name, phone, gender, occupation_type, organisation) => ({ full_name, phone, email: full_name.toLowerCase().replace(/ /g, '.') + '@example.com', gender, occupation_type, organisation });
  await put(M.Tenant, 'tenant_id', [
    T('Aarav Sharma', '9810011001', 'Male', 'Professional', 'Maruti Suzuki, Manesar'), T('Rohan Verma', '9810011002', 'Male', 'Student', 'Raisina University'),
    T('Ishita Gupta', '9810011003', 'Female', 'Student', 'Raisina University'), T('Karan Malhotra', '9810011004', 'Male', 'Professional', 'Hero MotoCorp'),
    T('Priya Singh', '9810011005', 'Female', 'Professional', 'Sohna Civil Hospital'), T('Vikram Yadav', '9810011006', 'Male', 'Professional', 'Hero MotoCorp'),
    T('Ananya Mehta', '9810011007', 'Female', 'Student', 'Raisina University'), T('Rahul Chauhan', '9810011008', 'Male', 'Student', 'Raisina University'),
    T('Sneha Kapoor', '9810011009', 'Female', 'Professional', 'Deloitte USI'), T('Aditya Rana', '9810011010', 'Male', 'Professional', 'Deloitte USI'),
    T('Neha Dahiya', '9810011011', 'Female', 'Student', 'GD Goenka University'), T('Manish Hooda', '9810011012', 'Male', 'Professional', 'Tata Consultancy Services'),
    T('Pooja Rathi', '9810011013', 'Female', 'Professional', 'Tata Consultancy Services'), T('Sandeep Malik', '9810011014', 'Male', 'Student', 'GD Goenka University'),
    T('Kritika Jain', '9810011015', 'Female', 'Student', 'GD Goenka University'), T('Deepak Saini', '9810011016', 'Male', 'Professional', 'Google, Gurugram'),
    T('Nidhi Aggarwal', '9810011017', 'Female', 'Professional', 'Google, Gurugram'), T('Harsh Tyagi', '9810011018', 'Male', 'Professional', 'American Express'),
    T('Simran Kaur', '9810011019', 'Female', 'Professional', 'American Express'), T('Gaurav Nain', '9810011020', 'Male', 'Professional', 'EXL Service'),
    T('Divya Sehrawat', '9810011021', 'Female', 'Professional', 'EXL Service'), T('Mohit Ahlawat', '9810011022', 'Male', 'Professional', 'Genpact'),
    T('Ritu Chaudhary', '9810011023', 'Female', 'Professional', 'Genpact'), T('Ankit Bansal', '9810011024', 'Male', 'Professional', 'Nagarro'),
    T('Shivani Goyal', '9810011025', 'Female', 'Student', 'MDU Rohtak'), T('Yogesh Punia', '9810011026', 'Male', 'Student', 'MDU Rohtak'),
    T('Tanvi Arora', '9810011027', 'Female', 'Student', 'MDU Rohtak'), T('Sahil Dagar', '9810011028', 'Male', 'Student', 'MDU Rohtak'),
    T('Komal Beniwal', '9810011029', 'Female', 'Student', 'MDU Rohtak'), T('Nitin Kadian', '9810011030', 'Male', 'Professional', 'Samsung R&D'),
    T('Aman Khatri', '9810011031', 'Male', 'Student', 'MDU Rohtak')]);

  // [tenant, room, start]  (tenants 8, 15, 24, 29 are recent move-ins)
  const A = (tenant_id, room_id, start_date) => ({ tenant_id, room_id, start_date, end_date: null, status: 'Active' });
  await put(M.Allocation, 'allocation_id', [
    A(1, 1, back(m1, 40)), A(2, 2, back(m1, 70)), A(3, 2, back(m1, 20)), A(4, 3, back(m1, 100)), A(5, 4, back(m1, 15)), A(6, 4, back(m1, 55)), A(7, 4, back(m1, 30)), A(8, 5, fwd(m3, 7)),
    A(9, 7, back(m1, 90)), A(10, 8, back(m1, 60)), A(11, 8, back(m1, 10)), A(12, 9, back(m1, 45)), A(13, 10, back(m1, 25)), A(14, 10, back(m1, 35)), A(15, 11, fwd(m2, 12)),
    A(16, 13, back(m1, 120)), A(17, 14, back(m1, 80)), A(18, 14, back(m1, 33)), A(19, 16, back(m1, 65)), A(20, 16, back(m1, 18)), A(21, 16, back(m1, 5)),
    A(22, 19, back(m1, 75)), A(23, 20, back(m1, 50)), A(24, 20, fwd(m3, 3)),
    A(25, 25, back(m1, 85)), A(26, 26, back(m1, 60)), A(27, 26, back(m1, 22)), A(28, 28, back(m1, 48)), A(29, 28, fwd(m3, 10)),
    { tenant_id: 30, room_id: 12, start_date: back(m1, 150), end_date: back(m1, 20), status: 'Vacated' }]);

  // rent: one row per active stay per month since move-in
  const allocs = await M.Allocation.find({ status: 'Active' }).lean(), roomMap = Object.fromEntries(rooms.map((r, i) => [i + 1, r]));
  const rent = [];
  [[m1, 1], [m2, 2], [m3, 3], [m0, 4]].forEach(([mstart, idx]) => allocs.forEach((a) => {
    if (mstart < R.monthStart(a.start_date)) return;
    const pending = (a.allocation_id + idx) % 7 === 0 || (idx === 4 && a.allocation_id % 3 === 0);
    const when = R.addDays(mstart, (a.allocation_id % 5) + 1);
    rent.push({ allocation_id: a.allocation_id, rent_month: mstart, amount: roomMap[a.room_id].monthly_rent, status: pending ? 'Pending' : 'Paid',
      payment_date: pending ? null : (when > R.todayStr() ? R.todayStr() : when), method: pending ? null : ['UPI', 'Cash', 'Card', 'Bank Transfer'][a.allocation_id % 4] });
  }));
  await put(M.RentPayment, 'rent_id', rent);

  const ago = (days) => new Date(Date.now() - days * 86400000);
  await put(M.Complaint, 'complaint_id', [
    { tenant_id: 1, category: 'Maintenance', description: 'Ceiling fan makes a loud noise at night.', status: 'Resolved', created_at: ago(20), resolved_at: ago(17) },
    { tenant_id: 5, category: 'Facilities', description: 'Hot water is not available in the morning.', status: 'In Progress', created_at: ago(4) },
    { tenant_id: 9, category: 'Room', description: 'Window latch is broken in room 101.', status: 'Open', created_at: ago(2) },
    { tenant_id: 16, category: 'Maintenance', description: 'AC is not cooling properly.', status: 'In Progress', created_at: ago(6) },
    { tenant_id: 19, category: 'Facilities', description: 'WiFi speed drops after 10 pm.', status: 'Open', created_at: ago(1) },
    { tenant_id: 22, category: 'Room', description: 'Need an extra study table.', status: 'Resolved', created_at: ago(25), resolved_at: ago(22) },
    { tenant_id: 25, category: 'Maintenance', description: 'Bathroom tap is leaking.', status: 'Open', created_at: ago(3) },
    { tenant_id: 26, category: 'Other', description: 'Request to change meal timing on weekends.', status: 'Open', created_at: ago(1) }]);
  await put(M.Visitor, 'visitor_id', [
    ['Mahendra Sharma', '9899000101', 1, 1, 9, 'Father visiting'], ['Sunil Gupta', '9899000102', 3, 1, 6, 'Dropping documents'], ['Rekha Rana', '9899000103', 10, 2, 5, 'Mother visiting'],
    ['Piyush Jain', '9899000104', 16, 3, 3, 'Friend - project discussion'], ['Anita Singh', '9899000105', 19, 3, 2, 'Sister visiting'], ['Rakesh Arora', '9899000106', 22, 4, 1, 'Delivering luggage'],
    ['Satbir Punia', '9899000107', 26, 5, 4, 'Father visiting'], ['Kamal Goyal', '9899000108', 25, 5, 1, 'Parent-teacher visit']]
    .map(([visitor_name, phone, tenant_id, property_id, d, purpose]) => ({ visitor_name, phone, tenant_id, property_id, visit_datetime: ago(d), purpose })));

  // ----- employees, logins, tax slabs, leave, attendance, payroll -----
  await put(M.Designation, 'designation_id', ['Manager', 'Warden', 'Security Guard', 'Cleaner'].map((title) => ({ title })));
  const E = (full_name, phone, designation_id, property_id, joining_date, basic_salary) => ({ full_name, phone, email: full_name.toLowerCase().replace(/ /g, '.') + '@smartstay.in', designation_id, property_id, joining_date, basic_salary, is_active: true });
  await put(M.Employee, 'employee_id', [
    E('Rajesh Kumar', '9911022001', 1, 1, back(m1, 40), 42000), E('Sunita Devi', '9911022002', 2, 1, back(m1, 80), 24000), E('Mahesh Yadav', '9911022003', 3, 1, back(m1, 120), 16000),
    E('Pawan Kumar', '9911022004', 4, 1, back(m1, 160), 12000), E('Anil Chauhan', '9911022005', 1, 3, back(m1, 200), 38000), E('Meena Kumari', '9911022006', 2, 3, back(m1, 240), 22000),
    E('Ramesh Singh', '9911022007', 3, 3, back(m1, 280), 16500), E('Geeta Rani', '9911022008', 4, 4, back(m1, 320), 11500), E('Suresh Dahiya', '9911022009', 2, 5, back(m1, 360), 21000),
    E('Jagdish Prasad', '9911022010', 3, 5, back(m1, 400), 15500), E('Bablu Mandal', '9911022011', 3, 2, back(m1, 440), 15000), E('Kavita Sharma', '9911022012', 4, 2, fwd(m1, 9), 12500)]);   // joins mid-month
  await put(M.TaxSlab, 'slab_id', [{ annual_from: 0, annual_to: 240000, rate_percent: 0 }, { annual_from: 240000, annual_to: 480000, rate_percent: 5 }, { annual_from: 480000, annual_to: 720000, rate_percent: 10 }, { annual_from: 720000, annual_to: null, rate_percent: 20 }]);
  const adminHash = await bcrypt.hash('Admin@123', 10), empHash = await bcrypt.hash('Emp@1234', 10);
  await put(M.UserAccount, 'user_id', [{ username: 'admin', password_hash: adminHash, role: 'ADMIN', employee_id: null },
    ...Array.from({ length: 12 }, (_, i) => ({ username: 'emp' + (i + 1), password_hash: empHash, role: 'EMPLOYEE', employee_id: i + 1 }))]);

  const L = (employee_id, start_date, end_date, reason, status, applied_on) => ({ employee_id, start_date, end_date, reason, status, applied_on });
  const today = R.todayStr();
  await put(M.LeaveRequest, 'leave_id', [
    L(2, fwd(m1, 12), fwd(m1, 14), 'Family function', 'Approved', fwd(m1, 5)), L(5, fwd(m2, 19), fwd(m2, 21), 'Medical checkup', 'Approved', fwd(m2, 10)),
    L(7, fwd(m3, 4), fwd(m3, 5), 'Village visit', 'Approved', fwd(m3, 1)), L(4, fwd(m3, 24), fwd(m3, 25), 'Personal work', 'Approved', fwd(m3, 18)),
    L(3, fwd(m2, 14), fwd(m2, 15), 'Short trip', 'Rejected', fwd(m2, 8)), L(9, fwd(today, 5), fwd(today, 6), 'Wedding in family', 'Pending', today), L(10, fwd(today, 8), fwd(today, 8), 'Bank work', 'Pending', today)]);

  // attendance: deterministic pattern, ~5% absent, ~12% late; approved-leave days are skipped
  const emps = await M.Employee.find().lean(), leaves = await M.LeaveRequest.find({ status: 'Approved' }).lean();
  const hms = (s) => [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':');
  const att = [];
  for (const e of emps) for (const d of R.eachDay(e.joining_date > m1 ? e.joining_date : m1, today)) {
    if (R.isSunday(d) || leaves.some((l) => l.employee_id === e.employee_id && d >= l.start_date && d <= l.end_date)) continue;
    const dt = R.parse(d), doy = Math.floor((dt - Date.UTC(dt.getUTCFullYear(), 0, 0)) / 86400000);
    const h = (e.employee_id * 7 + doy * 13) % 100;
    if (h < 5) att.push({ employee_id: e.employee_id, att_date: d, status: 'Absent', check_in: null, check_out: null });
    else if (h < 17) att.push({ employee_id: e.employee_id, att_date: d, status: 'Late', check_in: hms(9 * 3600 + 16 * 60 + (h * 37) % 2400), check_out: hms(17 * 3600 + 1800 + (h * 29) % 3600) });
    else att.push({ employee_id: e.employee_id, att_date: d, status: 'Present', check_in: hms(8 * 3600 + 1800 + (h * 53) % 2700), check_out: hms(17 * 3600 + (h * 29) % 3600) });
  }
  await put(M.Attendance, 'attendance_id', att);
  for (const m of [m1, m2, m3]) await R.generatePayroll(m, null, false);
  const counts = {}; for (const [k, Model] of Object.entries(M.models)) counts[k] = await Model.countDocuments();
  console.log('Seeded:', JSON.stringify(counts));
  await mongoose.disconnect();
}
seed().catch((e) => { console.error(e); process.exit(1); });
