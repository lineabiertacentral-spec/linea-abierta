/**
 * ==========================================================================
 * LINEA ABIERTA (lineaabierta.net.pe)
 * Archivo: js/main.js - Interactividad frontend y consumo dinámico de D1
 * ==========================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
  initLivePeruClock();
  initMobileNavigation();
  initSearchModal();
  initThemeToggle();
  initPortalDynamicContent();
});

/**
 * 1. Reloj en Vivo (Hora Oficial de Lima, Perú)
 */
function initLivePeruClock() {
  const clockElement = document.getElementById('live-peru-time');
  if (!clockElement) return;

  const updateTime = () => {
    const now = new Date();
    
    const options = {
      timeZone: 'America/Lima',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    };

    try {
      const formatter = new Intl.DateTimeFormat('es-PE', options);
      const parts = formatter.formatToParts(now);
      
      const weekday = parts.find(p => p.type === 'weekday')?.value || '';
      const day = parts.find(p => p.type === 'day')?.value || '';
      const month = parts.find(p => p.type === 'month')?.value || '';
      const year = parts.find(p => p.type === 'year')?.value || '';
      const hour = parts.find(p => p.type === 'hour')?.value || '';
      const minute = parts.find(p => p.type === 'minute')?.value || '';
      const dayPeriod = parts.find(p => p.type === 'dayPeriod')?.value || '';

      const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
      clockElement.textContent = `${capitalizedWeekday}, ${day} de ${month} de ${year} | ${hour}:${minute} ${dayPeriod.toUpperCase()} (Lima)`;
    } catch (e) {
      clockElement.textContent = now.toLocaleDateString('es-PE') + ' (Lima)';
    }
  };

  updateTime();
  setInterval(updateTime, 1000);
}

/**
 * 2. Menú de Navegación Lateral Móvil (Drawer)
 */
function initMobileNavigation() {
  const toggleBtn = document.getElementById('mobile-menu-btn');
  const drawer = document.getElementById('mobile-drawer');
  const overlay = document.getElementById('drawer-overlay');
  const closeBtn = document.getElementById('drawer-close-btn');

  if (!toggleBtn || !drawer || !overlay) return;

  const openDrawer = () => {
    drawer.classList.add('active');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  };

  const closeDrawer = () => {
    drawer.classList.remove('active');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  };

  toggleBtn.addEventListener('click', openDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('active')) {
      closeDrawer();
    }
  });
}

/**
 * 3. Modal de Búsqueda Rápida
 */
function initSearchModal() {
  const triggerBtns = document.querySelectorAll('.search-trigger-btn');
  const modalOverlay = document.getElementById('search-modal');
  const closeBtn = document.getElementById('search-modal-close');
  const searchInput = document.getElementById('search-input');

  if (!modalOverlay) return;

  const openModal = () => {
    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    if (searchInput) {
      setTimeout(() => searchInput.focus(), 150);
    }
  };

  const closeModal = () => {
    modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
  };

  triggerBtns.forEach(btn => btn.addEventListener('click', openModal));
  if (closeBtn) closeBtn.addEventListener('click', closeModal);

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      closeModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
      closeModal();
    }
  });
}

/**
 * 4. Selector de Modo Oscuro / Claro
 */
function initThemeToggle() {
  const themeBtns = document.querySelectorAll('.theme-toggle-btn');
  let currentTheme = 'light';
  try {
    currentTheme = localStorage.getItem('linea_theme') || 'light';
  } catch (e) {
    currentTheme = 'light';
  }

  document.documentElement.setAttribute('data-theme', currentTheme);
  updateThemeButtonLabels(currentTheme);

  themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const activeTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = activeTheme === 'dark' ? 'light' : 'dark';

      document.documentElement.setAttribute('data-theme', newTheme);
      try {
        localStorage.setItem('linea_theme', newTheme);
      } catch (e) {}
      updateThemeButtonLabels(newTheme);
    });
  });

  function updateThemeButtonLabels(theme) {
    themeBtns.forEach(btn => {
      const textSpan = btn.querySelector('.theme-label');
      if (textSpan) {
        textSpan.textContent = theme === 'dark' ? 'Modo Día' : 'Modo Noche';
      }
    });
  }
}

