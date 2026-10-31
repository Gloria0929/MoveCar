import { ApiError } from '../lib/http.js';

export function notFound(req, res) {
  res.status(404).json({ code: 40400, message: '接口不存在' });
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof ApiError) {
    return res.status(err.status).json({
      code: err.code,
      message: err.message,
      data: err.data ?? null,
    });
  }

  // 记录错误但不落请求体（可能含手机号等敏感信息）
  console.error(`[error] ${req.method} ${req.path}`, err?.message || err);
  return res.status(500).json({ code: 50001, message: '服务开小差了，请稍后重试' });
}
