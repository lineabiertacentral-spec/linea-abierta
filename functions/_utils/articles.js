/**
 * ============================================================================
 * LINEA ABIERTA (lineaabierta.net.pe)
 * Helper para adaptación automática y segura a las columnas de D1
 * ============================================================================
 */

export function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Eliminar acentos
    .replace(/[^a-z0-9\s-]/g, '')   // Eliminar caracteres especiales
    .trim()
    .replace(/\s+/g, '-')          // Reemplazar espacios con guiones
    .replace(/-+/g, '-');          // Eliminar guiones duplicados
}

let cachedArticleColumns = null;

export async function getArticleColumns(db) {
  if (cachedArticleColumns) return cachedArticleColumns;
  try {
    const { results } = await db.prepare('PRAGMA table_info(articles)').all();
    const cols = new Set((results || []).map(r => r.name.toLowerCase()));
    cachedArticleColumns = cols;
    return cols;
  } catch {
    return new Set();
  }
}
