const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { setup, product } = require('./helpers.cjs');
const sandboxProduct = { ...require('../supabase/test/productos-preview.json')[0], activo:true, checkout_habilitado:true, precio_base:100000 };

async function fillCheckoutContact(page, email = 'buyer@example.invalid') {
  await page.locator('#checkoutFullName').fill('Comprador de Prueba');
  await page.locator('#checkoutEmail').fill(email);
  await page.locator('#checkoutPrivacy').check();
}

test('catalog shows final sandbox price with commission even while checkout is disabled',async({page})=>{
  const state=await setup(page,{rows:[sandboxProduct],checkoutSettings:{id:'default',commission_percent:7.5,payments_enabled:false}});
  await page.goto('/');
  await expect(page.locator('#catalogoGrid .product-price')).toContainText('108.000');
  await expect(page.locator('#catalogoGrid .price-breakdown')).toContainText('Comisión $7.500 · Redondeo $500');
  expect(state.checkoutRequests).toHaveLength(0);
});

test('product final price follows selected extras with checkout disabled',async({page})=>{
  const state=await setup(page,{rows:[sandboxProduct],checkoutSettings:{id:'default',commission_percent:7.5,payments_enabled:false}});
  await page.goto('/producto.html?id=pieza-sandbox-001');
  await expect(page.locator('#priceDisplay')).toHaveText('108.000');
  await expect(page.locator('#productPriceBreakdown')).toContainText('Comisión $7.500 · Redondeo $500');
  await expect(page.locator('#btnComprar')).toBeDisabled();
  await page.locator('.extra-checkbox').first().check();
  await expect(page.locator('#priceDisplay')).toHaveText('109.000');
  await expect(page.locator('#productPriceBreakdown')).toContainText('Extras $1.000');
  await page.evaluate(()=> { window.STORE_CONFIG={...window.STORE_CONFIG,whatsappNumber:''}; });
  await page.locator('#customNotes').fill('Consulta ficticia');
  await expect(page.locator('#btnWhatsapp')).not.toHaveAttribute('href');
  expect(state.checkoutRequests).toHaveLength(0);
});

