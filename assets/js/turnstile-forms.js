// Render Turnstile only when an operator has configured the public sandbox site key.
// The matching private TURNSTILE_SECRET stays in Supabase Edge Function Secrets.
window.StoreTurnstile = (() => {
 'use strict';
 const key=String(window.STORE_CONFIG?.turnstileSiteKey||'').trim();
 const formId=document.getElementById('quoteTurnstile')?'quoteTurnstile':
   document.getElementById('cancellationTurnstile')?'cancellationTurnstile':null;
 let widget=null,loading=false,ready=false;
 const target=formId?document.getElementById(formId):null;
 function response(){
  if(!key)return '';
  if(!ready||widget===null||!window.turnstile?.getResponse)return '';
  return String(window.turnstile.getResponse(widget)||'');
 }
 function reset(){
  if(ready&&widget!==null&&window.turnstile?.reset)window.turnstile.reset(widget);
 }
 function enabled(){return Boolean(key);}
 if(key&&target&&!loading){
  loading=true;target.hidden=false;
  const script=document.createElement('script');
  script.async=true;script.defer=true;
  script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.onload=()=>{
   if(typeof window.turnstile?.render!=='function')return;
   widget=window.turnstile.render(target,{sitekey:key,theme:'dark'});
   ready=true;
  };
  script.onerror=()=>{target.textContent='No se pudo cargar la verificación de seguridad. Recargá la página.';};
  document.head.appendChild(script);
 }
 return {enabled,response,reset};
})();
