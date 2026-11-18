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
