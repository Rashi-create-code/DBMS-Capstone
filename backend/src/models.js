// MongoDB collections. Field names match the SQL version so the API and website stay identical.
// Every collection has a small integer id (property_id, room_id ...) from an atomic counter.
const { mongoose } = require('./db');
const { Schema } = mongoose;

const Counter = mongoose.model('Counter', new Schema({ _id: String, seq: { type: Number, default: 0 } }, { versionKey: false }));
async function nextId(name, session) {
  const c = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, new: true, session });
  return c.seq;
}
function make(name, idField, def, setup) {
  const s = new Schema({ [idField]: { type: Number }, ...def }, { versionKey: false, collection: name });
  s.pre('validate', async function () { if (this.isNew && this[idField] == null) this[idField] = await nextId(name, this.$session()); });
  s.index({ [idField]: 1 }, { unique: true });
  if (setup) setup(s);
  return mongoose.model(name, s);
}
const str = (extra = {}) => ({ type: String, trim: true, ...extra });
const money = (extra = {}) => ({ type: Number, ...extra });
const dateStr = (extra = {}) => ({ type: String, match: /^\d{4}-\d{2}-\d{2}$/, ...extra });   // 'YYYY-MM-DD'
const timeStr = (extra = {}) => ({ type: String, match: /^\d{2}:\d{2}:\d{2}$/, ...extra });   // 'HH:MM:SS'
const phone = (extra = {}) => str({ match: [/^[6-9]\d{9}$/, 'phone must be a valid 10-digit mobile number'], ...extra });

