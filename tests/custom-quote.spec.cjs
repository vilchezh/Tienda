const {test,expect}=require('@playwright/test');
const {setup}=require('./helpers.cjs');

const quoteId='22222222-2222-4222-8222-222222222222';
const sampleProduct={...require('../supabase/test/productos-preview.json')[0],activo:true};
const sampleQuote={
 id:quoteId,code:'COT-2026-000001',status:'new',full_name:'Cliente de Prueba',email:'cliente@example.invalid',
 phone:'1155555555',city:'General Rodríguez',project_type:'mueble',
 description:'Mesa industrial de hierro y madera para seis personas.',measurements:'160 × 80 × 75 cm',
 materials:'Hierro y madera',finish:'Negro mate',quantity:1,desired_date:null,budget_ars:100000,
 delivery:'retiro',admin_note:'',quoted_amount:null,created_at:'2026-11-18T04:00:00Z',
 custom_quote_files:[{id:'33333333-3333-4333-8333-333333333333',storage_path:quoteId+'/archivo.pdf',original_name:'plano.pdf',mime_type:'application/pdf',byte_size:240}]
};

test('portada dirige al formulario de presupuestos a medida, no al catálogo',async({page})=>{
 const state=await setup(page,{rows:[sampleProduct]});
 await page.goto('/');
 await expect(page.locator('#a-medida a.button')).toHaveAttribute('href','presupuesto.html');
 await expect(page.locator('#a-medida a.button')).toContainText('Solicitar un mueble o estructura a medida');
 expect(state.errors).toEqual([]);
});

test('presupuesto en tres pasos: fotos/PDF, datos, número y seguimiento sin pagar',async({page})=>{
 const state=await setup(page,{rows:[sampleProduct]});
 const requests=[];
 await page.route('**/functions/v1/custom-quote-request*',async route=>{
  const req=route.request();const target=new URL(req.url());
  if(target.searchParams.get('action')==='upload'){
   requests.push({action:'upload',bytes:req.postDataBuffer()?.length||0});
   return route.fulfill({json:{ok:true,file_id:'33333333-3333-4333-8333-333333333333',name:'plano.pdf',byte_size:60,mime_type:'application/pdf'}});
  }
  const body=req.postDataJSON();requests.push(body);
  if(body.action==='start')return route.fulfill({json:{ok:true,quote_id:quoteId,code:'COT-2026-000001',status:'draft'}});
  if(body.action==='finish')return route.fulfill({json:{ok:true,code:'COT-2026-000001',status:'new'}});
  return route.fulfill({json:{code:'COT-2026-000001',status:'reviewing',created_at:'2026-11-18T04:00:00Z',updated_at:'2026-11-18T04:01:00Z'}});
 });
 await page.goto('/presupuesto.html');
 await expect(page.locator('.quote-step[data-step="1"]')).toBeVisible();
 await page.locator('#quoteDescription').fill('Quiero una mesa industrial de 160 cm con estructura de hierro y madera.');
 await page.locator('#quoteMeasurements').fill('160 × 80 × 75 cm');
 await page.locator('#quoteNext').click();
 await expect(page.locator('.quote-step[data-step="2"]')).toBeVisible();
 await page.locator('#quoteFiles').setInputFiles({name:'plano.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n1 0 obj <<>> endobj\n%%EOF')});
 await expect(page.locator('#quoteFileList')).toContainText('plano.pdf');
 await page.locator('#quoteNext').click();
 await expect(page.locator('.quote-step[data-step="3"]')).toBeVisible();
 await page.locator('#quoteName').fill('Cliente de Prueba');
 await page.locator('#quoteEmail').fill('cliente@example.invalid');
 await page.locator('#quotePhone').fill('1155555555');
 await page.locator('#quoteCity').fill('General Rodríguez');
 await page.locator('#quotePrivacy').check();
 await page.locator('#quoteSubmit').click();
 await expect(page.locator('#quoteSuccessCode')).toHaveText('COT-2026-000001');
 expect(requests.map(r=>r.action)).toEqual(['start','upload','finish']);
 expect(requests[0].description).toContain('mesa industrial');
 await page.locator('#quotePrivateLink').click();
 await expect(page.locator('#quoteLookup')).toBeVisible();
 await expect(page.locator('#quoteLookupStatus')).toContainText('En revisión');
 expect(requests.at(-1).action).toBe('status');
 expect(state.errors).toEqual([]);
});

test('cliente no puede seleccionar ejecutables y el servidor conserva verificación final',async({page})=>{
 const state=await setup(page,{rows:[sampleProduct]});
 await page.goto('/presupuesto.html');
 await page.locator('#quoteDescription').fill('Quiero una estructura industrial para apoyar herramientas.');
 await page.locator('#quoteNext').click();
 await page.locator('#quoteFiles').setInputFiles({name:'archivo.exe',mimeType:'application/octet-stream',buffer:Buffer.from('MZ un ejecutable')});
 await expect(page.locator('#quoteStatus')).toContainText('Solo se admiten');
 await page.locator('#quoteNext').click();
 await expect(page.locator('.quote-step[data-step="2"]')).toBeVisible();
 expect(state.errors).toEqual([]);
});

test('admin: presupuesto a medida separado de ventas y guardado sin cobros',async({page})=>{
 const state=await setup(page,{authenticated:true,rows:[sampleProduct]});
 const updated=[];
 await page.route('**/rest/v1/custom_quote_requests*',async route=>{
  const req=route.request();
  if(req.method()==='GET')return route.fulfill({json:[sampleQuote]});
  if(req.method()==='PATCH'){
   const body=req.postDataJSON();updated.push(body);
   return route.fulfill({json:{id:quoteId,...body}});
  }
  return route.fulfill({status:405});
 });
 await page.goto('/admin.html');
 await page.locator('#btnViewOrders').click();
 await page.locator('#btnOrdersShowQuotes').click();
 await expect(page.locator('#customQuotesRows')).toContainText('COT-2026-000001');
 await expect(page.locator('#ordersTableBody')).toBeHidden();
 await page.locator('#customQuotesRows tr').first().click();
 await expect(page.locator('#customQuoteDetailInfo')).toContainText('160 × 80 × 75 cm');
 await expect(page.locator('#customQuoteFiles')).toContainText('plano.pdf');
 await page.locator('#customQuoteState').selectOption('quoted');
 await page.locator('#customQuotePrice').fill('150000');
 await page.locator('#customQuoteNote').fill('Precio estimado: confirmar espesor.');
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#btnSaveCustomQuote').click();
 await expect(page.locator('#customQuoteSaveStatus')).toContainText('Guardado correctamente');
 expect(updated).toEqual([{status:'quoted',admin_note:'Precio estimado: confirmar espesor.',quoted_amount:150000}]);
 expect(state.checkoutRequests).toHaveLength(0);
 expect(state.orderWrites).toHaveLength(0);
 expect(state.errors).toEqual([]);
});
