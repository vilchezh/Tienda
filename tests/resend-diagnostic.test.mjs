import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resendDiagnosticHandler} from '../supabase/functions/_shared/resend-diagnostic.mjs';

const site='https://tienda.acero-y-escamas.workers.dev';
import { readFileSync } from 'node:fs';
test('Resend diagnostic entrypoint forwards configured allowed origins',()=>{
 const source=readFileSync(new URL('../supabase/functions/resend-diagnostic/index.ts',import.meta.url),'utf8');
 assert.match(source,/['\"]STORE_ALLOWED_ORIGINS['\"]/);
});
const env={
 SUPABASE_URL:'https://ivyagavbhsyzvikzhmhe.supabase.co',
 SUPABASE_ANON_KEY:'public-anon-test-key',
 SUPABASE_SERVICE_ROLE_KEY:'fake-test-internal-key',
 STORE_BASE_URL:site,
 STORE_DEPLOYMENT_MODE:'production',
 STORE_EXPECTED_SUPABASE_REF:'ivyagavbhsyzvikzhmhe',
 QUOTE_STORAGE_BUCKET:'quote-reference',
 RESEND_API_KEY:'fake-test-resend-key',
 ORDER_NOTIFICATION_TO:'Owner@Example.Invalid',
 ORDER_EMAIL_FROM:'Acero y Escamas <onboarding@resend.dev>'
};
const bearer='Bearer '+('x'.repeat(60));
const req=(origin=site,auth=bearer)=>new Request(env.SUPABASE_URL+'/functions/v1/resend-diagnostic',{
 method:'POST',headers:{origin,authorization:auth,'content-type':'application/json'},
 body:JSON.stringify({to:'attacker@example.invalid'})
});
const endpoint={auth:env.SUPABASE_URL+'/rest/v1/rpc/storefront_admin_authorized',
 reserve:env.SUPABASE_URL+'/rest/v1/rpc/email_diagnostic_reserve'};
const testBackend=(options={})=>{
 const requests=[];
 const fn=async(url,init)=>{
  requests.push({url:String(url),init});
  if(String(url)===endpoint.auth)return Response.json(options.authorized??true);
  if(String(url)===endpoint.reserve)return Response.json(options.reserved??true);
  if(String(url)==='https://api.resend.com/emails')return options.provider??Response.json({id:'re_test_123'});
  throw Error('Unexpected endpoint '+url);
 };
 return {requests,fn};
};
test('Resend diagnostic refuses unknown origins and anonymous users before network access',async()=>{
 const b=testBackend();
 const handler=resendDiagnosticHandler(env,b.fn);
 assert.equal((await handler(req('https://evil.example.invalid'))).status,403);
 assert.equal((await handler(req(site,''))).status,401);
 assert.equal(b.requests.length,0);
});
test('Resend diagnostic permits the new domain only when listed and preserves strict CORS',async()=>{
 const allowed={...env,STORE_ALLOWED_ORIGINS:'https://aceroyescamas.com.ar'};
 const b=testBackend();
 const response=await resendDiagnosticHandler(allowed,b.fn)(req('https://aceroyescamas.com.ar'));
 assert.equal(response.status,200);
 assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://aceroyescamas.com.ar');
 assert.equal((await resendDiagnosticHandler(env,b.fn)(req('https://aceroyescamas.com.ar'))).status,403);
 assert.equal((await resendDiagnosticHandler(allowed,b.fn)(req('https://evil.example.invalid'))).status,403);
});
test('Resend diagnostic requires actual admin authorization via Supabase JWT context',async()=>{
 const b=testBackend({authorized:false});
 assert.equal((await resendDiagnosticHandler(env,b.fn)(req())).status,403);
 assert.deepEqual(b.requests.map(x=>x.url),[endpoint.auth]);
});
test('Resend diagnostic never lets browser choose recipient and sends only to store inbox',async()=>{
 const b=testBackend();
 const response=await resendDiagnosticHandler(env,b.fn)(req());
 assert.equal(response.status,200);
 assert.equal((await response.json()).accepted_by_resend,true);
 assert.deepEqual(b.requests.map(x=>x.url),[endpoint.auth,endpoint.reserve,'https://api.resend.com/emails']);
 const outgoing=JSON.parse(b.requests[2].init.body);
 assert.deepEqual(outgoing.to,['owner@example.invalid']);
 assert.ok(!JSON.stringify(outgoing).includes('attacker@example.invalid'));
 assert.match(outgoing.subject,/Prueba técnica/);
 assert.ok(!JSON.stringify(outgoing).includes('fake-test-resend-key'));
});
test('Resend diagnostic rate limit protects provider quota and does not send',async()=>{
 const b=testBackend({reserved:false});
 assert.equal((await resendDiagnosticHandler(env,b.fn)(req())).status,429);
 assert.deepEqual(b.requests.map(x=>x.url),[endpoint.auth,endpoint.reserve]);
});
test('Resend diagnostic reports trial-sender 403 without exposing API key',async()=>{
 const b=testBackend({provider:Response.json({name:'validation_error',message:'owner not verified'},{status:403})});
 const response=await resendDiagnosticHandler(env,b.fn)(req());
 assert.equal(response.status,502);
 const data=await response.json();
 assert.equal(data.error,'sender_or_recipient_not_verified');
 assert.equal(JSON.stringify(data).includes('fake-test-resend-key'),false);
});
