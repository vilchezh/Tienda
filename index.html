<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Catálogo | Taller General Rodríguez</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Space+Grotesk:wght@400;600;700&display=swap" rel="stylesheet">
  
  <style>
    :root {
      --bg-base: #111215;
      --bg-surface: #17191e;
      --bg-surface-elevated: #1f232b;
      --border-dim: #2b303c;
      --text-main: #eceff4;
      --text-muted: #8892b0;
      --accent-wood: #c87a3e;
      --font-mono: 'JetBrains Mono', monospace;
      --font-sans: 'Space Grotesk', sans-serif;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      background-color: var(--bg-base);
      color: var(--text-main);
      font-family: var(--font-sans);
      -webkit-font-smoothing: antialiased;
    }

    /* HEADER TÉCNICO */
    header {
      border-bottom: 1px solid var(--border-dim);
      padding: 24px 32px;
      background: var(--bg-surface);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .brand { font-family: var(--font-mono); font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; }
    
    main { padding: 40px 32px; max-width: 1400px; margin: 0 auto; }
    
    .page-title {
      font-size: 28px;
      text-transform: uppercase;
      letter-spacing: -0.02em;
      margin-bottom: 32px;
      padding-bottom: 12px;
      border-bottom: 1px dashed var(--border-dim);
    }

    /* GRILLA DE PRODUCTOS */
    .shop-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 24px;
    }

    /* TARJETA DE PRODUCTO */
    .product-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-dim);
      border-radius: 2px;
      display: flex;
      flex-direction: column;
      text-decoration: none;
      color: inherit;
      transition: border-color 150ms ease, transform 150ms ease;
      position: relative;
    }

    .product-card:hover {
      border-color: var(--text-muted);
      transform: translateY(-2px);
    }

    .product-img-box {
      aspect-ratio: 4/3;
      background: #0b0c0e;
      border-bottom: 1px solid var(--border-dim);
      position: relative;
      overflow: hidden;
    }

    /* Patrón de plano de fondo si no hay imagen */
    .product-img-box::before {
      content: "";
      position: absolute;
      inset: 0;
      background-image: 
        linear-gradient(to right, rgba(43, 48, 60, 0.4) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(43, 48, 60, 0.4) 1px, transparent 1px);
      background-size: 20px 20px;
    }

    .product-img-box img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      position: relative;
      z-index: 1;
    }

    .badge-3d {
      position: absolute;
      top: 12px;
      right: 12px;
      background: rgba(17, 18, 21, 0.9);
      border: 1px solid var(--border-dim);
      color: var(--accent-wood);
      font-family: var(--font-mono);
      font-size: 10px;
      padding: 4px 8px;
      z-index: 2;
      backdrop-filter: blur(4px);
    }

    .product-info {
      padding: 16px;
      display: flex;
      flex-direction: column;
      flex-grow: 1;
    }

    .product-sku {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--text-muted);
      margin-bottom: 6px;
    }

    .product-title {
      font-size: 16px;
      font-weight: 600;
      line-height: 1.3;
      margin-bottom: 8px;
    }

    .product-desc {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 16px;
      flex-grow: 1;
    }

    .product-price {
      font-family: var(--font-mono);
      font-size: 18px;
      font-weight: 700;
      color: var(--text-main);
      padding-top: 12px;
      border-top: 1px solid var(--border-dim);
      display: flex;
      align-items: baseline;
      gap: 4px;
    }
    
    .price-currency { font-size: 12px; font-weight: normal; color: var(--text-muted); }
  </style>
</head>
<body>

  <header>
    <div class="brand">Catálogo de Taller</div>
    <div style="font-family: var(--font-mono); font-size: 12px; color: var(--text-muted);">G. Rodríguez</div>
  </header>

  <main>
    <h1 class="page-title">Inventario / Fabricación a Medida</h1>
    
    <!-- Contenedor donde JS inyectará los productos -->
    <div class="shop-grid" id="catalogoGrid">
      <!-- Los productos aparecen acá -->
    </div>
  </main>

  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script>
  const SUPABASE_URL = 'https://ivyagavbhsyzvikzhmhe.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2eWFnYXZiaHN5enZpa3pobWhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0MDMzMDIsImV4cCI6MjEwODk3OTMwMn0.c0beXPjYqt3X8PSs7xbKEmOuEhiAFvoQqNm4HC8iyPo';
  const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const formatoPeso = new Intl.NumberFormat('es-AR', { style: 'decimal' });
  const grid = document.getElementById('catalogoGrid');

  async function cargarCatalogo() {
    let productos = [];
    try {
      const { data, error } = await supabaseClient.from('productos').select('*').eq('activo', true);
      if (!error && Array.isArray(data) && data.length > 0) {
        productos = data;
      } else {
        const res = await fetch('productos.json?v=' + Date.now());
        const localData = await res.json();
        productos = localData.filter(p => p.activo !== false);
      }
    } catch (e) {
      const res = await fetch('productos.json?v=' + Date.now());
      const localData = await res.json();
      productos = localData.filter(p => p.activo !== false);
    }

    grid.innerHTML = '';
    productos.forEach(prod => {
      const precio = prod.precio_base !== undefined ? prod.precio_base : prod.precioBase;
      const card = document.createElement('a');
      card.href = `producto.html?id=${prod.id}`;
      card.className = 'product-card';
      card.innerHTML = `
        <div class="product-img-box">
          <div class="badge-3d">⚙️ VISOR 3D</div>
          ${prod.imagen ? `<img src="${prod.imagen}" alt="${prod.nombre}" loading="lazy" onerror="this.style.display='none'">` : ''}
        </div>
        <div class="product-info">
          <span class="product-sku">REF: ${prod.sku}</span>
          <h2 class="product-title">${prod.nombre}</h2>
          <p class="product-desc">${prod.resumen || ''}</p>
          <div class="product-price"><span class="price-currency">$</span>${formatoPeso.format(precio)}</div>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  cargarCatalogo();
</script>

</body>
</html>