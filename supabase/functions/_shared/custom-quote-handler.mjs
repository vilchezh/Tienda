import { corsHeaders } from './cors.mjs';
import { verifyTurnstile } from './turnstile-check.mjs';
import { deploymentConfig } from './deployment-config.mjs';
import { firstRow, supabaseRequest, encodeFilter, serviceKey, restHeaders } from './supabase-rest.mjs';

const MAX_BYTES=5*1024*1024,MAX_REQUEST=MAX_BYTES+16384;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const CODE=/^COT-[0-9]{4}-[0-9]{6,12}$/;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TYPES={
 'image/jpeg':{ext:'jpg',max:MAX_BYTES},
 'image/png':{ext:'png',max:MAX_BYTES},
 'image/webp':{ext:'webp',max:MAX_BYTES},
 'application/pdf':{ext:'pdf',max:MAX_BYTES}
};
const encoder=new TextEncoder();
const respond=(data,status=200,cors={})=>new Response(JSON.stringify(data),{
 status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...cors}
});
const clean=(value,max=200)=>typeof value==='string'?value.trim().replace(/\s+/g,' ').slice(0,max+1):'';
const safeName=value=>clean(value,140).replace(/[^\p{L}\p{N} ._()-]/gu,'_').replace(/^\.+/,'archivo').slice(0,140)||'referencia';

