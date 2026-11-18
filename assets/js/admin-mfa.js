// MFA gate for the sandbox administrator. The server additionally enforces AAL2
// for admins with a verified TOTP factor via tienda_security.is_admin().
window.AdminMFA = (() => {
  'use strict';
  const by=id=>document.getElementById(id);
  const loginPanel=by('adminMfaLoginPanel');
  const setupPanel=by('adminMfaEnrollPanel');
  const loginStatus=by('adminMfaLoginStatus');
  const enrollStatus=by('adminMfaEnrollStatus');
  const loginVerify=by('adminMfaLoginVerify');
  const enrollVerify=by('adminMfaEnrollVerify');
  const manage=by('btnMfaManage');
  const qr=by('adminMfaQr');
  const manual=by('adminMfaManualSecret');
  let client=null,verifiedFactorId='',unverifiedFactorId='',onVerified=null;
  const code=value=>String(value||'').trim();
  function feedback(el,message){el.textContent=message;}
  function hideSecrets(){
    qr.removeAttribute('src');qr.hidden=true;
    manual.textContent='';manual.hidden=true;
    by('adminMfaEnrollCode').value='';
    unverifiedFactorId='';
  }
  async function check(clientInstance,success){
    client=clientInstance;onVerified=success;
    try{
      const [assurance,factors]=await Promise.all([
        client.auth.mfa.getAuthenticatorAssuranceLevel(),
        client.auth.mfa.listFactors()
      ]);
      if(assurance.error||factors.error)throw Error('No se pudo verificar el estado de la autenticación.');
      const active=(factors.data?.totp||[]).filter(f=>f.status==='verified');
      verifiedFactorId=active[0]?.id||'';
      if(verifiedFactorId&&assurance.data?.currentLevel!=='aal2'){
        loginPanel.hidden=false;
        feedback(loginStatus,'Ingresá tu código TOTP para desbloquear el administrador.');
        by('adminMfaLoginCode').focus();
        return false;
      }
      loginPanel.hidden=true;
      manage.textContent=verifiedFactorId?'2FA activa':'Activar 2FA';
      manage.disabled=Boolean(verifiedFactorId);
      manage.title=verifiedFactorId?'Protección activa: iniciar sesión requiere verificación TOTP.':'Activar el segundo factor de seguridad.';
      return true;
    }catch(error){
      loginPanel.hidden=false;
      loginVerify.disabled=true;
      feedback(loginStatus,'No se pudo comprobar la seguridad de la sesión. Recargá la página y volvé a entrar.');
      return false;
    }
  }
  async function submitTOTP(){
    if(!client||!verifiedFactorId)return;
    const val=code(by('adminMfaLoginCode').value);
    if(!/^\d{6}$/.test(val)){feedback(loginStatus,'Ingresá los seis dígitos de la aplicación.');return;}
    loginVerify.disabled=true;feedback(loginStatus,'Verificando código…');
    try{
      const {error}=await client.auth.mfa.challengeAndVerify({factorId:verifiedFactorId,code:val});
      if(error)throw error;
      by('adminMfaLoginCode').value='';
      loginPanel.hidden=true;loginVerify.disabled=false;
      feedback(loginStatus,'');
      if(typeof onVerified==='function')await onVerified();
    }catch{
      feedback(loginStatus,'Código inválido o vencido. Esperá un código nuevo e intentá otra vez.');
      loginVerify.disabled=false;
    }
  }
  async function startEnrollment(){
    if(!client)return;
    setupPanel.hidden=false;
    hideSecrets();
    feedback(enrollStatus,'Preparando segundo factor…');
    manage.disabled=true;
    try{
      const {data:current,error:err}=await client.auth.mfa.listFactors();
      if(err)throw err;
      if((current.totp||[]).some(f=>f.status==='verified')){
        feedback(enrollStatus,'Esta cuenta ya tiene una aplicación autenticadora activa.');
        return;
      }
      const {data,error}=await client.auth.mfa.enroll({factorType:'totp',friendlyName:'Acero y Escamas - Taller'});
      if(error||!data?.id)throw Error('enroll_failed');
      unverifiedFactorId=data.id;
      const svg=data.totp?.qr_code||'';
      const url=svg.startsWith('<svg')?'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg):
        svg.startsWith('data:image/svg+xml')?svg:'';
      if(url){qr.src=url;qr.hidden=false;}
      if(data.totp?.secret){
        manual.textContent='Código manual (guardalo de forma privada): '+data.totp.secret;
        manual.hidden=false;
      }
      feedback(enrollStatus,'Escaneá el QR y confirmá con el código de seis dígitos. No compartas el QR ni el secreto.');
    }catch{
      feedback(enrollStatus,'No se pudo iniciar la activación. Revisá tu sesión y volvé a intentar.');
    }finally{manage.disabled=false;}
  }
  async function verifyEnrollment(){
    if(!client||!unverifiedFactorId)return;
    const val=code(by('adminMfaEnrollCode').value);
    if(!/^\d{6}$/.test(val)){feedback(enrollStatus,'Ingresá los seis dígitos.');return;}
    enrollVerify.disabled=true;feedback(enrollStatus,'Verificando y activando…');
    try{
      const {error}=await client.auth.mfa.challengeAndVerify({factorId:unverifiedFactorId,code:val});
      if(error)throw error;
      hideSecrets();setupPanel.hidden=true;
      manage.textContent='2FA activa';manage.disabled=true;
      alert('La verificación en dos pasos quedó activada. Los próximos accesos al administrador exigirán el código de tu aplicación.');
    }catch{
      feedback(enrollStatus,'No se pudo verificar el código. Revisalo y volvé a intentar.');
    }finally{enrollVerify.disabled=false;}
  }
  manage.addEventListener('click',startEnrollment);
  loginVerify.addEventListener('click',submitTOTP);
  by('adminMfaLoginCode').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();submitTOTP();}});
  enrollVerify.addEventListener('click',verifyEnrollment);
  by('adminMfaEnrollCancel').addEventListener('click',()=>{hideSecrets();setupPanel.hidden=true;feedback(enrollStatus,'');});
  return {check};
})();
