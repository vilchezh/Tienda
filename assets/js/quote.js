(() => {
 'use strict';
 const form=document.getElementById('quoteForm');
 const status=document.getElementById('quoteStatus');
 const prev=document.getElementById('quotePrev'),next=document.getElementById('quoteNext'),submit=document.getElementById('quoteSubmit');
 const steps=[...document.querySelectorAll('.quote-step')];
 const badges=[...document.querySelectorAll('[data-step-label]')];
 const filesInput=document.getElementById('quoteFiles');
 const fileList=document.getElementById('quoteFileList');
 const draftKey='acero-y-escamas.quote-draft.v1';
 const types=new Set(['jpg','jpeg','png','webp','pdf']);
 const maxFiles=5,maxSize=5*1024*1024,maxTotal=25*1024*1024;
 const TOKEN=/^[A-Za-z0-9_-]{43}$/, UUID=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
 const statusNames={draft:'Preparando solicitud',new:'Recibida por el taller',reviewing:'En revisión',need_info:'Necesitamos más información',quoted:'Presupuesto preparado',accepted:'Aceptado',declined:'Cerrado'};
 let step=1,busy=false,draft=null;
 const uploaded=new Set();
 const values=()=>Object.fromEntries(new FormData(form).entries());
 const endpoint=()=>String(window.STORE_CONFIG?.supabaseUrl||'').replace(/\/$/,'')+'/functions/v1/custom-quote-request';
 const newToken=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 const message=(text,error=false)=>{status.textContent=text;status.className='quote-status '+(error?'error':text?'ok':'');};
 function setStep(n){
  step=Math.max(1,Math.min(3,n));
  steps.forEach((field,i)=>{field.hidden=i+1!==step;});
  badges.forEach((badge,i)=>{badge.classList.toggle('current',i+1===step);badge.classList.toggle('done',i+1<step);});
  prev.hidden=step===1;next.hidden=step===3;submit.hidden=step!==3;
  message('');
 }
 function validStep(n){
  const fields=[...steps[n-1].querySelectorAll('input,textarea,select')].filter(el=>el.type!=='file');
  for(const input of fields){
   if(input.type==='radio'&&input.checked===false)continue;
   if(!input.checkValidity()){input.reportValidity();input.focus();return false;}
  }
  if(n===1&&document.getElementById('quoteDescription').value.trim().length<20){
   message('Describí tu idea con al menos 20 caracteres.',true);return false;
  }
  return true;
 }
 function selectedFiles(){return [...filesInput.files];}
 function validateFiles(list){
  if(list.length>maxFiles)return 'Podés adjuntar hasta 5 archivos.';
  if(list.some(file=>file.size<12||file.size>maxSize))return 'Cada archivo debe pesar como máximo 5 MB.';
  if(list.reduce((sum,file)=>sum+file.size,0)>maxTotal)return 'El total de archivos no puede superar 25 MB.';
  if(list.some(file=>!types.has(file.name.split('.').pop().toLowerCase())))
   return 'Solo se admiten JPG, PNG, WebP o PDF.';
  return '';
 }
 function renderFiles(){
  const files=selectedFiles(),err=validateFiles(files);
  fileList.replaceChildren();
  for(const file of files){
   const li=document.createElement('li');
   const name=document.createElement('span');name.textContent=file.name;
   const size=document.createElement('span');size.textContent=(file.size/1048576).toFixed(2)+' MB';
   li.append(name,size);fileList.appendChild(li);
  }
  if(err)message(err,true);
 }
 filesInput.addEventListener('change',renderFiles);
 next.addEventListener('click',()=>{
  if(step===2){const issue=validateFiles(selectedFiles());if(issue){message(issue,true);return;}}
  if(validStep(step))setStep(step+1);
 });
 prev.addEventListener('click',()=>setStep(step-1));
 async function api(action,data,formData=null){
  const config=window.STORE_CONFIG;
  if(!config?.supabaseUrl||!config?.supabaseAnonKey)throw Error('No se pudo conectar al servidor.');
  const response=await fetch(endpoint()+(formData?'?action=upload':''),{
   method:'POST',headers:{'apikey':config.supabaseAnonKey,...(formData?{}:{'Content-Type':'application/json'})},
   body:formData||JSON.stringify({action,...data}),
   cache:'no-store',signal:AbortSignal.timeout(formData?45000:16000)
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(result.message||(
   result.error==='unsupported_file'?'El archivo no pasó las verificaciones del servidor.':
   'No pudimos completar la operación. Comprobá tu conexión y reintentá.'));
  return result;
 }
 const fingerprint=data=>JSON.stringify(data);
 function saveDraft(){try{sessionStorage.setItem(draftKey,JSON.stringify(draft));}catch{}}
 try{
  const existing=JSON.parse(sessionStorage.getItem(draftKey)||'null');
  if(existing&&TOKEN.test(existing.token)&&UUID.test(existing.submission_id))draft=existing;
 }catch{}
 function disabled(value){busy=value;submit.disabled=value;prev.disabled=value;next.disabled=value;filesInput.disabled=value;}
 function receiptLink(record){
  const target=new URL('presupuesto.html',location.href);
  target.searchParams.set('codigo',record.code);
  target.searchParams.set('solicitud',record.quote_id);
  target.hash='token='+encodeURIComponent(record.token);
  return target.href;
 }
 function finished(record){
  form.hidden=true;
  document.getElementById('quoteSuccessCode').textContent=record.code;
  document.getElementById('quotePrivateLink').href=receiptLink(record);
  document.getElementById('quoteSuccess').hidden=false;
  message('');
  try{sessionStorage.removeItem(draftKey);}catch{}
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(busy||!validStep(3))return;
  const attachments=selectedFiles();
  const problem=validateFiles(attachments);if(problem){setStep(2);message(problem,true);return;}
  const data=values();
  if(data.description?.trim().length<20){setStep(1);message('Contanos un poco más sobre tu proyecto.',true);return;}
  if(!document.getElementById('quotePrivacy').checked){message('Necesitamos tu aceptación de la política de privacidad.',true);return;}
  const payload={
   full_name:data.full_name,email:data.email,phone:data.phone,city:data.city,
   project_type:data.project_type,description:data.description,measurements:data.measurements||'',
   materials:data.materials||'',finish:data.finish||'',quantity:Number(data.quantity),
   desired_date:data.desired_date||null,budget_ars:data.budget_ars?Number(data.budget_ars):null,
   delivery:data.delivery
  };
  const sig=fingerprint(payload);
  if(!draft||draft.fingerprint!==sig){
   draft={submission_id:crypto.randomUUID(),token:newToken(),fingerprint:sig};
   uploaded.clear();saveDraft();
  }
  disabled(true);
  try{
   message('Registrando tu proyecto…');
   if(!draft.quote_id){
    const result=await api('start',{...payload,submission_id:draft.submission_id,token:draft.token});
    if(!result?.quote_id||!result.code)throw Error('No recibimos un número de solicitud.');
    draft.quote_id=result.quote_id;draft.code=result.code;saveDraft();
   }
   if(draft.status!=='new'){
    for(const [index,file] of attachments.entries()){
     const signature=[file.name,file.size,file.lastModified,index].join(':');
     if(uploaded.has(signature))continue;
     message('Guardando referencia '+(index+1)+' de '+attachments.length+'…');
     const body=new FormData();
     body.append('quote_id',draft.quote_id);body.append('token',draft.token);body.append('file',file,file.name);
     const uploadedResponse=await api('upload',{},body);
     if(!uploadedResponse.ok)throw Error('No se pudo guardar '+file.name);
     uploaded.add(signature);
    }
    message('Confirmando solicitud y preparando el aviso al taller…');
    const result=await api('finish',{quote_id:draft.quote_id,token:draft.token});
    draft.code=result.code;draft.status=result.status;
   }
   if(draft.status==='draft')throw Error('La solicitud todavía no está confirmada.');
   finished(draft);
  }catch(error){
   message(error?.message||'Hubo un problema. Podés volver a enviar sin duplicar la solicitud.',true);
  }finally{disabled(false);}
 });
 const url=new URL(location.href),lookupId=url.searchParams.get('solicitud'),lookupCode=url.searchParams.get('codigo');
 const token=new URLSearchParams(location.hash.replace(/^#/,'' )).get('token');
 if(UUID.test(lookupId||'')&&/^COT-[0-9]{4}-[0-9]{6,12}$/.test(lookupCode||'')&&TOKEN.test(token||'')){
  form.hidden=true;
  const area=document.getElementById('quoteLookup');area.hidden=false;
  const label=document.getElementById('quoteLookupStatus');label.textContent='Consultando…';
  api('status',{quote_id:lookupId,token}).then(result=>{
   if(result.code!==lookupCode)throw Error('Código no coincide.');
   label.textContent=(statusNames[result.status]||'En revisión')+' · '+result.code;
   const date=new Date(result.created_at);
   document.getElementById('quoteLookupDate').textContent='Registrada: '+(Number.isNaN(date.getTime())?'—':date.toLocaleString('es-AR'));
  }).catch(()=>{label.textContent='No pudimos verificar el enlace privado. Revisá que esté completo.';});
 }
 setStep(1);
})();
