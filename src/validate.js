'use strict';
// Input checks shared by the API. Each returns a cleaned value or throws a 400 with a plain message.
const { bad } = require('./errors');
const { today } = require('./clock');

// A real calendar date (YYYY-MM-DD), not before 2000. Future dates are rejected unless allowFuture (e.g. expiry).
function date(v, label, { allowFuture = false, required = false } = {}) {
  if (v === undefined || v === null || v === '') { if (required) throw bad(`${label} is required`); return null; }
  const s = String(v).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!m || d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) throw bad(`${label} is not a valid date`);
  if (+m[1] < 2000) throw bad(`${label} must be in the year 2000 or later`);
  if (!allowFuture && s > today()) throw bad(`${label} cannot be in the future`);
  return s;
}

// Indian vehicle number, e.g. TN45AB1234 / TN 45 AB 1234 / TN-45-1234. Returned upper-case without spaces.
function vehicle(v, { required = false } = {}) {
  const s = String(v || '').toUpperCase().replace(/[\s-]/g, '');
  if (!s) { if (required) throw bad('Vehicle number is required to dispatch (e.g. TN45AB1234)'); return null; }
  if (!/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/.test(s)) throw bad('Vehicle number looks wrong. Use the format TN45AB1234');
  return s;
}

function phone(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).replace(/[\s-]/g, '').replace(/^(\+91|0)/, '');
  if (!/^[6-9]\d{9}$/.test(s)) throw bad('Phone must be a 10-digit Indian mobile number');
  return s;
}

function email(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) throw bad('Email address looks wrong');
  return s;
}
module.exports = { date, vehicle, phone, email };
