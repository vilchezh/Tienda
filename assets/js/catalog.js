
    const h = Store.escapeHTML;

    const formatoPeso = new Intl.NumberFormat('es-AR', { style: 'decimal' });
    const grid = document.getElementById('catalogoGrid');
    const promoSection = document.getElementById('promoSection');
    const promoGrid = document.getElementById('promoGrid');
    const promoSubtitle = document.getElementById('promoSubtitle');
    const sectionTitle = document.getElementById('sectionTitle');
    const catPillsContainer = document.getElementById('catPillsContainer');

    // Mapa de Categorías y Subcategorías (Variado no tiene desplegable)
    const CATEGORIAS_MENU = [
      {
        nombre: "Hogar",
        subs: ["Cocina", "Dormitorio", "Living/Comedor", "Baño", "Oficina", "Jardín/Exterior"]
      },
      {
        nombre: "Gym",
        subs: ["Máquinas", "Racks y Jaulas", "Bancos", "Accesorios", "Barras y Mancuernas", "Poleas y Soportes", "Calistenia y Funcional"]
      },
      {
        nombre: "Trailers",
        subs: ["Moto", "Auto"]
      },
      {
        nombre: "Variado",
        subs: [] // Sin subcategorías (filtro directo)
      },
      {
        nombre: "Maquinas/Herramientas",
        subs: ["Máquinas", "Herramientas"]
      },
      {
        nombre: "Promoción",
        isPromo: true,
        subs: ["Ofertas", "Combos", "Liquidación"]
      }
    ];

    let allProducts = [];
    let catalogUnavailable = false;
    let activeCat = null;
    let activeSub = null;

    // Extrae la subcategoría real y si el producto tiene Promoción combinada
    function parseProductMeta(prod) {
      const rawSub = String(prod.subcategoria || "");
      let cleanSub = rawSub;
      let enPromo = false;
      let promoTipo = "Ofertas";
      let precioAnterior = 0;

      if (rawSub.includes("||PROMO:")) {
        const [subPart, rest] = rawSub.split("||PROMO:");
        const [tipoPart, oldPart] = (rest || "").split("||OLD:");
        cleanSub = subPart || "General";
        enPromo = true;
        promoTipo = tipoPart || "Ofertas";
        precioAnterior = Number(oldPart) || 0;
      } else if ((prod.categoria || "").toLowerCase() === "promoción" || (prod.categoria || "").toLowerCase() === "promocion") {
        enPromo = true;
        promoTipo = cleanSub || "Ofertas";
      }

      let cleanCat = prod.categoria || "Hogar";
      if (cleanCat === "Uso Rudo") cleanCat = "Variado";

      return { cleanCat, cleanSub, enPromo, promoTipo, precioAnterior };
    }

    function buildCategoriesBar() {
      catPillsContainer.innerHTML = '';

      CATEGORIAS_MENU.forEach(catObj => {
        const wrap = document.createElement('div');
        wrap.className = 'cat-item-wrap';

        const hasSubs = Array.isArray(catObj.subs) && catObj.subs.length > 0;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cat-pill' + (catObj.isPromo ? ' promo-pill' : '');
        btn.dataset.cat = catObj.nombre;
        if (hasSubs) btn.setAttribute('aria-expanded', 'false');
        btn.innerHTML = `${catObj.isPromo ? '🔥 ' : ''}${catObj.nombre}${hasSubs ? '<span class="cat-arrow" aria-hidden="true">▼</span>' : ''}`;

        if (!hasSubs) {
          // Variado: filtra directo sin abrir desplegable
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllDropdowns();
            if (activeCat === catObj.nombre && !activeSub) {
              resetFilter();
            } else {
              activeCat = catObj.nombre;
              activeSub = null;
              updateActivePillsUI();
              renderCatalogAndPromos();
            }
          });
        } else {
          // Con subcategorías: abre desplegable con animación pop
          const drop = document.createElement('div');
          drop.className = 'subcat-dropdown';
          drop.id = `category-${catPillsContainer.children.length}`;
          btn.setAttribute('aria-controls', drop.id);

          // Opción "Ver todo [Categoría]"
          const allBtn = document.createElement('button');
          allBtn.type = 'button';
          allBtn.className = 'subcat-btn ver-todo';
          allBtn.innerHTML = `<span>Ver todo ${catObj.nombre}</span><span>→</span>`;
          allBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            activeCat = catObj.nombre;
            activeSub = null;
            closeAllDropdowns();
            updateActivePillsUI();
            renderCatalogAndPromos();
          });
          drop.appendChild(allBtn);

          catObj.subs.forEach(subName => {
            const sBtn = document.createElement('button');
            sBtn.type = 'button';
            sBtn.className = 'subcat-btn';
            sBtn.textContent = subName;
            sBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              activeCat = catObj.nombre;
              activeSub = subName;
              closeAllDropdowns();
              updateActivePillsUI();
              renderCatalogAndPromos();
            });
            drop.appendChild(sBtn);
          });

          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = wrap.classList.contains('open');
            closeAllDropdowns();
            if (!isOpen) { wrap.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); }
          });

          wrap.appendChild(drop);
        }

        wrap.insertBefore(btn, wrap.firstChild);
        catPillsContainer.appendChild(wrap);
      });
    }

    function closeAllDropdowns() {
      document.querySelectorAll('.cat-item-wrap.open').forEach(w => { w.classList.remove('open'); w.querySelector('.cat-pill').setAttribute('aria-expanded', 'false'); });
    }

    document.addEventListener('click', closeAllDropdowns);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        const open = document.querySelector('.cat-item-wrap.open .cat-pill');
        closeAllDropdowns();
        if (open) open.focus();
      }
    });
    document.addEventListener('focusin', event => {
      if (!event.target.closest('.cat-item-wrap.open')) closeAllDropdowns();
    });

    function updateActivePillsUI() {
      document.querySelectorAll('.cat-pill').forEach(b => {
        b.classList.toggle('active', b.dataset.cat === activeCat);
      });
      if (!activeCat) {
        sectionTitle.textContent = 'Piezas con carácter';
      } else if (activeSub) {
        sectionTitle.textContent = `${activeCat} · ${activeSub}`;
      } else {
        sectionTitle.textContent = activeCat;
      }
    }

    function createProductCard(prod, showPromoBadge = false) {
      const meta = parseProductMeta(prod);
      const precio = prod.precio_base !== undefined ? prod.precio_base : prod.precioBase;
      const fotosArr = Array.isArray(prod.fotos) ? prod.fotos.filter(Boolean) : [];
      const miniThumbs = fotosArr.slice(0, 3);

      const card = document.createElement('a');
      card.href = `producto.html?id=${encodeURIComponent(prod.id)}`;
      card.className = 'product-card' + (showPromoBadge ? ' is-promo-card' : '');

      const thumbsHtml = miniThumbs.length
        ? `<div class="card-thumbs">
            ${miniThumbs.map(f => `
              <div class="card-thumb-item">
                <img src="${h(Store.assetURL(f))}" alt="${h(prod.nombre)}" loading="lazy">
              </div>
            `).join('')}
          </div>`
        : '';

      const promoBadgeHtml = (showPromoBadge && meta.enPromo)
        ? `<div class="badge-promo">🔥 ${h(meta.promoTipo)}</div>`
        : '';

      card.innerHTML = `
        <div class="product-img-box">
          ${promoBadgeHtml}
          ${prod.glb ? '<div class="badge-3d">Vista 3D</div>' : ''}<span class="image-placeholder">ACERO &amp; ESCAMAS<br><small>Imagen no disponible</small></span>
          ${prod.imagen ? `<img class="product-main-img" src="${h(Store.assetURL(prod.imagen))}" alt="${h(prod.nombre)}" loading="lazy">` : ''}
          ${thumbsHtml}
        </div>
        <div class="product-info">
          <span class="product-sku">REF: ${h(prod.sku)}</span>
          <h2 class="product-title">${h(prod.nombre)}</h2>
          <p class="product-desc">${h(prod.resumen || '')}</p>
          <div class="price-caption">Desde · ARS</div><div class="product-price">
          ${(meta.enPromo && meta.precioAnterior > precio)
            ? `<span class="price-old">$${formatoPeso.format(meta.precioAnterior)}</span>`
            : ''}
          <span class="price-currency">$</span>${formatoPeso.format(precio)}
          ${(meta.enPromo && meta.precioAnterior > precio)
            ? `<span class="price-off-badge">-${Math.round((1 - precio / meta.precioAnterior) * 100)}% OFF</span>`
            : ''}
        </div>
        </div>
      `;
      const cta = document.createElement('span');
      cta.className = 'card-cta';
      cta.textContent = 'Ver pieza y personalizar';
      const arrow = document.createElement('span');
      arrow.className = 'arrow-icon';
      arrow.setAttribute('aria-hidden', 'true');
      cta.append(arrow);
      card.append(cta);
      card.querySelectorAll('img').forEach(img => img.addEventListener('error', () => img.remove()));
      return card;
    }

    function matchesCategoryFilter(prod, cat, sub) {
      const meta = parseProductMeta(prod);
      if (!cat) return true;

      if (cat === "Promoción") {
        if (!meta.enPromo) return false;
        if (sub && meta.promoTipo.toLowerCase() !== sub.toLowerCase()) return false;
        return true;
      }

      if (meta.cleanCat.toLowerCase() !== cat.toLowerCase()) return false;
      if (sub && meta.cleanSub.toLowerCase() !== sub.toLowerCase()) return false;
      return true;
    }

    function renderCatalogAndPromos() {
      grid.innerHTML = '';
      promoGrid.innerHTML = '';
      if (catalogUnavailable) { Store.showStatus(grid, 'El catálogo no está disponible en este momento. Intentá nuevamente en unos minutos.', cargarCatalogo); return; }

      // Si el usuario eligió directamente la pestaña "Promoción", mostramos las promos arriba y ocultamos el bloque inferior duplicado
      if (activeCat === "Promoción") {
        const promoItems = allProducts.filter(p => matchesCategoryFilter(p, "Promoción", activeSub));
        promoSection.style.display = 'none';

        if (promoItems.length === 0) {
          grid.innerHTML = `<div class="empty-state">No hay muebles cargados en "${h(sectionTitle.textContent)}".</div>`;
          return;
        }
        promoItems.forEach(p => grid.appendChild(createProductCard(p, true)));
        return;
      }

      // Vista Inicio o cualquier Categoría/Subcategoría
      const matchingAll = allProducts.filter(p => matchesCategoryFilter(p, activeCat, activeSub));
      const matchingPromos = matchingAll.filter(p => parseProductMeta(p).enPromo);

      if (matchingAll.length === 0) {
        grid.innerHTML = `<div class="empty-state">No hay muebles cargados en "${h(sectionTitle.textContent)}".</div>`;
      } else {
        matchingAll.forEach(p => {
          const isP = parseProductMeta(p).enPromo;
          grid.appendChild(createProductCard(p, isP));
        });
      }

      // Sección inferior de Promoción (aparece con línea divisoria solo si hay muebles en promo en esta vista)
      if (matchingPromos.length > 0) {
        promoSection.style.display = 'block';
        promoSubtitle.textContent = activeCat
          ? `En ${activeCat}${activeSub ? ' · ' + activeSub : ''}`
          : 'Ofertas · Combos · Liquidación';
        matchingPromos.forEach(p => promoGrid.appendChild(createProductCard(p, true)));
      } else {
        promoSection.style.display = 'none';
      }
    }

    function resetFilter() {
      activeCat = null;
      activeSub = null;
      closeAllDropdowns();
      updateActivePillsUI();
      renderCatalogAndPromos();
    }

    document.getElementById('btnResetCats').addEventListener('click', resetFilter);

    async function cargarCatalogo() {
      catalogUnavailable = false;
      allProducts = [];
      promoSection.style.display = 'none';
      Store.showStatus(grid, 'Cargando las piezas del taller…');
      try {
        allProducts = await Store.activeProducts(Store.createClient());
      } catch {
        catalogUnavailable = true;
      }
      renderCatalogAndPromos();
    }

    buildCategoriesBar();
    updateActivePillsUI();
    cargarCatalogo();
