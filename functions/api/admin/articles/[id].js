/**
 * ============================================================================
 * LINEA ABIERTA (lineaabierta.net.pe)
 * Endpoint: /api/admin/articles/[id]
 * GET: Obtener detalle de una noticia para edición
 * PUT: Actualizar campos de una noticia existente
 * DELETE: Eliminar o archivar una noticia
 * ============================================================================
 */

import { slugify, getArticleColumns } from '../../../_utils/articles.js';

export async function onRequestGet(context) {
  const { params, env } = context;
  const db = env.DB;
  const id = params.id;

  if (!db) {
    return new Response(JSON.stringify({ error: 'Base de datos no disponible.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const article = await db.prepare(`
      SELECT a.*, c.name AS category_name, c.slug AS category_slug
      FROM articles a
      LEFT JOIN categories c ON a.category_id = c.id
      WHERE a.id = ?
    `).bind(id).first();

    if (!article) {
      return new Response(JSON.stringify({ error: 'Noticia no encontrada.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true, article }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Error al obtener artículo:', err);
    return new Response(JSON.stringify({ error: 'Error al consultar la noticia.', details: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestPut(context) {
  const { params, request, env } = context;
  const db = env.DB;
  const id = params.id;

  if (!db) {
    return new Response(JSON.stringify({ error: 'Base de datos no disponible.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Datos de actualización inválidos.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const availableCols = await getArticleColumns(db);
  const updateData = {};
  const mapIfAvailable = (colName, value) => {
    if (availableCols.has(colName) && value !== undefined) {
      updateData[colName] = value;
    }
  };

  if (body.title !== undefined) mapIfAvailable('title', body.title.trim());
  if (body.slug !== undefined) mapIfAvailable('slug', body.slug.trim() || slugify(body.title || ''));
  if (body.category_id !== undefined) mapIfAvailable('category_id', body.category_id ? Number(body.category_id) : null);
  if (body.status !== undefined) mapIfAvailable('status', body.status);

  const content = body.content !== undefined ? body.content.trim() : undefined;
  if (content !== undefined) {
    if (availableCols.has('content')) updateData['content'] = content;
    else if (availableCols.has('body')) updateData['body'] = content;
  }

  const summary = (body.summary !== undefined ? body.summary : body.lead)?.trim();
  if (summary !== undefined) {
    if (availableCols.has('summary')) updateData['summary'] = summary;
    else if (availableCols.has('lead')) updateData['lead'] = summary;
    else if (availableCols.has('excerpt')) updateData['excerpt'] = summary;
  }

  if (body.image_url !== undefined || body.cover_image !== undefined) {
    const img = (body.image_url || body.cover_image || '').trim();
    if (availableCols.has('image_url')) updateData['image_url'] = img;
    else if (availableCols.has('cover_image')) updateData['cover_image'] = img;
    else if (availableCols.has('image')) updateData['image'] = img;
  }

  if (body.author_name !== undefined || body.author !== undefined) {
    const auth = (body.author_name || body.author || '').trim();
    if (availableCols.has('author_name')) updateData['author_name'] = auth;
    else if (availableCols.has('author')) updateData['author'] = auth;
  }

  if (body.published_at !== undefined || body.publish_date !== undefined) {
    const rawPub = body.published_at !== undefined ? body.published_at : body.publish_date;
    const pub = (rawPub && typeof rawPub === 'string' && rawPub.trim().length > 0) ? rawPub.trim() : null;
    if (availableCols.has('published_at')) updateData['published_at'] = pub;
    else if (availableCols.has('publish_date')) updateData['publish_date'] = pub;
  }

  if (availableCols.has('updated_at')) {
    updateData['updated_at'] = new Date().toISOString();
  }

  const updateKeys = Object.keys(updateData).filter(k => updateData[k] !== undefined);
  if (updateKeys.length === 0) {
    return new Response(JSON.stringify({ error: 'No se enviaron campos válidos para actualizar.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const setClause = updateKeys.map(k => `${k} = ?`).join(', ');
  const values = [...updateKeys.map(k => updateData[k] === undefined ? null : updateData[k]), Number(id) || id];

  try {
    const result = await db.prepare(`UPDATE articles SET ${setClause} WHERE id = ?`).bind(...values).run();

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Noticia actualizada exitosamente.',
        changes: result.meta?.changes || result.changes
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (err) {
    console.error('Error al actualizar artículo en D1:', err);
    return new Response(
      JSON.stringify({ error: 'Error al actualizar la noticia en la base de datos.', details: err.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

export async function onRequestDelete(context) {
  const { params, request, env } = context;
  const db = env.DB;
  const id = params.id;

  if (!db) {
    return new Response(JSON.stringify({ error: 'Base de datos no disponible.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const url = new URL(request.url);
  const isPermanent = url.searchParams.get('permanent') === 'true';

  try {
    const availableCols = await getArticleColumns(db);

    if (!isPermanent && availableCols.has('status')) {
      // Borrado lógico / Archivación por defecto para seguridad periodística
      await db.prepare("UPDATE articles SET status = 'archived' WHERE id = ?").bind(id).run();
      return new Response(
        JSON.stringify({ success: true, message: 'Noticia archivada correctamente.' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Eliminación física definitiva
    await db.prepare('DELETE FROM articles WHERE id = ?').bind(id).run();
    return new Response(
      JSON.stringify({ success: true, message: 'Noticia eliminada permanentemente.' }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (err) {
    console.error('Error al eliminar artículo:', err);
    return new Response(
      JSON.stringify({ error: 'Error al eliminar la noticia.', details: err.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
