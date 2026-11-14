const h = Store.escapeHTML;

    let supabaseClient;
    try { supabaseClient = Store.createClient(); }
    catch {
      const error = document.getElementById('loginError');
      error.textContent = 'No se pudo conectar con la tienda. Recargá la página para reintentar.';
      error.style.display = 'block';
      document.getElementById('btnLogin').disabled = true;
    }

    let catalog = [];
    let currentIndex = 0;
    let checkoutSettings = { id: 'default', commission_percent: 0, payments_enabled: false };
    let checkoutSettingsAvailable = false;

    // Mapa actualizado con Variado, Gym completo y Maquinas/Herramientas
    const CATEGORIAS_MAP = {
      "Hogar": ["Cocina", "Dormitorio", "Living/Comedor", "Baño", "Oficina", "Jardín/Exterior"],
      "Gym": ["Máquinas", "Racks y Jaulas", "Bancos", "Accesorios", "Barras y Mancuernas", "Poleas y Soportes", "Calistenia y Funcional"],
      "Trailers": ["Moto", "Auto"],
      "Variado": ["General"],
      "Maquinas/Herramientas": ["Máquinas", "Herramientas"]
    };

    const DEFAULT_WOODS = [
      { nombre: "Pino con Nudos", tex: "assets/texturas/pino-con-nudos.jpg", delta: 0, meta: "Veta marcada · Nudos moderados", activo: true },
      { nombre: "Pino Alistonado (Sin Nudos)", tex: "assets/texturas/pino-sin-nudos.jpg", delta: 12000, meta: "Alistonado limpio", activo: true },
      { nombre: "Eucalipto Macizo", tex: "assets/texturas/eucalipto.jpg", delta: 24000, meta: "Veta recta · Semidura", activo: true },
      { nombre: "Eucalipto Alistonado", tex: "assets/texturas/eucalipto-alistonado.jpg", delta: 32000, meta: "Listón seleccionado", activo: true }
    ];

    const DEFAULT_STAINS = [
      { nombre: "Transparente", etiqueta: "Natural", hex: "#d1b58c", rgb: [0.88, 0.78, 0.64], activo: true },
      { nombre: "Roble Claro", etiqueta: "R. Claro", hex: "#b88547", rgb: [0.72, 0.52, 0.28], activo: true },
      { nombre: "Caoba", etiqueta: "Caoba", hex: "#944f2e", rgb: [0.58, 0.31, 0.18], activo: true },
      { nombre: "Roble Oscuro", etiqueta: "R. Oscuro", hex: "#734729", rgb: [0.45, 0.28, 0.16], activo: true },
      { nombre: "Nogal", etiqueta: "Nogal", hex: "#523321", rgb: [0.32, 0.20, 0.13], activo: true },
      { nombre: "Wengue", etiqueta: "Wengue", hex: "#2e211c", rgb: [0.18, 0.13, 0.11], activo: true }
    ];

    const DEFAULT_METALS = [
      { nombre: "Negro", meta: "Clásico industrial", hex: "#1a1c1f", rgb: [0.10, 0.11, 0.12], activo: true },
      { nombre: "Blanco", meta: "Línea luminosa", hex: "#e0e3e0", rgb: [0.88, 0.89, 0.88], activo: true },
      { nombre: "Marrón Oscuro", meta: "Óxido / Bronce", hex: "#38261f", rgb: [0.22, 0.15, 0.12], activo: true }
    ];

    const DEFAULT_ACABADOS = [
      { nombre: "Mate", meta: "Sin reflejo", rough: 0.75, activo: true },
      { nombre: "Satinado", meta: "Brillo suave", rough: 0.42, activo: true },
      { nombre: "Brillante", meta: "Alta reflexión", rough: 0.15, activo: true }
    ];

    const DEFAULT_EXTRAS = [
      { nombre: "Regatones Regulables en Altura", precio: 12000, meta: "Nivelación antideslizante", activo: true },
      { nombre: "Ruedas Industriales con Freno", precio: 42000, meta: "Carga pesada (4 unidades)", activo: true }
    ];

    function showToast(msg) {
      const b = document.getElementById('statusBanner');
      b.textContent = msg; b.style.display = 'block';
      clearTimeout(window._toastTimer);
      window._toastTimer = setTimeout(() => { b.style.display = 'none'; }, 3800);
    }

    function hexToRgbArray(hex) {
      const clean = (hex || '#ffffff').replace('#', '');
      const num = parseInt(clean, 16) || 0;
      return [Number((((num >> 16) & 255)/255).toFixed(2)), Number((((num >> 8) & 255)/255).toFixed(2)), Number(((num & 255)/255).toFixed(2))];
    }

    function unpackSubAndPromo(rawSub) {
      const str = String(rawSub || "Living/Comedor");
      if (str.includes("||PROMO:")) {
        const [cleanSub, rest] = str.split("||PROMO:");
        const [promoTipo, oldPriceStr] = (rest || "").split("||OLD:");
        return {
          cleanSub: cleanSub || "General",
          enPromo: true,
          promoTipo: promoTipo || "Ofertas",
          precioAnterior: Number(oldPriceStr) || 0
        };
      }
      return { cleanSub: str, enPromo: false, promoTipo: "Ofertas", precioAnterior: 0 };
    }

    function packSubAndPromo(cleanSub, enPromo, promoTipo, precioAnterior) {
      const base = cleanSub || "General";
      if (!enPromo) return base;
      const oldPart = Number(precioAnterior) > 0 ? `||OLD:${Number(precioAnterior)}` : "";
      return `${base}||PROMO:${promoTipo || "Ofertas"}${oldPart}`;
    }

    function normalizeAcabados(list) {
      if (!Array.isArray(list) || list.length === 0) return JSON.parse(JSON.stringify(DEFAULT_ACABADOS));
      const hasSatinado = list.some(a => (a.nombre || '').toLowerCase().includes('satinado'));
      return hasSatinado ? list : JSON.parse(JSON.stringify(DEFAULT_ACABADOS));
    }

    function normalizeWoods(list) {
      const woods = (Array.isArray(list) && list.length) ? JSON.parse(JSON.stringify(list)) : JSON.parse(JSON.stringify(DEFAULT_WOODS));
      woods.forEach(w => {
        if (!w.tex || w.tex === "assets/texturas/alistonado.jpg") {
          const n = (w.nombre || "").toLowerCase();
          if (n.includes("sin nudo")) w.tex = "assets/texturas/pino-sin-nudos.jpg";
          else if (n.includes("eucalipto") && n.includes("alistonado")) w.tex = "assets/texturas/eucalipto-alistonado.jpg";
          else if (n.includes("eucalipto")) w.tex = "assets/texturas/eucalipto.jpg";
          else if (n.includes("alistonado")) w.tex = "assets/texturas/eucalipto-alistonado.jpg";
          else w.tex = "assets/texturas/pino-con-nudos.jpg";
        }
      });
      return woods;
    }

    function normalizeProduct(p) {
      const refProd = catalog[0];
      const baseMetals = refProd && Array.isArray(refProd.colores_metal) && refProd.colores_metal.length
        ? JSON.parse(JSON.stringify(refProd.colores_metal))
        : JSON.parse(JSON.stringify(DEFAULT_METALS));
      const baseStains = refProd && Array.isArray(refProd.tonos_madera) && refProd.tonos_madera.length
        ? JSON.parse(JSON.stringify(refProd.tonos_madera))
        : JSON.parse(JSON.stringify(DEFAULT_STAINS));

      let cat = p.categoria || "Hogar";
      if (cat === "Uso Rudo") cat = "Variado";
      if (!CATEGORIAS_MAP[cat]) cat = "Hogar";

      return {
        id: String(p.id || "mueble-" + Date.now()).trim(),
        nombre: p.nombre || "Nuevo Mueble",
        sku: p.sku || "AYE-001",
        activo: p.activo !== false,
        categoria: cat,
        subcategoria: p.subcategoria || CATEGORIAS_MAP[cat][0],
        precio_base: Number(p.precio_base !== undefined ? p.precio_base : p.precioBase) || 185000,
        resumen: p.resumen || "",
        imagen: p.imagen || "assets/img/mesa-ratona-thumb.jpg",
        fotos: Array.isArray(p.fotos) ? p.fotos : [],
        glb: p.glb || "assets/modelos/mesa-ratona-industrial-900x500x450.glb",
        mp_link: p.mp_link || p.mpLink || "",
        checkout_habilitado: p.checkout_habilitado === true,
        permitir_nota_medida: p.permitir_nota_medida !== undefined ? p.permitir_nota_medida : (p.permitirNotaMedida !== false),
        maderas: normalizeWoods(p.maderas),
        tonos_madera: Array.isArray(p.tonos_madera || p.tonosMadera) && (p.tonos_madera || p.tonosMadera).length ? (p.tonos_madera || p.tonosMadera) : baseStains,
        colores_metal: Array.isArray(p.colores_metal || p.coloresMetal) && (p.colores_metal || p.coloresMetal).length ? (p.colores_metal || p.coloresMetal) : baseMetals,
        acabados: normalizeAcabados(p.acabados),
        extras: Array.isArray(p.extras) && p.extras.length ? p.extras : JSON.parse(JSON.stringify(DEFAULT_EXTRAS))
      };
    }

    function syncGlobalMetalsFromCurrent() {
      const currentMetals = JSON.parse(JSON.stringify(catalog[currentIndex].colores_metal || []));
      catalog.forEach(item => { item.colores_metal = JSON.parse(JSON.stringify(currentMetals)); });
    }

    function syncGlobalStainsFromCurrent() {
      const currentStains = JSON.parse(JSON.stringify(catalog[currentIndex].tonos_madera || []));
      catalog.forEach(item => { item.tonos_madera = JSON.parse(JSON.stringify(currentStains)); });
    }

    function syncGlobalWoodStructureFromCurrent() {
      const srcWoods = catalog[currentIndex].maderas || [];
      catalog.forEach((item, idx) => {
        if (idx === currentIndex) return;
        const oldWoods = item.maderas || [];
        item.maderas = srcWoods.map((sw, i) => {
          const match = oldWoods[i] || oldWoods.find(ow => ow.nombre === sw.nombre);
          return {
            nombre: sw.nombre,
            tex: sw.tex,
            meta: sw.meta || "",
            activo: sw.activo !== false,
            delta: match && typeof match.delta === "number" ? match.delta : (sw.delta || 0)
          };
        });
      });
    }

    function populateSubcategorias(cat, selectedCleanSub) {
      const sel = document.getElementById('selSubcategoria');
      sel.innerHTML = '';
      (CATEGORIAS_MAP[cat] || ["General"]).forEach(s => {
        const opt = document.createElement('option');
        opt.value = s; opt.textContent = s;
        if (s === selectedCleanSub) opt.selected = true;
        sel.appendChild(opt);
      });
    }

    function updateCurrentSubAndPromo() {
      const p = catalog[currentIndex];
      if (!p) return;
      const cleanSub = document.getElementById('selSubcategoria').value;
      const enPromo = document.getElementById('chkEnPromo').checked;
      const promoTipo = document.getElementById('selPromoSub').value;
      const precioAnterior = document.getElementById('inpPrecioAnterior').value;
      p.subcategoria = packSubAndPromo(cleanSub, enPromo, promoTipo, precioAnterior);
      renderSidebar();
    }

    function renderSidebar() {
      const list = document.getElementById('prodList');
      document.getElementById('countProds').textContent = catalog.length;
      list.innerHTML = '';
      catalog.forEach((p, idx) => {
        const isHidden = !p.activo;
        const { enPromo, promoTipo } = unpackSubAndPromo(p.subcategoria);
        const div = document.createElement('button');
        div.type = 'button';
        div.className = 'prod-item' + (idx === currentIndex ? ' active' : '');
        div.style.cssText = isHidden ? 'opacity: 0.55; border-style: dashed;' : '';
        div.innerHTML = `
          <div>
            <span class="prod-item-title">
              ${h(p.nombre)}
              ${enPromo ? `<span style="color:#ffb366;font-size:10px;margin-left:4px">[🔥 ${h(promoTipo)}]</span>` : ''}
              ${isHidden ? '<span style="color:var(--danger);font-size:10px;margin-left:4px">[OCULTO]</span>' : ''}
            </span>
            <span class="prod-item-meta">${h(p.sku)} · ${h(p.categoria)}</span>
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
          <input type="text" class="mono-input" value="${h(url)}" placeholder="assets/fotos/foto1.jpg">
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
          <input type="text" value="${h(w.nombre)}" placeholder="Nombre madera">
          <input type="text" class="mono-input" value="${h(w.tex || '')}" placeholder="Ruta textura .jpg">
          <input type="number" value="${h(w.delta || 0)}" step="500" placeholder="Recargo $">
          <button type="button" class="btn btn-sm btn-danger">✕</button>`;
        const inputs = row.querySelectorAll('input');
        inputs[0].addEventListener('change', e => { w.activo = e.target.checked; syncGlobalWoodStructureFromCurrent(); });
        inputs[1].addEventListener('input', e => { w.nombre = e.target.value; syncGlobalWoodStructureFromCurrent(); });
        inputs[2].addEventListener('input', e => { w.tex = e.target.value; syncGlobalWoodStructureFromCurrent(); });
        inputs[3].addEventListener('input', e => { w.delta = Number(e.target.value) || 0; });
        row.querySelector('button').addEventListener('click', () => {
          p.maderas.splice(i, 1);
          syncGlobalWoodStructureFromCurrent();
          renderWoodsList(p);
        });
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
          <input type="text" value="${h(ex.nombre)}" placeholder="Nombre del extra">
          <input type="text" value="${h(ex.meta || '')}" placeholder="Descripción corta">
          <input type="number" value="${h(ex.precio || 0)}" step="500" placeholder="Precio $">
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
          <input type="color" value="${h(st.hex || '#b88449')}" style="width:32px;height:28px;border:none;background:none;cursor:pointer;">
          <input type="text" value="${h(st.nombre)}" placeholder="Nombre tono">
          <input type="text" value="${h(st.etiqueta || st.nombre)}" placeholder="Etiqueta corta">
          <button type="button" class="btn btn-sm btn-danger">✕</button>`;
        const inputs = row.querySelectorAll('input');
        inputs[0].addEventListener('change', e => { st.activo = e.target.checked; syncGlobalStainsFromCurrent(); });
        inputs[1].addEventListener('input', e => { st.hex = e.target.value; st.rgb = hexToRgbArray(e.target.value); syncGlobalStainsFromCurrent(); });
        inputs[2].addEventListener('input', e => { st.nombre = e.target.value; syncGlobalStainsFromCurrent(); });
        inputs[3].addEventListener('input', e => { st.etiqueta = e.target.value; syncGlobalStainsFromCurrent(); });
        row.querySelector('button').addEventListener('click', () => {
          p.tonos_madera.splice(i, 1);
          syncGlobalStainsFromCurrent();
          renderStainsList(p);
        });
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
          <input type="color" value="${h(mt.hex || '#1a1c1e')}" style="width:32px;height:28px;border:none;background:none;cursor:pointer;">
          <input type="text" value="${h(mt.nombre)}" placeholder="Color metal">
          <input type="text" value="${h(mt.meta || '')}" placeholder="Descripción">
          <button type="button" class="btn btn-sm btn-danger">✕</button>`;
        const inputs = row.querySelectorAll('input');
        inputs[0].addEventListener('change', e => { mt.activo = e.target.checked; syncGlobalMetalsFromCurrent(); });
        inputs[1].addEventListener('input', e => { mt.hex = e.target.value; mt.rgb = hexToRgbArray(e.target.value); syncGlobalMetalsFromCurrent(); });
        inputs[2].addEventListener('input', e => { mt.nombre = e.target.value; syncGlobalMetalsFromCurrent(); });
        inputs[3].addEventListener('input', e => { mt.meta = e.target.value; syncGlobalMetalsFromCurrent(); });
        row.querySelector('button').addEventListener('click', () => {
          p.colores_metal.splice(i, 1);
          syncGlobalMetalsFromCurrent();
          renderMetalsList(p);
        });
        box.appendChild(row);
      });
    }

    function renderEditor() {
      const p = catalog[currentIndex];
      document.querySelector('.editor-area').hidden = !p;
      document.getElementById('btnPreviewProduct').hidden = !p;
      if (!p) return;

      const btnToggle = document.getElementById('btnToggleVisibility');
      if (!p.activo) {
        btnToggle.innerHTML = '👁️ Mostrar en Catálogo'; btnToggle.className = 'btn btn-sm btn-primary';
      } else {
        btnToggle.innerHTML = '🚫 Ocultar Mueble'; btnToggle.className = 'btn btn-sm btn-secondary';
      }

      // Obtenemos los datos incluyendo el precio anterior
      const { cleanSub, enPromo, promoTipo, precioAnterior } = unpackSubAndPromo(p.subcategoria);

      document.getElementById('inpNombre').value = p.nombre;
      document.getElementById('inpId').value = p.id;
      document.getElementById('inpSku').value = p.sku;
      document.getElementById('inpPrecio').value = p.precio_base;
      document.getElementById('selCategoria').value = CATEGORIAS_MAP[p.categoria] ? p.categoria : "Hogar";
      populateSubcategorias(document.getElementById('selCategoria').value, cleanSub);

      // Cargamos el estado de promoción y el precio tachado
      document.getElementById('chkEnPromo').checked = enPromo;
      document.getElementById('selPromoSub').value = promoTipo;
      document.getElementById('inpPrecioAnterior').value = precioAnterior || '';

      document.getElementById('inpResumen').value = p.resumen;
      document.getElementById('inpMpLink').value = p.mp_link;
      document.getElementById('chkProductCheckout').checked = p.checkout_habilitado;
      document.getElementById('inpGlb').value = p.glb;
      document.getElementById('inpImagen').value = p.imagen;
      document.getElementById('chkPermitirNota').checked = p.permitir_nota_medida;
      document.getElementById('adminViewer').src = Store.assetURL(p.glb);
      document.getElementById('btnPreviewProduct').href = `producto.html?id=${encodeURIComponent(p.id)}`;

      renderPhotosList(p);
      renderWoodsList(p);
      renderExtrasList(p);
      renderStainsList(p);
      renderMetalsList(p);
    }

    function renderCheckoutSettings() {
      const commission = document.getElementById('inpCheckoutCommission');
      const enabled = document.getElementById('chkCheckoutEnabled');
      const status = document.getElementById('checkoutAdminStatus');
      commission.disabled = !checkoutSettingsAvailable;
      enabled.disabled = !checkoutSettingsAvailable;
      commission.value = checkoutSettings.commission_percent;
      enabled.checked = checkoutSettings.payments_enabled;
      status.textContent = checkoutSettingsAvailable
        ? 'Configuración lista. Solo usa MP_ACCESS_TOKEN_TEST; no habilita credenciales reales.'
        : 'Checkout permanece deshabilitado hasta aplicar la migración en un entorno autorizado.';
    }

    async function loadCheckoutSettings() {
      const { data, error } = await supabaseClient
        .from('checkout_settings')
        .select('id,commission_percent,payments_enabled')
        .eq('id', 'default')
        .maybeSingle()
        .abortSignal(AbortSignal.timeout(8000));
      checkoutSettingsAvailable = !error && Boolean(data);
      if (checkoutSettingsAvailable) {
        checkoutSettings = {
          id: 'default',
          commission_percent: Number(data.commission_percent) || 0,
          payments_enabled: data.payments_enabled === true,
        };
      }
      renderCheckoutSettings();
    }

    let importInProgress = false;
    async function importFromLocalJsonToSupabase() {
      if (importInProgress) return;
      importInProgress = true;
      const button = document.getElementById('btnImportJson');
      button.disabled = true;
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('Iniciá sesión antes de importar.');
        const res = await fetch('productos.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('No se encontró productos.json.');
        const raw = await res.json();
        if (!Array.isArray(raw) || !raw.length || raw.some(p => !p || typeof p.id !== 'string' || !p.id.trim() || typeof p.nombre !== 'string')) {
          throw new Error('El respaldo no es un catálogo válido.');
        }
        const ids = raw.map(p => p.id.trim());
        if (new Set(ids).size !== ids.length) throw new Error('El respaldo contiene IDs duplicados.');
        const { data: existing, error: readError } = await supabaseClient.from('productos').select('id').abortSignal(AbortSignal.timeout(8000));
        if (readError) throw readError;
        const existingIds = new Set(existing.map(p => p.id));
        const pending = raw.filter(p => !existingIds.has(p.id.trim())).map(p => ({ ...normalizeProduct(p), activo: false }));
        if (!pending.length) { showToast('No hay IDs nuevos para importar. No se modificó el catálogo.'); return; }
        const names = pending.map(p => `• ${p.nombre} (${p.id})`).join('\n');
        if (prompt(`Se agregarán ${pending.length} piezas OCULTAS para revisar:\n${names}\n\nLos IDs existentes se omiten. Puede incluir piezas eliminadas del respaldo.\nGuardá tus cambios antes de continuar: se recargará el editor.\nEscribí IMPORTAR para continuar.`) !== 'IMPORTAR') return;
        // INSERT fails atomically on any duplicate, including concurrent additions. Never upsert a backup.
        const { error } = await supabaseClient.from('productos').insert(pending);
        if (error) throw error;
        await loadCatalogFromSupabase();
        showToast('Importación completada. Las piezas nuevas siguen ocultas hasta que las publiques.');
      } catch (error) {
        alert('No se importó el respaldo: ' + error.message);
      } finally {
        importInProgress = false;
        button.disabled = false;
      }
    }

    async function loadCatalogFromSupabase() {
      showToast("Conectando con Supabase...");
      const { data, error } = await supabaseClient.from('productos').select('*').order('nombre').abortSignal(AbortSignal.timeout(8000));
      if (error) { alert("Error al leer Supabase: " + error.message); return; }

      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('mainAdmin').style.visibility = 'visible';
      await loadCheckoutSettings();

      if (!data || data.length === 0) {
        catalog = [];
        currentIndex = 0;
        renderSidebar();
        renderEditor();
        showToast('El catálogo está vacío. Creá una pieza o importá un respaldo manualmente.');
        return;
      }

      catalog = data.map(normalizeProduct);

      const richestMetals = catalog.reduce((best, item) =>
        (item.colores_metal && item.colores_metal.length > best.length) ? item.colores_metal : best
      , DEFAULT_METALS);
      catalog.forEach(item => {
        item.colores_metal = JSON.parse(JSON.stringify(richestMetals));
      });

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
      await importFromLocalJsonToSupabase();
    });

    document.getElementById('btnSaveSupabase').addEventListener('click', async () => {
      if (!catalog.length) { showToast('No hay piezas para publicar.'); return; }
      if (new Set(catalog.map(p => p.id)).size !== catalog.length) { alert('Hay IDs duplicados. Corregilos antes de publicar.'); return; }
      showToast("Publicando en Supabase...");
      const { error } = await supabaseClient.from('productos').upsert(catalog);
      if (error) { alert("Error al guardar en Supabase: " + error.message); return; }
      if (checkoutSettingsAvailable) {
        const { error: settingsError } = await supabaseClient
          .from('checkout_settings')
          .update({
            commission_percent: checkoutSettings.commission_percent,
            payments_enabled: checkoutSettings.payments_enabled,
            updated_at: new Date().toISOString(),
          })
          .eq('id', 'default');
        if (settingsError) { alert('Los productos se guardaron, pero no la configuración de checkout: ' + settingsError.message); return; }
      }
      showToast("✅ ¡Cambios publicados en vivo en la tienda!");
    });

    if (supabaseClient) supabaseClient.auth.getSession().then(({ data: { session } }) => {
      if (session) loadCatalogFromSupabase();
    }).catch(() => showToast('No se pudo recuperar la sesión. Volvé a iniciar sesión.'));

    document.getElementById('inpNombre').addEventListener('input', e => { catalog[currentIndex].nombre = e.target.value; renderSidebar(); });
    document.getElementById('inpId').addEventListener('input', e => {
      catalog[currentIndex].id = e.target.value.trim();
      document.getElementById('btnPreviewProduct').href = `producto.html?id=${encodeURIComponent(catalog[currentIndex].id)}`;
    });
    document.getElementById('inpSku').addEventListener('input', e => { catalog[currentIndex].sku = e.target.value; renderSidebar(); });
    document.getElementById('inpPrecio').addEventListener('input', e => { catalog[currentIndex].precio_base = Number(e.target.value) || 0; renderSidebar(); });
    document.getElementById('selCategoria').addEventListener('change', e => {
      catalog[currentIndex].categoria = e.target.value;
      populateSubcategorias(e.target.value, "");
      updateCurrentSubAndPromo();
    });
    document.getElementById('selSubcategoria').addEventListener('change', updateCurrentSubAndPromo);
    document.getElementById('chkEnPromo').addEventListener('change', updateCurrentSubAndPromo);
    document.getElementById('selPromoSub').addEventListener('change', updateCurrentSubAndPromo);
    document.getElementById('inpPrecioAnterior').addEventListener('input', updateCurrentSubAndPromo);
    document.getElementById('inpResumen').addEventListener('input', e => { catalog[currentIndex].resumen = e.target.value; });
    document.getElementById('inpMpLink').addEventListener('input', e => { catalog[currentIndex].mp_link = e.target.value.trim(); });
    document.getElementById('chkProductCheckout').addEventListener('change', e => { catalog[currentIndex].checkout_habilitado = e.target.checked; });
    document.getElementById('inpCheckoutCommission').addEventListener('input', e => {
      const value = Number(e.target.value);
      checkoutSettings.commission_percent = Number.isFinite(value) ? Math.min(50, Math.max(0, value)) : 0;
    });
    document.getElementById('chkCheckoutEnabled').addEventListener('change', e => { checkoutSettings.payments_enabled = e.target.checked; });
    document.getElementById('inpGlb').addEventListener('input', e => {
      catalog[currentIndex].glb = e.target.value.trim();
      document.getElementById('adminViewer').src = Store.assetURL(catalog[currentIndex].glb);
    });
    document.getElementById('inpImagen').addEventListener('input', e => { catalog[currentIndex].imagen = e.target.value.trim(); });
    document.getElementById('chkPermitirNota').addEventListener('change', e => { catalog[currentIndex].permitir_nota_medida = e.target.checked; });

    document.getElementById('btnToggleVisibility').addEventListener('click', () => {
      catalog[currentIndex].activo = !catalog[currentIndex].activo;
      renderSidebar(); renderEditor();
      showToast(catalog[currentIndex].activo ? "👁️ Mueble visible (tocá Publicar)" : "🚫 Mueble oculto (tocá Publicar)");
    });

    document.getElementById('btnNewProd').addEventListener('click', () => {
      const nuevo = normalizeProduct({ id: "mueble-" + crypto.randomUUID(), nombre: "Nuevo Mueble Industrial", sku: "AYE-NEW" });
      catalog.push(nuevo);
      currentIndex = catalog.length - 1;
      renderSidebar(); renderEditor();
      showToast("✨ Mueble creado.");
    });

    document.getElementById('btnDuplicateProd').addEventListener('click', () => {
      const copy = JSON.parse(JSON.stringify(catalog[currentIndex]));
      copy.id = "mueble-" + crypto.randomUUID();
      copy.nombre = copy.nombre + " (Copia)";
      catalog.push(copy);
      currentIndex = catalog.length - 1;
      renderSidebar(); renderEditor();
    });

    document.getElementById('btnDeleteProd').addEventListener('click', async () => {
      if (catalog.length <= 1) { alert("Debe quedar al menos 1 producto."); return; }
      const p = catalog[currentIndex];
      if (!confirm(`¿Eliminar definitivamente "${p.nombre}" de Supabase?`)) return;
      const { error } = await supabaseClient.from('productos').delete().eq('id', p.id);
      if (error) { alert('No se pudo eliminar la pieza: ' + error.message); return; }
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
      syncGlobalWoodStructureFromCurrent();
      renderWoodsList(catalog[currentIndex]);
    });
    document.getElementById('btnAddExtra').addEventListener('click', () => {
      catalog[currentIndex].extras.push({ nombre: "Nuevo Extra", meta: "Detalle adicional", precio: 8000, activo: true });
      renderExtrasList(catalog[currentIndex]);
    });
    document.getElementById('btnAddStain').addEventListener('click', () => {
      catalog[currentIndex].tonos_madera.push({ nombre: "Nuevo Tono", etiqueta: "Nuevo", hex: "#8c6239", rgb: [0.55, 0.38, 0.22], activo: true });
      syncGlobalStainsFromCurrent();
      renderStainsList(catalog[currentIndex]);
    });
    document.getElementById('btnAddMetal').addEventListener('click', () => {
      catalog[currentIndex].colores_metal.push({ nombre: "Nuevo Metal", meta: "Epoxi", hex: "#333333", rgb: [0.2, 0.2, 0.2], activo: true });
      syncGlobalMetalsFromCurrent();
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

    // ================= INYECTOR AUTOMÁTICO DE TEXTURAS DE MADERA Y UVS PARA ARCHIVOS .GLB =================
    const WHITE_PNG_4X4 = new Uint8Array([
      137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,4,0,0,0,4,8,2,0,0,0,38,147,9,41,
      0,0,0,20,73,68,65,84,120,156,99,252,255,255,63,3,12,48,49,32,1,220,28,0,150,110,3,5,
      242,37,190,249,0,0,0,0,73,69,78,68,174,66,96,130,0,0,0
    ]);

    function patchGlbBufferForWoodTextures(arrayBuffer) {
      const dv = new DataView(arrayBuffer);
      const magic = dv.getUint32(0, true);
      const version = dv.getUint32(4, true);
      if (magic !== 0x46546C67) return arrayBuffer;

      const jsonLen = dv.getUint32(12, true);
      const jsonStr = new TextDecoder().decode(new Uint8Array(arrayBuffer, 20, jsonLen));
      const gltf = JSON.parse(jsonStr);

      const binHeaderOffset = 20 + jsonLen;
      const binLen = dv.getUint32(binHeaderOffset, true);
      const oldBin = new Uint8Array(arrayBuffer, binHeaderOffset + 8, binLen);

      if (Array.isArray(gltf.materials) && gltf.materials.length > 0) {
        gltf.materials[0].name = "madera";
        gltf.materials[0].doubleSided = true;
        if (!gltf.materials[0].pbrMetallicRoughness) gltf.materials[0].pbrMetallicRoughness = {};
        if (gltf.materials[1]) {
          gltf.materials[1].name = "hierro";
          gltf.materials[1].doubleSided = true;
        }
      }

      const posAcc = gltf.accessors && gltf.accessors[0];
      const normAcc = gltf.accessors && gltf.accessors[1];
      if (!posAcc || !normAcc) return arrayBuffer;

      const posBv = gltf.bufferViews[posAcc.bufferView];
      const normBv = gltf.bufferViews[normAcc.bufferView];
      const count = posAcc.count;

      const posSlice = oldBin.slice(posBv.byteOffset || 0, (posBv.byteOffset || 0) + count * 12);
      const normSlice = oldBin.slice(normBv.byteOffset || 0, (normBv.byteOffset || 0) + count * 12);
      const positions = new Float32Array(posSlice.buffer, posSlice.byteOffset, count * 3);
      const normals = new Float32Array(normSlice.buffer, normSlice.byteOffset, count * 3);

      const uvs = new Float32Array(count * 2);
      for (let i = 0; i < count; i++) {
        const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
        const nx = Math.abs(normals[i * 3]), ny = Math.abs(normals[i * 3 + 1]), nz = Math.abs(normals[i * 3 + 2]);
        if (ny >= nx && ny >= nz) {
          uvs[i * 2] = (z + 0.25) * 1.8;
          uvs[i * 2 + 1] = (x + 0.45) * 1.1;
        } else if (nx >= ny && nx >= nz) {
          uvs[i * 2] = (z + 0.25) * 1.8;
          uvs[i * 2 + 1] = y * 1.8;
        } else {
          uvs[i * 2] = (x + 0.45) * 1.1;
          uvs[i * 2 + 1] = y * 1.8;
        }
      }
      const uvBytes = new Uint8Array(uvs.buffer);

      const oldBinPad = (4 - (oldBin.byteLength % 4)) % 4;
      const uvOffset = oldBin.byteLength + oldBinPad;
      const pngOffset = uvOffset + uvBytes.byteLength;
      const totalBinLen = pngOffset + WHITE_PNG_4X4.byteLength;

      const newBin = new Uint8Array(totalBinLen);
      newBin.set(oldBin, 0);
      newBin.set(uvBytes, uvOffset);
      newBin.set(WHITE_PNG_4X4, pngOffset);

      const uvBvIdx = gltf.bufferViews.length;
      gltf.bufferViews.push({ buffer: 0, byteOffset: uvOffset, byteLength: uvBytes.byteLength, target: 34962 });

      const uvAccIdx = gltf.accessors.length;
      gltf.accessors.push({ bufferView: uvBvIdx, componentType: 5126, count: count, type: "VEC2" });

      const pngBvIdx = gltf.bufferViews.length;
      gltf.bufferViews.push({ buffer: 0, byteOffset: pngOffset, byteLength: WHITE_PNG_4X4.byteLength });

      gltf.buffers[0].byteLength = newBin.byteLength;

      (gltf.meshes || []).forEach(mesh => {
        (mesh.primitives || []).forEach(prim => {
          if (!prim.attributes) prim.attributes = {};
          prim.attributes.TEXCOORD_0 = uvAccIdx;
        });
      });

      gltf.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
      gltf.images = [{ bufferView: pngBvIdx, mimeType: "image/png" }];
      gltf.textures = [{ sampler: 0, source: 0 }];
      if (gltf.materials && gltf.materials[0]) {
        gltf.materials[0].pbrMetallicRoughness.baseColorTexture = { index: 0 };
      }

      const newJsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
      const jsonPad = (4 - (newJsonBytes.byteLength % 4)) % 4;
      const binPad = (4 - (newBin.byteLength % 4)) % 4;

      const totalOutLen = 12 + 8 + newJsonBytes.byteLength + jsonPad + 8 + newBin.byteLength + binPad;
      const outBuf = new ArrayBuffer(totalOutLen);
      const outDv = new DataView(outBuf);
      const outU8 = new Uint8Array(outBuf);

      outDv.setUint32(0, magic, true);
      outDv.setUint32(4, version, true);
      outDv.setUint32(8, totalOutLen, true);
      outDv.setUint32(12, newJsonBytes.byteLength + jsonPad, true);
      outDv.setUint32(16, 0x4E4F534A, true);
      outU8.set(newJsonBytes, 20);
      for (let i = 0; i < jsonPad; i++) outU8[20 + newJsonBytes.byteLength + i] = 0x20;

      const bStart = 20 + newJsonBytes.byteLength + jsonPad;
      outDv.setUint32(bStart, newBin.byteLength + binPad, true);
      outDv.setUint32(bStart + 4, 0x004E4942, true);
      outU8.set(newBin, bStart + 8);

      return outBuf;
    }

    async function uploadToSupabase(file, folder) {
      let uploadBlob = file;
      if (file.name && file.name.toLowerCase().endsWith('.glb')) {
        try {
          showToast("🪄 Inyectando coordenadas de textura de madera al .GLB...");
          const rawBuf = await file.arrayBuffer();
          const patchedBuf = patchGlbBufferForWoodTextures(rawBuf);
          uploadBlob = new Blob([patchedBuf], { type: 'model/gltf-binary' });
        } catch (err) {
          console.warn("No se pudo parchar el GLB, subiendo original:", err);
        }
      }

      showToast("⏳ Subiendo " + file.name + "...");
      const cleanName = Date.now() + "-" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${folder}/${cleanName}`;

      const { error } = await supabaseClient.storage
        .from('tienda')
        .upload(filePath, uploadBlob, { upsert: true, contentType: file.name.endsWith('.glb') ? 'model/gltf-binary' : file.type });

      if (error) {
        alert("Error al subir archivo: " + error.message);
        return null;
      }

      const { data } = supabaseClient.storage.from('tienda').getPublicUrl(filePath);
      showToast("✅ Archivo subido. Tocá 'Publicar Cambios en Vivo'.");
      return data.publicUrl;
    }

    document.getElementById('btnRepairGlb').addEventListener('click', async () => {
      const currentUrl = document.getElementById('inpGlb').value.trim();
      if (!currentUrl) { alert("No hay ningún archivo .GLB cargado en este mueble."); return; }
      try {
        showToast("⏳ Descargando y reparando texturas del .GLB actual...");
        const safeURL = Store.assetURL(currentUrl);
        if (!safeURL) throw new Error('La URL del modelo no es válida.');
        const res = await fetch(safeURL);
        if (!res.ok) throw new Error("No se pudo leer el archivo .GLB actual");
        const buf = await res.arrayBuffer();
        const patched = patchGlbBufferForWoodTextures(buf);
        const fakeFile = new File([patched], (catalog[currentIndex].id || "modelo") + "-uv.glb", { type: "model/gltf-binary" });
        const newUrl = await uploadToSupabase(fakeFile, "modelos");
        if (newUrl) {
          document.getElementById('inpGlb').value = newUrl;
          catalog[currentIndex].glb = newUrl;
          document.getElementById('adminViewer').src = newUrl;
          showToast("✅ ¡Textura 3D reparada! Ahora tocá 'Publicar Cambios en Vivo'.");
        }
      } catch (e) {
        alert("Error al reparar el .GLB: " + e.message);
      }
    });

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

    enhanceInputs();
    const obs = new MutationObserver(enhanceInputs);
    ["photosList", "woodsList"].forEach(id => {
      const el = document.getElementById(id);
      if (el) obs.observe(el, { childList: true, subtree: true });
    });