const Property = make('property', 'property_id', {
  name: str({ required: true, maxlength: 100, unique: true }), address: str({ required: true, maxlength: 200 }),
  area: str({ required: true, maxlength: 80 }), city: str({ required: true, maxlength: 60 }), state: str({ default: 'Haryana', maxlength: 60 }),
  pin_code: str({ required: true, match: [/^\d{6}$/, 'pin_code must be 6 digits'] }),
  latitude: { type: Number, required: true, min: -90, max: 90 }, longitude: { type: Number, required: true, min: -180, max: 180 },
  description: str({ maxlength: 300, default: null }),
  facility_ids: { type: [Number], default: [] }                       // replaces the property_facility junction table
});
const Facility = make('facility', 'facility_id', { name: str({ required: true, unique: true }) });
const Room = make('room', 'room_id', {
  property_id: { type: Number, required: true }, room_number: str({ required: true, maxlength: 10 }),
  capacity: { type: Number, required: true, min: 1, max: 6, validate: Number.isInteger },
  monthly_rent: money({ required: true, min: [1, 'monthly_rent must be positive'] }),
  lock_version: { type: Number, default: 0 }                          // touched inside a transaction so two admins cannot take the last bed together
}, (s) => s.index({ property_id: 1, room_number: 1 }, { unique: true }));
const Tenant = make('tenant', 'tenant_id', {
  full_name: str({ required: true, maxlength: 100 }), phone: phone({ required: true, unique: true }), email: str({ default: null, maxlength: 120 }),
  gender: { type: String, enum: ['Male', 'Female', 'Other'], required: true }, occupation_type: { type: String, enum: ['Student', 'Professional'], required: true },
  organisation: str({ default: null, maxlength: 100 })
});
const Allocation = make('allocation', 'allocation_id', {
  tenant_id: { type: Number, required: true }, room_id: { type: Number, required: true },
  start_date: dateStr({ required: true }), end_date: dateStr({ default: null }),
  status: { type: String, enum: ['Active', 'Vacated'], default: 'Active' }
}, (s) => { s.index({ tenant_id: 1 }, { unique: true, partialFilterExpression: { status: 'Active' } }); s.index({ room_id: 1, status: 1 }); });
const RentPayment = make('rent_payment', 'rent_id', {
  allocation_id: { type: Number, required: true }, rent_month: dateStr({ required: true }), amount: money({ required: true, min: [0.01, 'amount must be positive'] }),
  status: { type: String, enum: ['Pending', 'Paid'], default: 'Pending' }, payment_date: dateStr({ default: null }),
  method: { type: String, enum: ['Cash', 'UPI', 'Card', 'Bank Transfer', null], default: null }
}, (s) => { s.index({ allocation_id: 1, rent_month: 1 }, { unique: true }); s.index({ rent_month: 1, status: 1 }); });
const Complaint = make('complaint', 'complaint_id', {
  tenant_id: { type: Number, required: true }, category: { type: String, enum: ['Room', 'Maintenance', 'Facilities', 'Other'], required: true },
  description: str({ required: true, maxlength: 500 }), status: { type: String, enum: ['Open', 'In Progress', 'Resolved'], default: 'Open' },
  created_at: { type: Date, default: Date.now }, resolved_at: { type: Date, default: null }
}, (s) => s.index({ status: 1, created_at: -1 }));
const Visitor = make('visitor', 'visitor_id', {
  visitor_name: str({ required: true, maxlength: 100 }), phone: phone({ required: true }), tenant_id: { type: Number, required: true },
  property_id: { type: Number, required: true }, visit_datetime: { type: Date, required: true }, purpose: str({ required: true, maxlength: 150 })
}, (s) => s.index({ property_id: 1, visit_datetime: -1 }));
const Enquiry = make('enquiry', 'enquiry_id', {
  property_id: { type: Number, default: null }, name: str({ required: true, maxlength: 100 }), phone: phone({ required: true }), email: str({ default: null, maxlength: 120 }),
  message: str({ required: true, maxlength: 500 }), status: { type: String, enum: ['New', 'Contacted', 'Closed'], default: 'New' }, created_at: { type: Date, default: Date.now }
});
const Designation = make('designation', 'designation_id', { title: str({ required: true, unique: true }) });
const Employee = make('employee', 'employee_id', {
  full_name: str({ required: true, maxlength: 100 }), phone: phone({ required: true, unique: true }), email: str({ default: null, maxlength: 120 }),
  designation_id: { type: Number, required: true }, property_id: { type: Number, required: true }, joining_date: dateStr({ required: true }),
  basic_salary: money({ required: true, min: [0.01, 'basic_salary must be greater than zero'] }), is_active: { type: Boolean, default: true }
});
const UserAccount = make('user_account', 'user_id', {
  username: str({ required: true, unique: true, maxlength: 50 }), password_hash: { type: String, required: true },
  role: { type: String, enum: ['ADMIN', 'EMPLOYEE'], required: true }, employee_id: { type: Number, default: null }
}, (s) => s.index({ employee_id: 1 }, { unique: true, partialFilterExpression: { employee_id: { $type: 'number' } } }));
const Attendance = make('attendance', 'attendance_id', {
  employee_id: { type: Number, required: true }, att_date: dateStr({ required: true }), status: { type: String, enum: ['Present', 'Absent', 'Late'], required: true },
  check_in: timeStr({ default: null }), check_out: timeStr({ default: null })
}, (s) => { s.index({ employee_id: 1, att_date: 1 }, { unique: true }); s.index({ att_date: 1, status: 1 }); });
const LeaveRequest = make('leave_request', 'leave_id', {
  employee_id: { type: Number, required: true }, start_date: dateStr({ required: true }), end_date: dateStr({ required: true }), reason: str({ required: true, maxlength: 200 }),
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' }, applied_on: dateStr({ required: true })
}, (s) => s.index({ employee_id: 1, status: 1, start_date: 1, end_date: 1 }));
const TaxSlab = make('tax_slab', 'slab_id', { annual_from: { type: Number, required: true, min: 0 }, annual_to: { type: Number, default: null }, rate_percent: { type: Number, required: true, min: 0, max: 100 } });
const Payroll = make('payroll', 'payroll_id', {
  employee_id: { type: Number, required: true }, pay_month: dateStr({ required: true }), basic_salary: money({ required: true, min: [0.01, 'basic_salary must be positive'] }),
  working_days: Number, days_present: Number, approved_leave_days: Number, days_absent: Number, late_marks: Number,
  absence_deduction: money({ min: 0 }), late_deduction: money({ min: 0 }), tax_deduction: money({ min: 0 }), net_salary: money({ required: true, min: [0, 'net_salary cannot be negative'] }),
  generated_at: { type: Date, default: Date.now }
}, (s) => { s.index({ employee_id: 1, pay_month: 1 }, { unique: true }); s.index({ pay_month: 1 }); });

const models = { Property, Facility, Room, Tenant, Allocation, RentPayment, Complaint, Visitor, Enquiry, Designation, Employee, UserAccount, Attendance, LeaveRequest, TaxSlab, Payroll };
module.exports = { ...models, models, Counter, nextId };
