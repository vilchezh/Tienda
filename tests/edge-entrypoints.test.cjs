const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readdirSync,readFileSync}=require('node:fs');
const {join}=require('node:path');
const vm=require('node:vm');
const path='supabase/functions';
const names=readdirSync(path,{withFileTypes:true}).filter(d=>d.isDirectory()&&!d.name.startsWith('_')).map(d=>d.name);
test('all Edge Function entrypoints parse and read explicitly quoted environment variables',()=>{
 assert.ok(names.length>=9);
 for(const name of names){
  const text=readFileSync(join(path,name,'index.ts'),'utf8');
  const js=text.replace(/^import\s+.*;\s*$/gm,'');
  assert.doesNotThrow(()=>new vm.Script(js,{filename:name+'/index.ts'}),name);
  assert.match(js,/Deno\.env\.get\(/,name);
 }
});
test('private runtime secrets are never embedded in the browser config source',()=>{
 const source=readFileSync('assets/js/config.js','utf8');
 assert.doesNotMatch(source,/service_role|sb_secret_|MP_ACCESS_TOKEN|RESEND_API_KEY|TURNSTILE_SECRET/);
});
test('production credentials cannot be accidentally used by the sandbox deploy workflow',()=>{
 const source=readFileSync('.github/workflows/deploy-checkout-sandbox.yml','utf8');
 assert.match(source,/tienda-checkout-sandbox/);
 assert.match(source,/STORE_PREVIEW_SUPABASE_ANON_KEY/);
 assert.doesNotMatch(source,/STORE_PROD_SUPABASE_ANON_KEY|MP_ACCESS_TOKEN_LIVE|wrangler deploy --config wrangler\.jsonc/);
});
