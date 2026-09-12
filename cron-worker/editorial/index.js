/**
 * ============================================================================
 * LINEA ABIERTA (lineaabierta.net.pe)
 * Orquestador Editorial: Procesamiento de Borradores con Gemini
 * ============================================================================
 * 
 * Toma los borradores almacenados en Cloudflare D1 y genera versiones editoriales
 * originales de Linea Abierta con Gemini API, preservando trazabilidad y estado 'draft'.
 */

import { generateEditorialArticle } from "./gemini.js";
import { generateSlug } from "../sources/index.js";
import { getArticleTableColumns } from "../index.js";

/**
 * Extrae metadatos de la fuente original embebidos en el comentario HTML del contenido.
 */
export function parseSourceMetadata(content) {
  const result = {
    source_name: "Fuente Abierta",
    source_url: "",
    detected_at: "",
    clean_content: content || ""
  };

  if (!content || typeof content !== "string") return result;

  const metaMatch = content.match(/<!--\s*FUENTE:\s*([^|]+?)\s*\|\s*URL:\s*([^|]+?)\s*\|\s*DETECTADO:\s*([^>]+?)\s*-->/);
  if (metaMatch) {
    result.source_name = metaMatch[1].trim();
    result.source_url = metaMatch[2].trim();
    result.detected_at = metaMatch[3].trim();
    // Remover el comentario para alimentar a Gemini con texto limpio
    result.clean_content = content.replace(metaMatch[0], "").trim();
  }

  return result;
}

/**
 * Consulta en D1 los borradores que aún no han sido procesados editorialmente.
 */
export async function getPendingEditorialDrafts(db, limit = 1, specificId = null) {
  if (!db) return [];

  try {
    if (specificId) {
      const row = await db.prepare(
        "SELECT * FROM articles WHERE id = ? AND status = 'draft'"
      ).bind(specificId).first();
      return row ? [row] : [];
    }

    // Buscar borradores que contengan autoría de fuente detectada o que no hayan sido redactados
    const sql = `
      SELECT * FROM articles 
      WHERE status = 'draft' 
        AND (author_name LIKE '%Fuente Detectada%' OR content NOT LIKE '%REDACTADO_EDITORIAL%')
      ORDER BY id ASC 
      LIMIT ?
    `;
    const { results } = await db.prepare(sql).bind(limit).all();
    return Array.isArray(results) ? results : [];
  } catch (err) {
    console.error("[Editorial Engine] Error al consultar borradores pendientes:", err);
    return [];
  }
}

/**
 * Procesa un borrador individual con Gemini y actualiza el registro en D1.
 * Mantiene estrictamente status = 'draft' y published_at = null.
 */