/**
 * ==========================================================================
 * 5. CONSUMO DINÁMICO DE CLOUDFLARE D1 (PORTAL PÚBLICO)
 * ==========================================================================
 */
function initPortalDynamicContent() {
  const isArticlePage = document.querySelector('.article-main');
  const isCategoryPage = document.getElementById('category-title');

  if (isArticlePage) {
    hydrateArticlePage();
  } else if (isCategoryPage) {
    hydrateCategoryPage();
  } else {
    hydrateHomePage();
  }
}

/**
 * A. Hidratación de Portada (index.html)
 */
async function hydrateHomePage() {
  try {
    const res = await fetch('/api/articles?limit=15');
    if (!res.ok) return;

    const data = await res.json();
    if (!data.success || !Array.isArray(data.articles) || data.articles.length === 0) {
      return; // Mantener contenido estático de respaldo si no hay noticias
    }

    const articles = data.articles;

    // 1. Cintillo de Último Minuto (Ticker)
    const tickerContainer = document.querySelector('.ticker-content .ticker-item');
    if (tickerContainer && articles.length > 0) {
      const tickerArticles = articles.slice(0, 5);
      tickerContainer.innerHTML = tickerArticles.map(art => {
        const timeStr = formatShortTime(art.published_at);
        const url = `articulo.html?slug=${encodeURIComponent(art.slug || art.id)}`;
        return `<span class="ticker-time">[${timeStr}]</span> <a href="${url}">${escapeHtml(art.title)}</a>`;
      }).join('&nbsp;&nbsp;•&nbsp;&nbsp;');
    }

    // 2. Noticia Principal (Lead Card)
    const leadCard = document.querySelector('.hero-section .lead-card');
    if (leadCard && articles[0]) {
      const mainArt = articles[0];
      const url = `articulo.html?slug=${encodeURIComponent(mainArt.slug || mainArt.id)}`;
      const catClass = getCategoryClass(mainArt.category_slug || mainArt.category_name);
      const catName = (mainArt.category_name || 'Actualidad').toUpperCase();
      const imgSrc = mainArt.image_url || getCategoryFallbackImage(mainArt.category_slug);

      const imgWrap = leadCard.querySelector('.lead-image-wrap');
      if (imgWrap) {
        imgWrap.href = url;
        const img = imgWrap.querySelector('img');
        if (img) {
          img.src = imgSrc;
          img.alt = mainArt.title;
        }
        const badge = imgWrap.querySelector('.badge');
        if (badge) {
          badge.className = `badge badge-${catClass}`;
          badge.textContent = catName;
        }
      }

      const titleLink = leadCard.querySelector('.lead-title a');
      if (titleLink) {
        titleLink.href = url;
        titleLink.textContent = mainArt.title;
      }

      const summaryEl = leadCard.querySelector('.lead-summary');
      if (summaryEl) {
        summaryEl.textContent = mainArt.summary || '';
      }

      const metaEl = leadCard.querySelector('.card-meta');
      if (metaEl) {
        const timeText = formatRelativeTime(mainArt.published_at);
        metaEl.innerHTML = `
          <span class="author">Por ${escapeHtml(mainArt.author_name || 'Redacción')}</span>
          <span>•</span>
          <time datetime="${mainArt.published_at}">${timeText}</time>
        `;
      }
    }

    // 3. Columna Secundaria Hero (Sub-cards)
    const subCards = document.querySelectorAll('.hero-subcolumn .sub-card');
    if (subCards.length >= 1 && articles[1]) {
      updateSubCard(subCards[0], articles[1]);
    }
    if (subCards.length >= 2 && articles[2]) {
      updateSubCard(subCards[1], articles[2]);
    }

    // 4. Feed de Noticias ("Lo Último en el Perú")
    const feedGrid = document.querySelector('.feed-section .news-feed-grid');
    if (feedGrid && articles.length > 3) {
      const feedArticles = articles.slice(3);
      feedGrid.innerHTML = feedArticles.map(art => renderFeedCardHtml(art)).join('');
    }

  } catch (err) {
    console.warn('No se pudieron cargar noticias dinámicas de D1:', err);
  }
}

