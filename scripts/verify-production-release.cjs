'use strict';
// Valida exclusivamente el paquete generado para el Worker "tienda".
// Sin llamadas HTTP, credenciales de administrador ni cambios productivos.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../dist');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const raw=read('assets/js/config.js');
const match=raw.match(/window\.STORE_CONFIG\s*=\s*Object\.freeze\((\{[^\n]+\})\)/);
assert.ok(match,'No se generó configuración JSON del release');
const cfg=JSON.parse(match[1]);
assert.equal(cfg.siteUrl,'https://tienda.acero-y-escamas.workers.dev');
assert.equal(cfg.supabaseUrl,'https://ivyagavbhsyzvikzhmhe.supabase.co');
assert.equal(cfg.whatsappNumber,'5491164598478','El WhatsApp productivo no debe cambiarse');
assert.equal(cfg.turnstileSiteKey,'0x4AAAAAAGJONVP8yIMQn-Tg');
assert.match(cfg.supabaseAnonKey,/^(eyJ[\w-]+\.[\w-]+\.[\w-]+|sb_publishable_[\w-]{15,})$/);
assert.ok(!Object.keys(cfg).some(k=>/secret|service_role|access_token|password/i.test(k)),'No agregar secretos a STORE_CONFIG');
assert.ok(!raw.includes('pacyytbscnlklyrhsshp'),'No debe aparecer el proyecto sandbox');
assert.ok(!raw.includes('tienda-checkout-sandbox'),'No debe aparecer Worker sandbox');
assert.ok(!raw.includes('TURNSTILE_SECRET'),'No debe aparecer el nombre del secreto privado');
const forms=['presupuesto.html','arrepentimiento.html'];
for (const file of forms){
 const body=read(file);
 assert.match(body,/assets\/js\/turnstile-forms\.js/);
 assert.ok(!/Entorno de pruebas:|En sandbox los correos|En este entorno de pruebas los emails/.test(body));
}
const handler=read('assets/js/turnstile-forms.js');
assert.match(handler,/window\.STORE_CONFIG\?\.turnstileSiteKey/);
const headers=read('_headers');
assert.match(headers,/https:\/\/ivyagavbhsyzvikzhmhe\.supabase\.co/);
assert.ok(!headers.includes('pacyytbscnlklyrhsshp'),'Cabeceras sin sandbox');
console.log('PREPARADO: URL, Supabase original, sitekey Turnstile, CSP y formularios coherentes; ningún secreto incluido.');
