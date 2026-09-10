/**
 * ============================================================================
 * LINEA ABIERTA (lineaabierta.net.pe)
 * Lógica del Editor de Noticias (admin/js/editor.js)
 * Maneja creación, edición, borradores y publicación programada
 * ============================================================================
 */

let articleId = null;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Verificar autenticación
  try {
    const authRes = await fetch('/api/auth/me');
    const authData = await authRes.json();
    if (!authData.authenticated) {
      window.location.href = '/admin/login.html';
      return;
    }
  } catch {
    window.location.href = '/admin/login.html';
    return;
  }

  // 2. Determinar si es modo edición
  const params = new URLSearchParams(window.location.search);
  articleId = params.get('id');

  // 3. Cargar categorías
  await loadCategories();

  // 4. Si hay ID, cargar datos del artículo
  if (articleId) {
    document.getElementById('editor-page-title').innerText = 'Editar Noticia';
    await loadArticleData(articleId);
  } else {
    document.getElementById('editor-page-title').innerText = 'Crear Nueva Noticia';
  }

  // 5. Inicializar eventos
  initEditorEvents();
});

async function loadCategories() {
  const select = document.getElementById('article-category');
  if (!select) return;

  try {
    const res = await fetch('/api/admin/categories');
    const data = await res.json();
    if (data.success && Array.isArray(data.categories)) {
      select.innerHTML = '<option value="">-- Seleccione una categoría --</option>';
      data.categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name;
        select.appendChild(opt);
      });
    }
  } catch (err) {
    console.error('Error al cargar categorías:', err);
  }
}

async function loadArticleData(id) {
  try {
    const res = await fetch(`/api/admin/articles/${encodeURIComponent(id)}`);
    const data = await res.json();

    if (!data.success || !data.article) {
      alert('No se pudo encontrar la noticia especificada.');
      window.location.href = '/admin/index.html';
      return;
    }

    const art = data.article;
    document.getElementById('article-title').value = art.title || '';
    document.getElementById('article-slug').value = art.slug || '';
    document.getElementById('article-category').value = art.category_id || '';
    document.getElementById('article-summary').value = art.summary || art.lead || art.excerpt || '';
    document.getElementById('article-content').value = art.content || art.body || '';
    document.getElementById('article-image').value = art.image_url || art.cover_image || '';
    document.getElementById('article-author').value = art.author_name || art.author || '';
    document.getElementById('article-status').value = art.status || 'draft';

    if (art.status === 'scheduled' && (art.published_at || art.publish_date)) {
      document.getElementById('schedule-container').style.display = 'block';
      const dateVal = (art.published_at || art.publish_date).slice(0, 16);
      document.getElementById('article-schedule-time').value = dateVal;
    }
  } catch (err) {
    console.error('Error al cargar datos de la noticia:', err);
    alert('Error al conectar con la base de datos.');
  }
}

function initEditorEvents() {
  const titleInput = document.getElementById('article-title');
  const slugInput = document.getElementById('article-slug');
  const statusSelect = document.getElementById('article-status');
  const scheduleContainer = document.getElementById('schedule-container');
  const form = document.getElementById('article-form');

  // Slug automático en tiempo real
  let manualSlug = false;
  slugInput.addEventListener('input', () => {
    manualSlug = slugInput.value.trim().length > 0;
  });

  titleInput.addEventListener('input', () => {
    if (!manualSlug && !articleId) {
      slugInput.value = slugify(titleInput.value);
    }
  });

  // Mostrar / ocultar selector de fecha programada
  statusSelect.addEventListener('change', () => {
    if (statusSelect.value === 'scheduled') {
      scheduleContainer.style.display = 'block';
    } else {
      scheduleContainer.style.display = 'none';
    }
  });

  // Guardar según acción
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveArticle();
  });

  document.getElementById('btn-save-draft')?.addEventListener('click', async () => {
    statusSelect.value = 'draft';
    scheduleContainer.style.display = 'none';
    await saveArticle();
  });

  document.getElementById('btn-publish-now')?.addEventListener('click', async () => {
    statusSelect.value = 'published';
    scheduleContainer.style.display = 'none';
    await saveArticle();
  });
}

async function saveArticle() {
  const title = document.getElementById('article-title').value.trim();
  const slug = document.getElementById('article-slug').value.trim() || slugify(title);
  const categoryId = document.getElementById('article-category').value;
  const summary = document.getElementById('article-summary').value.trim();
  const content = document.getElementById('article-content').value.trim();
  const imageUrl = document.getElementById('article-image').value.trim();
  const authorName = document.getElementById('article-author').value.trim();
  const status = document.getElementById('article-status').value;
  const scheduleTime = document.getElementById('article-schedule-time').value;

  if (!title) {
    alert('El título de la noticia es obligatorio.');
    return;
  }

  if (!categoryId) {
    alert('Por favor selecciona una categoría.');
    return;
  }

  let publishedAt = null;
  if (status === 'published') {
    publishedAt = new Date().toISOString();
  } else if (status === 'scheduled') {
    if (!scheduleTime) {
      alert('Debes indicar la fecha y hora programada para la publicación.');
      return;
    }
    publishedAt = new Date(scheduleTime).toISOString();
  }

  const payload = {
    title,
    slug,
    category_id: categoryId,
    summary,
    content,
    image_url: imageUrl,
    author_name: authorName,
    status,
    published_at: publishedAt
  };

  const isEdit = Boolean(articleId);
  const url = isEdit ? `/api/admin/articles/${encodeURIComponent(articleId)}` : '/api/admin/articles';
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (data.success) {
      alert(isEdit ? 'Noticia actualizada correctamente.' : 'Noticia creada con éxito.');
      window.location.href = '/admin/index.html';
    } else {
      alert(data.error || 'Error al guardar la noticia.');
    }
  } catch (err) {
    console.error('Error al guardar artículo:', err);
    alert('Error al conectar con el servidor.');
  }
}

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}
