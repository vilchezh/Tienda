const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function store(phone = '') {
  const context = { window: { STORE_CONFIG: { whatsappNumber: phone } }, URL, AbortSignal, location: { href: 'https://tienda.example/producto.html', origin: 'https://tienda.example' } };
  vm.runInNewContext(fs.readFileSync('assets/js/store.js', 'utf8'), context);
  return context.window.Store;
}
test('editable content cannot escape text or quoted HTML attributes', () => {
  assert.equal(store().escapeHTML('<img src=x onerror="alert(1)">&\''), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;');
});
test('media accepts local/HTTPS URLs and rejects executable schemes or credentials', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'vbscript:x', 'file:///tmp/a', 'http://external.test/a', 'https://user:pass@example.com/a']) assert.equal(store().assetURL(url), '');
  assert.equal(store().assetURL('assets/modelos/test.glb'), 'https://tienda.example/assets/modelos/test.glb');
});
test('WhatsApp requires configuration and encodes the message', () => {
  assert.equal(store().whatsappURL('hola'), '');
  assert.equal(store('javascript:alert(1)').whatsappURL('hola'), '');
  // Synthetic test-only value. Never installed in STORE_CONFIG.
  assert.equal(store('12345678901').whatsappURL('a&b #?'), 'https://wa.me/12345678901?text=a%26b%20%23%3F');
});
test('activeProducts fails closed on server errors, empty and hidden rows', async () => {
  const eqCalls = [];
  const query = { abortSignal() { return this; }, eq(...args) { eqCalls.push(args); return this; }, then(resolve) { resolve({data:[{id:'hidden',activo:false}, {id:'visible',activo:true}],error:null}); } };
  const products = await store().activeProducts({from:()=>({select:()=>query})}, 'visible');
  assert.equal(products.length, 1); assert.equal(products[0].id, 'visible');
  assert.deepEqual(eqCalls, [['activo',true],['id','visible']]);
  await assert.rejects(store().activeProducts({from:()=>({select:()=>({eq:()=>({abortSignal:()=>Promise.resolve({data:null,error:{message:'offline'}})})})})}));
});
