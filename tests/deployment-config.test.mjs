import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { deploymentConfig,emailVisuals,allowCustomerEmail,mercadoPagoSecrets } from '../supabase/functions/_shared/deployment-config.mjs';
import { verifyTurnstile } from '../supabase/functions/_shared/turnstile-check.mjs';
const sandbox={
 SUPABASE_URL:'https://pacyytbscnlklyrhsshp.supabase.co',
 STORE_BASE_URL:'https://tienda-checkout-sandbox.acero-y-escamas.workers.dev',
 MP_ACCESS_TOKEN_TEST:'TEST-SANDBOX-ONLY',MP_ACCESS_TOKEN_LIVE:'APP_USR-SHOULD-NOT-BE-USED',
 MP_WEBHOOK_SECRET_TEST:'sbx-secret',MP_WEBHOOK_SECRET_LIVE:'live-secret',
 ORDER_NOTIFICATION_TO:'seller@example.invalid'
};
const production={
 SUPABASE_URL:'https://ivyagavbhsyzvikzhmhe.supabase.co',
 STORE_BASE_URL:'https://tienda.acero-y-escamas.workers.dev',
 STORE_DEPLOYMENT_MODE:'production',
 STORE_EXPECTED_SUPABASE_REF:'ivyagavbhsyzvikzhmhe',
 QUOTE_STORAGE_BUCKET:'quote-reference',
 MP_ACCESS_TOKEN_TEST:'TEST-SHOULD-NOT-BE-USED',
 MP_ACCESS_TOKEN_LIVE:'APP_USR-LOCAL-TEST-NOT-REAL',
 MP_WEBHOOK_SECRET_LIVE:'live-secret',
 ORDER_NOTIFICATION_TO:'ventas@example.invalid',
 TURNSTILE_SECRET:'local-only-test-secret'
};
const req=new Request('https://example.invalid/submit',{headers:{'cf-connecting-ip':'203.0.113.9'}});
test('default runtime stays sandbox and rejects other project or hostname',()=>{
 assert.equal(deploymentConfig(sandbox).mode,'sandbox');
 assert.equal(deploymentConfig(sandbox).bucket,'quote-reference-sandbox');
 for(const broken of [
  {...sandbox,SUPABASE_URL:production.SUPABASE_URL},
  {...sandbox,STORE_BASE_URL:production.STORE_BASE_URL},
  {...sandbox,QUOTE_STORAGE_BUCKET:production.QUOTE_STORAGE_BUCKET},
  {...sandbox,STORE_DEPLOYMENT_MODE:'other'},
  {...sandbox,STORE_DEPLOYMENT_MODE:'production'},
  {...production,STORE_EXPECTED_SUPABASE_REF:'otherprojectotherone'},
  {...production,QUOTE_STORAGE_BUCKET:'quote-reference-sandbox'},
  {...production,QUOTE_STORAGE_BUCKET:'tienda'},
  {...production,STORE_ALLOWED_ORIGINS:'https://tienda-checkout-sandbox.acero-y-escamas.workers.dev'}
 ])assert.throws(()=>deploymentConfig(broken));
});
test('production only operates on explicit paired project, private bucket and HTTPS site',()=>{
 const prod=deploymentConfig(production);
 assert.deepEqual([prod.mode,prod.ref,prod.bucket],['production','ivyagavbhsyzvikzhmhe','quote-reference']);
 assert.match(emailVisuals(production).logoUrl,/^https:\/\/tienda\.acero-y-escamas\.workers\.dev\/assets\/img\//);
 assert.ok(!emailVisuals(production).tag);
 assert.equal(allowCustomerEmail(production,'buyer@example.invalid','quote'),true);
 assert.equal(allowCustomerEmail(sandbox,'buyer@example.invalid','quote'),false);
});
test('Mercado Pago secret selectors never fall back across test and live',()=>{
 assert.equal(mercadoPagoSecrets(sandbox).token,'TEST-SANDBOX-ONLY');
 assert.equal(mercadoPagoSecrets(sandbox).webhookSecret,'sbx-secret');
 assert.equal(mercadoPagoSecrets(production).token,'APP_USR-LOCAL-TEST-NOT-REAL');
 assert.equal(mercadoPagoSecrets(production).webhookSecret,'live-secret');
 assert.equal(mercadoPagoSecrets({...production,MP_ACCESS_TOKEN_LIVE:''}).token,'');
});
test('Turnstile checks productively configured hostname and fails when production secret absent',async()=>{
 const token='a-test-token-long-enough-for-turnstile';
 const validated=await verifyTurnstile(production,req,token,async()=>Response.json({success:true,hostname:'tienda.acero-y-escamas.workers.dev'}));
 assert.equal(validated.ok,true);
 const mismatch=await verifyTurnstile(production,req,token,async()=>Response.json({success:true,hostname:'tienda-checkout-sandbox.acero-y-escamas.workers.dev'}));
 assert.equal(mismatch.ok,false);
 const noSecret=await verifyTurnstile({...production,TURNSTILE_SECRET:''},req,token,async()=>{throw Error('unexpected network');});
 assert.equal(noSecret.ok,false);
});
test('release build refuses missing or sandbox credentials and accepts properly scoped public config',()=>{
 const run=env=>spawnSync(process.execPath,['scripts/build.cjs','--release'],{
  cwd:process.cwd(),encoding:'utf8',env:{...process.env,
   STORE_PROD_SUPABASE_URL:'',
   STORE_PROD_SITE_URL:'',
   STORE_PROD_SUPABASE_REF:'',
   STORE_PROD_SUPABASE_ANON_KEY:'',
   STORE_PROD_TURNSTILE_SITE_KEY:'',
   ...env
  }
 });
 assert.notEqual(run({}).status,0);
 assert.notEqual(run({STORE_PROD_SUPABASE_URL:sandbox.SUPABASE_URL,STORE_PROD_SITE_URL:sandbox.STORE_BASE_URL}).status,0);
 const jwt=parts=>parts.map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.')+'.synthetic';
 const good=run({
  STORE_PROD_SUPABASE_URL:production.SUPABASE_URL,
  STORE_PROD_SUPABASE_REF:'ivyagavbhsyzvikzhmhe',
  STORE_PROD_SITE_URL:production.STORE_BASE_URL,
  STORE_PROD_TURNSTILE_SITE_KEY:'0xTESTfakePublicSiteKeyABCDEFGHIJ',
  STORE_PROD_SUPABASE_ANON_KEY:jwt([{alg:'HS256'},{ref:'ivyagavbhsyzvikzhmhe',role:'anon'}])
 });
 assert.equal(good.status,0,good.stderr);
 const config=readFileSync('dist/assets/js/config.js','utf8');
 assert.match(config,/ivyagavbhsyzvikzhmhe/);
 assert.doesNotMatch(config,/pacyytbscnlklyrhsshp|tienda-checkout-sandbox/);
 assert.match(readFileSync('dist/_headers','utf8'),/https:\/\/ivyagavbhsyzvikzhmhe\.supabase\.co/);
 const quoteHtml=readFileSync('dist/presupuesto.html','utf8');
 const cancellationHtml=readFileSync('dist/arrepentimiento.html','utf8');
 assert.match(quoteHtml,/guardá el código de solicitud/);
 assert.doesNotMatch(quoteHtml,/En este entorno de pruebas los emails automáticos/);
 assert.match(cancellationHtml,/Guardá el enlace y el código/);
 assert.doesNotMatch(cancellationHtml,/Entorno de pruebas:|En sandbox los correos/);

});
