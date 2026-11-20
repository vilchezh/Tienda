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
  assert.match(config, /"quoteStorageBucket":"quote-reference-sandbox"/);
  assert.doesNotMatch(config, /"quoteStorageBucket":"quote-reference"/);
  assert.match(readFileSync(resolve(root, 'dist-preview/assets/js/quotes-admin.js'), 'utf8'), /storage\.from\(bucket\)/);

  const products = JSON.parse(readFileSync(resolve(root, 'dist-preview/productos.json'), 'utf8'));
  assert.equal(products.length, 1);
  assert.equal(products[0].id, 'pieza-sandbox-001');
  assert.match(readFileSync(resolve(root, 'dist-preview/presupuesto.html'), 'utf8'), /id="quoteForm"/);
  assert.match(readFileSync(resolve(root, 'dist-preview/presupuesto.html'), 'utf8'), /quote-choices\.js/);
  assert.match(readFileSync(resolve(root, 'dist-preview/assets/js/quote-choices.js'), 'utf8'), /custom_quote_options/);
  assert.match(readFileSync(resolve(root, 'dist-preview/assets/js/quote-options-admin.js'), 'utf8'), /custom_quote_options/);
  assert.match(readFileSync(resolve(root, 'dist-preview/assets/js/quote.js'), 'utf8'), /custom-quote-request/);
  assert.match(readFileSync(resolve(root, 'dist-preview/admin.html'), 'utf8'), /id="customQuotesAdmin"/);
  assert.match(readFileSync(resolve(root, 'dist-preview/admin.html'), 'utf8'), /id="adminMfaEnrollPanel"/);
  const headers = readFileSync(resolve(root, 'dist-preview/_headers'), 'utf8');
  for (const policy of ['X-Content-Type-Options: nosniff','X-Frame-Options: DENY','Referrer-Policy: strict-origin-when-cross-origin','Content-Security-Policy-Report-Only:']) assert.ok(headers.includes(policy), policy);
  assert.match(readFileSync(resolve(root, 'dist-preview/arrepentimiento.html'),'utf8'), /id="cancellationForm"/);
  assert.match(readFileSync(resolve(root, 'dist-preview/assets/js/cancellation.js'),'utf8'), /cancellation-request/);
  assert.match(readFileSync(resolve(root, 'dist-preview/admin.html'),'utf8'), /id="cancellationsAdmin"/);
  for (const page of ['privacidad.html', 'terminos.html', 'arrepentimiento.html']) {
    assert.match(readFileSync(resolve(root, 'dist-preview', page), 'utf8'), /<!doctype html>/i);
  }
  assert.equal(productionConfig(), original);
  const verified = spawnSync('node', ['scripts/verify-preview.cjs'], {
    cwd: root, encoding: 'utf8', env: { ...process.env, STORE_PREVIEW_SUPABASE_ANON_KEY: publicKey('pacyytbscnlklyrhsshp') },
  });
  assert.equal(verified.status, 0, verified.stderr);
});

test('preview build refuses published Supabase and mismatched public keys', () => {
  assert.notEqual(build('ivyagavbhsyzvikzhmhe').status, 0);
  assert.notEqual(build('pacyytbscnlklyrhsshp', publicKey('differentproject1234')).status, 0);
});
