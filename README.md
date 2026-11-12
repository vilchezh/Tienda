# Acero y Escamas · Tienda

Tienda estática en HTML, CSS y JavaScript, con Supabase para catálogo, autenticación y archivos, y model-viewer 3.5.0 para el visor existente. Sin framework ni compilación obligatoria.

## Estructura

- `index.html`: portada, categorías, catálogo y promociones.
- `producto.html`: visor 3D, fotos, opciones y consulta de la configuración.
- `admin.html`: acceso existente de Supabase y edición del catálogo.
- `assets/js/config.js`: configuración **pública** centralizada.
- `assets/js/store.js`: escape de texto/atributos, validación de URLs, consulta de productos activos y contacto.
- `assets/js/{catalog,product,admin}.js`: comportamiento de cada página.
- `assets/css/`: estilos originales separados por página y sistema visual compartido en `theme.css`.
- `assets/modelos/`, `assets/texturas/`, `assets/img/`: recursos existentes sin cambios.
- `assets/fonts/`: Space Grotesk, distribución @fontsource 5.2.10, licencia OFL incluida.
- `productos.json`: respaldo histórico para importación **manual**. Nunca alimenta la tienda pública.
- `tests/`: regresiones en Chromium con los SDK reales y respuestas de Supabase interceptadas.

## Configurar WhatsApp

Editar únicamente `whatsappNumber` en `assets/js/config.js`: número internacional válido, con país y sin `+`, espacios ni guiones. Se entrega vacío porque no se proporcionó el número real. Mientras esté vacío o tenga un formato inválido, la consulta no abre ningún enlace y muestra que WhatsApp aún no está disponible.

La URL y la clave `anon` de Supabase son las públicas que ya utilizaba la tienda. La autorización sigue dependiendo de las políticas RLS existentes. **No agregar service_role, contraseñas, tokens de Mercado Pago ni otros secretos al frontend.**

## Catálogo y respaldo

Supabase es la única fuente pública. Una consulta vacía muestra un catálogo vacío; un error muestra una opción de reintentar y nunca restaura productos históricos. Las consultas de catálogo y ficha filtran `activo = true`, también durante una sesión de administrador, y tienen un límite de espera de 8 segundos.

En el administrador, «Revisar respaldo JSON» valida el archivo, consulta los IDs existentes y muestra las piezas nuevas antes de pedir que se escriba `IMPORTAR`. Se usa `insert`, nunca `upsert`, para el respaldo: los IDs existentes se omiten y un conflicto concurrente hace fallar la operación. Todas las piezas importadas quedan ocultas hasta su revisión y publicación explícita. Guardar los cambios pendientes antes de importar, porque el editor se recarga. Un catálogo vacío no importa ni crea productos automáticamente.

## Desarrollo y pruebas

Requiere Node.js 22 o superior, Python 3, curl y Chromium.

```sh
npm ci
npx playwright install --with-deps chromium
npm run serve
```

Abrir `http://127.0.0.1:4173/`, `producto.html?id=ID` o `admin.html`. La navegación normal local consulta el Supabase configurado; **las pruebas automatizadas interceptan todas las llamadas externas y no modifican producción**.

```sh
npm run test:unit
npm test
```

El comando previo a las pruebas descarga a `.test-assets/` las versiones fijadas del SDK de Supabase y model-viewer desde jsDelivr. Se usa Chromium de Playwright o `/usr/bin/chromium`; `CHROMIUM_PATH` permite indicar otra ruta. Las capturas quedan en `test-results/`. GitHub Actions ejecuta estas comprobaciones en los PR y en main; este workflow **solo prueba**, no despliega.

## Publicación y próxima etapa

No se cambió el mecanismo de despliegue. Ver [inspección y límites de verificación](docs/REVISION.md) y [preparación de Checkout Pro](docs/CHECKOUT-PRO.md).

Para publicar los archivos estáticos, incluir los tres HTML, `assets/` y `productos.json` si se desea conservar la importación manual. Los archivos de pruebas, `.test-assets/`, `node_modules/` y la documentación no son necesarios en el despliegue.
