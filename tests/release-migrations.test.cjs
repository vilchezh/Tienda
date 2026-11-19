const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'supabase/production/migration-review.json'),'utf8'));
const list=()=>fs.readdirSync(path.join(root,'supabase/migrations')).filter(name=>name.endsWith('.sql')).sort();

test('production migration manifest accounts for every tracked SQL migration',()=>{
 const tracked=manifest.migrations.map(x=>x.file).sort();
 assert.equal(new Set(tracked).size,tracked.length,'duplicated migration');
 assert.deepEqual(tracked,list(),'an unreviewed SQL migration was added or removed');
 for(const row of manifest.migrations){
  assert.ok(row.reason.length>35,row.file+' missing rationale');
  assert.match(row.classification,/^(reconcile|replace_for_production|split_and_reconcile|review_limits|reconcile_and_review_limits|defer_activation|reconcile_storage)$/);
 }
 assert.ok(!JSON.stringify(manifest).includes('"approved_to_apply"'));
});
test('production inventory is read-only SQL and reveals only metadata',()=>{
 const sql=fs.readFileSync(path.join(root,manifest.sql_inventory),'utf8');
 const withoutComments=sql.replace(/\/\*[\s\S]*?\*\//g,'').replace(/--[^\n]*/g,'');
 assert.match(withoutComments,/\bWITH expected_relations\b/i);
 assert.match(withoutComments,/\bSELECT pg_catalog\.jsonb_pretty\b/i);
 assert.doesNotMatch(withoutComments,/\b(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COPY|DO|CALL|EXECUTE)\b/i);
 assert.doesNotMatch(withoutComments,/\bFROM\s+auth\.users\b|\bFROM\s+vault\.decrypted_secrets\b/i);
 for(const table of ['public.productos','public.checkout_settings','public.checkout_orders',
  'public.custom_quote_requests','public.checkout_cancellation_requests']){
  assert.ok(sql.includes("'"+table.split('.')[1]+"'"),table);
 }
});
test('production rollout requires manual review of sandbox-only database jobs and quotas',()=>{
 const byName=Object.fromEntries(manifest.migrations.map(x=>[x.file,x.classification]));
 for(const file of [
  '20261118034000_checkout_cancellation_cron.sql',
  '20261118061500_custom_quote_storage_read.sql',
  '20261118064000_custom_quote_email_cron.sql'
 ])assert.equal(byName[file],'replace_for_production');
 assert.equal(byName['20261118060000_custom_quote_requests.sql'],'split_and_reconcile');
 assert.equal(byName['20261118070000_custom_quote_global_quota.sql'],'review_limits');
 assert.equal(byName['20261118072000_custom_quote_storage_budget.sql'],'review_limits');
 assert.equal(byName['20261118120000_admin_mfa_stepup.sql'],'defer_activation');
});
