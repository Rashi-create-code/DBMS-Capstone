// Public PG discovery + enquiry + tenant complaints. Reads only; no admin data is ever returned here.
const router = require('express').Router();
const M = require('../models');
const R = require('../rules');
const v = require('../validate');

router.get('/properties', async (req, res, next) => {
  try {
    const { q, city, minRent, maxRent, sharing, availableOnly } = req.query;
    const rf = [];
    if (minRent !== undefined && minRent !== '') { const n = v.num(minRent, 'minRent', { min: 0 }); rf.push((r) => r.monthly_rent >= n); }
    if (maxRent !== undefined && maxRent !== '') { const n = v.num(maxRent, 'maxRent', { min: 0 }); rf.push((r) => r.monthly_rent <= n); }
    if (sharing && sharing !== '0') { const n = v.num(sharing, 'sharing', { int: true, min: 1, max: 6 }); rf.push((r) => r.capacity === n); }
    if (availableOnly === '1') rf.push((r) => r.available_beds > 0);
    const filter = {};
    if (city) filter.city = v.str(city, 'city', { max: 60 });
    if (q) { const rx = new RegExp(R.esc(v.str(q, 'q', { max: 60 })), 'i'); filter.$or = [{ name: rx }, { area: rx }, { city: rx }]; }
    const props = await R.propertyPublic(filter);
    const rooms = (await R.roomAvailability()).filter((r) => rf.every((f) => f(r))).sort((a, b) => a.monthly_rent - b.monthly_rent || a.room_number.localeCompare(b.room_number));
    // a property is listed when at least one room matches ALL room filters; the matching rooms are returned with it
    const out = [];
    for (const p of props) {
      const mr = rooms.filter((r) => r.property_id === p.property_id);
      if (!mr.length) continue;
      out.push({ ...p, match_rooms: mr.length, match_beds: mr.reduce((n, r) => n + r.available_beds, 0), match_min_rent: Math.min(...mr.map((r) => r.monthly_rent)),
        matching_rooms: mr.map(({ room_id, room_number, capacity, sharing_type, monthly_rent, available_beds, property_id }) => ({ property_id, room_id, room_number, capacity, sharing_type, monthly_rent, available_beds })) });
    }
    res.json(out);
  } catch (e) { next(e); }
});

router.get('/properties/:id', async (req, res, next) => {
  try {
    const id = v.num(req.params.id, 'id', { int: true, min: 1 });
    const [p] = await R.propertyPublic({ property_id: id });
    if (!p) throw new v.HttpError(404, 'Property not found');
    const rooms = (await R.roomAvailability({ property_id: id })).sort((a, b) => a.monthly_rent - b.monthly_rent)
      .map(({ room_id, room_number, capacity, sharing_type, monthly_rent, available_beds }) => ({ room_id, room_number, capacity, sharing_type, monthly_rent, available_beds }));
    res.json({ ...p, rooms });
  } catch (e) { next(e); }
});

router.get('/cities', async (_req, res, next) => {
  try { res.json((await M.Property.distinct('city')).sort()); } catch (e) { next(e); }
});

// Interested visitors leave a message. Simple abuse guard: at most 5 enquiries per IP per hour.
const hits = new Map();
router.post('/enquiries', async (req, res, next) => {
  try {
    const now = Date.now(), list = (hits.get(req.ip) || []).filter((t) => now - t < 3600000);
    if (list.length >= 5) throw new v.HttpError(429, 'Too many enquiries from this device. Please try again later.');
    const row = {
      property_id: req.body.propertyId ? v.num(req.body.propertyId, 'propertyId', { int: true, min: 1 }) : null,
      name: v.str(req.body.name, 'name', { min: 2, max: 100 }), phone: v.phone(req.body.phone),
      email: v.email(req.body.email), message: v.str(req.body.message, 'message', { min: 5, max: 500 })
    };
    const d = await M.Enquiry.create(row);
    list.push(now); hits.set(req.ip, list);
    res.status(201).json({ enquiryId: d.enquiry_id });
  } catch (e) { next(e); }
});

// Tenants have no login: they raise a complaint with their registered phone number
router.post('/complaints', async (req, res, next) => {
  try {
    const phone = v.phone(req.body.phone);
    const category = v.oneOf(req.body.category, 'category', ['Room', 'Maintenance', 'Facilities', 'Other']);
    const description = v.str(req.body.description, 'description', { min: 10, max: 500 });
    const t = await M.Tenant.findOne({ phone }).lean();
    const active = t && await M.Allocation.exists({ tenant_id: t.tenant_id, status: 'Active' });
    if (!active) throw new v.HttpError(400, 'No current tenant found for this phone number');
    const c = await M.Complaint.create({ tenant_id: t.tenant_id, category, description });
    res.status(201).json({ complaintId: c.complaint_id });
  } catch (e) { next(e); }
});
module.exports = router;
