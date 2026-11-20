import { deploymentConfig } from './deployment-config.mjs';
import { supabaseRequest } from './supabase-rest.mjs';
import { dispatchQuoteEmails } from './custom-quote-emails.mjs';
import { dispatchCancellationEmails } from './cancellation-emails.mjs';

const json=(value,status)=>new Response(JSON.stringify(value),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff'
}});

// Exclusivamente producción y exclusivamente mensajes internos del taller.
// El token viene de Vault, se verifica internamente mediante una RPC privada.
// Los destinatarios de clientes jamás se reclaman desde esta función.
export function sellerNotificationSchedulerHandler(env,fetchFn=fetch){
 return async request=>{
  if(request.method!=='POST')return json({error:'method_not_allowed'},405);
  try{
   const cfg=deploymentConfig(env);
   if(cfg.mode!=='production')return json({error:'production_only'},403);
  }catch{return json({error:'invalid_environment'},503);}

  const token=String(request.headers.get('x-seller-dispatch-token')||'');
  if(!/^[a-f0-9]{64}$/.test(token))return json({error:'unauthorized'},401);
  let allowed=false;
  try{
   allowed=await supabaseRequest(env,fetchFn,'rpc/storefront_validate_seller_dispatch',{
    method:'POST',body:JSON.stringify({p_token:token})
   });
  }catch{return json({error:'authorization_unavailable'},503);}
  if(allowed!==true)return json({error:'unauthorized'},401);

  if(!env.RESEND_API_KEY||!env.ORDER_EMAIL_FROM||!env.ORDER_NOTIFICATION_TO)
   return json({error:'email_configuration_incomplete'},503);

  const safeEnv={...env,STORE_CUSTOMER_EMAILS_ENABLED:''};
  const results={};
  let failed=false;
  for(const [kind,send] of [['quotes',dispatchQuoteEmails],['cancellations',dispatchCancellationEmails]]){
   try{
    const result=await send(safeEnv,fetchFn,1);
    results[kind]={processed:result.processed||0,sent:result.sent||0,
      pending:result.pending||0,rejected:result.rejected||0,skipped:result.skipped||0};
   }catch{
    results[kind]={error:'dispatch_failed'};failed=true;
   }
  }
  return json({ok:!failed,seller_only:true,...results},failed?503:200);
 };
}
