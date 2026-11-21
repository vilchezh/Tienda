const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const turnstileSource=fs.readFileSync('assets/js/turnstile-forms.js','utf8');

function start(config){
 const target={hidden:true,insertAdjacentElement(_,node){this.notice=node;}};
 const doc={
  getElementById:id=>id==='quoteTurnstile'?target:null,
  createElement:tag=>({tag,style:{},setAttribute(name,value){this[name]=value;}}),
  head:{appendChild(element){this.script=element;}}
 };
 const window={STORE_CONFIG:config};
 vm.runInNewContext(turnstileSource,{window,document:doc},{timeout:1000});
 return {target,doc,window};
}
const production={supabaseUrl:'https://ivyagavbhsyzvikzhmhe.supabase.co',
 siteUrl:'https://aceroyescamas.com.ar'};

test('un sitekey ausente en producción bloquea el formulario en cliente y muestra diagnóstico',()=>{
 const {target,doc,window}=start(production);
 assert.equal(window.StoreTurnstile.enabled(),true);
 assert.equal(window.StoreTurnstile.response(),'');
 assert.match(window.StoreTurnstile.errorMessage(),/Cloudflare/);
 assert.equal(target.hidden,false);
 assert.match(target.notice.textContent,/Ctrl\+F5/);
 assert.equal(doc.head.script,undefined);
});

test('sandbox sin sitekey conserva su comportamiento actual',()=>{
 const {target,window}=start({
  supabaseUrl:'https://pacyytbscnlklyrhsshp.supabase.co',
  siteUrl:'https://tienda-checkout-sandbox.acero-y-escamas.workers.dev'
 });
 assert.equal(window.StoreTurnstile.enabled(),false);
 assert.equal(target.hidden,true);
});

test('Cloudflare carga, completa el desafío y muestra el estado al visitante',()=>{
 const cfg={...production,turnstileSiteKey:'0x4AAAAAAGJONVP8yIMQn-Tg'};
 const {target,doc,window}=start(cfg);
 assert.match(doc.head.script.src,/challenges\.cloudflare\.com/);
 let callbacks;
 window.turnstile={
  render:function(element,opts){assert.equal(element,target);callbacks=opts;return 'widget-1';},
  getResponse:function(id){assert.equal(id,'widget-1');return 'token-mock-de-prueba';},
  reset(){return null;}
 };
 doc.head.script.onload();
 assert.equal(callbacks.sitekey,cfg.turnstileSiteKey);
 assert.equal(callbacks.appearance,'always');
 assert.equal(window.StoreTurnstile.response(),'token-mock-de-prueba');
 callbacks.callback('token-mock-de-prueba');
 assert.match(target.notice.textContent,/completada/);
 callbacks['error-callback']('110200');
 assert.match(window.StoreTurnstile.errorMessage(),/dominio/);
 assert.match(target.notice.textContent,/dominio/);
});

test('error de carga del script es visible y no produce un envío con token vacío',()=>{
 const {doc,target,window}=start({...production,turnstileSiteKey:'0x4AAAAAAGJONVP8yIMQn-Tg'});
 doc.head.script.onerror();
 assert.match(target.notice.textContent,/No se pudo cargar Cloudflare/);
 assert.equal(window.StoreTurnstile.response(),'');
 assert.match(window.StoreTurnstile.errorMessage(),/Cloudflare/);
});

test('no cachear sitekey y evitar reusar scripts antiguos en ambos formularios',()=>{
 const headers=fs.readFileSync('security/headers-sandbox.txt','utf8');
 assert.match(headers,/\/assets\/js\/config\.js\s*\n\s*Cache-Control: no-store/);
 assert.match(headers,/\/assets\/js\/turnstile-forms\.js\s*\n\s*Cache-Control: no-cache/);
 for(const page of ['presupuesto.html','arrepentimiento.html']){
  const html=fs.readFileSync(page,'utf8');
  assert.match(html,/assets\/js\/config\.js\?v=20261121-turnstile/);
  assert.match(html,/assets\/js\/turnstile-forms\.js\?v=20261121-turnstile/);
 }
 for(const script of ['assets/js/quote.js','assets/js/cancellation.js'])
  assert.match(fs.readFileSync(script,'utf8'),/StoreTurnstile\?\.errorMessage/);
});
