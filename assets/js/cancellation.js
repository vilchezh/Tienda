(() => {
 'use strict';
 const form=document.getElementById('cancellationForm');
 const message=document.getElementById('cancellationStatus');
 const submit=document.getElementById('cancellationSubmit');
 const receipt=document.getElementById('cancellationReceipt');
 const lookup=document.getElementById('cancellationLookup');
 const codeEl=document.getElementById('cancellationCode');
 const privateLink=document.getElementById('cancellationPrivateLink');
 const pendingKey='acero-y-escamas.cancellation-pending.v1';
 const endpoint=()=>window.STORE_CONFIG.supabaseUrl.replace(/\/$/,'')+'/functions/v1/cancellation-request';
 const TOKEN_RE=/^[A-Za-z0-9_-]{43}$/;
 const CODE_RE=/^ARR-[0-9]{4}-[0-9]{6,12}$/;
 const statuses={received:'Recibida, pendiente de revisión',reviewing:'En revisión',approved:'Aprobada administrativamente; el reembolso se gestiona aparte',denied:'Respuesta administrativa registrada; contactanos si necesitás aclaraciones',closed:'Trámite cerrado'};
 let pending=null;

 function newToken(){
  const bytes=crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 }
 function setMessage(text,error=false){
  message.textContent=text;
  message.className='status '+(error?'error':'ok');
 }
 async function api(payload){
  const response=await fetch(endpoint(),{
   method:'POST',headers:{'Content-Type':'application/json','apikey':window.STORE_CONFIG.supabaseAnonKey},
   body:JSON.stringify(payload),signal:AbortSignal.timeout(15000),cache:'no-store'
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok){
   if(response.status===429||result.error==='rate_limited')throw Error('Demasiadas solicitudes. Probá nuevamente más tarde.');
   throw Error(result.message||'No se pudo completar el trámite. Revisá tu conexión y reintentá.');
  }
  return result;
 }
 function linkFor(code,token){
  const u=new URL('arrepentimiento.html',location.href);
  u.searchParams.set('codigo',code);
  u.hash='token='+encodeURIComponent(token);
  return u.href;
 }
 function showReceipt(code,token){
  codeEl.textContent=code;
  privateLink.href=linkFor(code,token);
  receipt.hidden=false;
  form.hidden=true;
  setMessage('');
 }
 async function checkStatus(code,token){
  lookup.hidden=false;
  const target=document.getElementById('cancellationLookupStatus');
  target.textContent='Consultando estado…';
  try{
   const data=await api({action:'status',code,status_token:token});
   target.textContent=(statuses[data.status]||'En revisión')+' · '+code;
   const when=new Date(data.created_at);
   document.getElementById('cancellationLookupDate').textContent='Registrada: '+(Number.isNaN(when.getTime())?'—':when.toLocaleString('es-AR'));
  }catch{
   target.textContent='No pudimos verificar este enlace privado. Revisá que esté completo.';
  }
 }
 try{
  const original=sessionStorage.getItem(pendingKey);
  if(original){
   const data=JSON.parse(original);
   if(data&&TOKEN_RE.test(data.status_token||'')&&typeof data.submission_id==='string')pending=data;
  }
 }catch{}
 const params=new URLSearchParams(location.search);
 const hash=new URLSearchParams(location.hash.slice(1));
 if(CODE_RE.test(params.get('codigo')||'')&&TOKEN_RE.test(hash.get('token')||'')){
  checkStatus(params.get('codigo'),hash.get('token'));
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(submit.disabled)return;
  const email=document.getElementById('cancellationEmail').value.trim().toLowerCase();
  const reference=document.getElementById('cancellationOrder').value.trim();
  const note=document.getElementById('cancellationMessage').value.trim();
  const fingerprint=[email,reference,note].join('\n');
  if(!pending||pending.fingerprint!==fingerprint){
   pending={fingerprint,submission_id:crypto.randomUUID(),status_token:newToken()};
   try{sessionStorage.setItem(pendingKey,JSON.stringify(pending));}catch{}
  }
  submit.disabled=true;setMessage('Registrando tu solicitud…');
  try{
   const proof=window.StoreTurnstile?.response()||'';
   if(window.StoreTurnstile?.enabled()&&!proof)throw Error(window.StoreTurnstile?.errorMessage?.()||'Completá la verificación de seguridad antes de enviar.');
   const result=await api({action:'submit',submission_id:pending.submission_id,status_token:pending.status_token,
    email,order_reference:reference,message:note,turnstile_token:proof});
   if(!result.ok||!CODE_RE.test(result.code||''))throw Error('No se recibió el comprobante.');
   showReceipt(result.code,pending.status_token);
   try{sessionStorage.removeItem(pendingKey);}catch{}
   pending=null;
  }catch(error){window.StoreTurnstile?.reset();setMessage(error.message||'No pudimos registrar la solicitud.',true);}
  finally{submit.disabled=false;}
 });
})();
