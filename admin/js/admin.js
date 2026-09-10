/**
 * ============================================================================
 * LINEA ABIERTA (lineaabierta.net.pe)
 * Lógica del Dashboard Administrativo (admin/js/admin.js)
 * Manejo seguro de eventos sin código JavaScript inline ni riesgos de escape
 * ============================================================================
 */

let currentPage = 1;
let currentLimit = 20;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Verificar autenticación obligatoria
  const user = await checkAuth();
  if (!user) return;

  // 2. Inicializar interfaz y listeners
  initUserInterface(user);
  await loadCategories();
  await loadArticles();
  initEventListeners();
});

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (!data.authenticated) {
      window.location.href = '/admin/login.html';
      return null;
    }
    return data.user || 'Administrador';
  } catch (err) {
    window.location.href = '/admin/login.html';
    return null;
  }
}

function initUserInterface(username) {
  const userEl = document.getElementById('admin-username-display');
  if (userEl) userEl.innerText = username;

  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } finally {
        window.location.href = '/admin/login.html';
      }
    });
  }
}

async function loadCategories() {
  const selectFilter = document.getElementById('filter-category');
  if (!selectFilter) return;

  try {
    const res = await fetch('/api/admin/categories');
    const data = await res.json();
    if (data.success && Array.isArray(data.categories)) {
      data.categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name;
        selectFilter.appendChild(opt);
      });
    }
  } catch (err) {
    console.error('Error al cargar categorías:', err);
  }
}

