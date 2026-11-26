'use strict';
class AppError extends Error { constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; } }
const bad = (m, extra) => new AppError(400, m, extra);
const notFound = m => new AppError(404, m || 'Not found');
const forbidden = m => new AppError(403, m || 'Not allowed');
const conflict = (m, extra) => new AppError(409, m, extra);
module.exports = { AppError, bad, notFound, forbidden, conflict };
