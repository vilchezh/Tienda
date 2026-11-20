// Configuración de ejecución compartida. Nunca selecciona producción por accidente.
// STORE_DEPLOYMENT_MODE=production debe establecerse explícitamente en Supabase.
const SANDBOX_REF='pacyytbscnlklyrhsshp';
const SANDBOX_SITE='https://tienda-checkout-sandbox.acero-y-escamas.workers.dev';
const SANDBOX_BUCKET='quote-reference-sandbox';
const REF=/^[a-z0-9]{20}$/;
const BUCKET=/^[a-z0-9][a-z0-9-]{2,60}$/;
function origin(value,label){
 let url;
 try{url=new URL(String(value||''));}
 catch{throw Error('invalid_'+label);}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||
    url.pathname!=='/')throw Error('invalid_'+label);
 return url.origin;
}
export function deploymentConfig(env){
 const mode=String(env.STORE_DEPLOYMENT_MODE||'sandbox').trim();
 if(!['sandbox','production'].includes(mode))throw Error('invalid_deployment_mode');
 const supabaseUrl=origin(env.SUPABASE_URL,'supabase_url');
 const ref=new URL(supabaseUrl).hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1];
 if(!ref)throw Error('invalid_supabase_project');
 const siteUrl=origin(env.STORE_BASE_URL,'store_url');
 if(mode==='sandbox'){
  if(ref!==SANDBOX_REF||siteUrl!==SANDBOX_SITE)throw Error('sandbox_project_mismatch');
  if(env.QUOTE_STORAGE_BUCKET&&env.QUOTE_STORAGE_BUCKET!==SANDBOX_BUCKET)throw Error('sandbox_bucket_mismatch');
  return {mode,ref,supabaseUrl,siteUrl,bucket:SANDBOX_BUCKET};
 }
 const expected=String(env.STORE_EXPECTED_SUPABASE_REF||'');
 const bucket=String(env.QUOTE_STORAGE_BUCKET||'');
 if(!REF.test(expected)||expected===SANDBOX_REF||ref!==expected||
    siteUrl===SANDBOX_SITE||!BUCKET.test(bucket)||!bucket.startsWith('quote-')||
    bucket===SANDBOX_BUCKET||bucket==='tienda'||
    String(env.STORE_ALLOWED_ORIGINS||'').includes(new URL(SANDBOX_SITE).hostname))
  throw Error('production_configuration_incomplete');
 return {mode,ref,supabaseUrl,siteUrl,bucket};
}
export function isProduction(env){return deploymentConfig(env).mode==='production';}
export function emailVisuals(env) {
 const cfg=deploymentConfig(env);
 const tag=cfg.mode==='sandbox'?' (SANDBOX)':'';
 return {tag,siteUrl:cfg.siteUrl,
  logoUrl:cfg.siteUrl+'/assets/img/email-pangolin-708c76-sharp.png'};
}
// Los correos a clientes reales requieren una autorización distinta al modo producción.
// El remitente onboarding@resend.dev es SOLO de pruebas y no permite entrega general.
export function customerEmailsEnabled(env){
 const cfg=deploymentConfig(env);
 if(cfg.mode!=='production')return false;
 const sender=String(env.ORDER_EMAIL_FROM||'').trim().toLowerCase();
 const address=(sender.match(/<([^<>]+)>/)?.[1]||sender).trim();
 return String(env.STORE_CUSTOMER_EMAILS_ENABLED||'')==='true' &&
   /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(address) &&
   address!=='onboarding@resend.dev' && !address.endsWith('@resend.dev');
}
export function allowCustomerEmail(env,email,kind){
 const cfg=deploymentConfig(env);
 if(cfg.mode==='production')return customerEmailsEnabled(env);
 const allowed=kind==='quote'?
   String(env.CUSTOM_QUOTE_SANDBOX_CUSTOMER_EMAIL||env.CANCELLATION_SANDBOX_CUSTOMER_EMAIL||env.ORDER_NOTIFICATION_TO||''):
   String(env.CANCELLATION_SANDBOX_CUSTOMER_EMAIL||env.ORDER_NOTIFICATION_TO||'');
 return String(email||'').toLowerCase()===allowed.trim().toLowerCase();
}
export function mercadoPagoSecrets(env){
 const cfg=deploymentConfig(env);
 const prod=cfg.mode==='production';
 const token=String(prod?env.MP_ACCESS_TOKEN_LIVE||'':env.MP_ACCESS_TOKEN_TEST||'');
 const webhookSecret=String(prod?env.MP_WEBHOOK_SECRET_LIVE||'':env.MP_WEBHOOK_SECRET_TEST||'');
 return {mode:cfg.mode,token,webhookSecret};
}