function updateSubCard(cardEl, art) {
  if (!cardEl || !art) return;
  const url = `articulo.html?slug=${encodeURIComponent(art.slug || art.id)}`;
  const catClass = getCategoryClass(art.category_slug || art.category_name);
  const catName = (art.category_name || 'Actualidad').toUpperCase();
  const imgSrc = art.image_url || getCategoryFallbackImage(art.category_slug);

  const imgLink = cardEl.querySelector('.sub-card-image');
  if (imgLink) {
    imgLink.href = url;
    const img = imgLink.querySelector('img');
    if (img) {
      img.src = imgSrc;
      img.alt = art.title;
    }
  }

  const badge = cardEl.querySelector('.badge');
  if (badge) {
    badge.className = `badge badge-${catClass}`;
    badge.textContent = catName;
  }

  const titleLink = cardEl.querySelector('.sub-card-title a');
  if (titleLink) {
    titleLink.href = url;
    titleLink.textContent = art.title;
  }

  const timeEl = cardEl.querySelector('.card-meta time');
  if (timeEl) {
    timeEl.dateTime = art.published_at;
    timeEl.textContent = formatRelativeTime(art.published_at);
  }
}

function renderFeedCardHtml(art) {
  const url = `articulo.html?slug=${encodeURIComponent(art.slug || art.id)}`;
  const catClass = getCategoryClass(art.category_slug || art.category_name);
  const catName = (art.category_name || 'Actualidad').toUpperCase();
  const imgSrc = art.image_url || getCategoryFallbackImage(art.category_slug);
  const timeText = formatRelativeTime(art.published_at);

  return `
    <article class="feed-card">
      <a href="${url}" class="feed-card-img" aria-label="Leer ${escapeHtml(art.title)}">
        <img src="${imgSrc}" alt="${escapeHtml(art.title)}" loading="lazy">
      </a>
      <div class="feed-card-body">
        <span class="badge badge-${catClass}">${catName}</span>
        <h3 class="feed-card-title">
          <a href="${url}">${escapeHtml(art.title)}</a>
        </h3>
        <p class="feed-card-snippet">
          ${escapeHtml(art.summary || '')}
        </p>
        <div class="card-meta">
          <span class="author" style="font-size:0.75rem; color:#64748b;">Por ${escapeHtml(art.author_name || 'Redacción')}</span>
          <span>•</span>
          <time datetime="${art.published_at}">${timeText}</time>
        </div>
      </div>
    </article>
  `;
}

/**
 * B. Hidratación de Sección / Categoría (categoria.html)
 */
