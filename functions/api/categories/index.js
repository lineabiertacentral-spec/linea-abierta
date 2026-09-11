/**
 * ============================================================================
 * LINEA ABIERTA (lineaabierta.net.pe)
 * Endpoint Público: GET /api/categories
 * Retorna las categorías activas para la navegación pública
 * ============================================================================
 */

export async function onRequestGet(context) {
  const { env } = context;
  const db = env.DB;

  if (!db) {
    return new Response(JSON.stringify({ error: 'Base de datos no disponible.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const nowIso = new Date().toISOString();

  try {
    const sql = `
      SELECT 
        c.id,
        c.name,
        c.slug,
        COUNT(CASE WHEN a.status = 'published' AND (a.published_at IS NULL OR a.published_at <= ?) THEN a.id END) AS article_count
      FROM categories c
      LEFT JOIN articles a ON a.category_id = c.id
      GROUP BY c.id
      ORDER BY c.name ASC
    `;

    const { results } = await db.prepare(sql).bind(nowIso).all();

    return new Response(
      JSON.stringify({
        success: true,
        categories: results || []
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300, s-maxage=600'
        }
      }
    );
  } catch (err) {
    console.error('Error al consultar categorías públicas:', err);
    return new Response(
      JSON.stringify({
        error: 'Error al consultar categorías.',
        details: err.message
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
