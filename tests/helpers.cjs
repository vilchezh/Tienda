const fs = require('node:fs');
const sample = JSON.parse(fs.readFileSync('productos.json'))[0];
const product = { ...sample, activo: true, precio_base: sample.precioBase, imagen: 'assets/texturas/eucalipto.jpg', fotos: ['assets/texturas/eucalipto.jpg', 'assets/texturas/pino-con-nudos.jpg'] };
const host = 'https://ivyagavbhsyzvikzhmhe.supabase.co';
const user = { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'test@example.invalid' };
const session = { access_token: `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:user.id,exp:4102444800})).toString('base64url')}.test`, refresh_token: 'test-only', token_type:'bearer', expires_in:3600, expires_at:4102444800, user };
async function setup(page, options = {}) {
  const state = {
    rows: structuredClone(options.rows ?? [product]), writes: [], settingsWrites: [], orderWrites: [], uploads: [], reads: [],
    checkoutRequests: [], statusRequests: [], orderQueries: [], homeWrites: [], backups: 0, errors: [],
    checkoutSettings: structuredClone(options.checkoutSettings ?? { id:'default', commission_percent:0, payments_enabled:false }),
    orders: structuredClone(options.orders ?? [])
  };
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
      if (url.pathname.includes('/rest/v1/rpc/storefront_admin_authorized')) {
        return route.fulfill({json:options.adminAuthorized!==false});
      }
      if (url.pathname.includes('/rest/v1/storefront_content')) {
        if(req.method()==='GET'){
          if(options.homeFailure)return route.fulfill({status:403,json:{message:'not authorized'}});
          const data=options.homeContent||null;
          const one=(req.headers().accept||'').includes('application/vnd.pgrst.object');
          if(!data&&one)return route.fulfill({status:406,json:{message:'missing row'}});
          return route.fulfill({json:one?data:(data?[data]:[])});
        }
        const update=req.postDataJSON();
        state.homeWrites.push({method:req.method(),data:update});
        if(options.homeFailure)return route.fulfill({status:403,json:{message:'not authorized'}});
        Object.assign(options.homeContent||{},update);
        return route.fulfill({status:204});
      }
      if (url.pathname.includes('/rest/v1/checkout_settings')) {
        if (req.method() === 'GET') {
          const single = (req.headers().accept || '').includes('application/vnd.pgrst.object');
          return route.fulfill({json: single ? state.checkoutSettings : [state.checkoutSettings]});
        }
        state.settingsWrites.push({method:req.method(),data:req.postDataJSON(),headers:req.headers()});
        if (options.settingsWriteFailure) return route.fulfill({status:409,json:{message:'settings conflict'}});
        Object.assign(state.checkoutSettings, req.postDataJSON());
        return route.fulfill({status:204});
      }
      if (url.pathname.includes('/rest/v1/rpc/checkout_admin_list_orders')) {
        if (options.ordersFailure) return route.fulfill({status:403,json:{message:'not authorized'}});
        const params = req.postDataJSON();
        state.orderQueries.push(params);
        let rows = [...state.orders];
        const payment = order => order.payment_status || order.status || 'created';
        if (params.p_search) {
          const needle = String(params.p_search).toLocaleLowerCase('es');
          rows = rows.filter(order => {
            const customer = Array.isArray(order.checkout_order_customers) ? order.checkout_order_customers[0] : order.checkout_order_customers;
            const productSnapshot = order.product_snapshot || {};
            return [order.id,order.mp_order_id,order.product_id,productSnapshot.nombre,productSnapshot.sku,customer?.full_name,customer?.email]
              .filter(Boolean).join(' ').toLocaleLowerCase('es').includes(needle);
          });
        }
        if (params.p_payment_group === 'accredited') rows = rows.filter(order=>payment(order)==='processed');
        if (params.p_payment_group === 'unpaid') rows = rows.filter(order=>['created','failed','canceled'].includes(payment(order)));
        if (params.p_payment_group === 'processing') rows = rows.filter(order=>['processing','action_required','manual_review'].includes(payment(order)));
        if (params.p_payment_group === 'refunded') rows = rows.filter(order=>['refunded','partially_refunded','charged_back'].includes(payment(order)));
        if (params.p_payment_status) rows = rows.filter(order=>payment(order)===params.p_payment_status);
        if (params.p_manufacturing_status) rows = rows.filter(order=>order.manufacturing_status===params.p_manufacturing_status);
        if (params.p_date_from) rows = rows.filter(order=>new Date(order.created_at)>=new Date(params.p_date_from));
        if (params.p_date_to) rows = rows.filter(order=>new Date(order.created_at)<new Date(params.p_date_to));
        rows.sort((a,b)=>(params.p_sort==='asc'?1:-1)*(new Date(a.created_at)-new Date(b.created_at)));
        const total=rows.length;
        const offset=Number(params.p_offset)||0;
        const limit=Number(params.p_limit)||50;
        return route.fulfill({json:rows.slice(offset,offset+limit).map(order=>({order_data:order,total_count:total}))});
      }
      if (url.pathname.includes('/rest/v1/checkout_orders')) {
        if (req.method() === 'GET') {
          if (options.ordersFailure) return route.fulfill({status:403,json:{message:'not authorized'}});
          return route.fulfill({json:state.orders});
        }
        const data=req.postDataJSON();
        state.orderWrites.push({method:req.method(),data,headers:req.headers(),url:url.href});
        if(options.orderWriteFailure) return route.fulfill({status:403,json:{message:'not authorized'}});
        const id=(url.searchParams.get('id')||'').replace(/^eq\./,'');
        const order=state.orders.find(item=>item.id===id);
        if(order) Object.assign(order,data);
        return route.fulfill({status:204});
      }
      if (url.pathname.includes('/rest/v1/checkout_order_events')) {
        return route.fulfill({json:options.orderEvents ?? []});
      }
      if (url.pathname.endsWith('/functions/v1/create-mp-order')) {
        const data = req.postDataJSON();
        state.checkoutRequests.push({data,headers:req.headers()});
        const failureCount = options.checkoutFailuresBeforeSuccess ?? (options.checkoutFailure ? Number.POSITIVE_INFINITY : 0);
        if (state.checkoutRequests.length <= failureCount) return route.fulfill({status:503,json:{message:'Checkout de prueba no disponible.'}});
        const orderId = options.checkoutOrderIds?.[state.checkoutRequests.length - 1] || '11111111-1111-4111-8111-111111111111';
        return route.fulfill({status:201,json:{
          order_id:orderId,
          amount:199000,
          currency:'ARS',
          checkout_url:'https://www.mercadopago.com.ar/checkout/v1/redirect?id=synthetic-test'
        }});
      }
      if (url.pathname.endsWith('/functions/v1/get-mp-order-status')) {
        state.statusRequests.push(url.href);
        return route.fulfill({status:200,json:options.orderStatus ?? {
          order_id:'11111111-1111-4111-8111-111111111111', order_status:'processed', payment_status:'approved',
          amount:199000, currency:'ARS', product:{nombre:'Mesa de prueba'}
        }});
      }
    }
    if (/(^|\.)mercadopago\.com\.ar$/.test(url.hostname)) {
      return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Checkout Pro test</title><h1>Mercado Pago · prueba</h1>'});
    }
    return route.abort();
  });
  await page.route('**/productos.json*', async route=> { state.backups++; return route.fulfill({json:options.backup ?? [product]}); });
  if(options.authenticated) await page.addInitScript(({session})=>localStorage.setItem('sb-ivyagavbhsyzvikzhmhe-auth-token',JSON.stringify(session)), {session});
  return state;
}
module.exports = { setup, product };