async function hydrateCategoryPage() {
  const params = new URLSearchParams(window.location.search);
  const catSlug = (params.get('cat') || '').trim();
  const searchQ = (params.get('q') || params.get('search') || '').trim();

  // Si es búsqueda
  if (searchQ) {
    await hydrateSearchResultsPage(searchQ);
    return;
  }

  const currentCat = catSlug || 'politica';
  const categoryMeta = getCategoryMeta(currentCat);

  // 1. Actualizar Nav Activo
  const navItems = document.querySelectorAll('#category-nav-list .main-nav-item');
  navItems.forEach(item => {
    const itemCat = item.getAttribute('data-cat');
    if (itemCat === currentCat) {
      item.classList.add('active');
    } else if (itemCat) {
      item.classList.remove('active');
    }
  });

  // 2. Actualizar Banner
  const titleEl = document.getElementById('category-title');
  if (titleEl) {
    titleEl.innerHTML = `<span>${categoryMeta.title}</span>`;
  }
  const descEl = document.getElementById('category-description');
  if (descEl) {
    descEl.textContent = categoryMeta.description;
  }
  const breadcrumbEl = document.getElementById('breadcrumb-category');
  if (breadcrumbEl) {
    breadcrumbEl.textContent = categoryMeta.name;
  }

  document.title = `${categoryMeta.title} | Linea Abierta`;

  // 3. Consultar API
  try {
    const res = await fetch(`/api/articles?category=${encodeURIComponent(currentCat)}&limit=15`);
    if (!res.ok) return;

    const data = await res.json();
    if (!data.success || !Array.isArray(data.articles)) return;

    const articles = data.articles;
    const leadCard = document.querySelector('.category-articles-section .lead-card');
    const feedGrid = document.querySelector('.category-articles-section .news-feed-grid');

    if (articles.length === 0) {
      if (leadCard) leadCard.style.display = 'none';
      if (feedGrid) {
        feedGrid.innerHTML = `
          <div style="grid-column: 1 / -1; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 3rem 1.5rem; text-align: center; margin: 1.5rem 0;">
            <span style="font-size: 2.5rem; display: block; margin-bottom: 0.75rem;">📰</span>
            <h2 style="font-size: 1.25rem; color: #041f16; font-weight: 700; margin-bottom: 0.5rem;">No hay noticias publicadas en ${escapeHtml(categoryMeta.name)} todavía</h2>
            <p style="color: #64748b; font-size: 0.95rem; max-width: 500px; margin: 0 auto 1.5rem auto;">
              Nuestra redacción está preparando coberturas para esta sección. Puedes revisar la portada principal o explorar otras categorías.
            </p>
            <a href="index.html" class="btn-primary" style="display: inline-flex; text-decoration: none; padding: 0.6rem 1.25rem; border-radius: 6px; font-weight: 700;">
              ← Volver a la Portada
            </a>
          </div>
        `;
      }
      return;
    }

    // Si hay artículos:
    if (leadCard) {
      leadCard.style.display = '';
      const first = articles[0];
      const url = `articulo.html?slug=${encodeURIComponent(first.slug || first.id)}`;
      const catClass = getCategoryClass(first.category_slug || currentCat);

      const imgWrap = leadCard.querySelector('.lead-image-wrap');
      if (imgWrap) {
        imgWrap.href = url;
        const img = imgWrap.querySelector('img');
        if (img) {
          img.src = first.image_url || getCategoryFallbackImage(currentCat);
          img.alt = first.title;
        }
        const badge = imgWrap.querySelector('.badge');
        if (badge) {
          badge.className = `badge badge-${catClass}`;
          badge.textContent = 'DESTACADO';
        }
      }

      const titleLink = leadCard.querySelector('.lead-title a');
      if (titleLink) {
        titleLink.href = url;
        titleLink.textContent = first.title;
      }
      const summary = leadCard.querySelector('.lead-summary');
      if (summary) {
        summary.textContent = first.summary || '';
      }
      const meta = leadCard.querySelector('.card-meta');
      if (meta) {
        meta.innerHTML = `
          <span class="author">Por ${escapeHtml(first.author_name || 'Redacción')}</span>
          <span>•</span>
          <time datetime="${first.published_at}">${formatRelativeTime(first.published_at)}</time>
        `;
      }
    }

    if (feedGrid) {
      const rest = articles.slice(1);
      if (rest.length > 0) {
        feedGrid.innerHTML = rest.map(art => renderFeedCardHtml(art)).join('');
      } else {
        feedGrid.innerHTML = '';
      }
    }

  } catch (err) {
    console.warn('Error al cargar categoría:', err);
  }
}

