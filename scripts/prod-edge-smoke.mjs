// Pruebas HTTP negativas sin secretos ni datos reales.
// Solo consulta funciones productivas. No crear pedidos, cotizaciones, correos ni archivos.
const BASE='https://ivyagavbhsyzvikzhmhe.supabase.co/functions/v1';
const ORIGIN='https://tienda.acero-y-escamas.workers.dev';
const NOT_FOUND_ID='550e8400-e29b-41d4-a716-446655440000';
const TOKEN='A'.repeat(43);
const results=[];
async function check(label,slug,method,{body,headers={},expectedStatus,expectedError,cors=false}={}){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch(BASE+'/'+slug+(label.includes('nonexistent order')?'?order_id='+NOT_FOUND_ID:''),{
   method,
   headers:{'Origin':ORIGIN,...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},
   ...(body!==undefined?{body:JSON.stringify(body)}:{}),
   signal:controller.signal,redirect:'error'
  });
  const text=response.status===204?'':await response.text();
  let parsed={};try{parsed=JSON.parse(text)}catch{}
  const passed=response.status===expectedStatus &&
    (expectedError===undefined||parsed.error===expectedError) &&
    (!cors||response.headers.get('access-control-allow-origin')===ORIGIN);
  results.push({label,status:response.status,error:parsed.error||'',passed});
  console.log((passed?'PASS ':'FAIL ')+label+': '+response.status+' '+(parsed.error||''));
 }catch(error){results.push({label,passed:false});console.log('FAIL '+label+': network error '+String(error?.name||'unknown'));}
 finally{clearTimeout(timer);}
}
await check('status allowed preflight','get-mp-order-status','OPTIONS',{expectedStatus:204,cors:true});
await check('status missing id','get-mp-order-status','GET',{expectedStatus:400,cors:true});
await check('status nonexistent order','get-mp-order-status','GET',{expectedStatus:404,expectedError:'order_not_found',cors:true});
await check('status disallowed origin','get-mp-order-status','GET',{headers:{Origin:'https://example.invalid'},expectedStatus:403,expectedError:'origin_not_allowed'});
await check('checkout allowed preflight','create-mp-order','OPTIONS',{expectedStatus:204,cors:true});
await check('checkout blocks GET','create-mp-order','GET',{expectedStatus:405,expectedError:'method_not_allowed'});
await check('cancellation allowed preflight','cancellation-request','OPTIONS',{expectedStatus:204,cors:true});
await check('quote allowed preflight','custom-quote-request','OPTIONS',{expectedStatus:204,cors:true});
await check('cancellation missing Turnstile','cancellation-request','POST',{
 body:{action:'submit',submission_id:NOT_FOUND_ID,status_token:TOKEN,email:'qa@example.invalid',
 order_reference:'',message:''},expectedStatus:403,expectedError:'bot_check_failed',cors:true});
await check('quote missing Turnstile','custom-quote-request','POST',{
 body:{action:'start',submission_id:NOT_FOUND_ID,token:TOKEN,full_name:'Prueba controlada',
 email:'qa@example.invalid',phone:'1111111111',city:'Ciudad de prueba',
 description:'Prueba controlada del bloqueo de CAPTCHA sin registrar ninguna solicitud.',
 project_type:'mueble',delivery:'retiro',quantity:1},expectedStatus:403,expectedError:'bot_check_failed',cors:true});
await check('cancellation nonexistent secure token','cancellation-request','POST',{
 body:{action:'status',code:'ARR-2026-999999',status_token:TOKEN},
 expectedStatus:404,expectedError:'not_found',cors:true});
await check('quote nonexistent secure token','custom-quote-request','POST',{
 body:{action:'status',quote_id:NOT_FOUND_ID,token:TOKEN},
 expectedStatus:404,expectedError:'not_found',cors:true});
await check('webhook invalid signature','mp-order-webhook','POST',{body:{type:'order',data:{id:'11111'}},expectedStatus:401,expectedError:'invalid_signature'});
for(const slug of ['process-order-notifications','process-cancellation-notifications','process-custom-quote-notifications']){
 await check(slug+' unauthorized',slug,'POST',{body:{},expectedStatus:401,expectedError:'not_authorized'});
}
await check('maintenance unauthorized','process-order-maintenance','POST',{body:{},expectedStatus:401,expectedError:'not_authorized'});
const failed=results.filter(result=>!result.passed);
console.log('TOTAL '+results.length+' | PASSED '+(results.length-failed.length)+' | FAILED '+failed.length);
if(failed.length)process.exitCode=1;
