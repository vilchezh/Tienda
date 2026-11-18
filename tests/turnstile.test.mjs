import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyTurnstile } from '../supabase/functions/_shared/turnstile-check.mjs';
import { cancellationRequestHandler } from '../supabase/functions/_shared/cancellation-handler.mjs';
import { customQuoteHandler } from '../supabase/functions/_shared/custom-quote-handler.mjs';
const host='https://tienda-checkout-sandbox.acero-y-escamas.workers.dev';
const supa='https://pacyytbscnlklyrhsshp.supabase.co';
const originHost='tienda-checkout-sandbox.acero-y-escamas.workers.dev';
const shared={STORE_BASE_URL:host,SUPABASE_URL:supa,STORE_ALLOWED_ORIGINS:'',
 SUPABASE_SERVICE_ROLE_KEY:'local-sandbox-hmac-only-secret',
 TURNSTILE_SECRET:'test-only-secret-never-prod'};
const request=(body,path='cancellation-request')=>new Request(supa+'/functions/v1/'+path,{
 method:'POST',headers:{origin:host,'content-type':'application/json','cf-connecting-ip':'203.0.113.3'},
 body:JSON.stringify(body)
});
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
test('Turnstile opt-in does not block sandbox before real keys are configured',async()=>{
 const result=await verifyTurnstile({...shared,TURNSTILE_SECRET:''},request({}),undefined,async()=>{throw Error('unexpected call');});
 assert.deepEqual(result,{configured:false,ok:true});
});
test('missing or malformed Turnstile proof fails closed before contacting Cloudflare',async()=>{
 let network=0;
 const fetchFn=async()=>{network++;throw Error('not called');};
 assert.deepEqual(await verifyTurnstile(shared,request({}),undefined,fetchFn),{configured:true,ok:false});
 assert.deepEqual(await verifyTurnstile(shared,request({}),'bad',fetchFn),{configured:true,ok:false});
 assert.equal(network,0);
});
test('valid proof is accepted only for the sandbox hostname',async()=>{
 const t='0.long-but-fake-test-token-1234567890';
 const results=[];
 const checker=async(url,init)=>{
  assert.equal(String(url),'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  const body=new URLSearchParams(init.body);
  assert.equal(body.get('response'),t);
  assert.equal(body.get('secret'),shared.TURNSTILE_SECRET);
  assert.equal(body.get('remoteip'),'203.0.113.3');
  results.push(true);
  return reply({success:true,hostname:originHost});
 };
 assert.deepEqual(await verifyTurnstile(shared,request({}),t,checker),{configured:true,ok:true});
 assert.equal(results.length,1);
 assert.equal((await verifyTurnstile(shared,request({}),t,
  async()=>reply({success:true,hostname:'attacker.example.invalid'}))).ok,false);
 assert.equal((await verifyTurnstile(shared,request({}),t,
  async()=>reply({success:false,hostname:originHost}))).ok,false);
});
test('cancellation and quote cannot register without Turnstile once secret is configured',async()=>{
 let calls=0;
 const fetchFn=async()=>{calls++;throw Error('never reached');};
 const cancellation=cancellationRequestHandler(shared,fetchFn);
 const c=await cancellation(request({action:'submit',
  submission_id:'11111111-1111-4111-8111-111111111111',
  status_token:'A'.repeat(43),email:'buyer@example.invalid',
  order_reference:'',message:''
 }));
 assert.equal(c.status,403);
 const quote=customQuoteHandler(shared,fetchFn);
 const q=await quote(request({
  action:'start',submission_id:'11111111-1111-4111-8111-111111111111',
  token:'A'.repeat(43),full_name:'Cliente de Prueba',
  email:'buyer@example.invalid',phone:'1155555555',city:'General Rodriguez',
  project_type:'mueble',description:'Mesa industrial de hierro y madera para taller.',
  quantity:1,delivery:'retiro'
 },'custom-quote-request'));
 assert.equal(q.status,403);
 assert.equal(calls,0);
});
