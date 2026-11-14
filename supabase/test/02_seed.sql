-- Datos completamente ficticios. Ejecutar después de la migración de checkout.
insert into public.productos
  (id, nombre, sku, categoria, subcategoria, precio_base, resumen, imagen, fotos, glb,
   maderas, tonos_madera, colores_metal, acabados, extras, activo, checkout_habilitado)
values
  ('pieza-sandbox-001', 'Pieza ficticia de prueba', 'SANDBOX-001', 'Pruebas', 'Checkout', 100000,
   'Producto inventado para ensayar Checkout Pro. No se fabrica ni se entrega.',
   'assets/img/logo.jpg/Code_Generated_Image.png',
   '["assets/img/logo.jpg/Code_Generated_Image.png"]',
   'assets/modelos/mesa-ratona-industrial-900x500x450.glb',
   '[{"nombre":"Madera de prueba","delta":0,"tex":"assets/texturas/pino-con-nudos.jpg","activo":true}]',
   '[{"nombre":"Natural","rgb":[0.88,0.78,0.64],"hex":"#d1b58c","activo":true}]',
   '[{"nombre":"Negro","rgb":[0.1,0.11,0.12],"activo":true}]',
   '[{"nombre":"Mate","rough":0.75,"activo":true}]',
   '[{"nombre":"Extra ficticio","precio":1000,"activo":true}]', true, false);
