(() => {
 'use strict';
 const defaults={
  metal_materials:['Caño estructural 20×20 mm','Caño estructural 30×30 mm','Caño estructural 40×40 mm','Caño estructural 50×50 mm','Ángulo de hierro','Chapa lisa','Malla metálica'],
  wood_materials:['Pino 20 mm','Pino 30 mm','Eucalipto 20 mm','Eucalipto 30 mm','Contrachapado 18 mm'],
  metal_colors:['Negro','Blanco','Gris grafito','Rojo','Verde'],
  metal_finishes:['Mate','Satinado','Brillante'],
  wood_tones:['Natural','Roble claro','Roble oscuro','Nogal','Wengué'],
  wood_finishes:['Mate','Satinado','Brillante']
 };
 const names={
  metal_materials:'quoteMetalMaterials',wood_materials:'quoteWoodMaterials',
  metal_color:'quoteMetalColor',metal_finish:'quoteMetalFinish',
  wood_tone:'quoteWoodTone',wood_finish:'quoteWoodFinish'
 };
 const values={...defaults};
 let touched=false;
 document.getElementById('quoteForm').addEventListener('input',()=>{touched=true;});
 document.getElementById('quoteForm').addEventListener('change',()=>{touched=true;});
 const selectable=[['metal_color','metal_colors'],['metal_finish','metal_finishes'],
   ['wood_tone','wood_tones'],['wood_finish','wood_finishes']];
 const elements={};
 const clean=value=>typeof value==='string'?value.trim():'';
 const safeList=(raw,fallback)=>{
  if(!Array.isArray(raw)||raw.length<1||raw.length>20||!raw.every(x=>typeof x==='string'&&x.trim().length>=1&&x.trim().length<=70))return [...fallback];
  return raw.map(s=>s.trim());
 };
 function materialOptions(id,list){
  const root=document.getElementById(names[id]);root.replaceChildren();
  for(const option of list){
   const label=document.createElement('label');label.className='quote-material-chip';
   const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=option;
   checkbox.dataset.quoteGroup=id;
   const span=document.createElement('span');span.textContent=option;
   label.append(checkbox,span);root.appendChild(label);
   checkbox.addEventListener('change',updateVisibility);
  }
 }
 function selectOptions(id,list){
  const select=document.getElementById(names[id]);select.replaceChildren();
  const none=document.createElement('option');none.value='';none.textContent='Sin preferencia';select.appendChild(none);
  for(const option of list){
   const item=document.createElement('option');item.value=option;item.textContent=option;select.appendChild(item);
  }
  const other=document.createElement('option');other.value='__custom__';other.textContent='Otro (escribir)';select.appendChild(other);
  select.onchange=()=>{
   const custom=elements[id];
   custom.hidden=select.value!=='__custom__';
   if(!custom.hidden)custom.focus();else custom.value='';
  };
 }
 function selectedGroup(key){
  const selected=[...document.querySelectorAll('[data-quote-group="'+key+'"]:checked')].map(x=>x.value);
  const toggle=document.querySelector('[data-other-toggle="'+key+'"]');
  const other=document.querySelector('[data-other-value="'+key+'"]');
  if(toggle?.checked&&clean(other?.value))selected.push(clean(other.value));
  return [...new Set(selected)];
 }
 function syncMaterialDropdown(key){
  const selected=selectedGroup(key);
  const toggle=document.querySelector('[data-other-toggle="'+key+'"]');
  const summary=document.getElementById(key==='metal_materials'?'quoteMetalSummary':'quoteWoodSummary');
  const clear=document.querySelector('[data-clear-materials="'+key+'"]');
  const empty=selected.length===0&&!toggle?.checked;
  summary.textContent=empty?'Sin preferencia':
   selected.length>2?selected.length+' materiales seleccionados':
   selected.length?selected.join(', '):'Otro (escribir)';
  summary.title=selected.join(', ')||'Sin preferencia';
  clear.classList.toggle('is-active',empty);
  clear.setAttribute('aria-pressed',String(empty));
 }
 function updateVisibility(){
  // Los colores y acabados son independientes de los materiales seleccionados.
  // Únicamente se actualiza el resumen de ambos desplegables.
  syncMaterialDropdown('metal_materials');
  syncMaterialDropdown('wood_materials');
 }
 for(const [key] of selectable)elements[key]=document.querySelector('[data-choice-custom="'+key+'"]');
 for(const toggle of document.querySelectorAll('[data-other-toggle]')){
  const input=document.querySelector('[data-other-value="'+toggle.dataset.otherToggle+'"]');
  toggle.addEventListener('change',()=>{
   input.hidden=!toggle.checked;
   if(toggle.checked)input.focus();else input.value='';
   updateVisibility();
  });
  input.addEventListener('input',updateVisibility);
 }
 for(const button of document.querySelectorAll('[data-clear-materials]')){
  button.addEventListener('click',()=>{
   const key=button.dataset.clearMaterials;
   for(const option of document.querySelectorAll('[data-quote-group="'+key+'"]'))option.checked=false;
   const toggle=document.querySelector('[data-other-toggle="'+key+'"]');
   const input=document.querySelector('[data-other-value="'+key+'"]');
   toggle.checked=false;input.value='';input.hidden=true;
   updateVisibility();
   button.closest('details').open=false;
  });
 }
 const materialDropdowns=[...document.querySelectorAll('[data-material-dropdown]')];
 for(const dropdown of materialDropdowns){
  dropdown.addEventListener('toggle',()=>{
   if(dropdown.open)for(const other of materialDropdowns)if(other!==dropdown)other.open=false;
  });
 }
 document.addEventListener('pointerdown',event=>{
  for(const dropdown of materialDropdowns){
   if(dropdown.open&&!dropdown.contains(event.target))dropdown.open=false;
  }
 });
 function render(config){
  for(const key of Object.keys(defaults))values[key]=safeList(config?.[key],defaults[key]);
  materialOptions('metal_materials',values.metal_materials);
  materialOptions('wood_materials',values.wood_materials);
  for(const [key,configKey] of selectable)selectOptions(key,values[configKey]);
  updateVisibility();
 }
 function getSingle(key){
  const select=document.getElementById(names[key]);
  return select.value==='__custom__'?clean(elements[key].value):clean(select.value);
 }
 function collect(){
  const metal=selectedGroup('metal_materials');
  const wood=selectedGroup('wood_materials');
  const choices={
   metal_materials:metal,
   wood_materials:wood,
   metal_color:getSingle('metal_color'),
   metal_finish:getSingle('metal_finish'),
   wood_tone:getSingle('wood_tone'),
   wood_finish:getSingle('wood_finish')
  };
  const all=[...metal,...wood,choices.metal_color,choices.metal_finish,choices.wood_tone,choices.wood_finish];
  if(all.some(s=>s.length>70))throw Error('Usá como máximo 70 caracteres por material, color o acabado.');
  if(metal.length>8||wood.length>8)throw Error('Elegí hasta 8 materiales por grupo.');
  for(const key of ['metal_color','metal_finish','wood_tone','wood_finish']){
   const el=elements[key],select=document.getElementById(names[key]);
   if(select.value==='__custom__'&&!choices[key])
    throw Error('Completá la opción «Otro» o elegí «Sin preferencia».');
  }
  for(const key of ['metal_materials','wood_materials']){
   const toggle=document.querySelector('[data-other-toggle="'+key+'"]');
   const input=document.querySelector('[data-other-value="'+key+'"]');
   if(toggle.checked&&!clean(input.value))throw Error('Escribí el material personalizado o desmarcá «Otro».');
  }
  return choices;
 }
 render(defaults);
 async function fetchOptions(){
  const config=window.STORE_CONFIG;
  if(!config?.supabaseUrl||!config.supabaseAnonKey)return;
  try{
   const response=await fetch(config.supabaseUrl.replace(/\/$/,'')+'/rest/v1/custom_quote_options?select=*&id=eq.default&limit=1',{
    headers:{apikey:config.supabaseAnonKey,Authorization:'Bearer '+config.supabaseAnonKey},cache:'no-store',signal:AbortSignal.timeout(8000)
   });
   if(!response.ok)return;
   const data=await response.json();
   const options=Array.isArray(data)?data[0]:null;
   if(!options)return;
   if(touched)return;
   render(options);
  }catch { /* Si el servidor no está disponible, usar las opciones seguras de respaldo. */ }
 }
 window.QuoteChoices={collect,fetchOptions};
 fetchOptions();
})();