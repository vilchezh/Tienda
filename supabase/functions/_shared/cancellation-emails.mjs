import { firstRow, supabaseRequest, encodeFilter } from './supabase-rest.mjs';
import { constantTimeEqual } from './internal-auth.mjs';

const json=(body,status)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const htmlEscape=value=>String(value??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function changeStatus(env,fetchFn,item,patch) {
 await supabaseRequest(env,fetchFn,'checkout_cancellation_emails?id=eq.'+encodeFilter(item.email_id)+'&status=eq.processing',{
  method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)
 });
}

export async function dispatchCancellationEmails(env,fetchFn=fetch,limit=10){
 if(!env.RESEND_API_KEY||!env.ORDER_EMAIL_FROM||!env.ORDER_NOTIFICATION_TO)
  return {configured:false,processed:0};
 const claimed=await supabaseRequest(env,fetchFn,'rpc/checkout_claim_cancellation_emails',{
  method:'POST',body:JSON.stringify({p_limit:Math.min(Math.max(Number(limit)||10,1),20)})
 });
 let sent=0,rejected=0,pending=0;
 for(const item of Array.isArray(claimed)?claimed:[]){
  const row=await firstRow(env,fetchFn,'checkout_cancellation_requests?id=eq.'+encodeFilter(item.req_id)+'&select=id,code,customer_email,order_reference,status,created_at&limit=1');
  if(!row){await changeStatus(env,fetchFn,item,{status:'rejected',last_error:'missing_request',lease_until:null});rejected++;continue;}
  // Sandbox: jamás enviar a un correo arbitrario ingresado por un visitante.
  // El cliente sólo recibe correo real si coincide con una dirección de pruebas permitida.
  const customerAllowed=String(env.CANCELLATION_SANDBOX_CUSTOMER_EMAIL||env.ORDER_NOTIFICATION_TO||'').trim().toLowerCase();
  if(item.kind==='customer'&&row.customer_email!==customerAllowed){
   await changeStatus(env,fetchFn,item,{status:'rejected',last_error:'sandbox_customer_not_allowlisted',lease_until:null});
   rejected++;continue;
  }
  const to=item.kind==='seller'?env.ORDER_NOTIFICATION_TO:row.customer_email;
  const isSeller=item.kind==='seller';
  const subject=isSeller?'Nueva solicitud de arrepentimiento (SANDBOX) · '+row.code:
    'Acero y Escamas · Solicitud registrada '+row.code+' (PRUEBA)';
  const intro=isSeller?'Se registró una solicitud en el entorno de pruebas. Revisala desde el panel administrador.':
    'Recibimos tu solicitud de prueba. Guardá el siguiente código de registro para cualquier consulta.';
  const status='Recibida, pendiente de revisión. Este correo no confirma un reembolso.';
  const text=[subject,'',intro,'','Código: '+row.code,'Registrada: '+row.created_at,
    isSeller?'Correo indicado: '+row.customer_email:'',
    isSeller?'Pedido indicado: '+(row.order_reference||'No indicado'):'',
    status,'','Acero y Escamas · ENTORNO DE PRUEBAS'].filter(Boolean).join('\n');
  const html='<!doctype html><html lang="es"><meta charset="utf-8"><body style="margin:0;padding:24px;background:#eef1ec;font-family:Arial,sans-serif;color:#25342d"><main style="max-width:560px;margin:auto;background:#fff;border:1px solid #c9d8cd;padding:28px"><header style="background:#0f3d2e;color:#f6f5ec;padding:18px"><strong>ACERO Y ESCAMAS</strong><p style="font-size:12px">SOLICITUD DE ARREPENTIMIENTO · SANDBOX</p></header><h1 style="font-size:24px;color:#274c36">Solicitud registrada</h1><p>'+htmlEscape(intro)+'</p><p style="padding:14px;background:#e7f1e8;font-size:24px;font-weight:bold">'+htmlEscape(row.code)+'</p><p>'+htmlEscape(status)+'</p>'+(isSeller?'<p>Correo indicado: '+htmlEscape(row.customer_email)+'</p><p>Referencia: '+htmlEscape(row.order_reference||'Sin referencia')+'</p>':'')+'<p style="font-size:12px">No se realizó ninguna devolución automática de dinero.</p></main></body></html>';
  let response,payload;
  try {
   response=await fetchFn('https://api.resend.com/emails',{
    method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'cancel-'+item.req_id+'-'+item.kind},
    body:JSON.stringify({from:env.ORDER_EMAIL_FROM,to:[to],subject,text,html})
   });
   payload=await response.json().catch(()=>({}));
  }catch{response=null;}
  if(response?.ok&&payload?.id){
   await changeStatus(env,fetchFn,item,{status:'sent',sent_at:new Date().toISOString(),provider_message_id:String(payload.id).slice(0,200),last_error:null,lease_until:null});
   sent++;continue;
  }
  const httpStatus=Number(response?.status||0);
  const permanent=[400,401,403,404,422].includes(httpStatus)||Number(item.attempt)>=4;
  const backoff=Math.min(60,5*Math.pow(2,Math.max(0,Number(item.attempt)-1)));
  await changeStatus(env,fetchFn,item,{
   status:permanent?'rejected':'pending',
   last_error:httpStatus?'provider_http_'+httpStatus:'provider_outcome_uncertain',
   next_attempt_at:new Date(Date.now()+backoff*60000).toISOString(),
   lease_until:null
  });
  if(permanent)rejected++;else pending++;
 }
 return {configured:true,processed:Array.isArray(claimed)?claimed.length:0,sent,rejected,pending};
}

export function processCancellationNotificationsHandler(env,fetchFn=fetch){
 return async request=>{
  if(request.method!=='POST')return json({error:'method_not_allowed'},405);
  const valid=env.ORDER_NOTIFICATION_DISPATCH_SECRET&&constantTimeEqual(env.ORDER_NOTIFICATION_DISPATCH_SECRET,request.headers.get('x-dispatch-secret'));
  if(!valid)return json({error:'not_authorized'},401);
  if(!env.SUPABASE_URL?.includes('pacyytbscnlklyrhsshp.supabase.co'))return json({error:'sandbox_only'},503);
  try{return json({ok:true,...await dispatchCancellationEmails(env,fetchFn,10)},200);}
  catch{console.error('cancellation_email_dispatch_failed');return json({error:'dispatch_failed'},503);}
 };
}
