(() => {
 'use strict';
 const fields={
  metal_materials:'optionMetalMaterials',wood_materials:'optionWoodMaterials',
  metal_colors:'optionMetalColors',metal_finishes:'optionMetalFinishes',
  wood_tones:'optionWoodTones',wood_finishes:'optionWoodFinishes'
 };
 const status=document.getElementById('quoteOptionsStatus');
 const saveButton=document.getElementById('btnSaveQuoteOptions');
 const reloadButton=document.getElementById('btnReloadQuoteOptions');
 const panel=document.getElementById('customQuoteOptionsPanel');
 let loaded=false,requestId=0,busy=false;
 function feedback(message){status.textContent=message;}
 function setBusy(next){busy=next;saveButton.disabled=next||!loaded;reloadButton.disabled=next;}
 function parseValue(text,label){
  const values=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(!values.length)throw Error('Agregá al menos una opción en «'+label+'».');
  if(values.length>20)throw Error('Máximo 20 opciones en «'+label+'».');
  if(values.some(x=>x.length>70))throw Error('Cada opción de «'+label+'» admite hasta 70 caracteres.');
  if(new Set(values.map(x=>x.toLocaleLowerCase('es'))).size!==values.length)
   throw Error('Hay opciones repetidas en «'+label+'».');
  return values;
 }
 function fill(row){
  for(const [key,id] of Object.entries(fields)){
   const list=Array.isArray(row[key])?row[key]:[];
   document.getElementById(id).value=list.join('\n');
  }
  loaded=true;setBusy(false);feedback('Opciones cargadas. Podés modificar una línea por opción.');
 }
 async function read(){
  const version=++requestId;
  loaded=false;setBusy(true);feedback('Cargando opciones del formulario…');
  try{
   const client=Store.createClient();
   const {data:authorized,error:permissionError}=await client.rpc('storefront_admin_authorized');
   if(version!==requestId)return;
   if(permissionError||authorized!==true)throw Error('sin permisos');
   const {data,error}=await client.from('custom_quote_options').select('*').eq('id','default').single();
   if(version!==requestId)return;
   if(error||!data)throw Error('lectura fallida');
   fill(data);
  }catch{
   if(version!==requestId)return;
   feedback('No se pudieron cargar las opciones. Revisá tu sesión y conexión.');
   saveButton.disabled=true;reloadButton.disabled=false;
  }
 }
 async function save(){
  if(busy||!loaded)return;
  const values={};
  try{
   for(const [key,id] of Object.entries(fields)){
    const label=document.querySelector('label[for="'+id+'"]').textContent.trim();
    values[key]=parseValue(document.getElementById(id).value,label);
   }
  }catch(error){feedback(error.message);return;}
  setBusy(true);feedback('Guardando las opciones…');
  try{
   const client=Store.createClient();
   const {data:authorized,error:permissionError}=await client.rpc('storefront_admin_authorized');
   if(permissionError||authorized!==true)throw Error('sin permisos');
   const {data,error}=await client.from('custom_quote_options').update({
    ...values,updated_at:new Date().toISOString()
   }).eq('id','default')
     .select('id,metal_materials,wood_materials,metal_colors,metal_finishes,wood_tones,wood_finishes')
     .single();
   if(error||!data)throw Error('no se pudo guardar');
   fill(data);feedback('Opciones actualizadas. Se mostrarán en las nuevas solicitudes al recargar el formulario.');
  }catch{feedback('No pudimos guardar. Revisá permisos o conexión y reintentá.');}
  finally{setBusy(false);}
 }
 reloadButton.addEventListener('click',read);
 saveButton.addEventListener('click',save);
 panel.addEventListener('toggle',()=>{if(panel.open&&!loaded)read();});
 window.CustomQuoteOptions={open:()=>{if(!loaded)read();},close:()=>{requestId++;}};
 saveButton.disabled=true;
})();