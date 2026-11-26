class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
const bad = (m, extra) => new HttpError(400, m, extra);
const notFound = (m = 'Not found') => new HttpError(404, m);
const forbidden = (m = 'You do not have permission to do this') => new HttpError(403, m);
const conflict = (m, extra) => new HttpError(409, m, extra);
module.exports = { HttpError, bad, notFound, forbidden, conflict };
