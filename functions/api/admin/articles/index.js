/**
 * ============================================================================
 * LINEA ABIERTA (lineaabierta.net.pe)
 * Endpoint: /api/admin/articles
 * GET: Listado paginado de noticias con filtros
 * POST: Creación de noticia (borrador, publicación inmediata o programada)
 * ============================================================================
 */

import { slugify, getArticleColumns } from '../../../_utils/articles.js';

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

  const search = (url.searchParams.get('search') || '').trim();
  const categoryId = url.searchParams.get('category_id');
  const status = url.searchParams.get('status');

  const conditions = [];
  const params = [];

  if (search) {
    conditions.push('(a.title LIKE ? OR a.slug LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  if (categoryId) {
    conditions.push('a.category_id = ?');
    params.push(categoryId);
  }

  if (status) {
    conditions.push('a.status = ?');
    params.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    // 1. Conteo total de registros
    const countSql = `SELECT COUNT(*) AS total FROM articles a ${whereClause}`;
    const countResult = await db.prepare(countSql).bind(...params).first();
    const total = countResult ? countResult.total : 0;

    // 2. Consulta de registros con LEFT JOIN a categories
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

    return new Response(
      JSON.stringify({
        success: true,
        articles: results || [],
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1
        }
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (err) {
    console.error('Error al consultar artículos en D1:', err);
    return new Response(
      JSON.stringify({
        error: 'Error al consultar las noticias en la base de datos.',
        details: err.message
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

export async function onRequestPost(context) {
  const { request, env, data } = context;
  const db = env.DB;

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
    return new Response(JSON.stringify({ error: 'Datos de artículo inválidos.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const title = (body.title || '').trim();
  const content = (body.content || '').trim();
  const categoryId = body.category_id;
  const status = body.status || 'draft'; // draft, published, scheduled
  const authorName = (body.author_name || data?.adminUser || 'Redacción Linea Abierta').trim();
  const summary = (body.summary || body.lead || '').trim();
  const imageUrl = (body.image_url || '').trim();
  let slug = (body.slug || '').trim();
  let publishedAt = body.published_at || null;

  if (!title) {
    return new Response(JSON.stringify({ error: 'El título de la noticia es obligatorio.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!slug) {
    slug = slugify(title);
  }

  const nowIso = new Date().toISOString();
  if (status === 'published' && !publishedAt) {
    publishedAt = nowIso;
  }

  // Detectar columnas existentes para compatibilidad flexible
  const availableCols = await getArticleColumns(db);

  const insertData = {};
  const mapIfAvailable = (colName, value) => {
    if (availableCols.has(colName)) {
      insertData[colName] = value;
    }
  };

  // Mapear campos estándar y variantes comunes
  mapIfAvailable('title', title);
  mapIfAvailable('slug', slug);
  mapIfAvailable('category_id', categoryId ? Number(categoryId) : null);
  mapIfAvailable('status', status);

  // Contenido
  if (availableCols.has('content')) insertData['content'] = content;
  else if (availableCols.has('body')) insertData['body'] = content;

  // Resumen / Bajada
  if (availableCols.has('summary')) insertData['summary'] = summary;
  else if (availableCols.has('lead')) insertData['lead'] = summary;
  else if (availableCols.has('excerpt')) insertData['excerpt'] = summary;

  // Imagen
  if (availableCols.has('image_url')) insertData['image_url'] = imageUrl;
  else if (availableCols.has('cover_image')) insertData['cover_image'] = imageUrl;
  else if (availableCols.has('image')) insertData['image'] = imageUrl;

  // Autor
  if (availableCols.has('author_name')) insertData['author_name'] = authorName;
  else if (availableCols.has('author')) insertData['author'] = authorName;

  // Fechas
  if (availableCols.has('published_at')) insertData['published_at'] = publishedAt;
  else if (availableCols.has('publish_date')) insertData['publish_date'] = publishedAt;

  if (availableCols.has('created_at')) insertData['created_at'] = nowIso;
  if (availableCols.has('updated_at')) insertData['updated_at'] = nowIso;

  const colNames = Object.keys(insertData);
  if (colNames.length === 0) {
    return new Response(JSON.stringify({ error: 'No se pudieron mapear los campos a la tabla articles.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const placeholders = colNames.map(() => '?').join(', ');
  const values = colNames.map(k => insertData[k]);

  const insertSql = `INSERT INTO articles (${colNames.join(', ')}) VALUES (${placeholders})`;

  try {
    const result = await db.prepare(insertSql).bind(...values).run();
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Noticia guardada exitosamente.',
        articleId: result.meta?.last_row_id || result.lastRowId,
        slug
      }),
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (err) {
    console.error('Error al insertar noticia en D1:', err);
    return new Response(
      JSON.stringify({
        error: 'Error al registrar la noticia en la base de datos.',
        details: err.message
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
