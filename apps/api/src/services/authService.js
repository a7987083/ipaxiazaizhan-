import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { findAdmin,touchLogin } from '../repositories/adminRepository.js';
import { updateAdminPassword } from '../storage/controlStore.js';
import { AppError } from '../utils/http.js';

export async function login(username,password){
  const admin=await findAdmin(username);
  if(!admin || !(await bcrypt.compare(password,admin.passwordHash))) throw new AppError(401,'LOGIN_FAILED','用户名或密码错误');
  await touchLogin(admin.id);
  const token=jwt.sign({sub:String(admin.id),username:admin.username,role:admin.role,sv:Number(admin.sessionVersion||1)},env.JWT_SECRET,{expiresIn:'12h'});
  return {token,admin:{id:admin.id,username:admin.username,role:admin.role}};
}

export async function changePassword(adminId,currentPassword,newPassword){
  const admin=await import('../storage/controlStore.js').then(m=>m.getAdminById(adminId));
  if(!admin || !(await bcrypt.compare(currentPassword,admin.passwordHash))) throw new AppError(400,'CURRENT_PASSWORD_INVALID','当前密码错误');
  if(newPassword.length<10) throw new AppError(400,'PASSWORD_TOO_SHORT','新密码至少 10 个字符');
  if(await bcrypt.compare(newPassword,admin.passwordHash)) throw new AppError(400,'PASSWORD_UNCHANGED','新密码不能与当前密码相同');
  const updated=await updateAdminPassword(admin.id,await bcrypt.hash(newPassword,12));
  return {id:updated.id,username:updated.username,sessionVersion:updated.sessionVersion};
}
