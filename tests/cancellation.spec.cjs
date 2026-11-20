const { test, expect } = require('@playwright/test');
const { setup } = require('./helpers.cjs');

test('arrepentimiento: registra solicitud y consulta estado mediante enlace privado',async({page})=>{
 const state=await setup(page);
 const calls=[];
 await page.route('**/functions/v1/cancellation-request',async route=>{
  const payload=route.request().postDataJSON();
  calls.push(payload);
  if(payload.action==='submit'){
   await route.fulfill({status:200,json:{ok:true,code:'ARR-2026-000010',status:'received',created_at:'2026-11-18T02:00:00Z'}});
  }else{
   await route.fulfill({status:200,json:{code:'ARR-2026-000010',status:'reviewing',created_at:'2026-11-18T02:00:00Z',updated_at:'2026-11-18T02:01:00Z'}});
  }
 });
 await page.goto('/arrepentimiento.html');
 await expect(page.locator('#cancellationForm')).toBeVisible();
 await page.locator('#cancellationEmail').fill('cliente@example.invalid');
 await page.locator('#cancellationOrder').fill('pedido de prueba');
 await page.locator('#cancellationSubmit').click();
 await expect(page.locator('#cancellationCode')).toHaveText('ARR-2026-000010');
 expect(calls).toHaveLength(1);
 expect(calls[0].action).toBe('submit');
 expect(calls[0].status_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
 await page.locator('#cancellationPrivateLink').click();
 await expect(page.locator('#cancellationLookup')).toBeVisible();
 await expect(page.locator('#cancellationLookupStatus')).toContainText('En revisión');
 expect(calls.at(-1).action).toBe('status');
 expect(state.errors).toEqual([]);
});

test('arrepentimiento: no acepta formularios con correo inválido',async({page})=>{
 const state=await setup(page);
 let count=0;
 await page.route('**/functions/v1/cancellation-request',async route=>{count++;await route.fulfill({json:{ok:true}});});
 await page.goto('/arrepentimiento.html');
 await page.locator('#cancellationEmail').fill('correo-invalido');
 await page.locator('#cancellationSubmit').click();
 expect(count).toBe(0);
 await expect(page.locator('#cancellationReceipt')).toBeHidden();
 expect(state.errors).toEqual([]);
});


test('admin: gestiona solicitudes sin tocar pagos ni reembolsos',async({page})=>{
 const sampleProduct={...require('../supabase/test/productos-preview.json')[0],activo:true};
 const state=await setup(page,{authenticated:true,rows:[sampleProduct]});
 const row={id:'11111111-1111-4111-8111-111111111111',code:'ARR-2026-000010',
  customer_email:'cliente@example.invalid',order_reference:'PEDIDO-TEST',order_id:null,
  message:'Solicitud de prueba',status:'received',admin_note:'',created_at:'2026-11-18T02:00:00Z',
  checkout_cancellation_emails:[{recipient_type:'customer',status:'rejected',last_error:'sandbox_customer_not_allowlisted'},{recipient_type:'seller',status:'sent',sent_at:'2026-11-18T02:01:00Z'}]};
 const updates=[];
 await page.route('**/rest/v1/checkout_cancellation_requests*',async route=>{
  const req=route.request();
  if(req.method()==='GET')return route.fulfill({json:[row]});
  if(req.method()==='PATCH'){
   const data=req.postDataJSON();
   updates.push(data);
   Object.assign(row,data);
   return route.fulfill({json:{id:row.id,status:row.status,admin_note:row.admin_note}});
  }
  return route.fulfill({status:405});
 });
 await page.goto('/admin.html');
 await page.locator('#btnViewCancellations').click();
 await expect(page.locator('#cancellationsTableBody')).toContainText('ARR-2026-000010');
 await page.locator('#cancellationsTableBody tr').first().click();
 await expect(page.locator('#cancellationEmailInfo')).toContainText('Aviso al taller: Enviado');
 await page.locator('#cancellationAdminState').selectOption('reviewing');
 await page.locator('#cancellationAdminNote').fill('Revisando la solicitud de prueba.');
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#btnSaveCancellation').click();
 await expect(page.locator('#cancellationSaveStatus')).toContainText('Revisión guardada');
 expect(updates).toEqual([{status:'reviewing',admin_note:'Revisando la solicitud de prueba.'}]);
 expect(state.orderWrites).toHaveLength(0);
 expect(state.errors).toEqual([]);
});
