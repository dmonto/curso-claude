import { createHmac, timingSafeEqual, scryptSync } from 'node:crypto';
import { config } from './config.js';
const users = [
  {userId:'u-admin',email:'admin@empresa.com',role:'support_admin',tenantId:'tenant-a'},
  {userId:'u-agent',email:'agent@empresa.com',role:'support_agent',tenantId:'tenant-a'},
  {userId:'u-ana',email:'ana@empresa.com',role:'customer',tenantId:'tenant-a'},
  {userId:'u-otro',email:'otro@empresa.com',role:'customer',tenantId:'tenant-b'},
];
const hashes = new Map(users.map(u=>[u.userId,scryptSync(config.password,u.userId,32)]));
const encode = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
const signature = value => createHmac('sha256',config.secret).update(value).digest('base64url');
export function login(email,password) {
  const u=users.find(u=>u.email===email);
  const calculated=scryptSync(password,u?.userId || 'unknown',32);
  if (!u || !timingSafeEqual(calculated,hashes.get(u.userId))) return null;
  const now=Math.floor(Date.now()/1000);
  const claims={sub:u.userId,iss:'tema13',aud:'tema13-lab',iat:now,exp:now+config.ttl};
  const unsigned=encode({alg:'HS256',typ:'JWT'})+'.'+encode(claims);
  return {accessToken:unsigned+'.'+signature(unsigned),expiresIn:config.ttl,user:u};
}
export function authenticate(header) {
  try {
    if (typeof header!=='string' || !header.startsWith('Bearer ') || header.length>4096) return null;
    const parts=header.slice(7).split('.'); if(parts.length!==3) return null;
    const [h,p,s]=parts, expected=Buffer.from(signature(h+'.'+p)), actual=Buffer.from(s);
    if(actual.length!==expected.length || !timingSafeEqual(actual,expected)) return null;
    const head=JSON.parse(Buffer.from(h,'base64url')),claims=JSON.parse(Buffer.from(p,'base64url'));
    if(head.alg!=='HS256' || head.typ!=='JWT' || claims.iss!=='tema13' || claims.aud!=='tema13-lab' || !Number.isInteger(claims.exp) || claims.exp<=Date.now()/1000) return null;
    return users.find(u=>u.userId===claims.sub) || null;
  } catch { return null; }
}
