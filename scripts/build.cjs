const { cpSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');

const projectRoot = resolve(__dirname, '..');
const preview = process.argv.includes('--preview');
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

console.log(`${preview ? 'dist-preview' : 'dist'} preparado con archivos públicos.`);
