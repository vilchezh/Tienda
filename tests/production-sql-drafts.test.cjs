const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const drafts=path.join(root,'supabase/production/drafts');
const files={
 a:'01_checkout_admin_NO_EJECUTAR.sql',
 b:'02_presupuestos_arrepentimiento_REQUIERE_LIMITES.sql',
 c:'03_storage_privado_NO_EJECUTAR.sql',
 d:'04_verificacion_READ_ONLY.sql'
};
const read=name=>fs.readFileSync(path.join(drafts,name),'utf8');
const src=path.join(root,'supabase/migrations');
const lock=JSON.parse(read('source-lock.json'));
const strip=s=>s.replace(/--[^\n]*/g,'');
const sha=s=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');

test('all 16 source migrations are classified and original contents match locked Git SHA',()=>{
 const actual=fs.readdirSync(src).filter(x=>x.endsWith('.sql')).sort();
 const listed=[...lock.sources.map(x=>x.name),...lock.excluded].sort();
 assert.deepEqual(listed,actual);
 assert.equal(lock.production_project_ref,'ivyagavbhsyzvikzhmhe');
 for(const entry of lock.sources){
  assert.equal(sha(fs.readFileSync(path.join(src,entry.name),'utf8')),entry.git_blob_sha,
   'Source changed after production draft: '+entry.name);
 }
 for(const name of lock.stage1)
  assert.ok(read(files.a).includes('-- SOURCE: supabase/migrations/'+name),name);
 for(const name of lock.stage2)
  assert.ok(read(files.b).includes('-- SOURCE: supabase/migrations/'+name),name);
 for(const name of lock.excluded)
  assert.ok(!(read(files.a)+read(files.b)).includes('-- SOURCE: supabase/migrations/'+name),
   'Unsafe migration included: '+name);
});

test('migration drafts have a single outer transaction and require review',()=>{
 for(const name of [files.a,files.b,files.c]){
  const s=read(name);
  assert.match(s,/NO AUTORIZADO PARA EJECUTAR/i);
  assert.equal((s.match(/^BEGIN;$/gm)||[]).length,1,name);
  assert.equal((s.match(/^COMMIT;$/gm)||[]).length,1,name);
 }
});

test('checkout migration preserves original products and keeps payments disabled',()=>{
 const s=read(files.a);
 assert.match(s,/to_regclass\('public\.productos'\)/);
 assert.match(s,/to_regprocedure\('tienda_security\.is_admin\(\)'\)/);
 assert.match(s,/precio_base<>trunc\(precio_base\)/);
 assert.match(s,/add column if not exists checkout_habilitado boolean not null default false/);
 assert.match(s,/payments_enabled boolean not null default false/);
 assert.match(s,/values \('default', 0, false\)/);
});

test('quotas are unresolved placeholders and never copied from sandbox silently',()=>{
 const s=strip(read(files.b));
 assert.equal((s.match(/__QUOTE_MAX_DAILY__/g)||[]).length,2);
 assert.equal((s.match(/__QUOTE_STORAGE_MAX_BYTES__/g)||[]).length,1);
 assert.doesNotMatch(s,/v_count>10 then raise exception 'sandbox_daily_quota_reached'/);
 assert.doesNotMatch(s,/v_global_total\+p_size>209715200/);
 assert.match(s,/custom_quote_production_global_/);
 assert.match(s,/custom_quote_production_storage_quota/);
 assert.doesNotMatch(s,/insert into storage\.buckets/i);
});

test('production draft SQL cannot refer to sandbox, delete products or change stock_taller',()=>{
 const s=strip(read(files.a)+'\n'+read(files.b)+'\n'+read(files.c));
 assert.doesNotMatch(s,/pacyytbscnlklyrhsshp|quote-reference-sandbox|checkout-sandbox|MP_ACCESS_TOKEN_TEST|custom_quote_sandbox/i);
 assert.doesNotMatch(s,/\b(drop\s+table|truncate\s+table|delete\s+from\s+public\.productos|alter\s+table\s+public\.stock_taller|drop\s+schema)\b/i);
 assert.doesNotMatch(s,/\bupdate\s+public\.productos\s+set\s+activo\b/i);
 assert.doesNotMatch(s,/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?public\.(productos|stock_taller)\b/i);
});

test('private storage uses a new bucket restricted to admin and leaves catalog bucket alone',()=>{
 const s=strip(read(files.c));
 assert.match(s,/VALUES\('quote-reference','quote-reference',false,5242880/);
 assert.match(s,/ON storage\.objects FOR SELECT TO authenticated/);
 assert.match(s,/bucket_id='quote-reference' AND \(SELECT tienda_security\.is_admin\(\)\)/);
 assert.doesNotMatch(s,/\b(update|delete)\s+(?:from\s+)?storage\.buckets\b/i);
});

test('read-only post-migration verification checks payments and stock without SQL writes',()=>{
 const s=strip(read(files.d));
 assert.match(s,/SELECT pg_catalog\.jsonb_pretty/);
 assert.match(s,/stock_taller_exists/);
 assert.match(s,/payments_enabled/);
 assert.match(s,/checkout_enabled_products/);
 const outsideStrings=s.replace(/'(?:''|[^'])*'/g,"''");
 assert.doesNotMatch(outsideStrings,/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|DO|CALL|GRANT|REVOKE|EXECUTE)\b/i);
});
