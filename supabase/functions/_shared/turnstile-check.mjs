// Cloudflare Turnstile verification. The feature is opt-in until keys are set
// in the sandbox Edge Function and the matching public site key is deployed.
const VERIFY_ENDPOINT='https://challenges.cloudflare.com/turnstile/v0/siteverify';
import { deploymentConfig } from './deployment-config.mjs';
import { allowedOrigins } from './cors.mjs';
export async function verifyTurnstile(env,request,token,fetchFn=fetch) {
 const config=deploymentConfig(env);
 const secret=String(env.TURNSTILE_SECRET||'');
 // No admitir formularios públicos en producción sin el secreto del captcha.
 if(config.mode==='production'&&!secret)return {configured:false,ok:false};
 if(!secret)return {configured:false,ok:true};
 // Durante la migración se aceptan únicamente hostnames del origen explícitamente autorizado.
 const origin=request.headers.get('origin')||'';
 const permitted=allowedOrigins(env);
 if(origin&&!permitted.has(origin))return {configured:true,ok:false};
 const expectedHostname=new URL(origin||config.siteUrl).hostname;
 if(typeof token!=='string'||token.length<20||token.length>2048||
    !/^[A-Za-z0-9._-]+$/.test(token))return {configured:true,ok:false};
 const values=new URLSearchParams({secret,response:token});
 const originIp=String(request.headers.get('cf-connecting-ip')||'');
 if(originIp&&originIp.length<=45&&/^[a-fA-F0-9:.]+$/.test(originIp))
  values.set('remoteip',originIp);
 try {
  const response=await fetchFn(VERIFY_ENDPOINT,{
   method:'POST',
   headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:values.toString(),
   signal:AbortSignal.timeout(6000)
  });
  if(!response.ok)return {configured:true,ok:false};
  const data=await response.json();
  return {configured:true,ok:data?.success===true&&data.hostname===expectedHostname};
 }catch {return {configured:true,ok:false};}
}
