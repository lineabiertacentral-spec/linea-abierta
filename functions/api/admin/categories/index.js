/**
 * ============================================================================
 * LINEA ABIERTA (lineaabierta.net.pe)
 * Endpoint: GET /api/admin/categories
 * Obtiene el listado de categorías existentes desde Cloudflare D1
 * ============================================================================
 */

export async function onRequestGet(context) {
  const { env } = context;
  const db = env.DB;

  if (!db) {
    return new Response(JSON.stringify({ error: 'Base de datos no vinculada (Binding DB faltante).' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Consulta segura a la tabla existente 'categories'
    const { results } = await db.prepare('SELECT * FROM categories ORDER BY name ASC').all();
    return new Response(JSON.stringify({ success: true, categories: results || [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Error al consultar categorías:', err);
    return new Response(
      JSON.stringify({
        error: 'Error al consultar categorías en la base de datos.',
        details: err.message
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