async function hash(value) {
 const digest=await crypto.subtle.digest('SHA-256',encoder.encode(value));
 return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
}
async function hmac(value,secret){
 const k=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=await crypto.subtle.sign('HMAC',k,encoder.encode(value));
 return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
}
async function jsonBody(request,max=8192){
 if(Number(request.headers.get('content-length')||0)>max)throw Error('body_too_large');
 const body=await request.text();if(body.length>max)throw Error('body_too_large');
 const data=JSON.parse(body);if(!data||typeof data!=='object'||Array.isArray(data))throw Error('invalid_json');
 return data;
}
async function formWithinLimit(request){
 if(Number(request.headers.get('content-length')||0)>MAX_REQUEST)throw Error('too_large');
 const reader=request.body?.getReader();if(!reader)throw Error('invalid_file');
 const chunks=[];let n=0;
 while(true){
  const {value,done}=await reader.read();if(done)break;
  n+=value.length;if(n>MAX_REQUEST){await reader.cancel();throw Error('too_large');}
  chunks.push(value);
 }
 const whole=new Uint8Array(n);let at=0;for(const c of chunks){whole.set(c,at);at+=c.length;}
 return new Response(whole,{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();
}
function sniff(bytes){
 if(bytes.length>MAX_BYTES||bytes.length<12)return null;
 const ascii=(start,length)=>String.fromCharCode(...bytes.subarray(start,start+length));
 if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff&&bytes.at(-2)===0xff&&bytes.at(-1)===0xd9)return 'image/jpeg';
 if([137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n)&&ascii(bytes.length-8,4)==='IEND')return 'image/png';
 if(ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP'&&
   (bytes[4]|bytes[5]<<8|bytes[6]<<16|bytes[7]<<24)===bytes.length-8)return 'image/webp';
 if(ascii(0,5)==='%PDF-'&&ascii(Math.max(0,bytes.length-2048),Math.min(2048,bytes.length)).includes('%%EOF'))return 'application/pdf';
 return null;
}
async function uploadStorage(env,fetchFn,path,mime,bytes){
 const cfg=deploymentConfig(env);
 const url=cfg.supabaseUrl+'/storage/v1/object/'+cfg.bucket+'/'+path;
 const headers=restHeaders(env,{'Content-Type':mime,'x-upsert':'false','cache-control':'no-store'});
 const response=await fetchFn(url,{method:'POST',headers,body:bytes});
 if(!response.ok)throw Error('storage_failed');
}
async function deleteStorage(env,fetchFn,path){
 try{
  const response=await fetchFn(deploymentConfig(env).supabaseUrl+'/storage/v1/object/'+deploymentConfig(env).bucket,{method:'DELETE',headers:restHeaders(env),body:JSON.stringify({prefixes:[path]})});
  if(!response.ok)console.error('quote_storage_cleanup_failed');
 }catch{console.error('quote_storage_cleanup_failed');}
}
async function uploadAction(env,request,fetchFn,cors){
 const form=await formWithinLimit(request);
 const quoteId=String(form.get('quote_id')||'');
 const token=String(form.get('token')||'');
 const file=form.get('file');
 if(!UUID.test(quoteId)||!TOKEN.test(token)||!(file instanceof Blob))return respond({error:'invalid_upload'},400,cors);
 if(file.size<12||file.size>MAX_BYTES)return respond({error:'invalid_size'},400,cors);
 const tokenHash=await hash(token);
 const quote=await firstRow(env,fetchFn,
  'custom_quote_requests?id=eq.'+encodeFilter(quoteId)+'&token_hash=eq.'+tokenHash+
  '&status=eq.draft&expires_at=gte.'+encodeURIComponent(new Date().toISOString())+'&select=id,status&limit=1');
 if(!quote)return respond({error:'invalid_or_expired_draft'},404,cors);
 const bytes=new Uint8Array(await file.arrayBuffer());
 const actualMime=sniff(bytes);
 const name=safeName(file.name||'referencia');
 const extension=name.split('.').pop().toLowerCase();
 if(!actualMime||!TYPES[actualMime]||!['jpg','jpeg','png','webp','pdf'].includes(extension)||
   !(extension===TYPES[actualMime].ext||(extension==='jpeg'&&actualMime==='image/jpeg'))){
  return respond({error:'unsupported_file',message:'Solo fotos JPG, PNG, WebP y PDF válidos. No se admiten ejecutables ni archivos comprimidos.'},400,cors);
 }
 const path=quoteId+'/'+crypto.randomUUID()+'.'+TYPES[actualMime].ext;
 await uploadStorage(env,fetchFn,path,actualMime,bytes);
 try{
  const id=await supabaseRequest(env,fetchFn,'rpc/custom_quote_add_file',{method:'POST',
   body:JSON.stringify({p_quote_id:quoteId,p_token_hash:tokenHash,p_path:path,p_name:name,p_mime:actualMime,p_size:bytes.length})
  });
  if(!id||typeof id!=='string')throw Error('file_record_missing');
  return respond({ok:true,file_id:id,name,byte_size:bytes.length,mime_type:actualMime},200,cors);
 }catch{
  await deleteStorage(env,fetchFn,path);
  return respond({error:'file_limit_or_storage_error',message:'No pudimos guardar el archivo. El límite es 5 archivos y 25 MB.'},422,cors);
 }
}

export function customQuoteHandler(env,fetchFn=fetch){
 return async request=>{
  let cors;
  try{cors=corsHeaders(request,env);}catch{return respond({error:'misconfigured'},503);}
  if(!cors)return respond({error:'origin_not_allowed'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'Cache-Control':'no-store'}});
  if(request.method!=='POST')return respond({error:'method_not_allowed'},405,cors);
  try{deploymentConfig(env);}catch{return respond({error:'environment_not_configured'},503,cors);}
  try{
   if(new URL(request.url).searchParams.get('action')==='upload')return await uploadAction(env,request,fetchFn,cors);
   const data=await jsonBody(request);
   if(data.action==='start'){
    const name=clean(data.full_name,120),email=clean(data.email,254).toLowerCase();
    const phone=clean(data.phone,30),city=clean(data.city,100);
    const description=typeof data.description==='string'?data.description.trim():'';
    const type=data.project_type,delivery=data.delivery;
    const incoming=data.choices;
    const structured=incoming!=null;
    const validStringArray=list=>Array.isArray(list)&&list.length<=8&&
      list.every(x=>typeof x==='string'&&x.trim().length>=1&&x.trim().length<=70);
    let choices=null;
    if(structured){
     if(!incoming||typeof incoming!=='object'||Array.isArray(incoming)||
        !validStringArray(incoming.metal_materials)||!validStringArray(incoming.wood_materials))
      return respond({error:'invalid_materials',message:'Revisá las opciones de materiales.'},400,cors);
     const fields=['metal_color','metal_finish','wood_tone','wood_finish'];
     if(fields.some(key=>typeof incoming[key]!=='string'||incoming[key].trim().length>70))
      return respond({error:'invalid_finish',message:'Revisá los colores, tonos y acabados.'},400,cors);
     choices={
      metal_materials:incoming.metal_materials.map(x=>x.trim()),
      wood_materials:incoming.wood_materials.map(x=>x.trim()),
      metal_color:incoming.metal_color.trim(),
      metal_finish:incoming.metal_finish.trim(),
      wood_tone:incoming.wood_tone.trim(),
      wood_finish:incoming.wood_finish.trim()
     };
     if(encoder.encode(JSON.stringify(choices)).length>1800)
      return respond({error:'material_choices_too_large'},400,cors);
    }
    const quantity=Number(data.quantity);
    const budget=data.budget_ars==null||data.budget_ars===''?null:Number(data.budget_ars);
    const date=data.desired_date?String(data.desired_date):null;
    if(!UUID.test(data.submission_id||'')||!TOKEN.test(data.token||'')||
      name.length<2||name.length>120||!EMAIL.test(email)||email.length>254||
      phone.length<7||!/^[+0-9() .-]{7,30}$/.test(phone)||city.length<2||city.length>100||
      !['mueble','estructura','parrilla','accesorio','otro'].includes(type)||description.length<20||description.length>2000||
      !['retiro','envio','a_coordinar'].includes(delivery)||!Number.isInteger(quantity)||quantity<1||quantity>100||
      (budget!==null&&(!Number.isSafeInteger(budget)||budget<0||budget>999999999))||
      (date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))||
      clean(data.measurements,250).length>250||clean(data.materials,250).length>250||clean(data.finish,180).length>180)
     return respond({error:'invalid_form',message:'Revisá los datos marcados antes de continuar.'},400,cors);
    const proof=await verifyTurnstile(env,request,data.turnstile_token,fetchFn);
    if(!proof.ok)return respond({error:'bot_check_failed',message:'Completá la verificación de seguridad y volvé a intentar.'},403,cors);
    const key=serviceKey(env);
    const hour=Math.floor(Date.now()/3600000);
    const ip=clean(request.headers.get('cf-connecting-ip')||'unknown',80);
    const [tokenHash,ipHash,emailHash]=await Promise.all([
     hash(data.token),hmac('quote-ip:'+hour+':'+ip,key),hmac('quote-email:'+hour+':'+email,key)]);
    const materials=choices?
       [...choices.metal_materials,...choices.wood_materials].join(', ').slice(0,250):
       clean(data.materials,250);
    const finishSummary=choices?
       [choices.metal_color&&'Color metal: '+choices.metal_color,choices.metal_finish&&'Acabado metal: '+choices.metal_finish,
        choices.wood_tone&&'Tono madera: '+choices.wood_tone,choices.wood_finish&&'Acabado madera: '+choices.wood_finish]
       .filter(Boolean).join(' · ').slice(0,180):
       clean(data.finish,180);
    const rows=await supabaseRequest(env,fetchFn,structured?'rpc/custom_quote_create_v2':'rpc/custom_quote_create',{
      method:'POST',
      body:JSON.stringify({
       p_submission_id:data.submission_id,p_token_hash:tokenHash,p_ip_key:ipHash,p_email_key:emailHash,
       p_name:name,p_email:email,p_phone:phone,p_city:city,p_project_type:type,p_description:description,
       p_measurements:clean(data.measurements,250),p_materials:materials,
       p_finish:finishSummary,p_quantity:quantity,p_desired_date:date,p_budget:budget,p_delivery:delivery,
       ...(structured?{p_choices:choices}:{})
      })
    });
    const row=Array.isArray(rows)?rows[0]:null;
    if(!row?.quote_id)return respond({error:'save_failed'},503,cors);
    return respond({ok:true,quote_id:row.quote_id,code:row.quote_code,status:row.quote_status},200,cors);
   }
   if(['finish','status'].includes(data.action)){
    if(!UUID.test(data.quote_id||'')||!TOKEN.test(data.token||''))return respond({error:'invalid_request'},400,cors);
    const tokenHash=await hash(data.token);
    if(data.action==='finish'){
     const rows=await supabaseRequest(env,fetchFn,'rpc/custom_quote_finish',{
      method:'POST',body:JSON.stringify({p_quote_id:data.quote_id,p_token_hash:tokenHash})});
     const row=Array.isArray(rows)?rows[0]:null;
     if(!row?.quote_code)return respond({error:'save_failed'},503,cors);
     return respond({ok:true,code:row.quote_code,status:row.quote_status},200,cors);
    }
    const row=await firstRow(env,fetchFn,'custom_quote_requests?id=eq.'+encodeFilter(data.quote_id)+
      '&token_hash=eq.'+tokenHash+'&select=code,status,created_at,updated_at&limit=1');
    return row?respond({code:row.code,status:row.status,created_at:row.created_at,updated_at:row.updated_at},200,cors):
      respond({error:'not_found'},404,cors);
   }
   return respond({error:'invalid_action'},400,cors);
  }catch(error){
   if(['body_too_large','too_large','invalid_json','invalid_file'].includes(error?.message)||error instanceof SyntaxError)
    return respond({error:'invalid_request_size_or_body'},400,cors);
   console.error('quote_request_error',String(error?.message||'unknown'));
   return respond({error:'request_failed',message:'No pudimos completar esta operación. Reintentá sin cambiar los datos.'},503,cors);
  }
 };
}