async function hydrateSearchResultsPage(query) {
  const titleEl = document.getElementById('category-title');
  if (titleEl) titleEl.innerHTML = `<span>Resultados de búsqueda: "${escapeHtml(query)}"</span>`;

  const descEl = document.getElementById('category-description');
  if (descEl) descEl.textContent = `Listado de noticias encontradas con el término de búsqueda "${query}".`;

  const breadcrumbEl = document.getElementById('breadcrumb-category');
  if (breadcrumbEl) breadcrumbEl.textContent = 'Búsqueda';

  document.title = `Búsqueda: ${query} | Linea Abierta`;

  const leadCard = document.querySelector('.category-articles-section .lead-card');
  if (leadCard) leadCard.style.display = 'none';

  const feedGrid = document.querySelector('.category-articles-section .news-feed-grid');
  if (!feedGrid) return;

  feedGrid.innerHTML = `
    <div style="grid-column:1/-1; text-align:center; padding:2rem; color:#64748b;">
      Buscando noticias en Linea Abierta...
    </div>
  `;

  try {
    const res = await fetch(`/api/articles?search=${encodeURIComponent(query)}&limit=20`);
    const data = await res.json();

    if (!data.success || !Array.isArray(data.articles) || data.articles.length === 0) {
      feedGrid.innerHTML = `
        <div style="grid-column: 1 / -1; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 3rem 1.5rem; text-align: center; margin: 1.5rem 0;">
          <span style="font-size: 2.5rem; display: block; margin-bottom: 0.75rem;">🔍</span>
          <h2 style="font-size: 1.25rem; color: #041f16; font-weight: 700; margin-bottom: 0.5rem;">No se encontraron resultados</h2>
          <p style="color: #64748b; font-size: 0.95rem; max-width: 480px; margin: 0 auto 1.5rem auto;">
            No encontramos noticias que coincidan con "<strong>${escapeHtml(query)}</strong>". Intenta con términos más generales.
          </p>
          <a href="index.html" class="btn-primary" style="display: inline-flex; text-decoration: none; padding: 0.6rem 1.25rem; border-radius: 6px; font-weight: 700;">
            ← Volver a la Portada
          </a>
        </div>
      `;
      return;
    }

    feedGrid.innerHTML = data.articles.map(art => renderFeedCardHtml(art)).join('');

  } catch (err) {
    feedGrid.innerHTML = `<div style="grid-column:1/-1; color:#ef4444; text-align:center; padding:2rem;">Error al buscar noticias.</div>`;
  }
}

/**
 * C. Hidratación de Noticia Individual (articulo.html)
 */
