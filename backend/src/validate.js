// Small input validators. Every function throws HttpError(400) with a clear message.
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (m) => { throw new HttpError(400, m); };

const str = (v, name, { min = 1, max = 255, optional = false } = {}) => {
  if (v === undefined || v === null || v === '') { if (optional) return null; bad(`${name} is required`); }
  const s = String(v).trim();
  if (s.length < min || s.length > max) bad(`${name} must be ${min}-${max} characters`);
  return s;
};
const num = (v, name, { min = -Infinity, max = Infinity, int = false, optional = false } = {}) => {
  if (v === undefined || v === null || v === '') { if (optional) return null; bad(`${name} is required`); }
  const n = Number(v);
  if (!Number.isFinite(n)) bad(`${name} must be a number`);
  if (int && !Number.isInteger(n)) bad(`${name} must be a whole number`);
  if (n < min) bad(`${name} must be at least ${min}`);
  if (n > max) bad(`${name} must be at most ${max}`);
  return n;
};
const date = (v, name, { optional = false } = {}) => {
  if (v === undefined || v === null || v === '') { if (optional) return null; bad(`${name} is required`); }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) bad(`${name} must be a date (YYYY-MM-DD)`);
  return v;
};
const month = (v, name = 'month') => {          // 'YYYY-MM' -> 'YYYY-MM-01'
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(v || '')) bad(`${name} must look like 2026-10`);
  return `${v}-01`;
};
const time = (v, name, { optional = true } = {}) => {
  if (v === undefined || v === null || v === '') { if (optional) return null; bad(`${name} is required`); }
  if (!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v)) bad(`${name} must be HH:MM`);
  return v.length === 5 ? `${v}:00` : v;
};
const oneOf = (v, name, list) => { if (!list.includes(v)) bad(`${name} must be one of: ${list.join(', ')}`); return v; };
const phone = (v, name = 'phone') => { const s = String(v || '').trim(); if (!/^[6-9]\d{9}$/.test(s)) bad(`${name} must be a valid 10-digit mobile number`); return s; };
const email = (v) => { if (!v) return null; const s = String(v).trim(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) bad('email is not valid'); return s; };

module.exports = { HttpError, str, num, date, month, time, oneOf, phone, email };
