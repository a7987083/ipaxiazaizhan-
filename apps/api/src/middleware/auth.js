import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../utils/http.js';
export function requireAdmin(req, _res, next) {
  const token = req.cookies?.zonoe_admin;
  if (!token) return next(new AppError(401,'AUTH_REQUIRED','需要管理员登录'));
  try { req.admin = jwt.verify(token, env.JWT_SECRET); next(); }
  catch { next(new AppError(401,'AUTH_INVALID','登录状态无效或已过期')); }
}
export function requireCsrf(req,_res,next) {
  if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
  const cookie=req.cookies?.zonoe_csrf, header=req.get('x-csrf-token');
  if (!cookie || !header || cookie !== header) return next(new AppError(403,'CSRF_INVALID','CSRF 校验失败'));
  next();
}