async function hydrateArticlePage() {
  const params = new URLSearchParams(window.location.search);
  const slugOrId = (params.get('slug') || params.get('id') || '').trim();

  // Si no hay parámetro, se mantiene la plantilla predeterminada
  if (!slugOrId) return;

  const articleMain = document.querySelector('.article-main');
  if (!articleMain) return;

  try {
    const res = await fetch(`/api/articles/${encodeURIComponent(slugOrId)}`);
    const data = await res.json();

    if (!res.ok || !data.success || !data.article) {
      articleMain.innerHTML = `
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 3.5rem 1.5rem; text-align: center; margin: 2rem 0;">
          <span style="font-size: 3rem; display: block; margin-bottom: 1rem;">🔍</span>
          <h1 style="font-size: 1.6rem; color: #041f16; font-weight: 800; margin-bottom: 0.75rem;">Noticia no encontrada</h1>
          <p style="color: #64748b; font-size: 1rem; max-width: 520px; margin: 0 auto 1.5rem auto;">
            La noticia solicitada no existe, fue archivada o aún se encuentra en borrador.
          </p>
          <a href="index.html" class="btn-primary" style="display: inline-flex; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 6px; font-weight: 700;">
            ← Ir a la Portada Principal
          </a>
        </div>
      `;
      return;
    }

    const art = data.article;
    const catClass = getCategoryClass(art.category_slug || art.category_name);
    const catName = art.category_name || 'Actualidad';
    const catSlug = art.category_slug || 'actualidad';

    // 1. Título y Metadatos
    document.title = `${art.title} | Linea Abierta`;
    updateMetaTag('og:title', `${art.title} | Linea Abierta`);
    updateMetaTag('og:description', art.summary || art.title);
    updateMetaTag('og:url', window.location.href);
    if (art.image_url) {
      updateMetaTag('og:image', art.image_url);
    }

    // 2. Migas de Pan (Breadcrumbs)
    const breadcrumbs = document.querySelector('.breadcrumbs');
    if (breadcrumbs) {
      breadcrumbs.innerHTML = `
        <a href="index.html">Inicio</a>
        <span class="separator">/</span>
        <a href="categoria.html?cat=${encodeURIComponent(catSlug)}">${escapeHtml(catName)}</a>
        <span class="separator">/</span>
        <span class="current">${escapeHtml(art.title)}</span>
      `;
    }

    // 3. Encabezado
    const badge = articleMain.querySelector('.article-header .badge');
    if (badge) {
      badge.className = `badge badge-${catClass}`;
      badge.textContent = catName.toUpperCase();
    }

    const headline = articleMain.querySelector('.article-headline');
    if (headline) {
      headline.textContent = art.title;
    }

    const lead = articleMain.querySelector('.article-lead');
    if (lead) {
      lead.textContent = art.summary || '';
      if (!art.summary) lead.style.display = 'none';
    }

    const authorName = articleMain.querySelector('.author-details .author-name');
    if (authorName) {
      authorName.textContent = `Por ${art.author_name || 'Redacción Linea Abierta'}`;
    }

    const publishDates = articleMain.querySelector('.author-details .publish-dates');
    if (publishDates) {
      publishDates.innerHTML = `Publicado: ${formatFullDate(art.published_at)} • <time datetime="${art.published_at}">${formatRelativeTime(art.published_at)}</time>`;
    }

    // 4. Compartir
    updateShareButtons(art.title);

    // 5. Imagen Destacada
    const mediaWrap = articleMain.querySelector('.featured-media');
    if (mediaWrap) {
      const img = mediaWrap.querySelector('img');
      const figcaption = mediaWrap.querySelector('figcaption');
      const imgSrc = art.image_url || getCategoryFallbackImage(catSlug);

      if (img) {
        img.src = imgSrc;
        img.alt = art.title;
      }
      if (figcaption) {
        figcaption.innerHTML = `<strong>${escapeHtml(catName)}:</strong> ${escapeHtml(art.title)}. <em>Foto: Archivo Periodístico Linea Abierta</em>.`;
      }
    }

    // 6. Cuerpo del Artículo
    const articleBody = articleMain.querySelector('.article-body');
    if (articleBody) {
      articleBody.innerHTML = formatArticleContentHtml(art.content || '');
    }

    // 7. Ficha del Autor
    const bioName = articleMain.querySelector('.author-bio-info h4');
    if (bioName) {
      bioName.textContent = art.author_name || 'Redacción Linea Abierta';
    }

    // 8. Noticias Relacionadas
    if (Array.isArray(data.relatedArticles) && data.relatedArticles.length > 0) {
      const relatedGrid = articleMain.querySelector('.related-news-section .related-grid');
      if (relatedGrid) {
        relatedGrid.innerHTML = data.relatedArticles.map(rel => renderFeedCardHtml(rel)).join('');
      }
    }

  } catch (err) {
    console.warn('Error al cargar el artículo de D1:', err);
  }
}

/**
 * Utilidades de Formato y Presentación
 */
function getCategoryClass(slugOrName) {
  const str = (slugOrName || '').toLowerCase();
  if (str.includes('polit')) return 'politica';
  if (str.includes('regio')) return 'regiones';
  if (str.includes('econo')) return 'economia';
  if (str.includes('depor')) return 'deportes';
  if (str.includes('opini')) return 'opinion';
  if (str.includes('tend')) return 'tendencias';
  return 'actualidad';
}

function getCategoryFallbackImage(catSlug) {
  const cat = (catSlug || '').toLowerCase();
  if (cat.includes('econo')) return 'assets/images/noticia-economia.svg';
  if (cat.includes('regio')) return 'assets/images/noticia-regiones.svg';
  if (cat.includes('depor')) return 'assets/images/noticia-deportes.svg';
  return 'assets/images/noticia-principal.svg';
}

