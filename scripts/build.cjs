const { cpSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');

const projectRoot = resolve(__dirname, '..');
const preview = process.argv.includes('--preview');
const release = process.argv.includes('--release');
if(preview&&release)throw new Error('No mezclar preview y release.');
const outputDirectory = resolve(projectRoot, preview ? 'dist-preview' : 'dist');

if (![resolve(projectRoot, 'dist'), resolve(projectRoot, 'dist-preview')].includes(outputDirectory)) {
  throw new Error('El directorio de salida no es seguro.');
}

let previewConfig;
if (preview) {
  const rawUrl = process.env.STORE_PREVIEW_SUPABASE_URL || '';
  const rawKey = process.env.STORE_PREVIEW_SUPABASE_ANON_KEY || '';
  const rawSite = process.env.STORE_PREVIEW_SITE_URL || '';
  const url = new URL(rawUrl);
  const site = new URL(rawSite);
  if (url.origin !== 'https://pacyytbscnlklyrhsshp.supabase.co' ||
      url.pathname !== '/' || url.search || url.hash ||
      site.origin !== 'https://tienda-checkout-sandbox.acero-y-escamas.workers.dev' ||
      site.pathname !== '/' || site.search || site.hash ||
      !rawKey || rawKey.length < 40) {
    throw new Error('La vista previa exige pacyytbscnlklyrhsshp, su clave anon JWT y un Worker sandbox HTTPS.');
  }
  // Claves anon JWT tradicionales incluyen el ref del proyecto; detectar mezclas.
  if (rawKey.split('.').length !== 3) throw new Error('La vista previa requiere la clave anon JWT verificable del proyecto de pruebas.');
  let claims;
  try { claims = JSON.parse(Buffer.from(rawKey.split('.')[1], 'base64url').toString('utf8')); }
  catch { throw new Error('Clave anon JWT inválida.'); }
  if (claims.ref !== 'pacyytbscnlklyrhsshp' || claims.role !== 'anon') throw new Error('La clave anon no coincide con el proyecto de pruebas.');
  const turnstileSiteKey = String(process.env.STORE_PREVIEW_TURNSTILE_SITE_KEY || '').trim();
  if (turnstileSiteKey && !/^0x[A-Za-z0-9_-]{10,80}$/.test(turnstileSiteKey)) {
    throw new Error('La site key pública de Turnstile no es válida.');
  }
  previewConfig = { siteUrl: site.origin, whatsappNumber: '', supabaseUrl: url.origin, supabaseAnonKey: rawKey, turnstileSiteKey };
}


let releaseConfig;
if(release){
 const rawUrl=process.env.STORE_PROD_SUPABASE_URL||'';
 const rawSite=process.env.STORE_PROD_SITE_URL||'';
 const expectedRef=String(process.env.STORE_PROD_SUPABASE_REF||'');
 const key=String(process.env.STORE_PROD_SUPABASE_ANON_KEY||'');
 const turnstileSiteKey=String(process.env.STORE_PROD_TURNSTILE_SITE_KEY||'');
 const rawPhone=String(process.env.STORE_PROD_WHATSAPP_NUMBER||'');
 let url,site;
 try{url=new URL(rawUrl);site=new URL(rawSite);}
 catch{throw Error('Faltan URL públicas productivas válidas.');}
 const ref=url.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1];
 if(!ref||ref==='pacyytbscnlklyrhsshp'||expectedRef!==ref||
   url.protocol!=='https:'||url.pathname!=='/'||url.username||url.password||url.search||url.hash||
   site.protocol!=='https:'||site.pathname!=='/'||site.username||site.password||site.search||site.hash||
   site.origin==='https://tienda-checkout-sandbox.acero-y-escamas.workers.dev'||
   !/^(?:[0-9]{10,15})?$/.test(rawPhone)||
   !/^0x[A-Za-z0-9_-]{10,80}$/.test(turnstileSiteKey))
  throw Error('Configuración productiva incompleta, inválida o mezclada con sandbox.');
 if(key.startsWith('sb_publishable_')){
  if(key.length<30)throw Error('Clave pública productiva demasiado corta.');
 }else if(key.split('.').length===3){
  let claims;
  try{claims=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString('utf8'));}
  catch{throw Error('Clave anon JWT productiva inválida.');}
  if(claims.ref!==ref||claims.role!=='anon')throw Error('La clave pública no corresponde al proyecto productivo.');
 }else throw Error('Usá una clave pública Supabase anon o publishable; jamás service_role.');
 releaseConfig={siteUrl:site.origin,whatsappNumber:rawPhone,supabaseUrl:url.origin,supabaseAnonKey:key,turnstileSiteKey};
}

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });

for (const file of ['index.html', 'admin.html', 'producto.html', 'pago.html', 'privacidad.html', 'terminos.html', 'arrepentimiento.html', 'presupuesto.html']) {
  cpSync(resolve(projectRoot, file), resolve(outputDirectory, file));
}
cpSync(resolve(projectRoot, preview ? 'supabase/test/productos-preview.json' : 'productos.json'),
  resolve(outputDirectory, 'productos.json'));

cpSync(resolve(projectRoot, 'assets'), resolve(outputDirectory, 'assets'), {
  recursive: true,
});

if (preview) {
  // Cloudflare Workers serves static assets with _headers from the built directory.
  cpSync(resolve(projectRoot, 'security/headers-sandbox.txt'), resolve(outputDirectory, '_headers'));
  writeFileSync(resolve(outputDirectory, 'assets/js/config.js'),
    `// Configuración pública del proyecto ficticio de pruebas.\nwindow.STORE_CONFIG = Object.freeze(${JSON.stringify(previewConfig)});\n`);
}

if(release){
 // Cabeceras equivalentes a las probadas en sandbox, con el endpoint productivo.
 const headers=require('node:fs').readFileSync(resolve(projectRoot,'security/headers-sandbox.txt'),'utf8')
  .replaceAll('https://pacyytbscnlklyrhsshp.supabase.co',releaseConfig.supabaseUrl);
 writeFileSync(resolve(outputDirectory,'_headers'),headers);
 writeFileSync(resolve(outputDirectory,'assets/js/config.js'),
  '// Configuración pública generada para producción. No contiene secretos.\n'+
  'window.STORE_CONFIG = Object.freeze('+JSON.stringify(releaseConfig)+');\n');
}

console.log(`${preview ? 'dist-preview' : 'dist'} preparado con archivos públicos.`);
