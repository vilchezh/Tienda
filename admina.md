<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ADMIN // BLCKSCLE · Acero y Escamas</title>
  <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-carbon: #141a1a;
      --bg-petrol: #1d4347;
      --bg-panel: #1b2424;
      --bg-input: #101515;
      --sage-main: #75927e;
      --sage-muted: #435749;
      --cream-light: #f5f3eb;
      --text-muted: #9cb0a2;
      --danger: #d9534f;
      --font-mono: 'JetBrains Mono', monospace;
      --font-sans: 'Space Grotesk', sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background-color: var(--bg-carbon); color: var(--cream-light); font-family: var(--font-sans); min-height: 100vh; display: flex; flex-direction: column; }

    #loginScreen { position: fixed; inset: 0; background: var(--bg-carbon); z-index: 9999; display: flex; justify-content: center; align-items: center; }
    .login-box { background: var(--bg-panel); border: 1px solid var(--sage-main); padding: 32px; border-radius: 2px; width: 100%; max-width: 400px; text-align: center; }
    .login-box h2 { font-family: var(--font-mono); color: var(--sage-main); margin-bottom: 20px; font-size: 16px; text-transform: uppercase; }
    .login-box input { width: 100%; margin-bottom: 12px; }

    header { background: var(--bg-petrol); border-bottom: 2px solid var(--sage-main); padding: 14px 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
    .brand-sub { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.18em; color: var(--sage-main); font-weight: 700; display: block; }
    .brand-main { font-size: 18px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
    .top-actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }

    .btn { font-family: var(--font-mono); font-size: 12px; font-weight: 700; text-transform: uppercase; padding: 9px 14px; border-radius: 2px; border: 1px solid var(--sage-main); background: var(--bg-panel); color: var(--cream-light); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; text-decoration: none; transition: all 120ms ease; }
    .btn:hover { background: var(--sage-main); color: var(--bg-carbon); }
    .btn-primary { background: var(--sage-main); color: var(--bg-carbon); border-color: var(--cream-light); }
    .btn-primary:hover { background: var(--cream-light); color: var(--bg-carbon); }
    .btn-secondary { border-color: var(--text-muted); color: var(--text-muted); }
    .btn-danger { border-color: var(--danger); color: #ff9b98; background: rgba(217, 83, 79, 0.12); }
    .btn-danger:hover { background: var(--danger); color: #fff; }
    .btn-sm { padding: 5px 10px; font-size: 11px; }

    .hazard-divider { height: 7px; background: repeating-linear-gradient(-55deg, var(--bg-petrol), var(--bg-petrol) 24px, var(--sage-main) 24px, var(--sage-main) 27px); border-bottom: 1px solid var(--sage-muted); }
    .admin-layout { display: grid; grid-template-columns: 310px 1fr; flex-grow: 1; min-height: calc(100vh - 76px); }
    @media (max-width: 960px) { .admin-layout { grid-template-columns: 1fr; } }

    .sidebar { background: var(--bg-panel); border-right: 1px solid var(--sage-muted); padding: 20px; display: flex; flex-direction: column; gap: 16px; }
    .sidebar-header { display: flex; justify-content: space-between; align-items: center; font-family: var(--font-mono); font-size: 12px; text-transform: uppercase; color: var(--sage-main); padding-bottom: 8px; border-bottom: 1px solid var(--sage-muted); }
    .prod-list { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; max-height: 55vh; }
    .prod-item { background: var(--bg-input); border: 1px solid var(--sage-muted); padding: 12px; border-radius: 2px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; }
    .prod-item:hover { border-color: var(--cream-light); }
    .prod-item.active { background: var(--bg-petrol); border-color: var(--sage-main); border-left: 4px solid var(--sage-main); }
    .prod-item-title { font-size: 14px; font-weight: 700; display: block; }
    .prod-item-meta { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); margin-top: 2px; }
    .prod-item-price { font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: var(--sage-main); }
    .bulk-box { margin-top: auto; background: var(--bg-input); border: 1px solid var(--sage-muted); padding: 14px; border-radius: 2px; }
    .bulk-title { font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; color: var(--sage-main); margin-bottom: 8px; display: block; }

    .editor-area { padding: 28px 32px; overflow-y: auto; display: flex; flex-direction: column; gap: 24px; }
    .editor-card { background: var(--bg-panel); border: 1px solid var(--sage-muted); padding: 22px; border-radius: 2px; }
    .card-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--sage-muted); padding-bottom: 10px; margin-bottom: 18px; flex-wrap: wrap; gap: 10px; }
    .card-title { font-family: var(--font-mono); font-size: 13px; font-weight: 700; text-transform: uppercase; color: var(--sage-main); letter-spacing: 0.06em; }

    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; }
    .form-group { display: flex; flex-direction: column; gap: 6px; }
    .form-group.full { grid-column: 1 / -1; }
    label { font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; color: var(--text-muted); }
    input[type="text"], input[type="password"], input[type="number"], select, textarea { background: var(--bg-input); border: 1px solid var(--sage-muted); color: var(--cream-light); padding: 10px 12px; font-family: var(--font-sans); font-size: 13px; border-radius: 2px; width: 100%; }
    input[type="number"], .mono-input { font-family: var(--font-mono); }

    .dynamic-list { display: flex; flex-direction: column; gap: 10px; }
    .dynamic-row { display: grid; grid-template-columns: auto 1.3fr 1.3fr 120px auto; gap: 10px; align-items: center; background: var(--bg-input); border: 1px solid var(--sage-muted); padding: 10px 12px; border-radius: 2px; }
    @media (max-width: 768px) { .dynamic-row { grid-template-columns: 1fr; } }

    .media-split { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 20px; align-items: start; }
    @media (max-width: 900px) { .media-split { grid-template-columns: 1fr; } }
    .mini-viewer-box { background: #0e1313; border: 1px solid var(--sage-muted); height: 260px; position: relative; border-radius: 2px; }
    model-viewer { width: 100%; height: 100%; --poster-color: transparent; }

    .status-banner { position: fixed; bottom: 20px; right: 20px; background: var(--bg-petrol); border: 2px solid var(--sage-main); color: var(--cream-light); font-family: var(--font-mono); font-size: 12px; padding: 12px 18px; border-radius: 2px; display: none; z-index: 999; box-shadow: 0 8px 24px rgba(0,0,0,0.6); }
  </style>
</head>
<body>

  <div id="loginScreen">
    <div class="login-box">
      <h2>Panel Taller // Acceso</h2>
      <input type="text" id="loginEmail" placeholder="Email administrador">
      <input type="password" id="loginPassword" placeholder="Contraseña">
      <button class="btn btn-primary" id="btnLogin" style="width:100%; justify-content:center;">ENTRAR A SUPABASE</button>
      <p id="loginError" style="color:var(--danger); font-family:var(--font-mono); font-size:11px; margin-top:10px; display:none;"></p>
    </div>
  </div>

  <header>
    <div>
      <span class="brand-sub">PANEL DE TALLER // SUPABASE</span>
      <span class="brand-main">Acero y Escamas · Admin</span>
    </div>
    <div class="top-actions">
      <button type="button" class="btn" id="btnImportJson" title="Importar muebles de productos.json a Supabase">📥 Restaurar desde productos.json</button>
      <a id="btnPreviewProduct" href="#" target="_blank" class="btn">👁️ Ver en Tienda</a>
      <button type="button" class="btn btn-primary" id="btnSaveSupabase">💾 Publicar Cambios en Vivo</button>
      <button type="button" class="btn btn-danger" id="btnLogout">SALIR</button>
    </div>
  </header>
  <div class="hazard-divider"></div>

  <div class="admin-layout" id="mainAdmin" style="visibility: hidden;">
    <aside class="sidebar">
      <div class="sidebar-header">
        <span>Catálogo (<span id="countProds">0</span>)</span>
        <button type="button" class="btn btn-sm btn-primary" id="btnNewProd">+ Nuevo</button>
      </div>
      <div class="prod-list" id="prodList"></div>
      <div class="bulk-box">
        <span class="bulk-title">⚡ Ajuste Masivo de Precios</span>
        <div style="display: flex; gap: 8px;">
          <input type="number" id="bulkPercent" placeholder="Ej: 10" step="1" style="width: 90px;">
          <button type="button" class="btn btn-sm" id="btnApplyBulk" style="flex-grow: 1; justify-content: center;">Aplicar %</button>
        </div>
      </div>
    </aside>

    <main class="editor-area">
      <section class="editor-card">
        <div class="card-header">
          <span class="card-title">1. Datos Principales, Precio y Categoría</span>
          <div style="display: flex; gap: 8px;">
            <button type="button" class="btn btn-sm btn-secondary" id="btnToggleVisibility">🚫 Ocultar Mueble</button>
            <button type="button" class="btn btn-sm" id="btnDuplicateProd">📄 Duplicar</button>
            <button type="button" class="btn btn-sm btn-danger" id="btnDeleteProd">🗑️ Eliminar</button>
          </div>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>Nombre del Producto</label>
            <input type="text" id="inpNombre">
          </div>
          <div class="form-group">
            <label>ID en URL (sin espacios)</label>
            <input type="text" id="inpId" class="mono-input">
          </div>
          <div class="form-group">
            <label>Código SKU / Referencia</label>
            <input type="text" id="inpSku" class="mono-input">
          </div>
          <div class="form-group">
            <label>Precio Base ($ ARS)</label>
            <input type="number" id="inpPrecio" step="500">
          </div>
          <div class="form-group">
            <label>Categoría Principal</label>
            <select id="selCategoria">
              <option value="Hogar">Hogar</option>
              <option value="Gym">Gym</option>
              <option value="Trailers">Trailers</option>
              <option value="Uso Rudo">Uso Rudo</option>
            </select>
          </div>
          <div class="form-group">
            <label>Subcategoría</label>
            <select id="selSubcategoria"></select>
          </div>
          <div class="form-group full">
            <label>Descripción / Resumen Técnico</label>
            <textarea id="inpResumen" rows="2"></textarea>
          </div>
          <div class="form-group full">
            <label>Link de Pago Mercado Pago (Opcional)</label>
            <input type="text" id="inpMpLink" class="mono-input">
          </div>
        </div>
      </section>

      <section class="editor-card">
        <div class="card-header">
          <span class="card-title">2. Visor 3D (.GLB) + Galería de Fotos Reales</span>
        </div>
        <div class="media-split">
          <div style="display: flex; flex-direction: column; gap: 14px;">
            <div class="form-group">
              <label>Ruta Modelo 3D (.GLB)</label>
              <input type="text" id="inpGlb" class="mono-input">
            </div>
            <div class="form-group">
              <label>Ruta Foto Portada</label>
              <input type="text" id="inpImagen" class="mono-input">
            </div>
            <div class="form-group">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <label>Fotos Reales del Taller</label>
                <button type="button" class="btn btn-sm" id="btnAddPhoto">+ Agregar Foto</button>
              </div>
              <div class="dynamic-list" id="photosList"></div>
            </div>
          </div>
          <div>
            <label style="display: block; margin-bottom: 6px;">Vista Previa 3D</label>
            <div class="mini-viewer-box">
              <model-viewer id="adminViewer" src="" camera-controls exposure="0.58"></model-viewer>
            </div>
          </div>
        </div>
      </section>

      <section class="editor-card">
        <div class="card-header">
          <span class="card-title">3. Tipos de Madera y Recargo ($)</span>
          <button type="button" class="btn btn-sm" id="btnAddWood">+ Agregar Madera</button>
        </div>
        <div class="dynamic-list" id="woodsList"></div>
      </section>

      <section class="editor-card">
        <div class="card-header">
          <span class="card-title">4. Opciones Extras y Modificaciones</span>
          <button type="button" class="btn btn-sm" id="btnAddExtra">+ Agregar Extra</button>
        </div>
        <div style="margin-bottom: 14px; display: flex; align-items: center; gap: 10px;">
          <input type="checkbox" id="chkPermitirNota" style="width: 18px; height: 18px; accent-color: var(--sage-main);">
          <label for="chkPermitirNota" style="color: var(--cream-light); font-size: 12px;">Habilitar caja de texto para medidas personalizadas</label>
        </div>
        <div class="dynamic-list" id="extrasList"></div>
      </section>

      <section class="editor-card">
        <div class="card-header">
          <span class="card-title">5. Tonos de Lustre y Pintura Epoxi</span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <label>Tonos de Lustre</label>
              <button type="button" class="btn btn-sm" id="btnAddStain">+ Tono</button>
            </div>
            <div class="dynamic-list" id="stainsList"></div>
          </div>
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <label>Colores Metal</label>
              <button type="button" class="btn btn-sm" id="btnAddMetal">+ Metal</button>
            </div>
            <div class="dynamic-list" id="metalsList"></div>
          </div>
        </div>
      </section>
    </main>
  </div>

  <div class="status-banner" id="statusBanner"></div>

  <script>
    const SUPABASE_URL = 'https://ivyagavbhsyzvikzhmhe.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2eWFnYXZiaHN5enZpa3pobWhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0MDMzMDIsImV4cCI6MjEwODk3OTMwMn0.c0beXPjYqt3X8PSs7xbKEmOuEhiAFvoQqNm4HC8iyPo';
    const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    let catalog = [];
    let currentIndex = 0;

    const CATEGORIAS_MAP = {
      "Hogar": ["Cocina", "Dormitorio", "Living/Comedor", "Baño", "Oficina", "Jardín/Exterior"],
      "Gym": ["Máquinas de Gym"],
      "Trailers": ["Moto", "Auto"],
      "Uso Rudo": ["Herramientas", "Máquinas Uso Rudo"]
    };

    const DEFAULT_WOODS = [
      { nombre: "Pino con Nudos", tex: "assets/texturas/pino-con-nudos.jpg", delta: 0, meta: "Base · Veta rústica", activo: true },
      { nombre: "Pino sin Nudos", tex: "assets/texturas/pino-sin-nudos.jpg", delta: 12000, meta: "+$12.000 · Limpio", activo: true },
      { nombre: "Eucalipto", tex: "assets/texturas/eucalipto.jpg", delta: 24000, meta: "+$24.000 · Dura", activo: true },
      { nombre: "Alistonado", tex: "assets/texturas/alistonado.jpg", delta: 18000, meta: "+$18.000 · Finger-joint", activo: true }
    ];

    const DEFAULT_STAINS = [
      { nombre: "Transparente", etiqueta: "Natural", hex: "#e0c7a3", rgb: [0.88, 0.78, 0.64], activo: true },
      { nombre: "Roble Claro", etiqueta: "Roble C.", hex: "#b88449", rgb: [0.72, 0.52, 0.29], activo: true },
      { nombre: "Roble Oscuro", etiqueta: "Roble O.", hex: "#6e4626", rgb: [0.43, 0.27, 0.15], activo: true },
      { nombre: "Nogal", etiqueta: "Nogal", hex: "#472c18", rgb: [0.28, 0.17, 0.09], activo: true },
      { nombre: "Caoba", etiqueta: "Caoba", hex: "#6b2918", rgb: [0.42, 0.16, 0.09], activo: true },
      { nombre: "Wengue", etiqueta: "Wengue", hex: "#241914", rgb: [0.14, 0.10, 0.08], activo: true }
    ];

    const DEFAULT_METALS = [
      { nombre: "Negro", meta: "Epoxi clásico", hex: "#1a1c1e", rgb: [0.10, 0.11, 0.12], activo: true },
      { nombre: "Blanco", meta: "Epoxi luminoso", hex: "#eceee9", rgb: [0.92, 0.93, 0.91], activo: true },
      { nombre: "Gris Acero", meta: "Industrial", hex: "#5a6265", rgb: [0.35, 0.38, 0.40], activo: true }
    ];

    const DEFAULT_ACABADOS = [
      { nombre: "Mate", meta: "Satinado suave", rough: 0.75, activo: true },
      { nombre: "Brillante", meta: "Laca pulida", rough: 0.22, activo: true }
    ];

    const DEFAULT_EXTRAS = [
      { nombre: "Regatones regulables", precio: 6500, meta: "Nivelación antideslizante", activo: true },
      { nombre: "Ruedas industriales con freno", precio: 22000, meta: "4 ruedas giro 360°", activo: true }
    ];

    function showToast(msg) {
      const b = document.getElementById('statusBanner');
      b.textContent = msg; b.style.display = 'block';
      clearTimeout(window._toastTimer);
      window._toastTimer = setTimeout(() => { b.style.display = 'none'; }, 3500);
    }

    function hexToRgbArray(hex) {
      const clean = (hex || '#ffffff').replace('#', '');
      const num = parseInt(clean, 16) || 0;
      return [Number((((num >> 16) & 255)/255).toFixed(2)), Number((((num >> 8) & 255)/255).toFixed(2)), Number(((num & 255)/255).toFixed(2))];
    }

    function normalizeProduct(p) {
      return {
        id: String(p.id || "mueble-" + Date.now()).trim(),
        nombre: p.nombre || "Nuevo Mueble",
        sku: p.sku || "AYE-001",
        activo: p.activo !== false,
        categoria: p.categoria || "Hogar",
        subcategoria: p.subcategoria || "Living/Comedor",
        precio_base: Number(p.precio_base !== undefined ? p.precio_base : p.precioBase) || 100000,
        resumen: p.resumen || "",
        imagen: p.imagen || "assets/img/portada.jpg",
        fotos: Array.isArray(p.fotos) ? p.fotos : [],
        glb: p.glb || "assets/modelos/biblioteca.glb",
        mp_link: p.mp_link || p.mpLink || "",
        permitir_nota_medida: p.permitir_nota_medida !== undefined ? p.permitir_nota_medida : (p.permitirNotaMedida !== false),
        maderas: Array.isArray(p.maderas) && p.maderas.length ? p.maderas : JSON.parse(JSON.stringify(DEFAULT_WOODS)),
        tonos_madera: Array.isArray(p.tonos_madera || p.tonosMadera) && (p.tonos_madera || p.tonosMadera).length ? (p.tonos_madera || p.tonosMadera) : JSON.parse(JSON.stringify(DEFAULT_STAINS)),
        colores_metal: Array.isArray(p.colores_metal || p.coloresMetal) && (p.colores_metal || p.coloresMetal).length ? (p.colores_metal || p.coloresMetal) : JSON.parse(JSON.stringify(DEFAULT_METALS)),
        acabados: Array.isArray(p.acabados) && p.acabados.length ? p.acabados : JSON.parse(JSON.stringify(DEFAULT_ACABADOS)),
        extras: Array.isArray(p.extras) && p.extras.length ? p.extras : JSON.parse(JSON.stringify(DEFAULT_EXTRAS))
      };
    }

    function populateSubcategorias(cat, selectedSub) {
      const sel = document.getElementById('selSubcategoria');
      sel.innerHTML = '';
      (CATEGORIAS_MAP[cat] || ["General"]).forEach(s => {
        const opt = document.createElement('option');
        opt.value = s; opt.textContent = s;
        if (s === selectedSub) opt.selected = true;
        sel.appendChild(opt);
      });
    }

    function renderSidebar() {
      const list = document.getElementById('prodList');
      document.getElementById('countProds').textContent = catalog.length;
      list.innerHTML = '';
      catalog.forEach((p, idx) => {
        const isHidden = !p.activo;
        const div = document.createElement('div');
        div.className = 'prod-item' + (idx === currentIndex ? ' active' : '');
        div.style.cssText = isHidden ? 'opacity: 0.55; border-style: dashed;' : '';
        div.innerHTML = `
          <div>
            <span class="prod-item-title">${p.nombre}${isHidden ? '<span style="color:var(--danger);font-size:10px;margin-left:8px">[OCULTO]</span>' : ''}</span>
            <span class="prod-item-meta">${p.sku} · ${p.categoria}</span>
          </div>
          <div class="prod-item-price">$${Number(p.precio_base).toLocaleString('es-AR')}</div>`;
        div.addEventListener('click', () => { currentIndex = idx; renderSidebar(); renderEditor(); });
        list.appendChild(div);
      });
    }

    function renderPhotosList(p) {
      const box = document.getElementById('photosList');
      box.innerHTML = '';
      p.fotos.forEach((url, i) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; gap:8px; align-items:center;';
        row.innerHTML = `
          <input type="text" class="mono-input" value="${url}" placeholder="assets/fotos/foto1.jpg">
          <button type="button" class="btn btn-sm btn-danger">✕</button>`;
        row.querySelector('input').addEventListener('input', e => { p.fotos[i] = e.target.value; });
        row.querySelector('button').addEventListener('click', () => { p.fotos.splice(i, 1); renderPhotosList(p); });
        box.appendChild(row);
      });
    }

    function renderWoodsList(p) {
      const box = document.getElementById('woodsList');
      box.innerHTML = '';
      p.maderas.forEach((w, i) => {
        const row = document.createElement('div');
        row.className = 'dynamic-row';
        row.innerHTML = `
          <input type="checkbox" ${w.activo !== false ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--sage-main)">
          <input type="text" value="${w.nombre}" placeholder="Nombre madera">
          <input type="text" class="mono-input" value="${w.tex || ''}" placeholder="Ruta textura .jpg">
          <input type="number" value="${w.delta || 0}" step="500" placeholder="Recargo $">
          <button type="button" class="btn btn-sm btn-danger">✕</button>`;
        const inputs = row.querySelectorAll('input');
        inputs[0].addEventListener('change', e => { w.activo = e.target.checked; });
        inputs[1].addEventListener('input', e => { w.nombre = e.target.value; });
        inputs[2].addEventListener('input', e => { w.tex = e.target.value; });
        inputs[3].addEventListener('input', e => { w.delta = Number(e.target.value) || 0; });
        row.querySelector('button').addEventListener('click', () => { p.maderas.splice(i, 1); renderWoodsList(p); });
        box.appendChild(row);
      });
    }

    function renderExtrasList(p) {
      const box = document.getElementById('extrasList');
      box.innerHTML = '';
      p.extras.forEach((ex, i) => {
        const row = document.createElement('div');
        row.className = 'dynamic-row';
        row.innerHTML = `
          <input type="checkbox" ${ex.activo !== false ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--sage-main)">
          <input type="text" value="${ex.nombre}" placeholder="Nombre del extra">
          <input type="text" value="${ex.meta || ''}" placeholder="Descripción corta">
          <input type="number" value="${ex.precio || 0}" step="500" placeholder="Precio $">
          <button type="button" class="btn btn-sm btn-danger">✕</button>`;
        const inputs = row.querySelectorAll('input');
        inputs[0].addEventListener('change', e => { ex.activo = e.target.checked; });
        inputs[1].addEventListener('input', e => { ex.nombre = e.target.value; });
        inputs[2].addEventListener('input', e => { ex.meta = e.target.value; });
        inputs[3].addEventListener('input', e => { ex.precio = Number(e.target.value) || 0; });
        row.querySelector('button').addEventListener('click', () => { p.extras.splice(i, 1); renderExtrasList(p); });
        box.appendChild(row);
      });
    }

    function renderStainsList(p) {
      const box = document.getElementById('stainsList');
      box.innerHTML = '';
      p.tonos_madera.forEach((st, i) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:grid; grid-template-columns:auto 36px 1fr 1fr auto; gap:8px; align-items:center; background:var(--bg-input); padding:8px; border:1px solid var(--sage-muted);';
        row.innerHTML = `
          <input type="checkbox" ${st.activo !== false ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--sage-main)">
          <input type="color" value="${st.hex || '#b88449'}" style="width:32px;height:28px;border:none;background:none;cursor:pointer;">
          <input type="text" value="${st.nombre}" placeholder="Nombre tono">
          <input type="text" value="${st.etiqueta || st.nombre}" placeholder="Etiqueta corta">
          <button type="button" class="btn btn-sm btn-danger">✕</button>`;
        const inputs = row.querySelectorAll('input');
        inputs[0].addEventListener('change', e => { st.activo = e.target.checked; });
        inputs[1].addEventListener('input', e => { st.hex = e.target.value; st.rgb = hexToRgbArray(e.target.value); });
        inputs[2].addEventListener('input', e => { st.nombre = e.target.value; });
        inputs[3].addEventListener('input', e => { st.etiqueta = e.target.value; });
        row.querySelector('button').addEventListener('click', () => { p.tonos_madera.splice(i, 1); renderStainsList(p); });
        box.appendChild(row);
      });
    }

    function renderMetalsList(p) {
      const box = document.getElementById('metalsList');
      box.innerHTML = '';
      p.colores_metal.forEach((mt, i) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:grid; grid-template-columns:auto 36px 1fr 1fr auto; gap:8px; align-items:center; background:var(--bg-input); padding:8px; border:1px solid var(--sage-muted);';
        row.innerHTML = `
          <input type="checkbox" ${mt.activo !== false ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--sage-main)">
          <input type="color" value="${mt.hex || '#1a1c1e'}" style="width:32px;height:28px;border:none;background:none;cursor:pointer;">
          <input type="text" value="${mt.nombre}" placeholder="Color metal">
          <input type="text" value="${mt.meta || ''}" placeholder="Descripción">
          <button type="button" class="btn btn-sm btn-danger">✕</button>`;
        const inputs = row.querySelectorAll('input');
        inputs[0].addEventListener('change', e => { mt.activo = e.target.checked; });
        inputs[1].addEventListener('input', e => { mt.hex = e.target.value; mt.rgb = hexToRgbArray(e.target.value); });
        inputs[2].addEventListener('input', e => { mt.nombre = e.target.value; });
        inputs[3].addEventListener('input', e => { mt.meta = e.target.value; });
        row.querySelector('button').addEventListener('click', () => { p.colores_metal.splice(i, 1); renderMetalsList(p); });
        box.appendChild(row);
      });
    }

    function renderEditor() {
      const p = catalog[currentIndex];
      if (!p) return;

      const btnToggle = document.getElementById('btnToggleVisibility');
      if (!p.activo) {
        btnToggle.innerHTML = '👁️ Mostrar en Catálogo'; btnToggle.className = 'btn btn-sm btn-primary';
      } else {
        btnToggle.innerHTML = '🚫 Ocultar Mueble'; btnToggle.className = 'btn btn-sm btn-secondary';
      }

      document.getElementById('inpNombre').value = p.nombre;
      document.getElementById('inpId').value = p.id;
      document.getElementById('inpSku').value = p.sku;
      document.getElementById('inpPrecio').value = p.precio_base;
      document.getElementById('selCategoria').value = CATEGORIAS_MAP[p.categoria] ? p.categoria : "Hogar";
      populateSubcategorias(document.getElementById('selCategoria').value, p.subcategoria);
      document.getElementById('inpResumen').value = p.resumen;
      document.getElementById('inpMpLink').value = p.mp_link;
      document.getElementById('inpGlb').value = p.glb;
      document.getElementById('inpImagen').value = p.imagen;
      document.getElementById('chkPermitirNota').checked = p.permitir_nota_medida;
      document.getElementById('adminViewer').src = p.glb;
      document.getElementById('btnPreviewProduct').href = `producto.html?id=${p.id}`;

      renderPhotosList(p);
      renderWoodsList(p);
      renderExtrasList(p);
      renderStainsList(p);
      renderMetalsList(p);
    }

    async function importFromLocalJsonToSupabase() {
      try {
        const res = await fetch('productos.json?v=' + Date.now());
        if (!res.ok) throw new Error("No se encontró productos.json");
        const raw = await res.json();
        if (Array.isArray(raw) && raw.length > 0) {
          const normalized = raw.map(normalizeProduct);
          const { error } = await supabaseClient.from('productos').upsert(normalized);
          if (error) throw error;
          catalog = normalized;
          currentIndex = 0;
          renderSidebar();
          renderEditor();
          showToast("✅ Muebles de productos.json importados y guardados en Supabase");
          return true;
        }
      } catch (e) {
        console.warn("No se pudo importar productos.json:", e);
      }
      return false;
    }

    async function loadCatalogFromSupabase() {
      showToast("Conectando con Supabase...");
      const { data, error } = await supabaseClient.from('productos').select('*').order('nombre');
      if (error) { alert("Error al leer Supabase: " + error.message); return; }

      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('mainAdmin').style.visibility = 'visible';

      if (!data || data.length === 0) {
        const imported = await importFromLocalJsonToSupabase();
        if (!imported) {
          catalog = [normalizeProduct({ id: "biblioteca-industrial", nombre: "Biblioteca Industrial" })];
          renderSidebar();
          renderEditor();
        }
        return;
      }

      catalog = data.map(normalizeProduct);
      currentIndex = 0;
      renderSidebar();
      renderEditor();
      showToast("✅ Catálogo cargado desde Supabase");
    }

    document.getElementById('btnLogin').addEventListener('click', async () => {
      const email = document.getElementById('loginEmail').value.trim();
      const pass = document.getElementById('loginPassword').value;
      const errEl = document.getElementById('loginError');
      errEl.style.display = 'none';
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
      if (error) { errEl.textContent = "Error: " + error.message; errEl.style.display = 'block'; }
      else { loadCatalogFromSupabase(); }
    });

    document.getElementById('btnLogout').addEventListener('click', async () => {
      await supabaseClient.auth.signOut();
      window.location.reload();
    });

    document.getElementById('btnImportJson').addEventListener('click', async () => {
      if (confirm("¿Restaurar los muebles desde productos.json y subirlos a Supabase?")) {
        await importFromLocalJsonToSupabase();
      }
    });

    document.getElementById('btnSaveSupabase').addEventListener('click', async () => {
      showToast("Publicando en Supabase...");
      const { error } = await supabaseClient.from('productos').upsert(catalog);
      if (error) alert("Error al guardar en Supabase: " + error.message);
      else showToast("✅ ¡Cambios publicados en vivo en la tienda!");
    });

    supabaseClient.auth.getSession().then(({ data: { session } }) => {
      if (session) loadCatalogFromSupabase();
    });

    // Eventos del formulario principal
    document.getElementById('inpNombre').addEventListener('input', e => { catalog[currentIndex].nombre = e.target.value; renderSidebar(); });
    document.getElementById('inpId').addEventListener('input', e => {
      catalog[currentIndex].id = e.target.value.trim();
      document.getElementById('btnPreviewProduct').href = `producto.html?id=${catalog[currentIndex].id}`;
    });
    document.getElementById('inpSku').addEventListener('input', e => { catalog[currentIndex].sku = e.target.value; renderSidebar(); });
    document.getElementById('inpPrecio').addEventListener('input', e => { catalog[currentIndex].precio_base = Number(e.target.value) || 0; renderSidebar(); });
    document.getElementById('selCategoria').addEventListener('change', e => {
      catalog[currentIndex].categoria = e.target.value;
      populateSubcategorias(e.target.value, "");
      catalog[currentIndex].subcategoria = document.getElementById('selSubcategoria').value;
      renderSidebar();
    });
    document.getElementById('selSubcategoria').addEventListener('change', e => { catalog[currentIndex].subcategoria = e.target.value; });
    document.getElementById('inpResumen').addEventListener('input', e => { catalog[currentIndex].resumen = e.target.value; });
    document.getElementById('inpMpLink').addEventListener('input', e => { catalog[currentIndex].mp_link = e.target.value.trim(); });
    document.getElementById('inpGlb').addEventListener('input', e => {
      catalog[currentIndex].glb = e.target.value.trim();
      document.getElementById('adminViewer').src = catalog[currentIndex].glb;
    });
    document.getElementById('inpImagen').addEventListener('input', e => { catalog[currentIndex].imagen = e.target.value.trim(); });
    document.getElementById('chkPermitirNota').addEventListener('change', e => { catalog[currentIndex].permitir_nota_medida = e.target.checked; });

    document.getElementById('btnToggleVisibility').addEventListener('click', () => {
      catalog[currentIndex].activo = !catalog[currentIndex].activo;
      renderSidebar(); renderEditor();
      showToast(catalog[currentIndex].activo ? "👁️ Mueble visible (tocá Publicar)" : "🚫 Mueble oculto (tocá Publicar)");
    });

    document.getElementById('btnNewProd').addEventListener('click', () => {
      const nuevo = normalizeProduct({ id: "mueble-" + Date.now().toString().slice(-4), nombre: "Nuevo Mueble Industrial", sku: "AYE-NEW" });
      catalog.push(nuevo);
      currentIndex = catalog.length - 1;
      renderSidebar(); renderEditor();
      showToast("✨ Mueble creado. Tocá 'Publicar Cambios en Vivo' para guardarlo.");
    });

    document.getElementById('btnDuplicateProd').addEventListener('click', () => {
      const copy = JSON.parse(JSON.stringify(catalog[currentIndex]));
      copy.id = copy.id + "-copia";
      copy.nombre = copy.nombre + " (Copia)";
      catalog.push(copy);
      currentIndex = catalog.length - 1;
      renderSidebar(); renderEditor();
    });

    document.getElementById('btnDeleteProd').addEventListener('click', async () => {
      if (catalog.length <= 1) { alert("Debe quedar al menos 1 producto."); return; }
      const p = catalog[currentIndex];
      if (!confirm(`¿Eliminar definitivamente "${p.nombre}" de Supabase?`)) return;
      await supabaseClient.from('productos').delete().eq('id', p.id);
      catalog.splice(currentIndex, 1);
      currentIndex = Math.max(0, currentIndex - 1);
      renderSidebar(); renderEditor();
      showToast("🗑️ Producto eliminado de Supabase");
    });

    document.getElementById('btnAddPhoto').addEventListener('click', () => {
      catalog[currentIndex].fotos.push("assets/fotos/nueva.jpg");
      renderPhotosList(catalog[currentIndex]);
    });
    document.getElementById('btnAddWood').addEventListener('click', () => {
      catalog[currentIndex].maderas.push({ nombre: "Nueva Madera", tex: "assets/texturas/pino-sin-nudos.jpg", delta: 10000, activo: true });
      renderWoodsList(catalog[currentIndex]);
    });
    document.getElementById('btnAddExtra').addEventListener('click', () => {
      catalog[currentIndex].extras.push({ nombre: "Nuevo Extra", meta: "Detalle adicional", precio: 8000, activo: true });
      renderExtrasList(catalog[currentIndex]);
    });
    document.getElementById('btnAddStain').addEventListener('click', () => {
      catalog[currentIndex].tonos_madera.push({ nombre: "Nuevo Tono", etiqueta: "Nuevo", hex: "#8c6239", rgb: [0.55, 0.38, 0.22], activo: true });
      renderStainsList(catalog[currentIndex]);
    });
    document.getElementById('btnAddMetal').addEventListener('click', () => {
      catalog[currentIndex].colores_metal.push({ nombre: "Nuevo Metal", meta: "Epoxi", hex: "#333333", rgb: [0.2, 0.2, 0.2], activo: true });
      renderMetalsList(catalog[currentIndex]);
    });

    document.getElementById('btnApplyBulk').addEventListener('click', () => {
      const pct = Number(document.getElementById('bulkPercent').value);
      if (!pct) return;
      const factor = 1 + (pct / 100);
      catalog.forEach(p => { p.precio_base = Math.round((p.precio_base * factor) / 500) * 500; });
      renderSidebar(); renderEditor();
      showToast(`⚡ Precios ajustados ${pct}%. Tocá Publicar Cambios en Vivo.`);
    });
  </script>
  <script>
