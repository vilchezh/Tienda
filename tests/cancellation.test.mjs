import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cancellationRequestHandler } from '../supabase/functions/_shared/cancellation-handler.mjs';
import { dispatchCancellationEmails,processCancellationNotificationsHandler } from '../supabase/functions/_shared/cancellation-emails.mjs';

const env={
 STORE_BASE_URL:'https://tienda-checkout-sandbox.acero-y-escamas.workers.dev',
 STORE_ALLOWED_ORIGINS:'',
 SUPABASE_URL:'https://pacyytbscnlklyrhsshp.supabase.co',
 SUPABASE_SERVICE_ROLE_KEY:'sandbox-only-secret-for-hmac-tests',
 ORDER_NOTIFICATION_DISPATCH_SECRET:'sandbox-dispatch-test'
};
const sample={
 action:'submit',
 submission_id:'123e4567-e89b-42d3-a456-426614174000',
 status_token:'A'.repeat(43),
 email:'test@example.invalid',
 order_reference:'pedido de prueba',
 message:''
};
const request=(data,origin=env.STORE_BASE_URL)=>new Request(
 env.SUPABASE_URL+'/functions/v1/cancellation-request',{
  method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(data)
 });
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});

test('cancellation endpoint never permits other origins or arbitrary HTTP methods',async()=>{
 let hits=0;
 const handler=cancellationRequestHandler(env,async()=>{hits++;return reply([]);});
 const wrong=await handler(request(sample,'https://evil.example.invalid'));
 assert.equal(wrong.status,403);
 const wrongMethod=await handler(new Request('https://example.invalid',{method:'GET',headers:{origin:env.STORE_BASE_URL}}));
 assert.equal(wrongMethod.status,405);
 assert.equal(hits,0);
});

test('cancellation registration returns a code without exposing private data',async()=>{
 const calls=[];
 const handler=cancellationRequestHandler(env,async(url,init)=>{
  calls.push({url:String(url),payload:JSON.parse(init.body)});
  return reply([{request_code:'ARR-2026-000001',request_status:'received',registered_at:'2026-11-18T02:00:00Z'}]);
 });
 const res=await handler(request(sample));
 assert.equal(res.status,200);
 const data=await res.json();
 assert.equal(data.code,'ARR-2026-000001');
 assert.equal(data.status,'received');
 assert.ok(!JSON.stringify(data).includes('test@example.invalid'));
 assert.match(calls[0].url,/rpc\/checkout_register_cancellation/);
 assert.match(calls[0].payload.p_token_hash,/^[a-f0-9]{64}$/);
 assert.match(calls[0].payload.p_ip_hash,/^[a-f0-9]{64}$/);
 assert.ok(!JSON.stringify(calls[0].payload).includes(sample.status_token));
});
test('cancellation registration rejects invalid or oversized submissions',async()=>{
 let hits=0;
 const handler=cancellationRequestHandler(env,async()=>{hits++;return reply([]);});
 assert.equal((await handler(request({...sample,email:'broken'}))).status,400);
 assert.equal((await handler(request({...sample,status_token:'short'}))).status,400);
 assert.equal((await handler(request({...sample,message:'Z'.repeat(501)}))).status,400);
 assert.equal(hits,0);
});
test('status requires a private token and returns only public state',async()=>{
 let hits=0;
 const handler=cancellationRequestHandler(env,async(url)=>{
  hits++;
  assert.match(String(url),/access_token_hash=eq\.[a-f0-9]{64}/);
  return reply([{code:'ARR-2026-000001',status:'reviewing',created_at:'2026-11-18T02:00:00Z',updated_at:'2026-11-18T02:01:00Z'}]);
 });
 assert.equal((await handler(request({action:'status',code:'ARR-2026-000001',status_token:'x'}))).status,400);
 const res=await handler(request({action:'status',code:'ARR-2026-000001',status_token:sample.status_token}));
 assert.equal(res.status,200);
 const data=await res.json();
 assert.deepEqual(Object.keys(data),['code','status','created_at','updated_at']);
 assert.equal(hits,1);
});
test('scheduled email dispatch rejects missing secret and never emails unapproved sandbox buyers',async()=>{
 const handler=processCancellationNotificationsHandler({...env,RESEND_API_KEY:'test',ORDER_EMAIL_FROM:'taller@example.invalid',ORDER_NOTIFICATION_TO:'seller@example.invalid'},async()=>{throw Error('must not dispatch');});
 const unauthorized=await handler(new Request(env.SUPABASE_URL+'/functions/v1/process-cancellation-notifications',{method:'POST'}));
 assert.equal(unauthorized.status,401);
 const urlHits=[];
 const statusChanges=[];
 const configured={...env,RESEND_API_KEY:'test',ORDER_EMAIL_FROM:'taller@example.invalid',ORDER_NOTIFICATION_TO:'seller@example.invalid'};
 const result=await dispatchCancellationEmails(configured,async(url,init)=>{
  urlHits.push(String(url));
  if(String(url).includes('rpc/checkout_claim_cancellation_emails'))return reply([{email_id:'1',req_id:'2',kind:'customer',attempt:1}]);
  if(String(url).includes('checkout_cancellation_requests?'))return reply([{id:'2',code:'ARR-2026-000001',customer_email:'buyer@example.invalid',status:'received',created_at:'2026-11-18T02:00:00Z'}]);
  if(init?.method==='PATCH'){statusChanges.push(JSON.parse(init.body));return new Response(null,{status:204});}
  throw Error('unexpected request');
 },10);
 assert.equal(result.rejected,1);
 assert.equal(statusChanges[0].last_error,'sandbox_customer_not_allowlisted');
 assert.equal(urlHits.filter(x=>x.includes('api.resend.com')).length,0);
});
