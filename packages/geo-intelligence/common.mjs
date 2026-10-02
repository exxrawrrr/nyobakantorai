import { createHash } from "node:crypto";

export const clean=(v,max=4000)=>String(v??"").trim().slice(0,max);
export function assert(c,m){if(!c)throw new Error(m);}
export function stable(v){
  if(Array.isArray(v)) return v.map(stable);
  if(v&&typeof v==="object") return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));
  return v;
}
export function digest(v){return createHash("sha256").update(JSON.stringify(stable(v))).digest("hex");}
export function contentRef(kind,v){return String(kind).replace(/:+$/,"")+":sha256:"+digest(v);}
export function uniq(items){return [...new Set(items)];}
export function validTime(v){return typeof v==="string"&&v.trim()&&!Number.isNaN(Date.parse(v));}
export function iso(v,label="timestamp"){
  assert(validTime(v),label+" invalid.");
  return new Date(v).toISOString();
}
export function freeze(value){
  if(Array.isArray(value)) return Object.freeze(value.map(freeze));
  if(value&&typeof value==="object"){
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key,item])=>[key,freeze(item)])));
  }
  return value;
}
export function normalizedText(v){
  return clean(v,1000).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
}
export function tokenSet(v){return new Set(normalizedText(v).split(" ").filter(Boolean));}
export function jaccard(a,b){
  const A=tokenSet(a),B=tokenSet(b);
  if(!A.size||!B.size) return 0;
  let inter=0; for(const x of A) if(B.has(x)) inter++;
  return inter/(A.size+B.size-inter);
}
export function normalizeDomain(value){
  const raw=clean(value,2000);
  if(!raw) return null;
  try{
    const u=new URL(raw.includes("://")?raw:"https://"+raw);
    return u.hostname.toLowerCase().replace(/^www\./,"");
  }catch{return null;}
}
export function normalizePhone(value){
  const raw=clean(value,200);
  if(!raw) return null;
  const plus=raw.trim().startsWith("+");
  const digits=raw.replace(/\D/g,"");
  if(digits.length<7) return null;
  return (plus?"+":"")+digits;
}
export function distanceMeters(a,b){
  if(!a||!b) return Infinity;
  const lat1=Number(a.latitude),lon1=Number(a.longitude),lat2=Number(b.latitude),lon2=Number(b.longitude);
  if(![lat1,lon1,lat2,lon2].every(Number.isFinite)) return Infinity;
  const R=6371008.8,toRad=x=>x*Math.PI/180;
  const dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);
  const h=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
}
