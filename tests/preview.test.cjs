const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '..');
const productionConfig = () => readFileSync(resolve(root, 'assets/js/config.js'), 'utf8');
const publicKey = ref => {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256' })}.${encode({ role: 'anon', ref })}.synthetic`;
};
const build = (ref, key = publicKey(ref)) => spawnSync('npm', ['run', 'build:preview'], {
  cwd: root, encoding: 'utf8',
  env: { ...process.env, STORE_PREVIEW_SUPABASE_URL: `https://${ref}.supabase.co`,
    STORE_PREVIEW_SUPABASE_ANON_KEY: key, STORE_PREVIEW_SITE_URL: 'https://tienda-checkout-sandbox.acero-y-escamas.workers.dev' },
});

test('preview build uses only a separate Supabase project and fictitious catalog', () => {
  const original = productionConfig();
  const result = build('pacyytbscnlklyrhsshp');
  assert.equal(result.status, 0, result.stderr);
  const config = readFileSync(resolve(root, 'dist-preview/assets/js/config.js'), 'utf8');
  assert.match(config, /pacyytbscnlklyrhsshp\.supabase\.co/);
  assert.doesNotMatch(config, /ivyagavbhsyzvikzhmhe/);
  assert.match(config, /"whatsappNumber":""/);
  const products = JSON.parse(readFileSync(resolve(root, 'dist-preview/productos.json'), 'utf8'));
  assert.equal(products.length, 1);
  assert.equal(products[0].id, 'pieza-sandbox-001');
  assert.equal(productionConfig(), original);
});

test('preview build refuses published Supabase and mismatched public keys', () => {
  assert.notEqual(build('ivyagavbhsyzvikzhmhe').status, 0);
  assert.notEqual(build('pacyytbscnlklyrhsshp', publicKey('differentproject1234')).status, 0);
});