test('catalog filters, promos and encoded product links', async ({page})=> {
  const state = await setup(page,{rows:[product,{...product,id:'gym&promo',nombre:'Banco Gym',categoria:'Gym',subcategoria:'Bancos||PROMO:Ofertas||OLD:200000'}, {...product,id:'hidden',activo:false}]});
  await page.goto('/');
  await expect(page.locator('#catalogoGrid .product-card')).toHaveCount(2);
  await expect(page.locator('#promoGrid .product-card')).toHaveCount(1);
  await page.getByRole('button',{name:'Gym',exact:true}).click();
  await page.getByRole('button',{name:'Bancos',exact:true}).click();
  await expect(page.locator('#catalogoGrid .product-card')).toHaveCount(1);
  await expect(page.locator('#catalogoGrid .product-card')).toHaveAttribute('href','producto.html?id=gym%26promo');
  await page.getByRole('button',{name:'Ver todo',exact:true}).click();
  await expect(page.locator('#catalogoGrid .product-card')).toHaveCount(2);
  expect(state.backups).toBe(0); expect(state.errors).toEqual([]);
});
for (const mode of ['empty','offline','noSDK']) test(`catalog ${mode} never restores a backup`,async({page})=>{
  const state=await setup(page,{rows:[],offline:mode==='offline',noSDK:mode==='noSDK'});
  await page.goto('/');
  await expect(page.locator('#catalogoGrid .product-card')).toHaveCount(0);
  await expect(page.locator('#catalogoGrid')).toContainText(mode==='empty'?'No hay muebles':'no está disponible', {timeout:12000});
  if(mode!=='empty') await page.getByRole('button',{name:'Volver a intentar'}).click();
  await page.getByRole('button',{name:'Ver todo',exact:true}).click();
  expect(state.backups).toBe(0); expect(state.writes).toEqual([]); expect(state.errors).toEqual([]);
});
for(const mode of ['hidden','missing','offline','noSDK']) test(`detail ${mode} has no fallback or purchase`,async({page})=>{
  const state=await setup(page,{rows:mode==='hidden'?[{...product,activo:false}]:[],offline:mode==='offline',noSDK:mode==='noSDK'});
  await page.goto('/producto.html?id='+product.id);
  await expect(page.locator('#errorPanel')).toBeVisible({timeout:12000});
  await expect(page.locator('#mainShopLayout')).not.toBeVisible();
  expect(state.backups).toBe(0); expect(state.errors).toEqual([]);
});
test('configurator preserves prices, 3D material changes, extras, gallery and contact configuration',async({page})=>{
  const state=await setup(page);
  await page.goto('/producto.html?id='+product.id);
  await expect(page.locator('#priceDisplay')).toHaveText('185.000');
  await expect(page.locator('#btnComprar')).toBeDisabled();
  await expect(page.locator('#btnWhatsapp')).toHaveAttribute('href',/^https:\/\/wa\.me\//);
  await expect.poll(()=>page.locator('model-viewer').evaluate(v=>Boolean(v.loaded && v.model?.materials?.length)),{timeout:20000}).toBe(true);
  await page.getByRole('button',{name:'Pino Alistonado (Sin Nudos)',exact:false}).click();
  await page.locator('.extra-checkbox').first().check();
  await expect(page.locator('#priceDisplay')).toHaveText('239.000');
  await page.locator('#gridWoodStain .swatch-btn').nth(1).click();
  await page.locator('#gridMetalColor .btn-opt').nth(1).click();
  await page.locator('#gridFinish .btn-opt').nth(1).click();
  await expect(page.locator('#labelMetal')).toHaveText('Blanco · Satinado');
  await expect.poll(()=>page.locator('model-viewer').evaluate(v=>v.model.materials.find(m=>m.name==='hierro').pbrMetallicRoughness.baseColorFactor[0])).toBeCloseTo(0.88,2);
  await expect.poll(()=>page.locator('model-viewer').evaluate(v=>v.model.materials.find(m=>m.name==='hierro').pbrMetallicRoughness.roughnessFactor)).toBeCloseTo(0.27,2);
  await expect(page.locator('#labelWoodStain')).toHaveText('Roble Claro');
  await page.locator('#tabBtnPhotos').click();
  await expect(page.locator('#photoGalleryView')).toBeVisible();
  await page.locator('.thumb-item').nth(1).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#mainRealPhoto')).toHaveAttribute('src',/pino-con-nudos/);
  await page.locator('#tabBtn3d').click();
  await expect(page.locator('model-viewer')).toBeVisible();
  await page.evaluate(()=> { window.STORE_CONFIG={...window.STORE_CONFIG,whatsappNumber:'12345678901'}; });
  await page.locator('#customNotes').fill('Quiero 10cm más & un cajón');
  const href=await page.locator('#btnWhatsapp').getAttribute('href');
  expect(new URL(href).searchParams.get('text')).toContain('239.000');
  expect(new URL(href).searchParams.get('text')).toContain('Quiero 10cm más & un cajón');
  expect(state.errors).toEqual([]);
});
test('Checkout Pro test mode sends selections without trusting a client total and redirects only to Mercado Pago',async({page})=>{
  const directProduct={...product,checkout_habilitado:true};
  const state=await setup(page,{rows:[directProduct],checkoutSettings:{id:'default',commission_percent:7.5,payments_enabled:true}});
  await page.goto('/producto.html?id='+product.id);
  await expect(page.locator('#btnComprar')).toBeEnabled();
  await expect(page.locator('#checkoutStatus')).toContainText('$199.000');
  await expect(page.locator('#checkoutStatus')).toContainText('7,5%');
  await page.locator('#btnComprar').click();
  expect(state.checkoutRequests).toHaveLength(0);
  await expect(page.locator('#checkoutStatus')).toContainText('datos obligatorios');
  await fillCheckoutContact(page);
  await page.locator('#btnComprar').click();
  await expect.poll(()=>state.checkoutRequests.length).toBe(1);
  expect(state.checkoutRequests[0].data).toMatchObject({
    product_id:product.id,
    wood_type:'Pino con Nudos',
    wood_stain:'Transparente',
    metal_color:'Negro',
    finish:'Mate',
    extras:[],
    custom_notes:'',
    customer:{
      full_name:'Comprador de Prueba',email:'buyer@example.invalid',phone:'',delivery_method:'pickup',
      address_line:'',city:'',province:'',postal_code:'',delivery_notes:'',privacy_accepted:true
    }
  });
  expect(state.checkoutRequests[0].data.total).toBeUndefined();
  expect(state.checkoutRequests[0].data.client_request_id).toMatch(/^[0-9a-f-]{36}$/);
  await expect(page).toHaveURL(/mercadopago\.com\.ar\/checkout\/v1\/redirect/);
  expect(state.errors).toEqual([]);
});
test('checkout reload and network retry preserve one client request id',async({page})=>{
  const state=await setup(page,{rows:[{...product,checkout_habilitado:true}],checkoutSettings:{id:'default',commission_percent:0,payments_enabled:true},checkoutFailuresBeforeSuccess:1});
  await page.goto('/producto.html?id='+product.id);
  await fillCheckoutContact(page);
  await page.locator('#btnComprar').click();
  await expect.poll(()=>state.checkoutRequests.length).toBe(1);
  const firstId=state.checkoutRequests[0].data.client_request_id;
  await page.reload();
  await fillCheckoutContact(page);
  await page.locator('#btnComprar').click();
  await expect.poll(()=>state.checkoutRequests.length).toBe(2);
  expect(state.checkoutRequests[1].data.client_request_id).toBe(firstId);
  await expect(page).toHaveURL(/mercadopago\.com\.ar/);
});
test('double click sends one request and a configuration change starts a new attempt',async({page})=>{
  const state=await setup(page,{rows:[{...product,checkout_habilitado:true}],checkoutSettings:{id:'default',commission_percent:0,payments_enabled:true},checkoutFailuresBeforeSuccess:1});
  await page.goto('/producto.html?id='+product.id);
  await fillCheckoutContact(page);
  await page.locator('#btnComprar').evaluate(button=>{button.click();button.click();});
  await expect.poll(()=>state.checkoutRequests.length).toBe(1);
  const abandonedId=state.checkoutRequests[0].data.client_request_id;
  await page.locator('.extra-checkbox').first().check();
  await page.locator('#btnComprar').click();
  await expect.poll(()=>state.checkoutRequests.length).toBe(2);
  expect(state.checkoutRequests[1].data.client_request_id).not.toBe(abandonedId);
});
test('pending return reuses the attempt and a terminal payment allows a legitimate repeated purchase',async({page})=>{
  const orderStatus={order_id:'11111111-1111-4111-8111-111111111111',order_status:'created',payment_status:'created',amount:199000,currency:'ARS',product:{nombre:'Mesa'}};
  const state=await setup(page,{rows:[{...product,checkout_habilitado:true}],checkoutSettings:{id:'default',commission_percent:0,payments_enabled:true},orderStatus});
  await page.goto('/producto.html?id='+product.id);
  await fillCheckoutContact(page);
  await page.locator('#btnComprar').click();
  await expect.poll(()=>state.checkoutRequests.length).toBe(1);
  const pendingId=state.checkoutRequests[0].data.client_request_id;
  await expect(page).toHaveURL(/mercadopago\.com\.ar/);
  await page.goto('/pago.html?pedido=11111111-1111-4111-8111-111111111111');
  await expect(page.locator('#resultTitle')).toHaveText('Pedido creado');
  await page.goto('/producto.html?id='+product.id);
  await fillCheckoutContact(page);
  await page.locator('#btnComprar').click();
  await expect.poll(()=>state.checkoutRequests.length).toBe(2);
  expect(state.checkoutRequests[1].data.client_request_id).toBe(pendingId);
  await expect(page).toHaveURL(/mercadopago\.com\.ar/);

  orderStatus.order_status='processed';
  orderStatus.payment_status='processed';
  await page.goto('/pago.html?pedido=11111111-1111-4111-8111-111111111111');
  await expect(page.locator('#resultTitle')).toHaveText('Pago acreditado');
  await page.goto('/producto.html?id='+product.id);
  await fillCheckoutContact(page);
  await page.locator('#btnComprar').click();
  await expect.poll(()=>state.checkoutRequests.length).toBe(3);
  expect(state.checkoutRequests[2].data.client_request_id).not.toBe(pendingId);
});
test('custom work keeps WhatsApp available and blocks direct checkout',async({page})=>{
  const state=await setup(page,{rows:[{...product,checkout_habilitado:true}],checkoutSettings:{id:'default',commission_percent:5,payments_enabled:true}});
  await page.goto('/producto.html?id='+product.id);
  await expect(page.locator('#btnComprar')).toBeEnabled();
  await page.locator('#customNotes').fill('Necesito 10 cm adicionales');
  await expect(page.locator('#btnComprar')).toBeDisabled();
  await expect(page.locator('#checkoutStatus')).toContainText('WhatsApp');
  await expect(page.locator('#btnWhatsapp')).toHaveAttribute('href',/^https:\/\/wa\.me\//);
  expect(state.checkoutRequests).toHaveLength(0);
});
test('return page reports only the server-verified payment state',async({page})=>{
  const state=await setup(page);
  await page.goto('/pago.html?pedido=11111111-1111-4111-8111-111111111111&resultado=exito');
  await expect(page.locator('#resultTitle')).toHaveText('Pago aprobado');
  await expect(page.locator('#resultAmount')).toHaveText('$199.000 ARS');
  await expect(page.locator('#resultStatus')).toHaveText('approved');
  expect(state.statusRequests).toHaveLength(1);
  expect(state.errors).toEqual([]);
});
test('editable catalog and product data cannot inject HTML, attributes or scripts',async({page})=>{
  const payload='\"><img src=x onerror="window.XSS=1"><svg onload="window.XSS=1">';
  const malicious={...product,nombre:payload,sku:payload,resumen:payload,imagen:'javascript:window.XSS=1',fotos:['javascript:window.XSS=1'],maderas:[{nombre:payload,meta:payload,tex:"'); color:red; background:url(javascript:alert(1))",delta:0}],tonos_madera:[{nombre:payload,etiqueta:payload,hex:payload,rgb:[1,1,1]}],colores_metal:[{nombre:payload,meta:payload,rgb:[0,0,0]}],acabados:[{nombre:payload,meta:payload,rough:.75}],extras:[{nombre:payload,meta:payload,precio:10}]};
  await setup(page,{rows:[malicious]});
  await page.goto('/');
  await expect(page.locator('.product-title').first()).toHaveText(payload);
  expect(await page.evaluate(()=>document.querySelectorAll('[onerror], [onload], svg').length)).toBe(0);
  await page.locator('#catalogoGrid .product-card').click();
  await expect(page.locator('#prodTitle')).toHaveText(payload);
  expect(await page.evaluate(()=>document.querySelectorAll('[onerror], [onload], svg').length)).toBe(0);
  expect(await page.evaluate(()=>window.XSS)).toBeUndefined();
  await expect(page.locator('.extra-checkbox')).toHaveAttribute('data-name',payload);
});
for (const width of [390,1280]) test(`responsive and accessible storefront at ${width}px`,async({page},testInfo)=>{
  await setup(page);
  await page.setViewportSize({width,height:900});
  await page.goto('/');
  await expect(page.locator('.product-card').first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Hogar',exact:true}).click();
  await expect(page.getByRole('button',{name:'Hogar',exact:true})).toHaveAttribute('aria-expanded','true');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Hogar',exact:true})).toHaveAttribute('aria-expanded','false');
  let audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(audit.violations).toEqual([]);
  await page.screenshot({path:testInfo.outputPath(`catalog-${width}.png`),fullPage:true});
  await page.goto('/producto.html?id='+product.id);
  await expect(page.locator('#mainShopLayout')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(audit.violations).toEqual([]);
  await page.screenshot({path:testInfo.outputPath(`product-${width}.png`),fullPage:true});
});

test('transactional email fits narrow mobile viewports without cropped content', async ({ page }) => {
  const { orderEmailTemplate } = await import('../supabase/functions/_shared/email-notifications.mjs');
  const customer = { full_name: 'Comprador de prueba', email: 'buyer@example.invalid', delivery_method: 'pickup' };
  const order = {
    id: '11111111-1111-4111-8111-111111111111',
    product_id: 'pieza-sandbox-001',
    product_snapshot: { id: 'pieza-sandbox-001', nombre: 'Mesa de hierro y madera de prueba', sku: 'SANDBOX-001', imagen: '/assets/img/logo.jpg/Code_Generated_Image.png' },
    selection_snapshot: { wood_type: 'Pino', wood_stain: 'Natural', metal_color: 'Negro', finish: 'Mate', extras: [] },
    total_amount: 108000, currency: 'ARS',
    mp_order_id: 'ORDTST01SAMPLE000001',
  };
  for (const notificationType of ['customer_payment_confirmed', 'seller_payment_received']) {
    for (const width of [320, 360, 620]) {
      await page.setViewportSize({ width, height: 780 });
      await page.setContent(orderEmailTemplate({}, { notification_type: notificationType }, order, customer).html);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('.email-amount')).toContainText('108.000');
      await expect(page.locator('img')).toHaveCount(1);
      await expect(page.locator('img')).toHaveAttribute('src', 'https://tienda-checkout-sandbox.acero-y-escamas.workers.dev/assets/img/email-pangolin-708c76-sharp.png');
      await expect.poll(() => page.locator('img').evaluate(img => img.naturalWidth)).toBe(192);
      await expect(page.locator('img')).toHaveAttribute('width', '80');
      await expect(page.locator('img')).toHaveAttribute('align', 'right');
    }
  }
});
