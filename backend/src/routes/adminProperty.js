// Admin: properties, rooms, tenants, allocations, tenant rent
const router = require('express').Router();
const M = require('../models');
const R = require('../rules');
const v = require('../validate');
const id = (req) => v.num(req.params.id, 'id', { int: true, min: 1 });
const pid = (x, n = 'propertyId') => v.num(x, n, { int: true, min: 1 });
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
const inUse = () => new v.HttpError(409, 'This record is in use and cannot be deleted');
const missing = () => new v.HttpError(400, 'A referenced record does not exist');

// ---------- Properties ----------
const propFields = async (b) => {
  const f = {
    name: v.str(b.name, 'name', { max: 100 }), address: v.str(b.address, 'address', { max: 200 }), area: v.str(b.area, 'area', { max: 80 }),
    city: v.str(b.city, 'city', { max: 60 }), state: v.str(b.state || 'Haryana', 'state', { max: 60 }),
    pin_code: /^\d{6}$/.test(b.pinCode) ? b.pinCode : v.str(null, 'pinCode (6 digits)'),
    latitude: v.num(b.latitude, 'latitude', { min: -90, max: 90 }), longitude: v.num(b.longitude, 'longitude', { min: -180, max: 180 }),
    description: v.str(b.description, 'description', { max: 300, optional: true }),
    facility_ids: [...new Set((b.facilityIds || []).map((x) => v.num(x, 'facility', { int: true, min: 1 })))]
  };
  if (f.facility_ids.length && (await M.Facility.countDocuments({ facility_id: { $in: f.facility_ids } })) !== f.facility_ids.length) throw missing();
  return f;
};
router.get('/properties', wrap(async (_req, res) => res.json(await R.propertyPublic())));
router.get('/facilities', wrap(async (_req, res) => res.json(await M.Facility.find().sort({ name: 1 }).select('-_id').lean())));
router.get('/properties/:id/facilities', wrap(async (req, res) => {
  const p = await M.Property.findOne({ property_id: id(req) }).lean();
  res.json(p ? p.facility_ids : []);
}));
router.post('/properties', wrap(async (req, res) => { const d = await M.Property.create(await propFields(req.body)); res.status(201).json({ propertyId: d.property_id }); }));
router.put('/properties/:id', wrap(async (req, res) => {
  const r = await M.Property.updateOne({ property_id: id(req) }, { $set: await propFields(req.body) }, { runValidators: true });
  if (!r.matchedCount) throw new v.HttpError(404, 'Property not found');
  res.json({ ok: true });
}));
router.delete('/properties/:id', wrap(async (req, res) => {
  const p = id(req);
  if (!(await M.Property.exists({ property_id: p }))) throw new v.HttpError(404, 'Property not found');
  const roomIds = (await M.Room.find({ property_id: p }).lean()).map((r) => r.room_id);
  if (await M.Allocation.exists({ room_id: { $in: roomIds } }) || await M.Employee.exists({ property_id: p }) || await M.Visitor.exists({ property_id: p })) throw inUse();
  await M.Room.deleteMany({ property_id: p }); await M.Property.deleteOne({ property_id: p });
  res.json({ ok: true });
}));

// ---------- Rooms ----------
router.get('/rooms', wrap(async (req, res) => {
  const filter = req.query.propertyId ? { property_id: pid(req.query.propertyId, 'propertyId') } : {};
  const props = Object.fromEntries((await M.Property.find().lean()).map((p) => [p.property_id, p.name]));
  const rows = (await R.roomAvailability(filter)).map((r) => ({ ...r, property_name: props[r.property_id] }));
  res.json(rows.sort((a, b) => a.property_name.localeCompare(b.property_name) || a.room_number.localeCompare(b.room_number)));
}));
const roomFields = (b) => ({ property_id: pid(b.propertyId), room_number: v.str(b.roomNumber, 'roomNumber', { max: 10 }),
  capacity: v.num(b.capacity, 'capacity', { int: true, min: 1, max: 6 }), monthly_rent: v.num(b.monthlyRent, 'monthlyRent', { min: 1, max: 1000000 }) });
