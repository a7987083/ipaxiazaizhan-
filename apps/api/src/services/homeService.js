import { listApps } from '../repositories/appRepository.js';
import { listCategories,getSettings } from '../repositories/adminRepository.js';
export async function getHome(){
  const [featured,latest,hot,cats,settings]=await Promise.all([
    listApps({sort:'weight',page:1,pageSize:12}),
    listApps({sort:'updated',page:1,pageSize:12}),
    listApps({sort:'downloads',page:1,pageSize:12}),
    listCategories(),
    getSettings(true)
  ]);
  return {featured:featured.items,latest:latest.items,hot:hot.items,categories:cats,settings};
}
