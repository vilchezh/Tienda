const { cpSync, mkdirSync, rmSync } = require('node:fs');
const { resolve } = require('node:path');

const projectRoot = resolve(__dirname, '..');
const outputDirectory = resolve(projectRoot, 'dist');

if (outputDirectory !== resolve(projectRoot, 'dist')) {
  throw new Error('El directorio de salida no es seguro.');
}

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });

for (const file of ['index.html', 'admin.html', 'producto.html', 'pago.html', 'productos.json']) {
  cpSync(resolve(projectRoot, file), resolve(outputDirectory, file));
}

cpSync(resolve(projectRoot, 'assets'), resolve(outputDirectory, 'assets'), {
  recursive: true,
});

console.log('dist preparado con HTML, catálogo de respaldo y assets públicos.');