export async function processSingleDraft(article, env) {
  const meta = parseSourceMetadata(article.content);
  const nowIso = new Date().toISOString();

  // 1. Invocar Gemini API con directrices editoriales y anti-alucinación
  const rewriteResult = await generateEditorialArticle({
    title: article.title,
    summary: article.summary,
    raw_content: meta.clean_content,
    category_name: article.category_name || "Actualidad"
  }, env);

  if (!rewriteResult.success) {
    return {
      id: article.id,
      success: false,
      skipped: true,
      reason: rewriteResult.reason || rewriteResult.error || "Fallo en llamada a Gemini API"
    };
  }

  const editorialData = rewriteResult.data;

  // 2. Si la información es insuficiente, conservar el borrador intacto sin inventar nada
  if (editorialData.insufficient_info === true || !editorialData.content || editorialData.content.trim().length < 50) {
    return {
      id: article.id,
      success: false,
      skipped: true,
      reason: "Información de fuente insuficiente para redacción responsable (conservado sin modificar)"
    };
  }

  // 3. Generar slug editorial limpio a partir del nuevo titular
  const newSlugCandidate = generateSlug(editorialData.title || article.title);
  let finalSlug = newSlugCandidate;

  // Comprobar colisión de slug en D1 si cambió respecto al actual
  if (finalSlug !== article.slug && env.DB) {
    try {
      const collision = await env.DB.prepare(
        "SELECT id FROM articles WHERE slug = ? AND id != ?"
      ).bind(finalSlug, article.id).first();

      if (collision) {
        finalSlug = `${finalSlug}-${Date.now().toString(36)}`;
      }
    } catch {
      // Continuar con finalSlug
    }
  }

  // 4. Formatear contenido final preservando trazabilidad interna con encabezado HTML oculto
  const sourceName = meta.source_name || "Fuente Abierta";
  const sourceUrl = meta.source_url || "";
  const finalContent = `<!-- FUENTE: ${sourceName} | URL: ${sourceUrl} | REDACTADO_EDITORIAL: ${nowIso} | MODELO: ${rewriteResult.model_used} -->\n\n${editorialData.content.trim()}`;

  // 5. Actualizar en D1 respetando columnas dinámicas y manteniendo status='draft' y published_at=null
  const availableCols = await getArticleTableColumns(env.DB);
  const updateFields = {};

  const setCol = (colName, val) => {
    if (availableCols.size === 0 || availableCols.has(colName.toLowerCase())) {
      updateFields[colName] = val;
    }
  };

  setCol("title", editorialData.title.trim());
  setCol("slug", finalSlug);

  // Resumen / Bajada
  if (availableCols.size === 0 || availableCols.has("summary")) {
    updateFields["summary"] = editorialData.summary.trim();
  } else if (availableCols.has("lead")) {
    updateFields["lead"] = editorialData.summary.trim();
  }

  // Contenido
  if (availableCols.size === 0 || availableCols.has("content")) {
    updateFields["content"] = finalContent;
  } else if (availableCols.has("body")) {
    updateFields["body"] = finalContent;
  }

  // Autoría oficial de redacción
  if (availableCols.size === 0 || availableCols.has("author_name")) {
    updateFields["author_name"] = "Redacción Linea Abierta";
  } else if (availableCols.has("author")) {
    updateFields["author"] = "Redacción Linea Abierta";
  }

  // Garantías inalterables de seguridad: SIEMPRE borrador, NUNCA publicado
  if (availableCols.size === 0 || availableCols.has("status")) {
    updateFields["status"] = "draft";
  }
  if (availableCols.size === 0 || availableCols.has("published_at")) {
    updateFields["published_at"] = null;
  }

  if (availableCols.size === 0 || availableCols.has("updated_at")) {
    updateFields["updated_at"] = nowIso;
  }

  const setClauses = Object.keys(updateFields).map(k => `${k} = ?`).join(", ");
  const values = [...Object.values(updateFields), article.id];
  const updateSql = `UPDATE articles SET ${setClauses} WHERE id = ?`;

  await env.DB.prepare(updateSql).bind(...values).run();

  return {
    id: article.id,
    success: true,
    model_used: rewriteResult.model_used,
    source_url: sourceUrl,
    old_title: article.title,
    new_title: editorialData.title.trim(),
    new_slug: finalSlug,
    summary: editorialData.summary.trim(),
    word_count: editorialData.content.trim().split(/\s+/).length,
    status: "draft",
    published_at: null
  };
}

/**
 * Procesa un lote de borradores (por defecto 1 para pruebas controladas, o más).
 * 
 * @param {object} env - Variables de entorno y bindings de Cloudflare Workers
 * @param {object} options - { limit = 1, articleId = null }
 */
export async function processEditorialDrafts(env, options = {}) {
  const limit = Math.max(1, Math.min(9, parseInt(options.limit || 1, 10)));
  const specificId = options.articleId ? parseInt(options.articleId, 10) : null;

  if (!env || !env.DB) {
    return {
      success: false,
      error: "Base de datos D1 no vinculada en el Worker."
    };
  }

  const drafts = await getPendingEditorialDrafts(env.DB, limit, specificId);

  if (drafts.length === 0) {
    return {
      success: true,
      message: "No hay borradores pendientes de redacción editorial en D1.",
      processed_count: 0,
      skipped_count: 0,
      results: []
    };
  }

  const results = [];
  for (const draft of drafts) {
    try {
      const res = await processSingleDraft(draft, env);
      results.push(res);
    } catch (err) {
      results.push({
        id: draft.id,
        success: false,
        error: err.message
      });
    }
  }

  const processedCount = results.filter(r => r.success).length;
  const skippedCount = results.filter(r => !r.success).length;

  return {
    success: true,
    task: "editorial_gemini_rewrite",
    phase: "FASE 6.5 — Redacción Editorial Gratuita con Gemini API",
    processed_count: processedCount,
    skipped_count: skippedCount,
    results
  };
}