router.post('/rooms', wrap(async (req, res) => {
  const f = roomFields(req.body);
  if (!(await M.Property.exists({ property_id: f.property_id }))) throw missing();
  const d = await M.Room.create(f); res.status(201).json({ roomId: d.room_id });
}));
router.put('/rooms/:id', wrap(async (req, res) => {
  const rid = id(req), f = roomFields(req.body);
  if (!(await M.Property.exists({ property_id: f.property_id }))) throw missing();
  const occ = await M.Allocation.countDocuments({ room_id: rid, status: 'Active' });
  if (f.capacity < occ) throw new v.HttpError(400, `Capacity cannot be below current occupancy (${occ})`);
  const r = await M.Room.updateOne({ room_id: rid }, { $set: f }, { runValidators: true });
  if (!r.matchedCount) throw new v.HttpError(404, 'Room not found');
  res.json({ ok: true });
}));
router.delete('/rooms/:id', wrap(async (req, res) => {
  const rid = id(req);
  if (await M.Allocation.exists({ room_id: rid })) throw inUse();
  const r = await M.Room.deleteOne({ room_id: rid });
  if (!r.deletedCount) throw new v.HttpError(404, 'Room not found');
  res.json({ ok: true });
}));

// ---------- Tenants ----------
const tenantFields = (b) => ({ full_name: v.str(b.fullName, 'fullName', { max: 100 }), phone: v.phone(b.phone), email: v.email(b.email),
  gender: v.oneOf(b.gender, 'gender', ['Male', 'Female', 'Other']), occupation_type: v.oneOf(b.occupationType, 'occupationType', ['Student', 'Professional']),
  organisation: v.str(b.organisation, 'organisation', { max: 100, optional: true }) });
router.get('/tenants', wrap(async (req, res) => {
  const filter = {};
  if (req.query.q) { const rx = new RegExp(R.esc(v.str(req.query.q, 'q', { max: 50 })), 'i'); filter.$or = [{ full_name: rx }, { phone: rx }]; }
  const tenants = await M.Tenant.find(filter).sort({ full_name: 1 }).select('-_id').lean();
  const allocs = await M.Allocation.find().lean();
  const rooms = Object.fromEntries((await M.Room.find().lean()).map((r) => [r.room_id, r]));
  const props = Object.fromEntries((await M.Property.find().lean()).map((p) => [p.property_id, p]));
  res.json(tenants.map((t) => {
    // latest stay: the active one if any, otherwise the most recent past stay (so the check-out date shows)
    const mine = allocs.filter((a) => a.tenant_id === t.tenant_id).sort((a, b) => (a.status === 'Active' ? -1 : 0) - (b.status === 'Active' ? -1 : 0) || (a.start_date < b.start_date ? 1 : -1));
    const a = mine[0], r = a && rooms[a.room_id], p = r && props[r.property_id];
    return { ...t, allocation_id: a ? a.allocation_id : null, start_date: a ? a.start_date : null, end_date: a ? a.end_date : null, stay_status: a ? a.status : null,
      room_id: r ? r.room_id : null, room_number: r ? r.room_number : null, property_id: p ? p.property_id : null, property_name: p ? p.name : null };
  }));
}));
router.post('/tenants', wrap(async (req, res) => { const d = await M.Tenant.create(tenantFields(req.body)); res.status(201).json({ tenantId: d.tenant_id }); }));
router.put('/tenants/:id', wrap(async (req, res) => {
  const r = await M.Tenant.updateOne({ tenant_id: id(req) }, { $set: tenantFields(req.body) }, { runValidators: true });
  if (!r.matchedCount) throw new v.HttpError(404, 'Tenant not found');
  res.json({ ok: true });
}));

