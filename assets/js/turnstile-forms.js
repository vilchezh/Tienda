// Turnstile protege ambos formularios. La sitekey es pública; el secreto queda en Supabase.
window.StoreTurnstile = (() => {
 'use strict';
 const config=window.STORE_CONFIG||{};
 const key=String(config.turnstileSiteKey||'').trim();
 // En la tienda real la verificación es obligatoria, aunque un JS antiguo
 // o una configuración incompleta no haya cargado la clave pública.
 const production=config.supabaseUrl==='https://ivyagavbhsyzvikzhmhe.supabase.co';
 const target=document.getElementById('quoteTurnstile')||
   document.getElementById('cancellationTurnstile');
 const enabled=()=>Boolean(key||production);
 let widget=null,ready=false,issue='',status=null;

 function notice(message,error=false){
  if(!status)return;
  status.textContent=message;
  status.style.color=error?'#ffb8ad':'#cbdccb';
 }
 function fail(message){
  issue=message;
  notice(message,true);
 }
 function errorMessage(){
  return issue||(!ready?'La verificación de Cloudflare todavía se está cargando. Volvé a intentar.':
    'Completá la verificación de seguridad antes de enviar.');
 }
 function response(){
  if(!key||!ready||widget===null||typeof window.turnstile?.getResponse!=='function')return '';
  try{return String(window.turnstile.getResponse(widget)||'');}
  catch{return '';}
 }
 function reset(){
  if(ready&&widget!==null&&typeof window.turnstile?.reset==='function'){
   try{window.turnstile.reset(widget);issue='';notice('Verificando nuevamente con Cloudflare...');}
   catch{fail('No se pudo reiniciar Cloudflare. Actualizá la página y reintentá.');}
  }
 }

 if(target&&enabled()){
  target.hidden=false;
  status=document.createElement('p');
  status.className='turnstile-status';
  status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');
  status.style.cssText='margin:10px 0;color:#cbdccb;font-size:13px;line-height:1.5;';
  target.insertAdjacentElement('afterend',status);

  if(!key){
   fail('No se cargó la configuración de seguridad de Cloudflare. Actualizá la página con Ctrl+F5.');
  }else{
   notice('Cargando la verificación de Cloudflare...');
   const script=document.createElement('script');
   script.async=true;
   script.defer=true;
   script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
   script.onload=()=>{
    if(typeof window.turnstile?.render!=='function'){
     fail('No se pudo iniciar Cloudflare. Actualizá la página o probá sin bloqueadores.');
     return;
    }
    try{
     widget=window.turnstile.render(target,{
      sitekey:key,
      theme:'dark',
      appearance:'always',
      callback:()=>{
       issue='';
       notice('Verificación de Cloudflare completada.');
      },
      'expired-callback':()=>{
       fail('La verificación de Cloudflare venció. Completá el desafío nuevamente.');
      },
      'error-callback':code=>{
       const value=String(code||'').replace(/[^0-9]/g,'').slice(0,8);
       if(value==='110200'){
        fail('Cloudflare no autoriza este dominio. Hay que agregarlo a los hostnames del widget.');
       }else{
        fail('Cloudflare no pudo completar la verificación'+(value?' (código '+value+')':'')+'. Reintentá o probá sin bloqueadores.');
       }
      },
      'timeout-callback':()=>{
       fail('La verificación de Cloudflare tardó demasiado. Reintentá.');
      }
     });
     if(widget===null||widget===undefined){
      fail('Cloudflare no pudo mostrar el desafío de seguridad. Actualizá la página.');
      return;
     }
     ready=true;
    }catch{
     fail('No se pudo mostrar la verificación de Cloudflare. Actualizá la página o probá otro navegador.');
    }
   };
   script.onerror=()=>{
    fail('No se pudo cargar Cloudflare. Comprobá tu conexión o desactivá bloqueadores para este sitio.');
   };
   document.head.appendChild(script);
  }
 }
 return {enabled,response,reset,errorMessage};
})();
