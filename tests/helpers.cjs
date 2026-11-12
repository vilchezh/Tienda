const fs = require('node:fs');
const sample = JSON.parse(fs.readFileSync('productos.json'))[0];
const product = { ...sample, activo: true, precio_base: sample.precioBase, imagen: 'assets/texturas/eucalipto.jpg', fotos: ['assets/texturas/eucalipto.jpg', 'assets/texturas/pino-con-nudos.jpg'] };
const host = 'https://ivyagavbhsyzvikzhmhe.supabase.co';
const user = { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'test@example.invalid' };
const session = { access_token: `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:user.id,exp:4102444800})).toString('base64url')}.test`, refresh_token: 'test-only', token_type:'bearer', expires_in:3600, expires_at:4102444800, user };
async function setup(page, options = {}) {
  const state = { rows: structuredClone(options.rows ?? [product]), writes: [], uploads: [], reads: [], backups: 0, errors: [] };
  page.on('pageerror', e => state.errors.push(e.message));
  // All network calls are intercepted: these tests never access production data.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.href.includes('@supabase/supabase-js')) return options.noSDK ? route.abort() : route.fulfill({path:'.test-assets/supabase.js',contentType:'text/javascript'});
    if (url.href.includes('model-viewer')) return route.fulfill({path:'.test-assets/model-viewer.min.js',contentType:'text/javascript'});
    if (url.origin === host) {
      const req = route.request();
      if (url.pathname.includes('/auth/v1/token')) return route.fulfill({json: options.loginFailure ? {msg:'Invalid login credentials'} : session, status: options.loginFailure ? 400 : 200});
      if (url.pathname.includes('/auth/v1/logout')) return route.fulfill({status:204});
      if (url.pathname.startsWith('/storage/v1/object/tienda/')) {
        state.uploads.push({path:url.pathname,method:req.method(),bytes:req.postDataBuffer()?.length || 0});
        return route.fulfill({status:200,json:{Key:url.pathname.split('/object/')[1]}});
      }
      if (url.pathname.includes('/rest/v1/productos')) {
        if (req.method() === 'GET') {
          state.reads.push(url.href);
          if (options.offline) return route.fulfill({status:503,json:{message:'offline'}});
          let rows = state.rows;
          if (url.searchParams.get('activo') === 'eq.true') rows = rows.filter(p=>p.activo===true);
          if (url.searchParams.has('id')) rows = rows.filter(p=>p.id===url.searchParams.get('id').slice(3));
          return route.fulfill({json: rows});
        }
        const data = req.postDataJSON();
        state.writes.push({method:req.method(),data,headers:req.headers()});
        if (options.writeFailure) return route.fulfill({status:409,json:{message:'conflict'}});
        if (req.method()==='POST') {
          const incoming = Array.isArray(data) ? data : [data];
          if ((req.headers().prefer || '').includes('merge-duplicates')) {
            for(const p of incoming) { const i=state.rows.findIndex(x=>x.id===p.id); if(i<0) state.rows.push(p); else state.rows[i]=p; }
          } else state.rows.push(...incoming);
        }
        return route.fulfill({status:201,json:[]});
      }
    }
    return route.abort();
  });
  await page.route('**/productos.json*', async route=> { state.backups++; return route.fulfill({json:options.backup ?? [product]}); });
  if(options.authenticated) await page.addInitScript(({session})=>localStorage.setItem('sb-ivyagavbhsyzvikzhmhe-auth-token',JSON.stringify(session)), {session});
  return state;
}
module.exports = { setup, product };
