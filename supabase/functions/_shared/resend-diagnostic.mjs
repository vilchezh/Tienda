import { deploymentConfig,emailVisuals } from './deployment-config.mjs';
import { supabaseRequest } from './supabase-rest.mjs';

const json=(data,status,headers={})=>new Response(JSON.stringify(data),{
 status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff',...headers}
});
const validEmail=value=>/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(value||'').trim());

export function resendDiagnosticHandler(env,fetchFn=fetch) {
 return async request=>{
  let cfg;
  try{cfg=deploymentConfig(env);}catch{return json({error:'configuration_unavailable'},503);}
  const origin=request.headers.get('origin');
  if(origin!==cfg.siteUrl)return json({error:'origin_not_allowed'},403);
  const cors={'Access-Control-Allow-Origin':cfg.siteUrl,'Vary':'Origin',
   'Access-Control-Allow-Methods':'POST, OPTIONS',
   'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info'};
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(request.method!=='POST')return json({error:'method_not_allowed'},405,cors);

  const bearer=String(request.headers.get('authorization')||'');
  // No usar un JWT anon ni una clave de servicio; esta operación exige un usuario admin.
  if(!/^Bearer [A-Za-z0-9._~-]{40,6000}$/.test(bearer) ||
      !env.SUPABASE_ANON_KEY)return json({error:'not_authorized'},401,cors);
  let permission;
  try {
   const response=await fetchFn(cfg.supabaseUrl+'/rest/v1/rpc/storefront_admin_authorized',{
    method:'POST',headers:{'Content-Type':'application/json',
      'apikey':env.SUPABASE_ANON_KEY,Authorization:bearer},body:'{}'
   });
   if(!response.ok)return json({error:'not_authorized'},403,cors);
   permission=await response.json();
  }catch{return json({error:'authorization_unavailable'},503,cors);}
  if(permission!==true)return json({error:'not_authorized'},403,cors);

  if(!env.RESEND_API_KEY||!env.ORDER_EMAIL_FROM||!validEmail(env.ORDER_NOTIFICATION_TO)){
   return json({error:'email_configuration_incomplete'},503,cors);
  }

  // El cliente nunca decide el destinatario; esta prueba sólo va al inbox del taller.
  let reserved=false;
  try {
   reserved=await supabaseRequest(env,fetchFn,'rpc/email_diagnostic_reserve',{method:'POST',body:'{}'});
  }catch{return json({error:'rate_gate_unavailable'},503,cors);}
  if(reserved!==true)return json({error:'rate_limited',retry_after_minutes:15},429,cors);

  const title='Prueba técnica de correo · Acero y Escamas';
  const note='Este mensaje es una prueba interna solicitada desde el administrador. No corresponde a una compra, presupuesto ni solicitud de un cliente.';
  const url=emailVisuals(env).logoUrl;
  const html='<!doctype html><html lang="es"><meta charset="utf-8"><body style="margin:0;padding:25px;background:#edf1ec;font-family:Arial,sans-serif;color:#24352a"><main style="max-width:560px;margin:auto;background:#fff;padding:28px;border:1px solid #d1ded3"><header style="background:#0f3d2e;color:#fff;padding:22px"><img src="'+url+'" alt="Acero y Escamas" width="65" height="65" align="right" style="width:65px;height:65px;float:right"><strong>ACERO Y ESCAMAS</strong><p>VERIFICACIÓN INTERNA · SIN CLIENTES</p></header><h1 style="font-size:22px">Resend conectado</h1><p>'+note+'</p><p style="font-size:13px">Si recibiste este correo, se comprobó la aceptación y entrega a tu bandeja de entrada.</p></main></body></html>';
  let provider,body;
  try{
   provider=await fetchFn('https://api.resend.com/emails',{
    method:'POST',
    headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json',
     'Idempotency-Key':'store-diagnostic-'+cfg.ref+'-'+Math.floor(Date.now()/900000)},
    body:JSON.stringify({from:env.ORDER_EMAIL_FROM,to:[env.ORDER_NOTIFICATION_TO],
     subject:title,text:title+'\n\n'+note,html})
   });
   body=await provider.json().catch(()=>({}));
  }catch{return json({error:'provider_connection_failed'},502,cors);}
  if(!provider.ok||!body?.id){
   return json({error:provider.status===403?'sender_or_recipient_not_verified':'provider_rejected',
    provider_http_status:provider.status},502,cors);
  }
  return json({ok:true,accepted_by_resend:true,
    // Resend aceptó la solicitud; revisar la bandeja de entrada para confirmar entrega.
    message_id:String(body.id).slice(0,120)},200,cors);
 };
}
