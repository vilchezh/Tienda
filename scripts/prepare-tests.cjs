const { mkdirSync, existsSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
mkdirSync('.test-assets', { recursive: true });
for (const [name, url] of Object.entries({
  'supabase.js': 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.js',
  'model-viewer.min.js': 'https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js'
})) {
  if (!existsSync(`.test-assets/${name}`)) execFileSync('curl', ['--fail', '--silent', '--show-error', '--location', url, '-o', `.test-assets/${name}`], { stdio: 'inherit' });
}
