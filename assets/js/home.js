(() => {
  const sections = { hero: document.getElementById('heroGroup'), featured: document.getElementById('featuredSection'), catalog: document.getElementById('catalogSection'), custom: document.getElementById('a-medida') };
  const sectionNames=['hero','featured','catalog','custom'];
  const defaults={hero_eyebrow:'ACERO FIRME. MADERA VIVA.',hero_title:'Diseño que deja huella.',hero_description:'Piezas de carácter industrial para darle identidad a tu espacio. Elegí los materiales, explorá cada detalle y hacela tuya.',hero_image:'assets/img/email-pangolin-708c76-sharp.png',section_order:sectionNames,sections_visible:{hero:true,featured:true,catalog:true,custom:true},featured_product_ids:[]};
  let settings=defaults, products=[], checkoutConfig=null;
  const track=document.getElementById('featuredTrack'),root=document.getElementById('homeSections');
  function safeImage(value) {
    if (typeof value!=='string'||value.length>500||!(value.startsWith('assets/img/')||value.startsWith('https://')))return '';
    return Store.assetURL(value);
  }
  function renderFeatured(){
    track.replaceChildren();
    const ids=Array.isArray(settings.featured_product_ids)?settings.featured_product_ids:[];
    for(const id of ids.slice(0,12)){
      const item=products.find(p=>p.id===id && p.activo===true);
      if(!item)continue;
      const link=document.createElement('a');link.className='featured-card';link.href='producto.html?id='+encodeURIComponent(item.id);
      const picture=safeImage(item.imagen);
      if(picture){const img=document.createElement('img');img.src=picture;img.loading='lazy';img.alt=String(item.nombre||'Pieza destacada');link.appendChild(img);}
      const name=document.createElement('strong');name.textContent=String(item.nombre||'Pieza destacada');link.appendChild(name);
      if(checkoutConfig)try{
        const amount=Store.priceBreakdown(item.precio_base??item.precioBase,Store.defaultWoodDelta(item),0,checkoutConfig.commissionPercent).total;
        const label=document.createElement('span');label.textContent='$'+amount.toLocaleString('es-AR')+' ARS';link.appendChild(label);
      }catch{ /* Never expose an incomplete total. */ }
      track.appendChild(link);
    }
    sections.featured.hidden=!track.childElementCount||settings.sections_visible?.featured===false;
  }
  function updateHome(row){
    if(!row||typeof row!=='object')return;
    settings={...defaults,...row};
    if(typeof row.hero_title==='string'&&row.hero_title.trim())document.getElementById('heroTitle').textContent=row.hero_title;
    if(typeof row.hero_eyebrow==='string'&&row.hero_eyebrow.trim())document.getElementById('heroEyebrow').textContent=row.hero_eyebrow;
    if(typeof row.hero_description==='string'&&row.hero_description.trim())document.getElementById('heroDescription').textContent=row.hero_description;
    const image=safeImage(row.hero_image);
    if(image)document.getElementById('heroImage').src=image;
    const order=Array.isArray(row.section_order)&&row.section_order.length===4&&sectionNames.every(s=>row.section_order.includes(s))?row.section_order:sectionNames;
    for(const name of order)root.appendChild(sections[name]);
    for(const name of sectionNames)sections[name].hidden=row.sections_visible?.[name]===false;
    renderFeatured();
  }
  window.addEventListener('storefront:products',e=>{products=Array.isArray(e.detail?.products)?e.detail.products:[];checkoutConfig=e.detail?.checkoutConfig||null;renderFeatured();});
  for(const [id,direction] of [['featuredPrevious',-1],['featuredNext',1]]){
    document.getElementById(id).addEventListener('click',()=>track.scrollBy({left:direction*Math.max(270,Math.round(track.clientWidth*.8)),behavior:'smooth'}));
  }
  (async()=>{try{
    const {data,error}=await Store.createClient().from('storefront_content').select('*').eq('id','home').maybeSingle();
    if(!error&&data)updateHome(data);
  }catch{/* Fallback: static home stays visible when schema/connection is unavailable. */}})();
})();
