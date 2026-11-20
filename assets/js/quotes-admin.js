(() => {
 'use strict';
 const by=id=>document.getElementById(id);
 const pane=by('customQuotesAdmin'),tbody=by('customQuotesRows'),detail=by('customQuoteDetail');
 const status=by('customQuotesListStatus'),saveStatus=by('customQuoteSaveStatus');
 const labels={new:'Nueva',reviewing:'En revisión',need_info:'Falta información',quoted:'Presupuestado',accepted:'Aceptado',declined:'Descartado'};
 const purchases=['.orders-toolbar','#ordersStatus','.orders-pagination','.orders-workspace'];
 let rows=[],selected=null,active=false,loadVersion=0;
 const fmtDate=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('es-AR');};
 const asMoney=v=>v==null?'A definir':'$'+Number(v).toLocaleString('es-AR');
 const cell=(tr,value)=>{
  const td=document.createElement('td');td.textContent=String(value??'—');tr.appendChild(td);return td;
 };
 const line=(container,label,value)=>{
  const div=document.createElement('div');
  const title=document.createElement('strong'),data=document.createElement('span');
  title.textContent=label;data.textContent=String(value??'—');div.append(title,data);container.appendChild(div);
 };
 function showSelected(row){
  selected=row;detail.hidden=false;saveStatus.textContent='';
  by('customQuoteDetailCode').textContent=row.code;
  const info=by('customQuoteDetailInfo');info.replaceChildren();
  line(info,'Fecha',fmtDate(row.created_at));
  line(info,'Cliente',row.full_name);
  line(info,'Email',row.email);
  line(info,'Teléfono',row.phone);
  line(info,'Localidad',row.city);
  line(info,'Tipo de proyecto',row.project_type);
  line(info,'Descripción',row.description);
  line(info,'Medidas',row.measurements||'Por definir');
  const prefs=row.quote_preferences;
  if(prefs&&Array.isArray(prefs.metal_materials)&&Array.isArray(prefs.wood_materials)){
   line(info,'Materiales metálicos',prefs.metal_materials.join(', ')||'Sin preferencia');
   line(info,'Maderas',prefs.wood_materials.join(', ')||'Sin preferencia');
   line(info,'Color del metal',prefs.metal_color||'Sin preferencia');
   line(info,'Acabado del metal',prefs.metal_finish||'Sin preferencia');
   line(info,'Tono de madera',prefs.wood_tone||'Sin preferencia');
   line(info,'Acabado de madera',prefs.wood_finish||'Sin preferencia');
  }else{
   line(info,'Materiales',row.materials||'Por definir');
   line(info,'Terminación',row.finish||'Por definir');
  }
  line(info,'Cantidad',row.quantity);
  line(info,'Presupuesto orientativo',asMoney(row.budget_ars));
  line(info,'Fecha deseada',row.desired_date||'A coordinar');
  line(info,'Entrega',row.delivery);
  const links=by('customQuoteFiles');links.replaceChildren();
  const attachments=Array.isArray(row.custom_quote_files)?row.custom_quote_files:[];
  if(!attachments.length){const li=document.createElement('li');li.textContent='No adjuntó archivos.';links.appendChild(li);}
  for(const file of attachments){
   const li=document.createElement('li'),button=document.createElement('button');
   button.type='button';button.className='btn btn-sm';
   button.textContent='↓ Descargar '+file.original_name+' ('+(file.byte_size/1048576).toFixed(2)+' MB)';
   button.addEventListener('click',()=>downloadFile(file,button));
   li.appendChild(button);links.appendChild(li);
  }
  by('customQuoteState').value=labels[row.status]?row.status:'new';
  by('customQuotePrice').value=row.quoted_amount==null?'':String(row.quoted_amount);
  by('customQuoteNote').value=row.admin_note||'';
 }
 async function downloadFile(file,button){
  const original=button.textContent;button.disabled=true;button.textContent='Descargando archivo privado…';
  try{
   const client=Store.createClient();
   const {data:permission,error:err}=await client.rpc('storefront_admin_authorized');
   if(err||permission!==true)throw Error('not_authorized');
   // La clave del bucket es pública; los permisos reales se aplican con RLS.
   const bucket=String(window.STORE_CONFIG?.quoteStorageBucket||'');
   if(!['quote-reference','quote-reference-sandbox'].includes(bucket))throw Error('private_bucket_unconfigured');
   const {data,error}=await client.storage.from(bucket).download(file.storage_path);
   if(error||!data)throw Error('download_failed');
   // Se obliga la descarga. No insertar el archivo en iframe, img, object o window.open.
   const blob=new Blob([data],{type:'application/octet-stream'});
   const url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download=String(file.original_name||'referencia').replace(/[^\p{L}\p{N}._() -]/gu,'_');
   document.body.appendChild(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),12000);
   saveStatus.textContent='Archivo descargado. Tratá cualquier PDF como no verificado.';
  }catch{saveStatus.textContent='No se pudo descargar el archivo. Revisá tu sesión y permisos.';}
  finally{button.disabled=false;button.textContent=original;}
 }
 function render(){
  tbody.replaceChildren();
  const term=by('customQuoteSearch').value.trim().toLocaleLowerCase('es');
  const filter=by('customQuoteStatusFilter').value;
  const visible=rows.filter(row=>row.status!=='draft'&&row.status!=='expired')
    .filter(row=>filter==='all'||row.status===filter)
    .filter(row=>!term||[row.code,row.full_name,row.email,row.project_type,row.city].some(v=>String(v||'').toLocaleLowerCase('es').includes(term)));
  for(const row of visible){
   const tr=document.createElement('tr');tr.tabIndex=0;
   if(selected?.id===row.id)tr.classList.add('active');
   cell(tr,fmtDate(row.created_at));cell(tr,row.code);cell(tr,row.full_name);cell(tr,labels[row.status]||row.status);
   const open=()=>{showSelected(row);render();};
   tr.addEventListener('click',open);
   tr.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});
   tbody.appendChild(tr);
  }
  status.textContent=visible.length?visible.length+' solicitudes mostradas (máximo 100 más recientes).':'No hay presupuestos con esos filtros.';
 }
 async function open(){
  if(!active)return;
  const current=++loadVersion;rows=[];selected=null;detail.hidden=true;
  tbody.replaceChildren();status.textContent='Cargando presupuestos…';
  try{
   const client=Store.createClient();
   const {data:authorized,error:authError}=await client.rpc('storefront_admin_authorized');
   if(current!==loadVersion)return;
   if(authError||authorized!==true)throw Error('no_admin');
   const {data,error}=await client.from('custom_quote_requests')
    .select('id,code,status,full_name,email,phone,city,project_type,description,measurements,materials,finish,quote_preferences,quantity,desired_date,budget_ars,delivery,admin_note,quoted_amount,created_at,custom_quote_files(id,storage_path,original_name,mime_type,byte_size)')
    .order('created_at',{ascending:false}).limit(100);
   if(current!==loadVersion)return;
   if(error||!Array.isArray(data))throw Error('fetch_failed');
   rows=data;render();
  }catch{
   if(current===loadVersion){rows=[];tbody.replaceChildren();detail.hidden=true;status.textContent='No pudimos cargar presupuestos. Revisá tu sesión, permisos o conexión.';}
  }
 }
 async function save(){
  if(!selected)return;
  const state=by('customQuoteState').value,note=by('customQuoteNote').value.trim(),priceRaw=by('customQuotePrice').value;
  const price=priceRaw===''?null:Number(priceRaw);
  if(!labels[state]||note.length>2000||(price!==null&&(!Number.isSafeInteger(price)||price<0||price>999999999))){
   saveStatus.textContent='Revisá los campos del presupuesto.';return;
  }
  if(!confirm('¿Guardar cambios en '+selected.code+'? No se hará ningún cobro ni se enviará un presupuesto automáticamente.'))return;
  const button=by('btnSaveCustomQuote');button.disabled=true;saveStatus.textContent='Guardando…';
  try{
   const client=Store.createClient();
   const {data:authorized,error:authError}=await client.rpc('storefront_admin_authorized');
   if(authError||authorized!==true)throw Error('no_admin');
   const {data,error}=await client.from('custom_quote_requests').update({
    status:state,admin_note:note,quoted_amount:price
   }).eq('id',selected.id).select('id,status,admin_note,quoted_amount').single();
   if(error||!data||data.id!==selected.id)throw Error('save_failed');
   Object.assign(selected,data);render();
   saveStatus.textContent='Guardado correctamente. No se realizaron pagos ni se enviaron cotizaciones.';
  }catch{saveStatus.textContent='No pudimos guardar. Revisá permisos e intentá nuevamente.';}
  finally{button.disabled=false;}
 }
 function selectTab(to){
  active=to==='quotes';
  pane.hidden=!active;
  const container=by('ordersAdmin');
  for(const selector of purchases){
   const el=container.querySelector(selector);if(el)el.hidden=active;
  }
  for(const [id,chosen] of [['btnOrdersShowPurchases',!active],['btnOrdersShowQuotes',active]]){
   const button=by(id);button.classList.toggle('btn-primary',chosen);button.setAttribute('aria-pressed',String(chosen));
  }
  if(active){open();window.CustomQuoteOptions?.open();}
  else{loadVersion++;selected=null;detail.hidden=true;}
 }
 by('btnOrdersShowPurchases').addEventListener('click',()=>selectTab('purchases'));
 by('btnOrdersShowQuotes').addEventListener('click',()=>selectTab('quotes'));
 by('btnRefreshCustomQuotes').addEventListener('click',open);
 by('btnSaveCustomQuote').addEventListener('click',save);
 by('customQuoteSearch').addEventListener('input',render);
 by('customQuoteStatusFilter').addEventListener('change',render);
 window.CustomQuotesAdmin={active:()=>active,open,close:()=>{loadVersion++;selected=null;detail.hidden=true;}};
})();
