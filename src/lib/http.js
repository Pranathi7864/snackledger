const { HttpError } = require('./errors');
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Role gate. ADMIN may do everything; other roles must be listed. Authentication is checked first. */
const allow = (...roles) => (req, res, next) => {
  if (!req.user) return next(new HttpError(401, 'Please sign in'));
  if (req.user.roles.includes('ADMIN') || roles.some((r) => req.user.roles.includes(r))) return next();
  next(new HttpError(403, 'Your role does not have access to this'));
};
const signedIn = (req, res, next) => (req.user ? next() : next(new HttpError(401, 'Please sign in')));

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (res.headersSent) return;
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...err.extra });
  // PostgreSQL error codes -> friendly API errors
  if (err.code === '23505') return res.status(409).json({ error: 'That already exists (duplicate value)', detail: err.detail });
  if (err.code === '23503') return res.status(409).json({ error: 'This record is referenced elsewhere or points to something that does not exist', detail: err.detail });
  if (err.code === '23514' || err.code === '22P02' || err.code === '22003' || err.code === '22007') return res.status(400).json({ error: 'Invalid value: ' + (err.constraint || err.message) });
  if (err.code === '23000') return res.status(409).json({ error: err.message.replace(/^error: /i, '') });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
}
module.exports = { wrap, allow, signedIn, errorHandler };
