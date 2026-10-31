<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ADMIN // BLCKSCLE · Acero y Escamas</title>
  <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js"></script>
  <!-- Cliente Supabase -->
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

    /* ================= LOGIN ================= */
    #loginScreen {
      position: fixed; inset: 0; background: var(--bg-carbon); z-index: 9999;
      display: flex; justify-content: center; align-items: center;
    }
    .login-box {
      background: var(--bg-panel); border: 1px solid var(--sage-main); padding: 32px;
      border-radius: 2px; width: 100%; max-width: 400px; text-align: center;
    }
    .login-box h2 { font-family: var(--font-mono); color: var(--sage-main); margin-bottom: 20px; font-size: 16px; text-transform: uppercase; }
    .login-box input { width: 100%; margin-bottom: 12px; }

    /* ================= HEADER & LAYOUT ================= */
    header { background: var(--bg-petrol); border-bottom: 2px solid var(--sage-main); padding: 14px 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
    .brand-wrap { display: flex; align-items: center; gap: 12px; }
    .brand-sub { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.18em; color: var(--sage-main); font-weight: 700; display: block; }
    .brand-main { font-size: 18px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
    .top-actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }

    .btn { font-family: var(--font-mono); font-size: 12px; font-weight: 700; text-transform: uppercase; padding: 9px 14px; border-radius: 2px; border: 1px solid var(--sage-main); background: var(--bg-panel); color: var(--cream-light); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: all 120ms ease; }
    .btn:hover { background: var(--sage-main); color: var(--bg-carbon); }
    .btn-primary { background: var(--sage-main); color: var(--bg-carbon); border-color: var(--cream-light); }
    .btn-primary:hover { background: var(--cream-light); color: var(--bg-carbon); }
    .btn-secondary { border-color: var(--text-muted); color: var(--text-muted); }
    .btn-secondary:hover { background: var(--text-muted); color: var(--bg-carbon); }
    .btn-danger { border-color: var(--danger); color: #ff9b98; background: rgba(217, 83, 79, 0.12); }
    .btn-danger:hover { background: var(--danger); color: #fff; }
    .btn-sm { padding: 5px 10px; font-size: 11px; }

    .hazard-divider { height: 7px; background: repeating-linear-gradient(-55deg, var(--bg-petrol), var(--bg-petrol) 24px, var(--sage-main) 24px, var(--sage-main) 27px); border-bottom: 1px solid var(--sage-muted); }

    .admin-layout { display: grid; grid-template-columns: 310px 1fr; flex-grow: 1; min-height: calc(100vh - 76px); }
    @media (max-width: 960px) { .admin-layout { grid-template-columns: 1fr; } }

    /* ================= SIDEBAR ================= */
    .sidebar { background: var(--bg-panel); border-right: 1px solid var(--sage-muted); padding: 20px; display: flex; flex-direction: column; gap: 16px; }
    .sidebar-header { display: flex; justify-content: space-between; align-items: center; font-family: var(--font-mono); font-size: 12px; text-transform: uppercase; color: var(--sage-main); padding-bottom: 8px; border-bottom: 1px solid var(--sage-muted); }
    .prod-list { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; max-height: 55vh; }
    .prod-item { background: var(--bg-input); border: 1px solid var(--sage-muted); padding: 12px; border-radius: 2px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: all 120ms ease; }
    .prod-item:hover { border-color: var(--cream-light); }
    .prod-item.active { background: var(--bg-petrol); border-color: var(--sage-main); border-left: 4px solid var(--sage-main); }
    .prod-item-title { font-size: 14px; font-weight: 700; display: block; }
    .prod-item-meta { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); margin-top: 2px; }
    .prod-item-price { font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: var(--sage-main); }

    .bulk-box { margin-top: auto; background: var(--bg-input); border: 1px solid var(--sage-muted); padding: 14px; border-radius: 2px; }
    .bulk-title { font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; color: var(--sage-main); margin-bottom: 8px; display: block; }

    /* ================= MAIN EDITOR ================= */
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
    input:focus, select:focus, textarea:focus { outline: none; border-color: var(--sage-main); }

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

  <!-- PANTALLA DE LOGIN -->
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
    <div class="brand-wrap">
      <div>
        <span class="brand-sub">PANEL DE TALLER // SUPABASE</span>
        <span class="brand-main">Acero y Escamas · Admin</span>
      </div>
    </div>

    <div class="top-actions">
      <a id="btnPreviewProduct" href="#" target="_blank" class="btn">👁️ Ver en Tienda</a>
      <button type="button" class="btn btn-primary" id="btnSaveSupabase">💾 Publicar Cambios en Vivo</button>
      <button type="button" class="btn btn-danger" id="btnLogout" style="padding: 5px 8px; font-size:10px">SALIR</button>
    </div>
  </header>
  <div class="hazard-divider"></div>

  <div class="admin-layout" id="mainAdmin" style="visibility: hidden;">
    <!-- BARRA LATERAL -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <span>Catálogo Supabase (<span id="countProds">0</span>)</span>
        <button type="button" class="btn btn-sm btn-primary" id="btnNewProd">+ Nuevo</button>
      </div>

      <div class="prod-list" id="prodList"></div>

      <div class="bulk-box">
        <span class="bulk-title">⚡ Ajuste Masivo de Precios</span>
        <p style="font-size: 11px; color: var(--text-muted); margin-bottom: 8px;">Aumenta o reduce todos los precios en un %.</p>
        <div style="display: flex; gap: 8px;">
          <input type="number" id="bulkPercent" placeholder="Ej: 10" step="1" style="width: 90px;">
          <button type="button" class="btn btn-sm" id="btnApplyBulk" style="flex-grow: 1; justify-content: center;">Aplicar %</button>
        </div>
      </div>
    </aside>

    <!-- ÁREA DE EDICIÓN -->
    <main class="editor-area" id="editorArea">
      <!-- 1. DATOS GENERALES -->
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
            <label>Link de Pago (Opcional)</label>
            <input type="text" id="inpMpLink" class="mono-input">
          </div>
        </div>
      </section>

      <!-- 2. MODELO 3D Y FOTOS -->
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
                <label>Fotos Reales</label>
                <button type="button" class="btn btn-sm" id="btnAddPhoto">+ Agregar</button>
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

      <!-- 3. MADERAS -->
      <section class="editor-card">
        <div class="card-header">
          <span class="card-title">3. Maderas</span>
          <button type="button" class="btn btn-sm" id="btnAddWood">+ Agregar</button>
        </div>
        <div class="dynamic-list" id="woodsList"></div>
      </section>

      <!-- 4. EXTRAS -->
      <section class="editor-card">
        <div class="card-header">
          <span class="card-title">4. Extras</span>
          <button type="button" class="btn btn-sm" id="btnAddExtra">+ Agregar</button>
        </div>
        <div style="margin-bottom: 14px; display: flex; align-items: center; gap: 10px;">
          <input type="checkbox" id="chkPermitirNota" style="width: 18px; height: 18px; accent-color: var(--sage-main);">
          <label for="chkPermitirNota" style="color: var(--cream-light); font-size: 12px;">Permitir notas a medida</label>
        </div>
        <div class="dynamic-list" id="extrasList"></div>
      </section>

      <!-- 5. TONOS Y METAL -->
      <section class="editor-card">
        <div class="card-header">
          <span class="card-title">5. Tonos y Metales</span>
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
    // ================= CONFIGURACIÓN DE SUPABASE =================
    const SUPABASE_URL = 'TU_URL_DE_SUPABASE'; 
    const SUPABASE_ANON_KEY = 'TU_KEY_DE_SUPABASE';
    const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    let catalog = [];
    let currentIndex = 0;

    const CATEGORIAS_MAP = {
      "Hogar": ["Cocina", "Dormitorio", "Living/Comedor", "Baño", "Oficina", "Jardín/Exterior"],
      "Gym": ["Máquinas de Gym"],
      "Trailers": ["Moto", "Auto"],
      "Uso Rudo": ["Herramientas", "Máquinas Uso Rudo"]
    };

    function showToast(msg) {
      const b = document.getElementById('statusBanner');
      b.textContent = msg; b.style.display = 'block';
      clearTimeout(window._toastTimer);
      window._toastTimer = setTimeout(() => { b.style.display = 'none'; }, 3200);
    }

    function hexToRgbArray(hex) {
      const num = parseInt(hex.replace('#', ''), 16);
      return [Number((((num >> 16) & 255)/255).toFixed(2)), Number((((num >> 8) & 255)/255).toFixed(2)), Number(((num & 255)/255).toFixed(2))];
    }

    // Adaptar JSON a la tabla de Supabase[cite: 7]
    function normalizeProduct(p) {
      return {
        id: p.id || "nuevo-mueble",
        nombre: p.nombre || "Nuevo",
        sku: p.sku || "SKU",
        activo: p.activo !== false,
        categoria: p.categoria || "Hogar",
        subcategoria: p.subcategoria || "Living/Comedor",
        precio_base: Number(p.precio_base || p.precioBase) || 0,
        resumen: p.resumen || "",
        imagen: p.imagen || "",
        fotos: Array.isArray(p.fotos) ? p.fotos : [],
        glb: p.glb || "",
        mp_link: p.mp_link || p.mpLink || "",
        permitir_nota_medida: p.permitir_nota_medida !== undefined ? p.permitir_nota_medida : (p.permitirNotaMedida !== false),
        maderas: Array.isArray(p.maderas) ? p.maderas : [],
        tonos_madera: Array.isArray(p.tonos_madera || p.tonosMadera) ? (p.tonos_madera || p.tonosMadera) : [],
        colores_metal: Array.isArray(p.colores_metal || p.coloresMetal) ? (p.colores_metal || p.coloresMetal) : [],
        acabados: Array.isArray(p.acabados) ? p.acabados : [],
        extras: Array.isArray(p.extras) ? p.extras : []
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
          <div><span class="prod-item-title">${p.nombre}${isHidden ? '<span style="color:var(--danger);font-size:10px;margin-left:8px">[OCULTO]</span>' : ''}</span>
          <span class="prod-item-meta">${p.sku}</span></div>
          <div class="prod-item-price">$${Number(p.precio_base).toLocaleString('es-AR')}</div>`;
        div.addEventListener('click', () => { currentIndex = idx; renderSidebar(); renderEditor(); });
        list.appendChild(div);
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

      // (Las funciones renderPhotosList, WoodsList, etc. van aquí, simplificadas por espacio, actualizan catalog[currentIndex])
    }

    // ================= FUNCIONES DE BASE DE DATOS (SUPABASE) =================
    async function loadCatalogFromSupabase() {
      showToast("Cargando desde Supabase...");
      const { data, error } = await supabaseClient.from('productos').select('*').order('nombre');
      if (error) { alert("Error al cargar: " + error.message); return; }
      catalog = data.map(normalizeProduct);
      if(catalog.length === 0) catalog = [normalizeProduct({ id: "nuevo-01", nombre: "Primer Mueble" })];
      currentIndex = 0;
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('mainAdmin').style.visibility = 'visible';
      renderSidebar();
      renderEditor();
    }

    document.getElementById('btnLogin').addEventListener('click', async () => {
      const email = document.getElementById('loginEmail').value;
      const pass = document.getElementById('loginPassword').value;
      const errEl = document.getElementById('loginError');
      errEl.style.display = 'none';
      
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email: email, password: pass });
      if (error) { errEl.textContent = "Credenciales incorrectas."; errEl.style.display = 'block'; }
      else { loadCatalogFromSupabase(); }
    });

    document.getElementById('btnLogout').addEventListener('click', async () => {
      await supabaseClient.auth.signOut();
      window.location.reload();
    });

    document.getElementById('btnSaveSupabase').addEventListener('click', async () => {
      showToast("Guardando en la nube...");
      // Upsert: Si el ID existe lo actualiza, si no, lo crea.
      const { error } = await supabaseClient.from('productos').upsert(catalog);
      if (error) alert("Error al guardar: " + error.message);
      else showToast("✅ Cambios publicados en la tienda");
    });

    // Validar si ya está logueado al abrir la página
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
      if (session) loadCatalogFromSupabase();
    });

    // ================= EVENTOS DE EDICIÓN LOCAL =================
    document.getElementById('inpNombre').addEventListener('input', e => { catalog[currentIndex].nombre = e.target.value; renderSidebar(); });
    document.getElementById('inpId').addEventListener('input', e => { catalog[currentIndex].id = e.target.value.trim(); });
    document.getElementById('inpPrecio').addEventListener('input', e => { catalog[currentIndex].precio_base = Number(e.target.value)||0; renderSidebar(); });
    document.getElementById('btnToggleVisibility').addEventListener('click', () => { catalog[currentIndex].activo = !catalog[currentIndex].activo; renderSidebar(); renderEditor(); });
    document.getElementById('btnNewProd').addEventListener('click', () => {
      catalog.push(normalizeProduct({ id: `nuevo-${Date.now()}` }));
      currentIndex = catalog.length - 1; renderSidebar(); renderEditor();
    });
  </script>
</body>
</html>