const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');

const root = resolve(__dirname, '..');
const configSource = readFileSync(resolve(root, 'dist-preview/assets/js/config.js'), 'utf8');
const context = { window: {} };
runInNewContext(configSource, context, { timeout: 1000 });
const config = context.window.STORE_CONFIG;
const wrangler = JSON.parse(readFileSync(resolve(root, 'wrangler.checkout-preview.jsonc'), 'utf8'));
const products = JSON.parse(readFileSync(resolve(root, 'dist-preview/productos.json'), 'utf8'));

assert.equal(wrangler.name, 'tienda-checkout-sandbox');
assert.equal(wrangler.assets.directory, './dist-preview');
assert.equal(config.supabaseUrl, 'https://pacyytbscnlklyrhsshp.supabase.co');
assert.equal(config.siteUrl, 'https://tienda-checkout-sandbox.acero-y-escamas.workers.dev');
assert.equal(config.whatsappNumber, '');
assert.ok(process.env.STORE_PREVIEW_SUPABASE_ANON_KEY);
assert.equal(config.supabaseAnonKey, process.env.STORE_PREVIEW_SUPABASE_ANON_KEY);
assert.equal(products.length, 1);
assert.equal(products[0].id, 'pieza-sandbox-001');
assert.doesNotMatch(configSource, /ivyagavbhsyzvikzhmhe|5491164598478/);

console.log('Vista previa verificada: proyecto y Worker sandbox, catálogo ficticio, WhatsApp apagado.');
