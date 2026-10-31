export class ApiError extends Error {
  constructor(status, code, message, data = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export function ok(res, data = null, status = 200) {
  res.status(status).json({ code: 0, data });
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  const raw = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim() || req.socket?.remoteAddress || '';
  return raw.replace(/^::ffff:/, '');
}
