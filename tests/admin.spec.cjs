const {test,expect}=require('@playwright/test');
const {setup,product}=require('./helpers.cjs');
const sandboxProduct={...require('../supabase/test/productos-preview.json')[0],activo:true,checkout_habilitado:true,precio_base:100000};
const sandboxOrder={
 id:'11111111-1111-4111-8111-111111111111',product_id:'pieza-sandbox-001',
 product_snapshot:{nombre:'Mesa Sandbox',sku:'AYE-SBX-001'},
 selection_snapshot:{wood_type:'Eucalipto',wood_stain:'Natural',metal_color:'Negro',finish:'Mate',extras:['Ruedas']},
 total_amount:108000,currency:'ARS',status:'processed',payment_status:'processed',mp_order_id:'ORD-SANDBOX-1',
 manufacturing_status:'not_started',internal_notes:'',created_at:'2026-11-14T15:00:00Z',updated_at:'2026-11-14T15:05:00Z',
 checkout_order_customers:{full_name:'Cliente Sandbox',email:'buyer@example.invalid',phone:'+54 11 5555 0000',delivery_method:'delivery',address_line:'Calle 123',city:'CABA',province:'Buenos Aires',postal_code:'1000',delivery_notes:'Timbre 2'},
 checkout_email_outbox:[{notification_type:'customer_payment_confirmed',status:'sent',sent_at:'2026-11-14T15:06:00Z'}]
};
function generatedOrder(index) {
 const created=new Date(Date.UTC(2026,10,14,23)-index*6*60*60*1000).toISOString();
 const paid=index%2===0;
 return {...structuredClone(sandboxOrder),
  id:`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`,
  mp_order_id:`ORD-${String(index).padStart(4,'0')}`,created_at:created,status:paid?'processed':'created',
  payment_status:paid?'processed':'created',
  checkout_order_customers:{...sandboxOrder.checkout_order_customers,full_name:`Cliente ${index}`,email:`cliente${index}@example.invalid`}
 };
}
test('admin previews final selling price and breakdown while payment switch is off',async({page})=>{
 const state=await setup(page,{authenticated:true,rows:[sandboxProduct],checkoutSettings:{id:'default',commission_percent:7.5,payments_enabled:false}});
 await page.goto('/admin.html');
 await expect(page.locator('#outPrecioFinal')).toHaveText('$108.000');
 await expect(page.locator('#adminPriceBreakdown')).toContainText('Base $100.000');
 await expect(page.locator('#adminPriceBreakdown')).toContainText('Comisión $7.500 · Redondeo $500');
 await page.locator('#inpPrecio').fill('101000');
 await expect(page.locator('#outPrecioFinal')).toHaveText('$109.000');
 await expect(page.locator('#chkCheckoutEnabled')).not.toBeChecked();
 expect(state.checkoutRequests).toHaveLength(0);
});
test('orders view shows private purchase details and updates only manufacturing fields',async({page})=>{
 const state=await setup(page,{authenticated:true,rows:[sandboxProduct],orders:[sandboxOrder]});
 await page.goto('/admin.html');
 await page.locator('#btnViewOrders').click();
 await expect(page.locator('#ordersTableBody')).toContainText('Mesa Sandbox');
 await expect(page.locator('#ordersTableBody')).toContainText('$108.000');
 await expect(page.locator('#orderDetail')).toContainText('Eucalipto');
 await expect(page.locator('#orderDetail')).toContainText('buyer@example.invalid');
 await expect(page.locator('#orderDetail')).toContainText('Acreditado');
 await page.locator('#orderManufacturingStatus').selectOption('in_production');
 await page.locator('#orderInternalNotes').fill('Corte iniciado.');
 await page.locator('#btnSaveOrder').click();
 await expect.poll(()=>state.orderWrites.length).toBe(1);
 expect(state.orderWrites[0].data).toEqual({manufacturing_status:'in_production',internal_notes:'Corte iniciado.'});
 expect(state.orderWrites[0].data.payment_status).toBeUndefined();
 await expect(page.locator('#ordersTableBody')).toContainText('En fabricación');
 expect(state.errors).toEqual([]);
});
test('orders view fails closed when the session is not an authorized administrator',async({page})=>{
 await setup(page,{authenticated:true,rows:[sandboxProduct],ordersFailure:true});
 await page.goto('/admin.html');
 await page.locator('#btnViewOrders').click();
 await expect(page.locator('#ordersStatus')).toContainText('autorizar esta cuenta');
 await expect(page.locator('#ordersTableBody tr')).toHaveCount(0);
});
test('orders use server pagination and combinable Buenos Aires date/payment filters beyond 250 rows',async({page})=>{
 const orders=Array.from({length:275},(_,index)=>generatedOrder(index));
 const state=await setup(page,{authenticated:true,rows:[sandboxProduct],orders});
 await page.goto('/admin.html');
 await page.locator('#btnViewOrders').click();
 await expect(page.locator('#ordersTableBody tr')).toHaveCount(50);
 await expect(page.locator('#ordersStatus')).toContainText('275 resultados');
 expect(state.orderQueries[0]).toMatchObject({p_limit:50,p_offset:0,p_sort:'desc',p_payment_group:'all'});
 await page.locator('#btnNextOrders').click();
 await expect.poll(()=>state.orderQueries.at(-1).p_offset).toBe(50);
 await expect(page.locator('#ordersPageStatus')).toContainText('Página 2');
 await page.locator('#orderPaymentGroup').selectOption('unpaid');
 await expect(page.locator('#ordersStatus')).toContainText('137 resultados');
 expect(state.orderQueries.at(-1).p_payment_group).toBe('unpaid');
 await page.locator('#orderMonthFilter').fill('2026-11');
 await page.locator('#orderMonthFilter').evaluate(input=>input.dispatchEvent(new Event('change',{bubbles:true})));
 await expect.poll(()=>state.orderQueries.at(-1).p_date_from).toBe('2026-11-01T03:00:00.000Z');
 expect(state.orderQueries.at(-1).p_date_to).toBe('2026-12-01T03:00:00.000Z');
 await page.locator('#btnResetOrderFilters').click();
 await expect(page.locator('#ordersStatus')).toContainText('275 resultados');
 await page.locator('#orderSort').selectOption('asc');
 await expect.poll(()=>state.orderQueries.at(-1).p_sort).toBe('asc');
 await page.locator('#orderSearch').fill('Cliente 274');
 await expect(page.locator('#ordersStatus')).toContainText('1 resultados');
 expect(state.orderQueries.at(-1).p_search).toBe('Cliente 274');
 expect(state.errors).toEqual([]);
});
test('unpaid attempts are not presented as sales and customer/email content is escaped',async({page})=>{
 const payload='"><img src=x onerror="window.ORDER_XSS=1">';
 const attempt={...structuredClone(sandboxOrder),status:'created',payment_status:'created',mp_order_id:'ORD-UNPAID',
  checkout_order_customers:{...sandboxOrder.checkout_order_customers,full_name:payload,email:'safe@example.invalid'},
  checkout_email_outbox:[{notification_type:'seller_payment_received',status:'rejected',last_error:'provider_forbidden'}]};
 await setup(page,{authenticated:true,rows:[sandboxProduct],orders:[attempt]});
 await page.goto('/admin.html');
 await page.locator('#btnViewOrders').click();
 await expect(page.locator('#ordersTableBody')).toContainText(payload);
 await expect(page.locator('#ordersTableBody')).toContainText('safe@example.invalid');
 await expect(page.locator('#ordersTableBody')).toContainText('Orden creada · sin pago');
 await expect(page.locator('#orderDetail')).toContainText('no cuenta como venta acreditada');
 await expect(page.locator('#orderDetail')).toContainText('Rechazado permanentemente');
 await expect(page.locator('#orderDetail')).toContainText('dominio verificado');
 expect(await page.locator('[onerror]').count()).toBe(0);
 expect(await page.evaluate(()=>window.ORDER_XSS)).toBeUndefined();
});
test('order customer summary remains readable without page overflow on mobile',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await setup(page,{authenticated:true,rows:[sandboxProduct],orders:[sandboxOrder]});
 await page.goto('/admin.html');
 await page.locator('#btnViewOrders').click();
 await expect(page.locator('.order-customer-name')).toHaveText('Cliente Sandbox');
 await expect(page.locator('.order-customer-email')).toHaveText('buyer@example.invalid');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('login failure, successful login and sign out use existing Supabase Auth',async({page})=>{
 const state=await setup(page);
 await page.goto('/admin.html');
 await expect(page.locator('#loginScreen')).toBeVisible();
 await page.locator('#loginEmail').fill('test@example.invalid');
 await page.locator('#loginPassword').fill('synthetic-test-password');
 await page.locator('#btnLogin').click();
 await expect(page.locator('#mainAdmin')).toBeVisible();
 await expect(page.locator('#inpNombre')).toHaveValue(product.nombre);
 await page.locator('#btnLogout').click();
 await expect(page.locator('#loginScreen')).toBeVisible();
 expect(state.errors).toEqual([]);
});
test('invalid login stays on login screen',async({page})=>{
 await setup(page,{loginFailure:true});
 await page.goto('/admin.html');
 await page.locator('#loginEmail').fill('test@example.invalid');
 await page.locator('#loginPassword').fill('wrong-test-password');
 await page.locator('#btnLogin').click();
 await expect(page.locator('#loginError')).toBeVisible();
 await expect(page.locator('#mainAdmin')).not.toBeVisible();
});
test('empty admin catalog does not import or write automatically',async({page})=>{
 const state=await setup(page,{authenticated:true,rows:[]});
 await page.goto('/admin.html');
 await expect(page.locator('#mainAdmin')).toBeVisible();
 await expect(page.locator('.editor-area')).not.toBeVisible();
 expect(state.backups).toBe(0); expect(state.writes).toEqual([]);
 await page.locator('#btnNewProd').click();
 await expect(page.locator('.editor-area')).toBeVisible();
 expect(state.writes).toEqual([]);
 expect(state.errors).toEqual([]);
});
test('manual import skips existing IDs and inserts new rows hidden after typed confirmation',async({page})=>{
 const state=await setup(page,{authenticated:true,backup:[{...product,nombre:'DO NOT OVERWRITE'}, {...product,id:'new-from-backup',nombre:'Nueva'}]});
 await page.goto('/admin.html');
 await expect(page.locator('#mainAdmin')).toBeVisible();
 page.once('dialog',d=>d.accept('IMPORTAR'));
 await page.locator('#btnImportJson').click();
 await expect.poll(()=>state.writes.length).toBe(1);
 expect(state.writes[0].data).toHaveLength(1);
 expect(state.writes[0].data[0]).toMatchObject({id:'new-from-backup',activo:false});
 expect(state.writes[0].headers.prefer || '').not.toContain('merge-duplicates');
 expect(state.rows.find(p=>p.id===product.id).nombre).toBe(product.nombre);
 await expect(page.locator('#countProds')).toHaveText('2');
 expect(state.errors).toEqual([]);
});
for(const action of ['cancel','conflict','invalid']) test(`import ${action} leaves catalog unchanged`,async({page})=>{
 const state=await setup(page,{authenticated:true,writeFailure:action==='conflict',backup:action==='invalid'?[product,product]:[{...product,id:'new'}]});
 await page.goto('/admin.html');
 await expect(page.locator('#mainAdmin')).toBeVisible();
 page.on('dialog',d=>d.type()==='prompt'?(action==='cancel'?d.dismiss():d.accept('IMPORTAR')):d.accept());
 await page.locator('#btnImportJson').click();
 await expect(page.locator('#btnImportJson')).toBeEnabled();
 expect(state.writes.length).toBe(action==='conflict'?1:0);
 expect(state.rows).toHaveLength(1);
});
test('admin text/attribute injection is escaped while editing and publishing remain functional',async({page})=>{
 const payload='\"><img src=x onerror="window.XSS=1">';
 const malicious={...product,nombre:payload,fotos:[payload],maderas:[{nombre:payload,tex:payload,delta:0}],extras:[{nombre:payload,meta:payload,precio:100}],tonos_madera:[{nombre:payload,etiqueta:payload,hex:payload,rgb:[1,1,1]}],colores_metal:[{nombre:payload,meta:payload,hex:payload,rgb:[0,0,0]}]};
 const state=await setup(page,{authenticated:true,rows:[malicious]});
 await page.goto('/admin.html');
 await expect(page.locator('#inpNombre')).toHaveValue(payload);
 expect(await page.locator('[onerror], [onload]').count()).toBe(0);
 expect(await page.evaluate(()=>window.XSS)).toBeUndefined();
 await page.locator('#inpNombre').fill('Nombre editado');
 await page.locator('#btnToggleVisibility').click();
 await page.locator('#btnSaveSupabase').click();
 await expect.poll(()=>state.writes.length).toBe(1);
 expect(state.writes[0].data[0]).toMatchObject({nombre:'Nombre editado',activo:false});
 expect(state.errors).toEqual([]);
});
test('failed delete keeps the product in the editor',async({page})=>{
 const state=await setup(page,{authenticated:true,writeFailure:true,rows:[product,{...product,id:'second'}]});
 await page.goto('/admin.html');
 await expect(page.locator('#countProds')).toHaveText('2');
 page.on('dialog',d=>d.accept());
 await page.locator('#btnDeleteProd').click();
 await expect.poll(()=>state.writes.length).toBe(1);
 await expect(page.locator('#countProds')).toHaveText('2');
});
test('upload control uses existing Storage flow and stores the returned public URL',async({page})=>{
 const state=await setup(page,{authenticated:true});
 await page.goto('/admin.html');
 await expect(page.locator('#inpImagen')).toHaveValue(product.imagen);
 await page.locator('#inpImagen').locator('..').locator('input[type=file]').setInputFiles('assets/img/logo.jpg/Code_Generated_Image.png');
 await expect.poll(()=>state.uploads.length).toBe(1);
 expect(state.uploads[0]).toMatchObject({method:'POST'});
 expect(state.uploads[0].bytes).toBeGreaterThan(100);
 await expect(page.locator('#inpImagen')).toHaveValue(/\/storage\/v1\/object\/public\/tienda\/portadas\//);
 await page.locator('#btnSaveSupabase').click();
 await expect.poll(()=>state.writes.length).toBe(1);
 expect(state.writes[0].data[0].imagen).toContain('/storage/v1/object/public/tienda/portadas/');
 expect(state.errors).toEqual([]);
});
test('admin keeps commission editable, test-only checkout global switch and per-product authorization',async({page})=>{
 const state=await setup(page,{authenticated:true,checkoutSettings:{id:'default',commission_percent:7.5,payments_enabled:false}});
 await page.goto('/admin.html');
 await expect(page.locator('#inpCheckoutCommission')).toHaveValue('7.5');
 await expect(page.locator('#chkCheckoutEnabled')).not.toBeChecked();
 await page.locator('#inpCheckoutCommission').fill('8.25');
 await page.locator('#chkCheckoutEnabled').check();
 await page.locator('#chkProductCheckout').check();
 await page.locator('#btnSaveSupabase').click();
 await expect.poll(()=>state.settingsWrites.length).toBe(1);
 expect(state.settingsWrites[0].data).toMatchObject({commission_percent:8.25,payments_enabled:true});
 expect(state.writes[0].data[0].checkout_habilitado).toBe(true);
 expect(state.errors).toEqual([]);
});