function getCategoryMeta(catSlug) {
  const map = {
    politica: {
      name: 'Política',
      title: 'Noticias de Política',
      description: 'Cobertura y análisis exhaustivo de los poderes del Estado, decisiones legislativas, gobernabilidad y acontecer institucional en el Perú.'
    },
    actualidad: {
      name: 'Actualidad',
      title: 'Noticias de Actualidad',
      description: 'Acontecimientos del día a día, seguridad ciudadana, sucesos nacionales e información de impacto en la sociedad peruana.'
    },
    regiones: {
      name: 'Regiones',
      title: 'Noticias de Regiones',
      description: 'Información descentralizada desde el norte, centro, sur y oriente del Perú. Voces, desarrollo y realidades de cada región.'
    },
    economia: {
      name: 'Economía',
      title: 'Noticias de Economía',
      description: 'Mercados financieros, tipo de cambio, comercio exterior, empleo, inversión pública y finanzas personales en el Perú.'
    },
    deportes: {
      name: 'Deportes',
      title: 'Noticias de Deportes',
      description: 'Fútbol nacional e internacional, selección peruana, polideportivo y cobertura de atletas peruanos.'
    },
    opinion: {
      name: 'Opinión',
      title: 'Artículos de Opinión',
      description: 'Columnas de análisis, tribunas de debate y editoriales plurales sobre los temas de fondo del acontecer nacional.'
    },
    tendencias: {
      name: 'Tendencias',
      title: 'Tendencias & Sociedad',
      description: 'Cultura digital, tecnología, innovación, estilo de vida y fenómenos que marcan la conversación en el país.'
    }
  };

  const key = (catSlug || '').toLowerCase();
  return map[key] || {
    name: key.charAt(0).toUpperCase() + key.slice(1),
    title: `Noticias de ${key.charAt(0).toUpperCase() + key.slice(1)}`,
    description: 'Información y cobertura periodística en tiempo real en Linea Abierta.'
  };
}

function formatShortTime(isoStr) {
  if (!isoStr) return '00:00';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('es-PE', {
      timeZone: 'America/Lima',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  } catch {
    return '00:00';
  }
}

function formatRelativeTime(isoStr) {
  if (!isoStr) return 'Reciente';
  try {
    const now = Date.now();
    const then = new Date(isoStr).getTime();
    const diffMs = now - then;

    if (diffMs < 60000) return 'Hace un momento';
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `Hace ${diffMins} min`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Hace ${diffHours} h`;
    if (diffHours < 48) return 'Ayer';
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `Hace ${diffDays} días`;

    return new Date(isoStr).toLocaleDateString('es-PE', {
      timeZone: 'America/Lima',
      day: '2-digit',
      month: 'short'
    });
  } catch {
    return 'Reciente';
  }
}

function formatFullDate(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('es-PE', {
      timeZone: 'America/Lima',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) + ' hrs';
  } catch {
    return isoStr;
  }
}

function formatArticleContentHtml(content) {
  if (!content) return '';
  const trimmed = content.trim();
  // Si ya tiene etiquetas HTML
  if (/<(p|div|blockquote|h2|h3|h4|ul|ol|img|figure)\b/i.test(trimmed)) {
    return trimmed;
  }
  // Texto plano con saltos de línea -> párrafos
  return trimmed
    .split(/\n{2,}/)
    .map(p => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

function updateShareButtons(title) {
  const currentUrl = encodeURIComponent(window.location.href);
  const text = encodeURIComponent(title || 'Noticia en Linea Abierta');

  const waBtn = document.querySelector('.share-whatsapp');
  if (waBtn) waBtn.href = `https://api.whatsapp.com/send?text=${text}%20${currentUrl}`;

  const xBtn = document.querySelector('.share-x');
  if (xBtn) xBtn.href = `https://twitter.com/intent/tweet?text=${text}&url=${currentUrl}`;

  const fbBtn = document.querySelector('.share-facebook');
  if (fbBtn) fbBtn.href = `https://www.facebook.com/sharer/sharer.php?u=${currentUrl}`;
}

function updateMetaTag(property, content) {
  if (!property || !content) return;
  let meta = document.querySelector(`meta[property="${property}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('property', property);
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', content);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
