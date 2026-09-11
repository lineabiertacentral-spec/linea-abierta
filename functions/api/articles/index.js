/**
 * ============================================================================
 * LINEA ABIERTA (lineaabierta.net.pe)
 * Endpoint Público: GET /api/articles
 * Retorna noticias con estado 'published' y fecha de publicación cumplida.
 * ============================================================================
 */

export async function onRequestGet(context) {
  const { request, env } = context;
  const db = env.DB;

  if (!db) {
    return new Response(JSON.stringify({ error: 'Base de datos no disponible.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
  const offset = (page - 1) * limit;

  const category = (url.searchParams.get('category') || '').trim();
  const search = (url.searchParams.get('search') || '').trim();
  const excludeStr = (url.searchParams.get('exclude') || '').trim();

  const nowIso = new Date().toISOString();

  // Condiciones de consulta: únicamente noticias publicadas cuya fecha ya se haya cumplido
  const conditions = [
    "a.status = 'published'",
    "(a.published_at IS NULL OR a.published_at <= ?)"
  ];
  const params = [nowIso];

  // Filtro por categoría (slug o id)
  if (category) {
    if (/^\d+$/.test(category)) {
      conditions.push('a.category_id = ?');
      params.push(Number(category));
    } else {
      conditions.push('(c.slug = ? OR LOWER(c.name) = ?)');
      params.push(category.toLowerCase(), category.toLowerCase());
    }
  }

  // Filtro por búsqueda de texto
  if (search) {
    conditions.push('(a.title LIKE ? OR a.slug LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  // Excluir IDs específicos (útil para no repetir noticia principal en el feed)
  if (excludeStr) {
    const excludeIds = excludeStr
      .split(',')
      .map(id => parseInt(id.trim(), 10))
      .filter(id => !isNaN(id) && id > 0);

    if (excludeIds.length > 0) {
      const placeholders = excludeIds.map(() => '?').join(', ');
      conditions.push(`a.id NOT IN (${placeholders})`);
      params.push(...excludeIds);
    }
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  try {
    // 1. Conteo total de noticias públicas
    const countSql = `
      SELECT COUNT(*) AS total 
      FROM articles a 
      LEFT JOIN categories c ON a.category_id = c.id 
      ${whereClause}
    `;
    const countResult = await db.prepare(countSql).bind(...params).first();
    const total = countResult ? countResult.total : 0;

    // 2. Consulta de noticias usando a.* para máxima compatibilidad de columnas
    const selectSql = `
      SELECT a.*, c.name AS category_name, c.slug AS category_slug
      FROM articles a
      LEFT JOIN categories c ON a.category_id = c.id
      ${whereClause}
      ORDER BY a.id DESC
      LIMIT ? OFFSET ?
    `;

    const queryParams = [...params, limit, offset];
    const { results } = await db.prepare(selectSql).bind(...queryParams).all();

    // Normalización de campos en JavaScript (evita errores SQL si una columna varía)
    const articles = (results || []).map(row => ({
      id: row.id,
      title: row.title || 'Sin título',
      slug: row.slug || String(row.id),
      summary: row.summary || row.lead || row.excerpt || '',
      image_url: row.image_url || row.cover_image || row.image || '',
      author_name: row.author_name || row.author || 'Redacción Linea Abierta',
      category_id: row.category_id,
      status: row.status,
      published_at: row.published_at || row.publish_date || row.created_at || nowIso,
      created_at: row.created_at,
      category_name: row.category_name || 'Actualidad',
      category_slug: row.category_slug || 'actualidad'
    }));

    return new Response(
      JSON.stringify({
        success: true,
        articles,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1
        }
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=30, s-maxage=60'
        }
      }
    );
  } catch (err) {
    console.error('Error al consultar noticias públicas en D1:', err);
    return new Response(
      JSON.stringify({
        error: 'Error al consultar noticias públicas.',
        details: err.message
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