async function loadArticles(page = 1) {
  currentPage = page;
  const tbody = document.getElementById('articles-tbody');
  const paginationEl = document.getElementById('pagination-info');
  const prevBtn = document.getElementById('btn-prev-page');
  const nextBtn = document.getElementById('btn-next-page');

  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="6" style="text-align: center; padding: 2rem; color: #64748b;">
        Cargando noticias desde Cloudflare D1...
      </td>
    </tr>
  `;

  const search = document.getElementById('filter-search')?.value || '';
  const categoryId = document.getElementById('filter-category')?.value || '';
  const status = document.getElementById('filter-status')?.value || '';

  const params = new URLSearchParams({
    page: currentPage.toString(),
    limit: currentLimit.toString()
  });

  if (search) params.append('search', search);
  if (categoryId) params.append('category_id', categoryId);
  if (status) params.append('status', status);

  try {
    const res = await fetch(`/api/admin/articles?${params.toString()}`);
    const data = await res.json();

    if (!data.success) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: #ef4444; padding: 1.5rem;">
            ${escapeHtml(data.error || 'No se pudieron cargar las noticias.')}
          </td>
        </tr>
      `;
      return;
    }

    const { articles, pagination } = data;
    updateDashboardStats(articles, pagination.total);

    if (articles.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 2.5rem; color: #64748b;">
            No se encontraron noticias con los filtros seleccionados.
          </td>
        </tr>
      `;
      if (paginationEl) paginationEl.innerText = 'Mostrando 0 de 0 noticias';
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }

    // Renderizar filas sin ningún handler JS inline
    tbody.innerHTML = articles.map(art => {
      const statusClass = getStatusBadgeClass(art.status);
      const statusLabel = getStatusLabel(art.status);
      const dateStr = formatDate(art.published_at || art.created_at);
      const categoryName = art.category_name || 'Sin categoría';
      const safeTitle = escapeHtml(art.title || 'Sin título');
      const safeSlug = escapeHtml(art.slug || '');
      const safeAuthor = escapeHtml(art.author_name || art.author || 'Redacción');

      return `
        <tr>
          <td style="font-weight: 600; color: #0f172a; max-width: 320px;">
            ${safeTitle}
            <div style="font-size: 0.75rem; color: #64748b; margin-top: 2px;">
              /${safeSlug}
            </div>
          </td>
          <td>
            <span style="font-size: 0.8rem; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">
              ${escapeHtml(categoryName)}
            </span>
          </td>
          <td>
            <span class="badge-status ${statusClass}">${statusLabel}</span>
          </td>
          <td style="font-size: 0.85rem; color: #64748b;">
            ${safeAuthor}
          </td>
          <td style="font-size: 0.85rem; color: #64748b; white-space: nowrap;">
            ${dateStr}
          </td>
          <td>
            <div class="action-buttons">
              <a href="/admin/editor.html?id=${encodeURIComponent(art.id)}" class="btn-icon" title="Editar">✏️ Editar</a>
              <button type="button" 
                      class="btn-icon btn-icon-danger btn-delete-article" 
                      data-article-id="${encodeURIComponent(art.id)}" 
                      data-article-title="${safeTitle}" 
                      title="Eliminar">
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    if (paginationEl) {
      paginationEl.innerText = `Página ${pagination.page} de ${pagination.totalPages} (${pagination.total} noticias totales)`;
    }
    if (prevBtn) prevBtn.disabled = pagination.page <= 1;
    if (nextBtn) nextBtn.disabled = pagination.page >= pagination.totalPages;

  } catch (err) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: #ef4444; padding: 1.5rem;">
          Error de conexión al cargar noticias.
        </td>
      </tr>
    `;
  }
}

function updateDashboardStats(currentArticles, totalArticles) {
  const statTotal = document.getElementById('stat-total-articles');
  if (statTotal) statTotal.innerText = totalArticles || 0;

  const statPublished = document.getElementById('stat-published-articles');
  const statDrafts = document.getElementById('stat-draft-articles');
  const statScheduled = document.getElementById('stat-scheduled-articles');

  if (statPublished) {
    statPublished.innerText = currentArticles.filter(a => a.status === 'published').length;
  }
  if (statDrafts) {
    statDrafts.innerText = currentArticles.filter(a => a.status === 'draft').length;
  }
  if (statScheduled) {
    statScheduled.innerText = currentArticles.filter(a => a.status === 'scheduled').length;
  }
}

function initEventListeners() {
  const searchInput = document.getElementById('filter-search');
  const categoryFilter = document.getElementById('filter-category');
  const statusFilter = document.getElementById('filter-status');
  const tbody = document.getElementById('articles-tbody');

  let debounceTimeout;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => loadArticles(1), 300);
    });
  }

  if (categoryFilter) {
    categoryFilter.addEventListener('change', () => loadArticles(1));
  }

  if (statusFilter) {
    statusFilter.addEventListener('change', () => loadArticles(1));
  }

  const prevBtn = document.getElementById('btn-prev-page');
  const nextBtn = document.getElementById('btn-next-page');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentPage > 1) loadArticles(currentPage - 1);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      loadArticles(currentPage + 1);
    });
  }

  // Delegación segura de eventos para el botón de eliminar (sin onclick inline)
  if (tbody) {
    tbody.addEventListener('click', async (e) => {
      const deleteBtn = e.target.closest('.btn-delete-article');
      if (deleteBtn) {
        const id = deleteBtn.getAttribute('data-article-id');
        const title = deleteBtn.getAttribute('data-article-title');
        await handleDeleteArticle(id, title);
      }
    });
  }
}

async function handleDeleteArticle(id, title) {
  if (!confirm(`¿Estás seguro de que deseas eliminar la noticia "${title}"?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/admin/articles/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await res.json();

    if (data.success) {
      alert('Noticia eliminada correctamente.');
      await loadArticles(currentPage);
    } else {
      alert(data.error || 'Error al eliminar la noticia.');
    }
  } catch (err) {
    alert('Error al conectar con el servidor.');
  }
}

function getStatusBadgeClass(status) {
  switch (status) {
    case 'published': return 'badge-published';
    case 'scheduled': return 'badge-scheduled';
    case 'draft': return 'badge-draft';
    case 'archived': return 'badge-archived';
    default: return 'badge-draft';
  }
}

function getStatusLabel(status) {
  switch (status) {
    case 'published': return 'Publicado';
    case 'scheduled': return 'Programado';
    case 'draft': return 'Borrador';
    case 'archived': return 'Archivado';
    default: return status || 'Borrador';
  }
}

function formatDate(isoStr) {
  if (!isoStr) return '-';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return isoStr;
  }
}

// Escapado riguroso HTML contra XSS (incluye comillas simples y dobles)
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
