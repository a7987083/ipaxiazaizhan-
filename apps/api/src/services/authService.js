import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { findAdmin,touchLogin } from '../repositories/adminRepository.js';
import { AppError } from '../utils/http.js';
export async function login(username,password){ const admin=await findAdmin(username); if(!admin || !(await bcrypt.compare(password,admin.password_hash))) throw new AppError(401,'LOGIN_FAILED','用户名或密码错误'); await touchLogin(admin.id); const token=jwt.sign({sub:String(admin.id),username:admin.username,role:admin.role},env.JWT_SECRET,{expiresIn:'12h'}); return {token,admin:{id:admin.id,username:admin.username,role:admin.role}}; }
