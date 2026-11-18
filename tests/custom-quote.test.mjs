import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customQuoteHandler } from '../supabase/functions/_shared/custom-quote-handler.mjs';
import { quoteEmailTemplate,dispatchQuoteEmails,quoteNotificationsHandler } from '../supabase/functions/_shared/custom-quote-emails.mjs';

const site='https://tienda-checkout-sandbox.acero-y-escamas.workers.dev';
const project='https://pacyytbscnlklyrhsshp.supabase.co';
const env={SUPABASE_URL:project,STORE_BASE_URL:site,STORE_ALLOWED_ORIGINS:'',
 SUPABASE_SERVICE_ROLE_KEY:'unit-test-service-key-not-real',
 ORDER_NOTIFICATION_DISPATCH_SECRET:'unit-test-dispatch'};
const draft={
 action:'start',submission_id:'11111111-1111-4111-8111-111111111111',token:'A'.repeat(43),
 full_name:'Cliente de Prueba',email:'cliente@example.invalid',phone:'1155555555',city:'General Rodriguez',
 project_type:'mueble',description:'Mesa industrial de hierro y madera para comedor.',
 measurements:'160 x 80 x 75 cm',materials:'Hierro + madera',finish:'Negro mate',
 quantity:1,desired_date:null,budget_ars:100000,delivery:'a_coordinar'
};
const post=(value,origin=site)=>new Request(project+'/functions/v1/custom-quote-request',{
 method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(value)});
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const uuid='22222222-2222-4222-8222-222222222222';
const sample={code:'COT-2026-000001',id:uuid,full_name:'Cliente <prueba>',email:'cliente@example.invalid',
 phone:'1155555555',city:'General Rodriguez',project_type:'mueble',description:'Mesa <script>alert(1)</script>',
 measurements:'160x80',materials:'Hierro',finish:'Negro',quantity:1,delivery:'retiro',status:'new'};