(function() {
  // Función que sube el archivo a Supabase Storage y devuelve el link público
  async function uploadToSupabase(file, folder) {
    showToast("⏳ Subiendo " + file.name + "...");
    const cleanName = Date.now() + "-" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${folder}/${cleanName}`;

    const { error } = await supabaseClient.storage
      .from('tienda')
      .upload(filePath, file, { upsert: true });

    if (error) {
      alert("Error al subir archivo: " + error.message);
      return null;
    }

    const { data } = supabaseClient.storage.from('tienda').getPublicUrl(filePath);
    showToast("✅ Archivo subido. Tocá 'Publicar Cambios en Vivo' para guardar.");
    return data.publicUrl;
  }

  // Agrega un botón "📤 Subir" al lado de cualquier input de ruta
  function attachUploadButton(inputEl, accept, folder) {
    if (!inputEl || inputEl.dataset.hasUploader) return;
    inputEl.dataset.hasUploader = "1";

    const wrapper = document.createElement("div");
    wrapper.style.cssText = "display:flex; gap:8px; align-items:center; width:100%;";
    inputEl.parentNode.insertBefore(wrapper, inputEl);
    wrapper.appendChild(inputEl);

    const fileInp = document.createElement("input");
    fileInp.type = "file";
    fileInp.accept = accept;
    fileInp.style.display = "none";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-sm btn-primary";
    btn.style.whiteSpace = "nowrap";
    btn.innerHTML = "📤 Subir";

    btn.addEventListener("click", () => fileInp.click());
    fileInp.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      btn.disabled = true;
      btn.textContent = "⏳...";
      const url = await uploadToSupabase(file, folder);
      btn.disabled = false;
      btn.innerHTML = "📤 Subir";
      if (url) {
        inputEl.value = url;
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });

    wrapper.appendChild(btn);
    wrapper.appendChild(fileInp);
  }

  function enhanceInputs() {
    attachUploadButton(document.getElementById("inpGlb"), ".glb,.gltf", "modelos");
    attachUploadButton(document.getElementById("inpImagen"), "image/*", "portadas");
    document.querySelectorAll("#photosList input.mono-input").forEach(inp => {
      attachUploadButton(inp, "image/*", "fotos");
    });
    document.querySelectorAll("#woodsList input.mono-input").forEach(inp => {
      attachUploadButton(inp, "image/*", "texturas");
    });
  }

  // Ejecutar al iniciar y cada vez que se agregue una fila nueva de foto o madera
  enhanceInputs();
  const obs = new MutationObserver(enhanceInputs);
  ["photosList", "woodsList"].forEach(id => {
    const el = document.getElementById(id);
    if (el) obs.observe(el, { childList: true, subtree: true });
  });
})();
</script>
</body>
</html>