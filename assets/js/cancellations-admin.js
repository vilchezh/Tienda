(() => {
 'use strict';
 const body=document.getElementById('cancellationsTableBody');
 const feedback=document.getElementById('cancellationsAdminStatus');
 const detail=document.getElementById('cancellationAdminDetail');
 const saveStatus=document.getElementById('cancellationSaveStatus');
 const stateInput=document.getElementById('cancellationAdminState');
 const noteInput=document.getElementById('cancellationAdminNote');
 const labels={received:'Recibida',reviewing:'En revisión',approved:'Aprobada (sin reembolso automático)',denied:'Respuesta desfavorable',closed:'Cerrada'};
 let selected=null,rows=[],loadVersion=0;
 const fmt=value=>{const date=new Date(value);return Number.isNaN(date.getTime())?'—':date.toLocaleString('es-AR');};
 const setFeedback=message=>{feedback.textContent=message;};
 const newCell=(tr,value)=>{
  const td=document.createElement('td');
  td.textContent=value==null?'—':String(value);
  tr.append(td);
  return td;
 };
 function showRow(row){
  selected=row;
  detail.hidden=false;
  document.getElementById('cancellationSelectedCode').textContent=row.code;
  document.getElementById('cancellationSelectedInfo').textContent=
   'Registrada: '+fmt(row.created_at)+' · Correo indicado: '+row.customer_email+
   ' · Pedido: '+(row.order_id||row.order_reference||'Sin referencia');
  document.getElementById('cancellationSelectedMessage').textContent=row.message?'Mensaje: '+row.message:'Sin mensaje adicional.';
  const emailRows=Array.isArray(row.checkout_cancellation_emails)?row.checkout_cancellation_emails:[];
  const customer=emailRows.find(item=>item.recipient_type==='customer');
  const seller=emailRows.find(item=>item.recipient_type==='seller');
  const describe=item=>item?(item.status==='sent'?'Enviado':item.last_error==='sandbox_customer_not_allowlisted'?'No enviado (correo fuera de lista de pruebas)':item.status==='rejected'?'Error de envío':item.status==='pending'?'Pendiente de envío':'En procesamiento'):'No registrado';
  document.getElementById('cancellationEmailInfo').textContent=
   'Correo comprador: '+describe(customer)+' · Aviso al taller: '+describe(seller);
  stateInput.value=row.status;
  noteInput.value=row.admin_note||'';
  saveStatus.textContent='';
 }
 function render(){
  body.replaceChildren();
  for(const row of rows){
   const tr=document.createElement('tr');
   tr.tabIndex=0;
   tr.className=row.id===selected?.id?'active':'';
   newCell(tr,fmt(row.created_at));
   newCell(tr,row.code);
   newCell(tr,row.customer_email);
   newCell(tr,labels[row.status]||row.status);
   const open=()=>{showRow(row);render();};
   tr.addEventListener('click',open);
   tr.addEventListener('keydown',event=>{
    if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}
   });
   body.append(tr);
  }
 }
 async function open(){
  const version=++loadVersion;
  selected=null;detail.hidden=true;body.replaceChildren();setFeedback('Cargando solicitudes…');
  try{
   const client=Store.createClient();
   const {data:permission,error:permissionError}=await client.rpc('storefront_admin_authorized');
   if(version!==loadVersion)return;
   if(permissionError||permission!==true)throw Error('no_authorized');
   const {data,error}=await client.from('checkout_cancellation_requests')
    .select('id,code,customer_email,order_reference,order_id,message,status,admin_note,created_at,checkout_cancellation_emails(recipient_type,status,last_error,sent_at)')
    .order('created_at',{ascending:false}).limit(100);
   if(version!==loadVersion)return;
   if(error||!Array.isArray(data))throw Error('read_failed');
   rows=data;
   render();
   setFeedback(data.length?data.length+' solicitudes recientes. Seleccioná una para revisarla.':'Todavía no hay solicitudes registradas.');
  }catch{
   if(version===loadVersion){rows=[];render();detail.hidden=true;setFeedback('No pudimos consultar solicitudes. Comprobá tu sesión, permisos y conexión.');}
  }
 }
 async function save(){
  if(!selected)return;
  const status=stateInput.value;
  const note=noteInput.value.trim();
  if(!Object.hasOwn(labels,status)||note.length>1000){
   saveStatus.textContent='Revisá el estado y la nota.';return;
  }
  if(!confirm('¿Guardar la revisión del trámite '+selected.code+'? No se realizará ningún reembolso automático.'))return;
  const button=document.getElementById('btnSaveCancellation');
  button.disabled=true;saveStatus.textContent='Guardando revisión…';
  try{
   const client=Store.createClient();
   const {data:permission,error:permissionError}=await client.rpc('storefront_admin_authorized');
   if(permissionError||permission!==true)throw Error('forbidden');
   const {data,error}=await client.from('checkout_cancellation_requests')
    .update({status,admin_note:note}).eq('id',selected.id).select('id,status,admin_note').single();
   if(error||!data||data.id!==selected.id)throw Error('update_failed');
   Object.assign(selected,data);
   render();
   saveStatus.textContent='Revisión guardada. No se ejecutó ningún pago ni devolución.';
  }catch{saveStatus.textContent='No se pudo guardar. Revisá los permisos y reintentá.';}
  finally{button.disabled=false;}
 }
 document.getElementById('btnRefreshCancellations').addEventListener('click',open);
 document.getElementById('btnSaveCancellation').addEventListener('click',save);
 window.CancellationAdmin={open,close:()=>{loadVersion++;selected=null;detail.hidden=true;}};
})();
