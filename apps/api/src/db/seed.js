import { ensureControlInitialized,getAdminByUsername } from '../storage/controlStore.js';
import { env } from '../config/env.js';
await ensureControlInitialized();
const admin=await getAdminByUsername(env.ADMIN_USERNAME||'admin');
console.log(admin?`Admin ready: ${admin.username}`:'Admin bootstrap unavailable');
