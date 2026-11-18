import { firstRow, supabaseRequest, encodeFilter } from './supabase-rest.mjs';
import { constantTimeEqual } from './internal-auth.mjs';

const response=(body,status)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label={mueble:'Mueble',estructura:'Estructura',parrilla:'Parrilla',otro:'Otro proyecto'};
const LOGO='<img src="https://tienda-checkout-sandbox.acero-y-escamas.workers.dev/assets/img/email-pangolin-708c76-sharp.png" alt="Logo de Acero y Escamas" width="80" height="80" align="right" style="display:block;float:right;width:80px;height:80px;margin:15px 0 0 8px;border:0;outline:none;text-decoration:none;">';
export function quoteEmailTemplate(row,kind,filesCount=0){
 const seller=kind==='seller';
 const subject=(seller?'Nueva solicitud de presupuesto':'Recibimos tu solicitud de presupuesto')+' · '+row.code+' (SANDBOX)';
 const headline=seller?'Nueva solicitud de presupuesto':'¡Recibimos tu proyecto!';
 const intro=seller?'Ingresá en Administración → Pedidos → Presupuestos a medida para revisar la propuesta.':
   'Tu solicitud de presupuesto quedó registrada. Nuestro taller la revisará y te contactará para conversar los detalles.';
 const details=[
  ['Número de solicitud',row.code],
  ['Proyecto',label[row.project_type]||'Proyecto a medida'],
  ['Descripción',row.description],
  ['Medidas',row.measurements||'A definir'],
  ['Materiales',row.materials||'A definir'],
  ['Terminación',row.finish||'A definir'],
  ['Cantidad',row.quantity],
  ['Localidad',row.city],
  ['Entrega',row.delivery],
  ['Archivos recibidos',filesCount],
  ...(seller?[['Cliente',row.full_name],['Correo',row.email],['Teléfono',row.phone]]:[])
 ];
 const text=[subject,intro,'',...details.map(([k,v])=>k+': '+String(v)),'',
  'Esto es una solicitud de cotización, no una compra ni un pago.','Entorno de pruebas · Acero y Escamas'].join('\n');
 const detailTable=details.map(([key,value])=>'<tr><td style="padding:9px 6px;color:#65766a;vertical-align:top;width:38%;border-bottom:1px solid #edf1ed">'+escape(key)+'</td><td style="padding:9px 6px;overflow-wrap:anywhere;border-bottom:1px solid #edf1ed">'+escape(value)+'</td></tr>').join('');
 const html='<!doctype html><html lang="es"><meta charset="utf-8"><body style="margin:0;padding:22px;background:#eef1ec;font-family:Arial,Helvetica,sans-serif;color:#25342d"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" style="width:100%;max-width:560px;background:#fff;border:1px solid #d8e3da"><tr><td style="padding:24px 28px;background:#0f3d2e;color:#fff;min-height:145px">'+LOGO+'<div style="font-size:20px;font-weight:700;letter-spacing:1px;line-height:1.35">ACERO Y ESCAMAS</div><div style="font-size:13px;color:#d2e3d8;margin-top:5px">Herrería y muebles a medida</div><div style="font-size:11px;margin-top:18px;letter-spacing:1px">PRESUPUESTO A MEDIDA · SANDBOX</div></td></tr><tr><td style="padding:28px"><h1 style="font-size:26px;color:#153c2a">'+headline+'</h1><p style="line-height:1.6">'+escape(intro)+'</p><p style="font-size:23px;padding:16px;background:#e9f4ed;color:#0f3d2e;font-weight:bold">'+escape(row.code)+'</p><table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">'+detailTable+'</table><p style="font-size:12px;color:#52665a;margin-top:22px">No se realizó ningún cobro. Los archivos adjuntos no se incluyen en este correo por seguridad.</p></td></tr></table></td></tr></table></body></html>';
 return {subject,text,html};
}
async function patch(env,fetchFn,emailId,data){
 await supabaseRequest(env,fetchFn,'custom_quote_emails?id=eq.'+encodeFilter(emailId)+'&status=eq.processing',{
  method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(data)
 });
}
export async function dispatchQuoteEmails(env,fetchFn=fetch,limit=10){
 if(!env.RESEND_API_KEY||!env.ORDER_EMAIL_FROM||!env.ORDER_NOTIFICATION_TO)return {configured:false,processed:0};
 const items=await supabaseRequest(env,fetchFn,'rpc/custom_quote_claim_emails',{
  method:'POST',body:JSON.stringify({p_limit:Math.min(Math.max(Number(limit)||10,1),20)})
 });
 let sent=0,skipped=0,pending=0;
 for(const job of Array.isArray(items)?items:[]){
  const row=await firstRow(env,fetchFn,'custom_quote_requests?id=eq.'+encodeFilter(job.quote_id)+
   '&select=id,code,full_name,email,phone,city,project_type,description,measurements,materials,finish,quantity,delivery,status&limit=1');
  if(!row||row.status==='draft'||row.status==='expired'){
   await patch(env,fetchFn,job.email_id,{status:'rejected',last_error:'quote_not_submitted',lease_until:null});skipped++;continue;
  }
  const countRows=await supabaseRequest(env,fetchFn,'custom_quote_files?request_id=eq.'+encodeFilter(row.id)+'&select=id');
  const fileCount=Array.isArray(countRows)?countRows.length:0;
  const allow=String(env.CUSTOM_QUOTE_SANDBOX_CUSTOMER_EMAIL||env.CANCELLATION_SANDBOX_CUSTOMER_EMAIL||env.ORDER_NOTIFICATION_TO).trim().toLowerCase();
  if(job.kind==='customer'&&row.email.toLowerCase()!==allow){
   await patch(env,fetchFn,job.email_id,{status:'rejected',last_error:'sandbox_customer_not_allowlisted',lease_until:null});skipped++;continue;
  }
  const to=job.kind==='seller'?env.ORDER_NOTIFICATION_TO:row.email;
  const mail=quoteEmailTemplate(row,job.kind,fileCount);
  let res,body;
  try {
   res=await fetchFn('https://api.resend.com/emails',{method:'POST',headers:{
    Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json',
    'Idempotency-Key':'quote-'+job.quote_id+'-'+job.kind
   },body:JSON.stringify({from:env.ORDER_EMAIL_FROM,to:[to],...mail})});
   body=await res.json().catch(()=>({}));
  }catch{}
  if(res?.ok&&body?.id){
   await patch(env,fetchFn,job.email_id,{status:'sent',sent_at:new Date().toISOString(),
     provider_message_id:String(body.id).slice(0,200),last_error:null,lease_until:null});
   sent++;continue;
  }
  const httpCode=Number(res?.status||0);
  const permanent=[400,401,403,404,422].includes(httpCode)||Number(job.attempt)>=4;
  await patch(env,fetchFn,job.email_id,{status:permanent?'rejected':'pending',lease_until:null,
   last_error:httpCode?'provider_http_'+httpCode:'provider_outcome_uncertain',
   next_attempt_at:new Date(Date.now()+Math.min(60,5*2**Math.max(0,Number(job.attempt)-1))*60000).toISOString()});
  if(permanent)skipped++;else pending++;
 }
 return {configured:true,processed:Array.isArray(items)?items.length:0,sent,skipped,pending};
}
export function quoteNotificationsHandler(env,fetchFn=fetch){
 return async request=>{
  if(request.method!=='POST')return response({error:'method_not_allowed'},405);
  if(!env.ORDER_NOTIFICATION_DISPATCH_SECRET||
      !constantTimeEqual(env.ORDER_NOTIFICATION_DISPATCH_SECRET,request.headers.get('x-dispatch-secret')))
   return response({error:'not_authorized'},401);
  if(env.SUPABASE_URL!=='https://pacyytbscnlklyrhsshp.supabase.co')return response({error:'sandbox_only'},503);
  try{return response({ok:true,...await dispatchQuoteEmails(env,fetchFn,10)},200);}
  catch {console.error('quote_notifications_failure');return response({error:'dispatch_failed'},503);}
 };
}
