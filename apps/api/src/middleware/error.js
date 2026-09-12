import { AppError } from '../utils/http.js';
export function notFound(_req,_res,next){ next(new AppError(404,'NOT_FOUND','资源不存在')); }
export function errorHandler(err, _req, res, _next) {
  const status = err.status || (err.code === '23505' ? 409 : 500);
  const code = err.code === '23505' ? 'CONFLICT' : (err.code || 'INTERNAL_ERROR');
  if (status >= 500) console.error(err);
  res.status(status).json({ok:false,error:{code,message: status>=500 ? '服务器内部错误' : err.message, ...(err.details?{details:err.details}:{})}});
}
