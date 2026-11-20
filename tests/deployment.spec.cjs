const { test, expect } = require('@playwright/test');
const { setup, product } = require('./helpers.cjs');

test('Wrangler sirve las rutas públicas limpias y los assets binarios', async ({ page, request }) => {
  const state = await setup(page);

  const home = await page.goto('/');
  expect(home.status()).toBe(200);
  await expect(page).toHaveTitle(/Acero y Escamas/);
  await expect(page.locator('#catalogoGrid .product-card')).toHaveCount(1);

  const admin = await page.goto('/admin');
  expect(admin.status()).toBe(200);
  expect(page.url()).toBe('http://127.0.0.1:8787/admin');
  await expect(page.locator('#loginScreen')).toBeVisible();

  const productPage = await page.goto(`/producto?id=${encodeURIComponent(product.id)}`);
  expect(productPage.status()).toBe(200);
  expect(page.url()).toContain('/producto?id=');
  await expect(page.locator('#mainShopLayout')).toBeVisible();
  await expect.poll(
    () => page.locator('model-viewer').evaluate(viewer => Boolean(viewer.loaded && viewer.model?.materials?.length)),
    { timeout: 20000 },
  ).toBe(true);

  const paymentResult = await page.goto('/pago?pedido=11111111-1111-4111-8111-111111111111');
  expect(paymentResult.status()).toBe(200);
  expect(page.url()).toContain('/pago?pedido=');
  await expect(page.locator('#paymentResult')).toBeVisible();

  const image = await request.get('/assets/img/logo.jpg/Code_Generated_Image.png');
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toContain('image/png');
  expect((await image.body()).byteLength).toBeGreaterThan(1000);

  const model = await request.get('/assets/modelos/mesa-ratona-industrial-900x500x450.glb');
  expect(model.status()).toBe(200);
  expect((await model.body()).byteLength).toBeGreaterThan(1000);

  expect(state.errors).toEqual([]);
});

test('Wrangler redirige las rutas .html a sus URLs canónicas', async ({ request }) => {
  for (const path of ['/admin.html', '/producto.html', '/pago.html']) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toBe(path.replace('.html', ''));
  }
});
