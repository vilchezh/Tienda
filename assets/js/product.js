const h = Store.escapeHTML;
const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');
    const viewer = document.getElementById('muebleViewer');

    let BASE_PRICE = 0;
    let woodDelta = 0;
    let state = {
      woodType: "Pino con Nudos",
      woodTex: "assets/texturas/pino-con-nudos.jpg",
      woodStain: "Transparente",
      woodRgb: [0.88, 0.78, 0.64],
      metalColor: "Negro",
      metalRgb: [0.10, 0.11, 0.12],
      finish: "Mate",
      roughness: 0.75
    };
    let productData = null;
    const textureCache = {};

    async function sync3DMaterials() {
      if (!viewer.model || !viewer.model.materials) return;
      for (const mat of viewer.model.materials) {
        const name = mat.name.toLowerCase();
        if (name.includes('madera')) {
          mat.pbrMetallicRoughness.setBaseColorFactor([...state.woodRgb, 1]);
          mat.pbrMetallicRoughness.setRoughnessFactor(state.roughness);
          if (state.woodTex && mat.pbrMetallicRoughness.baseColorTexture) {
            if (!textureCache[state.woodTex]) {
              textureCache[state.woodTex] = await viewer.createTexture(state.woodTex);
            }
            mat.pbrMetallicRoughness.baseColorTexture.setTexture(textureCache[state.woodTex]);
          }
        } else if (name.includes('hierro')) {
          mat.pbrMetallicRoughness.setBaseColorFactor([...state.metalRgb, 1]);
          mat.pbrMetallicRoughness.setRoughnessFactor(Math.max(0.2, state.roughness - 0.15));
        }
      }
    }

    function reportTextureError() {
      document.getElementById('mediaStatus').textContent = 'No se pudo aplicar la textura. Podés seguir configurando la pieza.';
    }
    viewer.addEventListener('load', () => sync3DMaterials().catch(reportTextureError));

    function updateUI() {
      if (!productData) return;
      let total = BASE_PRICE + woodDelta;
      let extrasSeleccionados = [];

      document.querySelectorAll('.extra-checkbox:checked').forEach(cb => {
        total += parseInt(cb.dataset.price, 10) || 0;
        extrasSeleccionados.push(cb.dataset.name);
      });

      document.getElementById('priceDisplay').textContent = total.toLocaleString("es-AR");
      document.getElementById('labelWoodType').textContent = state.woodType;
      document.getElementById('labelWoodStain').textContent = state.woodStain;
      document.getElementById('labelMetal').textContent = `${state.metalColor} · ${state.finish}`;
      document.getElementById('labelExtras').textContent = extrasSeleccionados.length > 0 ? extrasSeleccionados.join(" + ") : "Ninguno";


      let text = `Hola *Acero y Escamas*, quiero realizar un pedido:
` +
                 `• Mueble: *${productData.nombre} (${productData.sku})*
` +
                 `• Madera: ${state.woodType} — Tono ${state.woodStain}
` +
                 `• Estructura: Metal ${state.metalColor} (${state.finish})
`;
      if (extrasSeleccionados.length > 0) {
        text += `• Extras: ${extrasSeleccionados.join(", ")}
`;
      }
      const notas = document.getElementById('customNotes').value.trim();
      if (notas) {
        text += `
*Modificación a medida solicitada:*
"${notas}"
`;
      }
      text += `
• Total estimado: $${total.toLocaleString("es-AR")} ARS`;

      Store.setContactLink(document.getElementById('btnWhatsapp'), text);
      document.getElementById('contactStatus').hidden = Boolean(Store.whatsappURL(text));
      document.querySelectorAll('.btn-opt, .swatch-btn').forEach(button => {
        if (button.tagName === 'BUTTON') button.setAttribute('aria-pressed', String(button.classList.contains('active')));
      });
      sync3DMaterials().catch(reportTextureError);
    }

    function buildDynamicOptions(prod) {
      // 1. Maderas
      const maderas = (prod.maderas || [
        { nombre: "Pino con Nudos", meta: "Veta marcada · Nudos moderados", delta: 0, tex: "assets/texturas/pino-con-nudos.jpg", activo: true },
        { nombre: "Pino Alistonado (Sin Nudos)", meta: "Alistonado limpio", delta: 12000, tex: "assets/texturas/pino-sin-nudos.jpg", activo: true },
        { nombre: "Eucalipto Macizo", meta: "Veta recta · Semidura", delta: 24000, tex: "assets/texturas/eucalipto.jpg", activo: true },
        { nombre: "Eucalipto Alistonado", meta: "Listón seleccionado", delta: 32000, tex: "assets/texturas/eucalipto-alistonado.jpg", activo: true }
      ]).filter(m => m.activo !== false);

      const gridWood = document.getElementById('gridWoodType');
      gridWood.innerHTML = '';
      maderas.forEach((m, idx) => {
        if (idx === 0) {
          state.woodType = m.nombre;
          state.woodTex = Store.assetURL(m.tex);
          woodDelta = Number(m.delta) || 0;
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-opt btn-opt-wood' + (idx === 0 ? ' active' : '');
        const deltaTxt = m.delta > 0 ? `+$${Number(m.delta).toLocaleString('es-AR')}` : (m.delta < 0 ? `-$${Math.abs(m.delta).toLocaleString('es-AR')}` : 'Base');
        btn.innerHTML = `
          <span class="wood-thumb" ></span>
          <div>
            <span class="opt-name">${h(m.nombre)}</span>
            <span class="opt-meta">${h(m.meta || deltaTxt)}</span>
          </div>
        `;
        btn.querySelector('.wood-thumb').style.backgroundImage = `url(${JSON.stringify(Store.assetURL(m.tex))})`;
        btn.addEventListener('click', () => {
          gridWood.querySelectorAll('.btn-opt').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          state.woodType = m.nombre;
          state.woodTex = Store.assetURL(m.tex);
          woodDelta = Number(m.delta) || 0;
          updateUI();
        });
        gridWood.appendChild(btn);
      });

      // 2. Tonos de madera
      const tonos = (prod.tonosMadera || [
        { nombre: "Transparente", etiqueta: "Natural", hex: "#d1b58c", rgb: [0.88, 0.78, 0.64], activo: true },
        { nombre: "Roble Claro", etiqueta: "R. Claro", hex: "#b88547", rgb: [0.72, 0.52, 0.28], activo: true },
        { nombre: "Caoba", etiqueta: "Caoba", hex: "#944f2e", rgb: [0.58, 0.31, 0.18], activo: true },
        { nombre: "Roble Oscuro", etiqueta: "R. Oscuro", hex: "#734729", rgb: [0.45, 0.28, 0.16], activo: true },
        { nombre: "Nogal", etiqueta: "Nogal", hex: "#523321", rgb: [0.32, 0.20, 0.13], activo: true },
        { nombre: "Wengue", etiqueta: "Wengue", hex: "#2e211c", rgb: [0.18, 0.13, 0.11], activo: true }
      ]).filter(t => t.activo !== false);

      const gridStain = document.getElementById('gridWoodStain');
      gridStain.innerHTML = '';
      tonos.forEach((t, idx) => {
        if (idx === 0) {
          state.woodStain = t.nombre;
          state.woodRgb = t.rgb;
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'swatch-btn' + (idx === 0 ? ' active' : '');
        btn.innerHTML = `
          <span class="swatch-color" ></span>
          <span class="swatch-label">${h(t.etiqueta || t.nombre)}</span>
        `;
        btn.querySelector('.swatch-color').style.backgroundColor = /^#[0-9a-f]{6}$/i.test(t.hex) ? t.hex : '#b88547';
        btn.title = String(t.nombre);
        btn.addEventListener('click', () => {
          gridStain.querySelectorAll('.swatch-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          state.woodStain = t.nombre;
          state.woodRgb = t.rgb;
          updateUI();
        });
        gridStain.appendChild(btn);
      });

      // 3. Colores de Metal y Acabados
      const metales = (prod.coloresMetal || [
        { nombre: "Negro", meta: "Clásico industrial", rgb: [0.10, 0.11, 0.12], activo: true },
        { nombre: "Blanco", meta: "Línea luminosa", rgb: [0.88, 0.89, 0.88], activo: true },
        { nombre: "Marrón Oscuro", meta: "Óxido / Bronce", rgb: [0.22, 0.15, 0.12], activo: true }
      ]).filter(mt => mt.activo !== false);

      const gridMetal = document.getElementById('gridMetalColor');
      gridMetal.innerHTML = '';
      metales.forEach((mt, idx) => {
        if (idx === 0) {
          state.metalColor = mt.nombre;
          state.metalRgb = mt.rgb;
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-opt' + (idx === 0 ? ' active' : '');
        btn.innerHTML = `<span class="opt-name">${h(mt.nombre)}</span><span class="opt-meta">${h(mt.meta || '')}</span>`;
        btn.addEventListener('click', () => {
          gridMetal.querySelectorAll('.btn-opt').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          state.metalColor = mt.nombre;
          state.metalRgb = mt.rgb;
          updateUI();
        });
        gridMetal.appendChild(btn);
      });

      const acabados = (prod.acabados || [
        { nombre: "Mate", meta: "Sin reflejo", rough: 0.75, activo: true },
        { nombre: "Satinado", meta: "Brillo suave", rough: 0.42, activo: true },
        { nombre: "Brillante", meta: "Alta reflexión", rough: 0.15, activo: true }
      ]).filter(a => a.activo !== false);

      const gridFin = document.getElementById('gridFinish');
      gridFin.innerHTML = '';
      acabados.forEach((ac, idx) => {
        if (idx === 0) {
          state.finish = ac.nombre;
          state.roughness = Number(ac.rough);
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-opt' + (idx === 0 ? ' active' : '');
        btn.innerHTML = `<span class="opt-name">${h(ac.nombre)}</span><span class="opt-meta">${h(ac.meta || '')}</span>`;
        btn.addEventListener('click', () => {
          gridFin.querySelectorAll('.btn-opt').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          state.finish = ac.nombre;
          state.roughness = Number(ac.rough);
          updateUI();
        });
        gridFin.appendChild(btn);
      });

      // 4. Opciones Extras y Campo a Medida
      const extras = (prod.extras || []).filter(ex => ex.activo !== false);
      const extContainer = document.getElementById('listExtrasContainer');
      extContainer.innerHTML = '';
      extras.forEach(ex => {
        const lbl = document.createElement('label');
        lbl.className = 'btn-opt';
        lbl.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 12px 16px;';
        lbl.innerHTML = `
          <div>
            <span class="opt-name">${h(ex.nombre)} (+$${Number(ex.precio).toLocaleString('es-AR')})</span>
            <span class="opt-meta">${h(ex.meta || '')}</span>
          </div>
          <input type="checkbox" class="extra-checkbox" data-name="${h(ex.nombre)}" data-price="${h(ex.precio)}" style="accent-color: var(--sage-main); width: 18px; height: 18px;">
        `;
        lbl.querySelector('input').addEventListener('change', updateUI);
        extContainer.appendChild(lbl);
      });

      document.getElementById('wrapCustomNotes').style.display = prod.permitirNotaMedida === false ? 'none' : 'block';

      // 5. Galería de Fotos Reales vs Visor 3D
      const fotosReales = Array.isArray(prod.fotos) ? prod.fotos.map(Store.assetURL).filter(Boolean) : [];
      const tabBtnPhotos = document.getElementById('tabBtnPhotos');
      const tabBtn3d = document.getElementById('tabBtn3d');
      const photoGalleryView = document.getElementById('photoGalleryView');
      const mainRealPhoto = document.getElementById('mainRealPhoto');
      const thumbsStrip = document.getElementById('thumbsStrip');

      if (fotosReales.length > 0) {
        tabBtnPhotos.style.display = 'inline-block';
        tabBtnPhotos.textContent = `📷 Fotos Reales (${fotosReales.length})`;
        mainRealPhoto.src = fotosReales[0];
        thumbsStrip.innerHTML = '';

        fotosReales.forEach((fUrl, i) => {
          const img = document.createElement('img');
          img.src = fUrl;
          img.alt = `Foto ${i + 1} de ${prod.nombre}`;
          img.tabIndex = 0;
          img.setAttribute('role', 'button');
          img.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); img.click(); } });
          img.className = 'thumb-item' + (i === 0 ? ' active' : '');
          img.addEventListener('click', () => {
            thumbsStrip.querySelectorAll('.thumb-item').forEach(t => t.classList.remove('active'));
            img.classList.add('active');
            mainRealPhoto.src = fUrl;
          });
          thumbsStrip.appendChild(img);
        });

        tabBtn3d.onclick = () => {
          tabBtn3d.classList.add('active');
          tabBtnPhotos.classList.remove('active');
          viewer.style.display = 'block';
          photoGalleryView.style.display = 'none';
          document.getElementById('hudTagMode').textContent = 'VISOR INTERACTIVO 3D';
        };

        tabBtnPhotos.onclick = () => {
          tabBtnPhotos.classList.add('active');
          tabBtn3d.classList.remove('active');
          viewer.style.display = 'none';
          photoGalleryView.style.display = 'flex';
          document.getElementById('hudTagMode').textContent = 'FOTOS REALES DE TALLER';
        };
      }
    }

    document.getElementById('customNotes').addEventListener('input', updateUI);

    async function initProductPage() {
      const errorPanel = document.getElementById('errorPanel');
      errorPanel.style.display = 'none';
      if (!productId) {
        errorPanel.style.display = 'block';
        return;
      }
      let data;
      try {
        [data] = await Store.activeProducts(Store.createClient(), productId);
      } catch {
        errorPanel.style.display = 'block';
        Store.showStatus(errorPanel, 'No pudimos cargar esta pieza. Intentá nuevamente en unos minutos.', initProductPage);
        return;
      }
      if (!data) {
        errorPanel.style.display = 'block';
        Store.showStatus(errorPanel, 'Esta pieza no está disponible en el catálogo.');
        return;
      }
      const prod = {
        ...data,
        precioBase: data.precio_base !== undefined ? data.precio_base : data.precioBase,
        tonosMadera: data.tonos_madera || data.tonosMadera,
        coloresMetal: data.colores_metal || data.coloresMetal,
        permitirNotaMedida: data.permitir_nota_medida !== undefined ? data.permitir_nota_medida : data.permitirNotaMedida
      };
      productData = prod;
      document.title = `${prod.nombre} | Acero y Escamas`;
      document.getElementById('prodTitle').textContent = prod.nombre;
      document.getElementById('prodSku').textContent = `REF: ${prod.sku}`;
      document.getElementById('prodDesc').textContent = prod.resumen;
      viewer.src = Store.assetURL(prod.glb);
      viewer.alt = `Vista 3D de ${prod.nombre}. Arrastrá para girar.`;
      if (!viewer.src) document.getElementById('mediaStatus').textContent = 'Esta pieza aún no tiene un modelo 3D disponible.';
      BASE_PRICE = Number(prod.precioBase || prod.precio_base) || 0;
      buildDynamicOptions(prod);
      document.getElementById('mainShopLayout').style.display = 'grid';
      updateUI();
    }
    viewer.addEventListener('error', () => {
      document.getElementById('mediaStatus').textContent = 'No se pudo cargar la vista 3D. Podés consultar las fotos y configurar tu pieza.';
    });
    initProductPage();
