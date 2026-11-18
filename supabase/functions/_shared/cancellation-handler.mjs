import { corsHeaders } from './cors.mjs';
import { firstRow, supabaseRequest, encodeFilter, serviceKey } from './supabase-rest.mjs';

const JSON_HEADERS = { 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const CODE_RE = /^ARR-[0-9]{4}-[0-9]{6,12}$/;
const enc = new TextEncoder();
const respond = (value,status=200,cors={}) => new Response(JSON.stringify(value),{status,headers:{...JSON_HEADERS,...cors}});

async function sha256(value){
 const bytes = await crypto.subtle.digest('SHA-256',enc.encode(value));
 return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
}
async function hmac(value, secret){
 const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=await crypto.subtle.sign('HMAC',key,enc.encode(value));
 return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
}
async function readBody(request){
 if(Number(request.headers.get('content-length')||0)>4096) throw Error('body_too_large');
 const raw=await request.text();
 if(raw.length>4096) throw Error('body_too_large');
 const data=JSON.parse(raw);
 if(!data||typeof data!=='object'||Array.isArray(data)) throw Error('invalid_body');
 return data;
}

export function cancellationRequestHandler(env, fetchFn=fetch) {
 return async request=>{
  let cors;
  try { cors=corsHeaders(request,env); } catch { return respond({error:'server_configuration'},500); }
  if(!cors) return respond({error:'origin_not_allowed'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'Cache-Control':'no-store'}});
  if(request.method!=='POST')return respond({error:'method_not_allowed'},405,cors);
  try {
   if(!env.SUPABASE_URL?.includes('pacyytbscnlklyrhsshp.supabase.co'))return respond({error:'sandbox_only'},503,cors);
   const data=await readBody(request);
   if(data.action==='status'){
    if(typeof data.code!=='string'||!CODE_RE.test(data.code)||typeof data.status_token!=='string'||!TOKEN_RE.test(data.status_token))
     return respond({error:'invalid_status_lookup'},400,cors);
    const hash=await sha256(data.status_token);
    const row=await firstRow(env,fetchFn,'checkout_cancellation_requests?code=eq.'+encodeFilter(data.code)+'&access_token_hash=eq.'+hash+'&select=code,status,created_at,updated_at&limit=1');
    if(!row)return respond({error:'not_found'},404,cors);
    return respond({code:row.code,status:row.status,created_at:row.created_at,updated_at:row.updated_at},200,cors);
   }
   if(data.action!=='submit')return respond({error:'invalid_action'},400,cors);
   const email=typeof data.email==='string'?data.email.trim().toLowerCase():'';
   const reference=typeof data.order_reference==='string'?data.order_reference.trim():'';
   const message=typeof data.message==='string'?data.message.trim():'';
   if(!UUID_RE.test(data.submission_id||'')||!TOKEN_RE.test(data.status_token||'')||
      email.length>254||!EMAIL_RE.test(email)||reference.length>120||message.length>500)
    return respond({error:'invalid_request',message:'Revisá el correo y los campos ingresados.'},400,cors);
   const secret=serviceKey(env);
   const ip=(request.headers.get('x-forwarded-for')||request.headers.get('cf-connecting-ip')||'unknown').split(',').at(-1).trim().slice(0,80);
   const tokenHash=await sha256(data.status_token);
   const slot=(Math.floor(Date.now()/900000)).toString();
   const [ipHash,emailHash]=await Promise.all([
    hmac('cancellation-ip:'+slot+':'+ip,secret),
    hmac('cancellation-email:'+slot+':'+email,secret),
   ]);
   let rows;
   try{
    rows=await supabaseRequest(env,fetchFn,'rpc/checkout_register_cancellation',{
     method:'POST',
     body:JSON.stringify({p_submission_id:data.submission_id,p_token_hash:tokenHash,p_email:email,
      p_reference:reference,p_message:message,p_ip_hash:ipHash,p_email_hash:emailHash})
    });
   }catch(error){
    if(error?.internalStatus===429)return respond({error:'rate_limited'},429,cors);
    return respond({error:'registration_unavailable',message:'No se pudo registrar la solicitud. Volvé a intentar.'},503,cors);
   }
   const row=Array.isArray(rows)?rows[0]:null;
   if(!row?.request_code)return respond({error:'registration_unavailable'},503,cors);
   return respond({ok:true,code:row.request_code,status:row.request_status,created_at:row.registered_at,
     message:'La solicitud fue registrada. Guardá el número de trámite.'},200,cors);
  }catch(error){
   if(error?.message==='body_too_large'||error instanceof SyntaxError||error?.message==='invalid_body')
    return respond({error:'invalid_request'},400,cors);
   return respond({error:'service_unavailable',message:'No se pudo completar la operación.'},503,cors);
  }
 };
}
