export class AppError extends Error {
  constructor(status, code, message, details) { super(message); this.status=status; this.code=code; this.details=details; }
}
export const ok = (res, data, meta) => res.json({ ok:true, data, ...(meta ? {meta} : {}) });
export const asyncHandler = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