// ---------- Allocations ----------
router.get('/allocations', wrap(async (req, res) => {
  const filter = req.query.status ? { status: v.oneOf(req.query.status, 'status', ['Active', 'Vacated']) } : {};
  const allocs = await M.Allocation.find(filter).select('-_id').lean();
  const tenants = Object.fromEntries((await M.Tenant.find().lean()).map((t) => [t.tenant_id, t.full_name]));
  const rooms = Object.fromEntries((await M.Room.find().lean()).map((r) => [r.room_id, r]));
  const props = Object.fromEntries((await M.Property.find().lean()).map((p) => [p.property_id, p.name]));
  res.json(allocs.map((a) => ({ ...a, tenant_name: tenants[a.tenant_id], room_number: rooms[a.room_id]?.room_number, property_name: props[rooms[a.room_id]?.property_id] }))
    .sort((a, b) => a.status.localeCompare(b.status) || (a.start_date < b.start_date ? 1 : -1)));
}));
router.post('/allocations', wrap(async (req, res) => {
  const a = { tenant_id: pid(req.body.tenantId, 'tenantId'), room_id: pid(req.body.roomId, 'roomId'), start_date: v.date(req.body.startDate, 'startDate'), status: 'Active', end_date: null };
  res.status(201).json({ allocationId: await R.createAllocation(a) });   // room is locked inside a transaction while capacity is re-checked
}));
router.post('/allocations/:id/vacate', wrap(async (req, res) => {
  const end = v.date(req.body.endDate, 'endDate');
  const a = await M.Allocation.findOne({ allocation_id: id(req), status: 'Active' });
  if (!a) throw new v.HttpError(404, 'No active allocation with this id');
  if (end < a.start_date) throw new v.HttpError(400, 'Move-out date cannot be before the move-in date');
  a.status = 'Vacated'; a.end_date = end; await a.save();
  res.json({ ok: true });
}));

// ---------- Tenant rent (separate from employee payroll) ----------
async function rentRows(q) {
  const filter = {};
  if (q.month) filter.rent_month = v.month(q.month);
  if (q.status) filter.status = v.oneOf(q.status, 'status', ['Paid', 'Pending']);
  const rents = await M.RentPayment.find(filter).select('-_id').lean();
  const allocs = Object.fromEntries((await M.Allocation.find().lean()).map((a) => [a.allocation_id, a]));
  const tenants = Object.fromEntries((await M.Tenant.find().lean()).map((t) => [t.tenant_id, t]));
  const rooms = Object.fromEntries((await M.Room.find().lean()).map((r) => [r.room_id, r]));
  const props = Object.fromEntries((await M.Property.find().lean()).map((p) => [p.property_id, p]));
  let rows = rents.map((r) => { const a = allocs[r.allocation_id], t = tenants[a.tenant_id], rm = rooms[a.room_id], p = props[rm.property_id];
    return { ...r, tenant_id: t.tenant_id, tenant_name: t.full_name, phone: t.phone, property_id: p.property_id, property_name: p.name, room_number: rm.room_number }; });
  if (q.propertyId) rows = rows.filter((r) => r.property_id === pid(q.propertyId, 'propertyId'));
  return rows.sort((a, b) => (a.rent_month < b.rent_month ? 1 : a.rent_month > b.rent_month ? -1 : 0) || a.property_name.localeCompare(b.property_name) || a.tenant_name.localeCompare(b.tenant_name));
}
router.get('/rent', wrap(async (req, res) => {
  const rows = await rentRows(req.query);
  const sum = (s) => R.round2(rows.filter((r) => r.status === s).reduce((n, r) => n + r.amount, 0));
  res.json({ rows, totals: { paid: sum('Paid'), pending: sum('Pending') } });
}));
router.post('/rent/generate', wrap(async (req, res) => {          // pending rent rows for every active stay (skips ones that exist)
  const m = v.month(req.body.month);
  const allocs = await M.Allocation.find({ status: 'Active' }).lean();
  const rooms = Object.fromEntries((await M.Room.find().lean()).map((r) => [r.room_id, r]));
  let created = 0;
  for (const a of allocs) {
    if (R.monthStart(a.start_date) > m) continue;
    if (await M.RentPayment.exists({ allocation_id: a.allocation_id, rent_month: m })) continue;
    await M.RentPayment.create({ allocation_id: a.allocation_id, rent_month: m, amount: rooms[a.room_id].monthly_rent }); created++;
  }
  res.json({ created });
}));
router.put('/rent/:id/pay', wrap(async (req, res) => {
  const amount = v.num(req.body.amount, 'amount', { min: 1 }), when = v.date(req.body.paymentDate, 'paymentDate');
  const method = v.oneOf(req.body.method, 'method', ['Cash', 'UPI', 'Card', 'Bank Transfer']);
  const r = await M.RentPayment.updateOne({ rent_id: id(req), status: 'Pending' }, { $set: { status: 'Paid', amount, payment_date: when, method } });
  if (!r.matchedCount) throw new v.HttpError(404, 'No pending rent record with this id');
  res.json({ ok: true });
}));
module.exports = router;
