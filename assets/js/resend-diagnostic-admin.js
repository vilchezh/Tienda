(() => {
 'use strict';
 const button=document.getElementById('btnResendDiagnostic');
 const feedback=document.getElementById('resendDiagnosticStatus');
 if(!button||!feedback)return;
 button.addEventListener('click',async()=>{
  const original=button.textContent;
  button.disabled=true;button.textContent='Verificando…';
  feedback.textContent='Comprobando credenciales y enviando solo al correo del taller…';
  try{
   const client=Store.createClient();
   const {data:{session},error}=await client.auth.getSession();
   if(error||!session?.access_token)throw Error('Iniciá sesión como administrador para probar el correo.');
   const config=window.STORE_CONFIG;
   if(!config?.supabaseUrl||!config?.supabaseAnonKey)throw Error('Falta la configuración pública de la tienda.');
   const res=await fetch(config.supabaseUrl.replace(/\/$/,'')+'/functions/v1/resend-diagnostic',{
    method:'POST',
    headers:{Authorization:'Bearer '+session.access_token,apikey:config.supabaseAnonKey,'Content-Type':'application/json'},
    body:'{}'
   });
   const result=await res.json().catch(()=>({}));
   if(res.ok&&result.accepted_by_resend){
    feedback.textContent='Resend aceptó el correo de prueba. Revisá la bandeja del taller (y spam); ID del mensaje: '+result.message_id;
   }else if(res.status===429){
    feedback.textContent='Límite de prueba: se permite un envío cada 15 minutos.';
   }else if(res.status===403||res.status===401){
    feedback.textContent='Acceso denegado. Iniciá sesión como administrador con la verificación de seguridad completa.';
   }else if(result.error==='sender_or_recipient_not_verified'){
    feedback.textContent='Resend rechazó el envío (403): el correo del taller debe ser el registrado en la cuenta Resend mientras uses onboarding@resend.dev.';
   }else if(result.error==='email_configuration_incomplete'){
    feedback.textContent='Falta configurar RESEND_API_KEY, ORDER_EMAIL_FROM u ORDER_NOTIFICATION_TO en Supabase.';
   }else{
    feedback.textContent='La prueba no se completó ('+String(result.error||'error de conexión').slice(0,80)+'). Revisá las credenciales.';
   }
  }catch(error){
   feedback.textContent=error?.message==='Failed to fetch'?'No se pudo conectar con el servidor de correos.':String(error?.message||'Error al realizar la prueba.').slice(0,150);
  }finally{button.disabled=false;button.textContent=original;}
 });
})();
