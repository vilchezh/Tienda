// Cloudflare Turnstile verification. The feature is opt-in until keys are set
// in the sandbox Edge Function and the matching public site key is deployed.
const VERIFY_ENDPOINT='https://challenges.cloudflare.com/turnstile/v0/siteverify';
const EXPECTED_HOST='tienda-checkout-sandbox.acero-y-escamas.workers.dev';
export async function verifyTurnstile(env,request,token,fetchFn=fetch) {
 const secret=String(env.TURNSTILE_SECRET||'');
 if(!secret)return {configured:false,ok:true};
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
  return {configured:true,ok:data?.success===true&&data.hostname===EXPECTED_HOST};
 }catch {return {configured:true,ok:false};}
}
