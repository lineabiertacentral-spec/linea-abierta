/**
 * ============================================================================
 * LINEA ABIERTA (lineaabierta.net.pe)
 * Endpoint Público: GET /api/articles/:slug
 * Retorna el detalle completo de un artículo publicado por slug o ID.
 * ============================================================================
 */

export async function onRequestGet(context) {
  const { params, env } = context;
  const db = env.DB;
  const slugOrId = params.slug;

  if (!db) {
    return new Response(JSON.stringify({ error: 'Base de datos no disponible.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!slugOrId) {
    return new Response(JSON.stringify({ error: 'Identificador de noticia no especificado.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const nowIso = new Date().toISOString();
  const isNumeric = /^\d+$/.test(slugOrId);

  try {
    // 1. Consulta del artículo publicado
    let querySql = '';
    let queryParams = [];

    if (isNumeric) {
      querySql = `
        SELECT a.*, c.name AS category_name, c.slug AS category_slug
        FROM articles a
        LEFT JOIN categories c ON a.category_id = c.id
        WHERE (a.id = ? OR a.slug = ?)
          AND a.status = 'published'
          AND (a.published_at IS NULL OR a.published_at <= ?)
      `;
      queryParams = [Number(slugOrId), slugOrId, nowIso];
    } else {
      querySql = `
        SELECT a.*, c.name AS category_name, c.slug AS category_slug
        FROM articles a
        LEFT JOIN categories c ON a.category_id = c.id
        WHERE a.slug = ?
          AND a.status = 'published'
          AND (a.published_at IS NULL OR a.published_at <= ?)
      `;
      queryParams = [slugOrId, nowIso];
    }

    const row = await db.prepare(querySql).bind(...queryParams).first();

    if (!row) {
      return new Response(JSON.stringify({ error: 'Noticia no encontrada o no publicada.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const article = {
      id: row.id,
      title: row.title || 'Sin título',
      slug: row.slug || String(row.id),
      summary: row.summary || row.lead || row.excerpt || '',
      content: row.content || row.body || '',
      image_url: row.image_url || row.cover_image || row.image || '',
      author_name: row.author_name || row.author || 'Redacción Linea Abierta',
      category_id: row.category_id,
      status: row.status,
      published_at: row.published_at || row.publish_date || row.created_at || nowIso,
      created_at: row.created_at,
      category_name: row.category_name || 'Actualidad',
      category_slug: row.category_slug || 'actualidad'
    };

    // 2. Consulta de artículos relacionados de la misma categoría
    let relatedArticles = [];
    if (article.category_id) {
      const relatedSql = `
        SELECT a.*, c.name AS category_name, c.slug AS category_slug
        FROM articles a
        LEFT JOIN categories c ON a.category_id = c.id
        WHERE a.id != ?
          AND a.category_id = ?
          AND a.status = 'published'
          AND (a.published_at IS NULL OR a.published_at <= ?)
        ORDER BY a.id DESC
        LIMIT 3
      `;
      const relatedResult = await db.prepare(relatedSql).bind(article.id, article.category_id, nowIso).all();
      relatedArticles = (relatedResult.results || []).map(r => ({
        id: r.id,
        title: r.title,
        slug: r.slug,
        summary: r.summary || r.lead || r.excerpt || '',
        image_url: r.image_url || r.cover_image || r.image || '',
        published_at: r.published_at || r.created_at || nowIso,
        category_name: r.category_name || 'Actualidad',
        category_slug: r.category_slug || 'actualidad'
      }));
    }

    return new Response(
      JSON.stringify({
        success: true,
        article,
        relatedArticles
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60, s-maxage=120'
        }
      }
    );
  } catch (err) {
    console.error('Error al obtener artículo público en D1:', err);
    return new Response(
      JSON.stringify({
        error: 'Error al consultar la noticia en la base de datos.',
        details: err.message
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
