import test from 'node:test';
import assert from 'node:assert/strict';
import { customerNotificationSchedulerHandler } from '../supabase/functions/_shared/customer-notification-scheduler.mjs';
import { readFileSync } from 'node:fs';

const env={
 SUPABASE_URL:'https://ivyagavbhsyzvikzhmhe.supabase.co',
 SUPABASE_SERVICE_ROLE_KEY:'fake-testing-only-service-role',
 STORE_BASE_URL:'https://aceroyescamas.com.ar',
 STORE_DEPLOYMENT_MODE:'production',
 STORE_EXPECTED_SUPABASE_REF:'ivyagavbhsyzvikzhmhe',
 QUOTE_STORAGE_BUCKET:'quote-reference',
 RESEND_API_KEY:'fake',
 ORDER_EMAIL_FROM:'Acero y Escamas <pedidos@aceroyescamas.com.ar>',
 ORDER_NOTIFICATION_TO:'acero.y.escamas@gmail.com',
 STORE_CUSTOMER_EMAILS_ENABLED:'true'
};
const secret='b'.repeat(64);
const send=(headers={},method='POST')=>new Request(
 env.SUPABASE_URL+'/functions/v1/process-customer-notifications',{
  method,headers:{...headers}
});
const json=data=>Response.json(data);

test('customer scheduler denies GET, missing token and wrong token without requesting a claim',async()=>{
 const paths=[];
 const handler=customerNotificationSchedulerHandler(env,async(url)=>{
  paths.push(String(url));
  return json(false);
 });
 assert.equal((await handler(send({},'GET'))).status,405);
 assert.equal((await handler(send())).status,401);
 assert.equal(paths.length,0);
 assert.equal((await handler(send({'x-seller-dispatch-token':secret}))).status,401);
 assert.deepEqual(paths,[env.SUPABASE_URL+'/rest/v1/rpc/storefront_validate_seller_dispatch']);
});

test('customer scheduler never executes in sandbox',async()=>{
 let calls=0;
 const sandbox={...env,SUPABASE_URL:'https://pacyytbscnlklyrhsshp.supabase.co',
  STORE_BASE_URL:'https://tienda-checkout-sandbox.acero-y-escamas.workers.dev',
  STORE_DEPLOYMENT_MODE:'sandbox',QUOTE_STORAGE_BUCKET:'quote-reference-sandbox'};
 const handler=customerNotificationSchedulerHandler(sandbox,async()=>{
  calls++;throw Error('No external calls');
 });
 assert.equal((await handler(send({'x-seller-dispatch-token':secret}))).status,403);
 assert.equal(calls,0);
});

test('customer scheduler does not claim queued records unless flag is explicitly true',async()=>{
 const paths=[];
 const disabled={...env,STORE_CUSTOMER_EMAILS_ENABLED:'false'};
 const base=env.SUPABASE_URL+'/rest/v1/';
 const handler=customerNotificationSchedulerHandler(disabled,async(url)=>{
  paths.push(String(url));return json(true);
 });
 const response=await handler(send({'x-seller-dispatch-token':secret}));
 assert.equal(response.status,409);
 assert.deepEqual(paths,[base+'rpc/storefront_validate_seller_dispatch']);
});

test('customer scheduler uses the two existing atomic claim procedures when enabled',async()=>{
 const paths=[];
 const base=env.SUPABASE_URL+'/rest/v1/';
 const expected=[
  base+'rpc/storefront_validate_seller_dispatch',
  base+'rpc/custom_quote_claim_emails',
  base+'rpc/checkout_claim_cancellation_emails'
 ];
 const handler=customerNotificationSchedulerHandler(env,async(url,init)=>{
  paths.push(String(url));
  assert.equal(init?.method,'POST');
  if(String(url)===expected[0])return json(true);
  if(expected.slice(1).includes(String(url)))return json([]);
  throw Error('Unexpected external request');
 });
 const response=await handler(send({'x-seller-dispatch-token':secret}));
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.ok,true);
 assert.equal(data.customer_delivery_enabled,true);
 assert.equal(data.quotes.processed,0);
 assert.equal(data.cancellations.processed,0);
 assert.deepEqual(paths,expected);
});

test('entrypoint passes customer flag and never places internal credentials in public files',()=>{
 const source=readFileSync(new URL('../supabase/functions/process-customer-notifications/index.ts',import.meta.url),'utf8');
 assert.match(source,/'STORE_CUSTOMER_EMAILS_ENABLED'/);
 assert.match(source,/'QUOTE_STORAGE_BUCKET'/);
 assert.doesNotMatch(source,/https:\/\/api\.resend\.com\/emails/);
});
