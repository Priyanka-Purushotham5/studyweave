import type {Evidence,Page} from '../contracts/types.js';
export const normalize=(s:string)=>s.replace(/-\s*\n\s*/g,'').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").toLowerCase().replace(/\s+/g,' ').trim();
export function verified(e:Evidence,pages:Page[]) {return !!e&&typeof e.quote==='string'&&!!normalize(e.quote)&&pages.some(p=>p.resourceId===e.resourceId&&p.n===e.page&&normalize(p.text).includes(normalize(e.quote)));}
