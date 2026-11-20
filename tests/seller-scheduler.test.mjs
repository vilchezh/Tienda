import test from 'node:test';
import assert from 'node:assert/strict';
import { sellerNotificationSchedulerHandler } from '../supabase/functions/_shared/seller-notification-scheduler.mjs';

const env={
 SUPABASE_URL:'https://ivyagavbhsyzvikzhmhe.supabase.co',
 SUPABASE_SERVICE_ROLE_KEY:'fake-testing-only-service-role',
 STORE_BASE_URL:'https://tienda.acero-y-escamas.workers.dev',
 STORE_DEPLOYMENT_MODE:'production',
 STORE_EXPECTED_SUPABASE_REF:'ivyagavbhsyzvikzhmhe',
 QUOTE_STORAGE_BUCKET:'quote-reference',
 RESEND_API_KEY:'fake',
 ORDER_EMAIL_FROM:'Acero y Escamas <ventas@example.test>',
 ORDER_NOTIFICATION_TO:'Taller@Example.Test',
 STORE_CUSTOMER_EMAILS_ENABLED:'true'
};
const secret='b'.repeat(64);
const send=(headers={},method='POST')=>new Request(
 env.SUPABASE_URL+'/functions/v1/process-seller-notifications',{
 method,headers:{...headers}
});
const json=(data)=>Response.json(data);

test('the scheduler refuses GET and missing/unrecognized token without claim or Resend requests',async()=>{
 const requests=[];
 const handler=sellerNotificationSchedulerHandler(env,async(url)=>{requests.push(String(url));return json(true);});
 assert.equal((await handler(send({},'GET'))).status,405);
 assert.equal((await handler(send())).status,401);
 assert.equal(requests.length,0);
 const invalid=sellerNotificationSchedulerHandler(env,async(url)=>{
  requests.push(String(url));return json(false);
 });
 assert.equal((await invalid(send({'x-seller-dispatch-token':secret}))).status,401);
 assert.equal(requests.length,1);
 assert.match(requests[0],/rpc\/storefront_validate_seller_dispatch$/);
});

test('scheduler never runs on sandbox, even with valid server-issued token',async()=>{
 const sandbox={...env,SUPABASE_URL:'https://pacyytbscnlklyrhsshp.supabase.co',
  STORE_BASE_URL:'https://tienda-checkout-sandbox.acero-y-escamas.workers.dev',
  STORE_DEPLOYMENT_MODE:'sandbox',QUOTE_STORAGE_BUCKET:'quote-reference-sandbox'};
 let calls=0;
 const handler=sellerNotificationSchedulerHandler(sandbox,async()=>{calls++;throw Error('No network');});
 assert.equal((await handler(send({'x-seller-dispatch-token':secret}))).status,403);
 assert.equal(calls,0);
});

test('scheduler claims only seller emails even when future customer notifications are enabled',async()=>{
 const requests=[];
 const base=env.SUPABASE_URL+'/rest/v1/';
 const fetchFn=async(url,init)=>{
  requests.push({url:String(url),method:init?.method});
  if(String(url)===base+'rpc/storefront_validate_seller_dispatch')return json(true);
  if(String(url)===base+'rpc/custom_quote_claim_seller_emails')return json([]);
  if(String(url)===base+'rpc/checkout_claim_cancellation_seller_emails')return json([]);
  throw Error('Unexpected request: '+String(url));
 };
 const response=await sellerNotificationSchedulerHandler(env,fetchFn)(send({'x-seller-dispatch-token':secret}));
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.ok,true);
 assert.equal(data.seller_only,true);
 assert.equal(data.quotes.processed,0);
 assert.equal(data.cancellations.processed,0);
 assert.deepEqual(requests.map(r=>r.url),[
  base+'rpc/storefront_validate_seller_dispatch',
  base+'rpc/custom_quote_claim_seller_emails',
  base+'rpc/checkout_claim_cancellation_seller_emails'
 ]);
});
