(() => {
  const names=['hero','featured','catalog','custom'];
  const labels={hero:'Encabezado',featured:'Destacados',catalog:'Colección',custom:'A medida'};
  let current=null, requestVersion=0;
  const status=document.getElementById('homeEditorStatus');
  const orderBox=document.getElementById('homeSectionOrder');
  const featuredBox=document.getElementById('homeFeaturedProducts');
  const fields={hero_eyebrow:'homeEyebrow',hero_title:'homeTitle',hero_description:'homeDescription',hero_image:'homeImage'};
  function setStatus(value){status.textContent=value;}
  function renderOrder(){
    orderBox.replaceChildren();
    current.section_order.forEach((key,index)=>{
      const row=document.createElement('div');row.className='home-section-item';
      const span=document.createElement('span');span.textContent=(index+1)+'. '+labels[key];row.appendChild(span);
      const check=document.createElement('input');check.type='checkbox';check.checked=current.sections_visible[key]!==false;check.setAttribute('aria-label','Mostrar '+labels[key]);
      check.addEventListener('change',()=>{current.sections_visible[key]=check.checked;});row.appendChild(check);
      for(const [label,step] of [['Subir',-1],['Bajar',1]]){
        const button=document.createElement('button');button.type='button';button.className='btn btn-sm';button.textContent=label;button.setAttribute('aria-label',label+' '+labels[key]);
        button.disabled=index+step<0||index+step>=4;
        button.addEventListener('click',()=>{
          [current.section_order[index],current.section_order[index+step]]=[current.section_order[index+step],current.section_order[index]];
          renderOrder();
        });
        row.appendChild(button);
      }
      orderBox.appendChild(row);
    });
  }
  function renderFeatured(){
    featuredBox.replaceChildren();
    for(const product of (window.StorefrontAdminProducts||[]).filter(p=>p.activo===true)){
      const label=document.createElement('label'),input=document.createElement('input');
      input.type='checkbox';input.value=product.id;input.checked=current.featured_product_ids.includes(product.id);
      input.addEventListener('change',()=>{
        if(input.checked){
          if(current.featured_product_ids.length>=12){input.checked=false;setStatus('Elegí como máximo 12 piezas.');return;}
          current.featured_product_ids.push(input.value);
        }else current.featured_product_ids=current.featured_product_ids.filter(x=>x!==input.value);
      });
      label.appendChild(input);
      const text=document.createElement('span');text.textContent=String(product.nombre||product.id);label.appendChild(text);
      featuredBox.appendChild(label);
    }
  }
  async function open(){
    const version=++requestVersion;
    setStatus('Cargando configuración del inicio…');
    try{
      const {data,error}=await Store.createClient().from('storefront_content').select('*').eq('id','home').single();
      if(version!==requestVersion)return;
      if(error||!data||!Array.isArray(data.section_order)||data.section_order.length!==4||!names.every(x=>data.section_order.includes(x)))throw Error('schema');
      current={...data,section_order:[...data.section_order],sections_visible:{...data.sections_visible},featured_product_ids:[...(data.featured_product_ids||[])]};
      for(const [column,id] of Object.entries(fields))document.getElementById(id).value=String(current[column]||'');
      renderOrder();renderFeatured();
      document.getElementById('btnSaveHome').disabled=false;
      setStatus('Editá el inicio. Los cambios se guardan solo al pulsar «Guardar inicio».');
    }catch{
      current=null;orderBox.replaceChildren();featuredBox.replaceChildren();
      document.getElementById('btnSaveHome').disabled=true;
      setStatus('El editor no está disponible: primero se debe aplicar la migración del Issue #5 en el sandbox.');
    }
  }
  document.getElementById('homeHeroUpload').addEventListener('change', async event=>{
    if(!current){event.target.value='';return;}
    const file=event.target.files?.[0];
    if(!file)return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size<=0||file.size>4*1024*1024){
      setStatus('La imagen debe ser PNG, JPG o WebP y pesar menos de 4 MB.');event.target.value='';return;
    }
    const extensions={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
    const target='home/hero-'+crypto.randomUUID()+'.'+extensions[file.type];
    const input=event.target;
    input.disabled=true;setStatus('Subiendo imagen al almacenamiento del sandbox…');
    try{
      const client=Store.createClient();
      const {error}=await client.storage.from('tienda').upload(target,file,{upsert:false,contentType:file.type});
      if(error)throw error;
      const {data}=client.storage.from('tienda').getPublicUrl(target);
      if(!data?.publicUrl||!Store.assetURL(data.publicUrl))throw Error('url');
      document.getElementById('homeImage').value=data.publicUrl;
      setStatus('Imagen subida. Para usarla, pulsá «Guardar inicio».');
    }catch{
      setStatus('No se pudo subir la imagen. Verificá que la cuenta tenga permisos de Storage.');
    }finally{input.disabled=false;input.value='';}
  });
  document.getElementById('btnSaveHome').addEventListener('click',async()=>{
    if(!current)return;
    const values={};
    for(const [column,id] of Object.entries(fields))values[column]=document.getElementById(id).value.trim();
    const image=values.hero_image;
    if(!values.hero_eyebrow||values.hero_eyebrow.length>80||!values.hero_title||values.hero_title.length>100||!values.hero_description||values.hero_description.length>420||!image||image.length>500||!(image.startsWith('assets/img/')||image.startsWith('https://'))||!Store.assetURL(image)){
      setStatus('Revisá los textos y la imagen: debe ser ruta assets/img/ o URL HTTPS válida.');return;
    }
    if(!confirm('¿Publicar estos cambios en el inicio del sandbox?'))return;
    const button=document.getElementById('btnSaveHome');button.disabled=true;setStatus('Guardando…');
    const data={...values,section_order:current.section_order,sections_visible:current.sections_visible,featured_product_ids:current.featured_product_ids,updated_at:new Date().toISOString()};
    try{
      const {error}=await Store.createClient().from('storefront_content').update(data).eq('id','home');
      if(error)throw error;
      Object.assign(current,data);
      setStatus('Inicio guardado. Abrí la vista pública para revisar los cambios.');
    }catch{setStatus('No se pudo guardar. Comprobá la conexión y tus permisos de administrador.');}
    finally{button.disabled=false;}
  });
  window.StorefrontEditor={open,close:()=>{++requestVersion;current=null;document.getElementById('btnSaveHome').disabled=true;}};
})();