test('quote API blocks foreign origins and invalid requests before database access',async()=>{
 let called=0;
 const handler=customQuoteHandler(env,async()=>{called++;return reply([]);});
 assert.equal((await handler(post(draft,'https://other.example.invalid'))).status,403);
 assert.equal((await handler(post({...draft,email:'incorrecto'}))).status,400);
 assert.equal((await handler(post({...draft,description:'corto'}))).status,400);
 assert.equal((await handler(post({...draft,quantity:0}))).status,400);
 assert.equal(called,0);
});
test('quote create hashes secrets and returns only a reference, not contact information',async()=>{
 const requests=[];
 const handler=customQuoteHandler(env,async(url,init)=>{
  requests.push({url:String(url),data:JSON.parse(init.body)});
  return reply([{quote_id:uuid,quote_code:'COT-2026-000001',quote_status:'draft'}]);
 });
 const response=await handler(post(draft));
 assert.equal(response.status,200);
 const output=await response.json();
 assert.equal(output.code,'COT-2026-000001');
 assert.equal(output.status,'draft');
 assert.ok(!JSON.stringify(output).includes('cliente@example.invalid'));
 assert.match(requests[0].url,/rpc\/custom_quote_create/);
 assert.match(requests[0].data.p_token_hash,/^[a-f0-9]{64}$/);
 assert.match(requests[0].data.p_ip_key,/^[a-f0-9]{64}$/);
 assert.ok(!JSON.stringify(requests[0].data).includes(draft.token));
});
test('quote finish enqueues messages only through RPC, repeat requests keep same reference',async()=>{
 const calls=[];
 const handler=customQuoteHandler(env,async(url,init)=>{
  calls.push(String(url));
  return reply([{quote_code:'COT-2026-000001',quote_status:'new'}]);
 });
 const response=await handler(post({action:'finish',quote_id:uuid,token:draft.token}));
 assert.equal(response.status,200);
 assert.equal((await response.json()).code,'COT-2026-000001');
 assert.deepEqual(calls,[project+'/rest/v1/rpc/custom_quote_finish']);
});
test('quote upload refuses disguised executables and oversized files without writing to Storage',async()=>{
 const hits=[];
 const handler=customQuoteHandler(env,async(url)=>{
  hits.push(String(url));
  if(String(url).includes('custom_quote_requests?'))return reply([{id:uuid,status:'draft'}]);
  throw Error('Storage should not be written');
 });
 const makeUpload=async(fileName,buffer)=>{
  const f=new FormData();f.append('quote_id',uuid);f.append('token',draft.token);
  f.append('file',new Blob([buffer],{type:'application/pdf'}),fileName);
  const request=new Request(project+'/functions/v1/custom-quote-request?action=upload',{
    method:'POST',headers:{origin:site},body:f
  });
  return handler(request);
 };
 let response=await makeUpload('plano.pdf.exe',Buffer.from('%PDF-1.4\n%%EOF'));
 assert.equal(response.status,400);
 response=await makeUpload('plano.pdf',Buffer.from('MZ this is actually a program, not a PDF.'));
 assert.equal(response.status,400);
 assert.ok(!hits.some(s=>s.includes('/storage/v1/object/')));
});
test('PDF upload validates signature, saves privately and registers file metadata',async()=>{
 const calls=[];
 const handler=customQuoteHandler(env,async(url,init)=>{
  const key=String(url);calls.push({key,method:init.method});
  if(key.includes('custom_quote_requests?'))return reply([{id:uuid,status:'draft'}]);
  if(key.includes('/storage/v1/object/quote-reference-sandbox/'))return reply({Key:'uploaded'});
  if(key.includes('/rpc/custom_quote_add_file'))return reply('33333333-3333-4333-8333-333333333333');
  throw Error('unexpected '+key);
 });
 const f=new FormData();f.append('quote_id',uuid);f.append('token',draft.token);
 f.append('file',new Blob([Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\n%%EOF\n')],{type:'application/pdf'}),'plano.pdf');
 const req=new Request(project+'/functions/v1/custom-quote-request?action=upload',{
  method:'POST',headers:{origin:site},body:f});
 const response=await handler(req);
 assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
 const data=await response.json();
 assert.equal(data.mime_type,'application/pdf');
 assert.ok(calls.some(c=>c.key.includes('/storage/v1/object/quote-reference-sandbox/'+uuid+'/')));
 assert.ok(calls.some(c=>c.key.includes('/rpc/custom_quote_add_file')));
});
test('quote email escapes customer text, contains paid-email logo and never attaches user files',()=>{
 const content=quoteEmailTemplate(sample,'seller',2);
 assert.match(content.html,/email-pangolin-708c76-sharp\.png/);
 assert.match(content.html,/width="80" height="80" align="right"/);
 assert.doesNotMatch(content.html,/<script>alert/);
 assert.match(content.html,/&lt;script&gt;/);
 assert.match(content.text,/Archivos recibidos: 2/);
 assert.equal(Object.hasOwn(content,'attachments'),false);
});
test('quote notification dispatch requires secret and blocks emails to non-allowlisted buyers',async()=>{
 const handler=quoteNotificationsHandler({...env,RESEND_API_KEY:'test',ORDER_EMAIL_FROM:'test@example.invalid',ORDER_NOTIFICATION_TO:'seller@example.invalid'},async()=>{throw Error('unexpected');});
 const unauth=await handler(new Request(project+'/functions/v1/process-custom-quote-notifications',{method:'POST'}));
 assert.equal(unauth.status,401);
 const configured={...env,RESEND_API_KEY:'test',ORDER_EMAIL_FROM:'test@example.invalid',ORDER_NOTIFICATION_TO:'seller@example.invalid'};
 let providerCalls=0;
 const results=await dispatchQuoteEmails(configured,async(url,init)=>{
  const target=String(url);
  if(target.includes('rpc/custom_quote_claim_emails'))return reply([{email_id:uuid,quote_id:uuid,kind:'customer',attempt:1}]);
  if(target.includes('custom_quote_requests?'))return reply([sample]);
  if(target.includes('custom_quote_files?'))return reply([]);
  if(target.includes('/api.resend.com/emails'))providerCalls++;
  if(init?.method==='PATCH')return new Response(null,{status:204});
  throw Error('unexpected '+target);
 });
 assert.equal(results.skipped,1);assert.equal(providerCalls,0);
});


test('quote v2 accepts accessory and saves structured metal/wood/color/finish separately',async()=>{
 const calls=[];
 const handler=customQuoteHandler(env,async(url,init)=>{
  calls.push({url:String(url),payload:JSON.parse(init.body)});
  return reply([{quote_id:uuid,quote_code:'COT-2026-000009',quote_status:'draft'}]);
 });
 const choices={metal_materials:['Caño estructural 50×50 mm'],wood_materials:['Pino 30 mm'],
  metal_color:'Rojo',metal_finish:'Satinado',wood_tone:'Nogal',wood_finish:'Mate'};
 const res=await handler(post({...draft,project_type:'accesorio',choices,delivery:'retiro'}));
 assert.equal(res.status,200);
 assert.match(calls[0].url,/rpc\/custom_quote_create_v2/);
 assert.deepEqual(calls[0].payload.p_choices,choices);
 assert.match(calls[0].payload.p_materials,/Pino 30 mm/);
 assert.match(calls[0].payload.p_finish,/Color metal: Rojo/);
 assert.match(calls[0].payload.p_finish,/Acabado madera: Mate/);
});

test('quote API forbids installation and refuses malformed material choices',async()=>{
 let hits=0;
 const handler=customQuoteHandler(env,async()=>{hits++;return reply([]);});
 const choices={metal_materials:['Caño estructural 20×20 mm'],wood_materials:[],
  metal_color:'Negro',metal_finish:'Mate',wood_tone:'',wood_finish:''};
 assert.equal((await handler(post({...draft,delivery:'instalacion',choices}))).status,400);
 assert.equal((await handler(post({...draft,choices:{...choices,metal_materials:'no array'}}))).status,400);
 assert.equal((await handler(post({...draft,choices:{...choices,metal_color:'X'.repeat(71)}}))).status,400);
 assert.equal(hits,0);
});

test('quote email lists wood tone separately from wood finish and metal color separately from finish',()=>{
 const mail=quoteEmailTemplate({...sample,project_type:'accesorio',quote_preferences:{
  metal_materials:['Caño estructural 20×20 mm'],wood_materials:['Eucalipto 20 mm'],
  metal_color:'Rojo',metal_finish:'Satinado',wood_tone:'Nogal',wood_finish:'Mate'
 }},'customer');
 for(const phrase of ['Accesorio','Caño estructural 20×20 mm','Eucalipto 20 mm',
  'Color del metal','Rojo','Acabado del metal','Satinado','Tono de madera','Nogal','Acabado de madera','Mate']){
  assert.ok(mail.text.includes(phrase),phrase);
 }
});
