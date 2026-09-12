/**
 * ============================================================================
 * LINEA ABIERTA (lineaabierta.net.pe)
 * Cloudflare Worker Dedicado: linea-abierta-cron
 * ============================================================================
 * 
 * Cron Trigger: "0 11 * * *" (Una vez al día a las 11:00 UTC = 06:00 a. m. Perú UTC-5)
 * Conexión: Base de datos Cloudflare D1 existente (linea-abierta-db) vía binding "DB".
 * 
 * FASE 6.4 (Primera Etapa):
 * Ingesta gratuita de fuentes informativas abiertas (RPP Noticias RSS y estructura
 * extensible para MEF, BCRP y Congreso), detección de noticias nuevas y guardado
 * seguro en D1 como borrador (status = 'draft', máximo 9 por día).
 * Cero uso de Gemini, APIs de pago o imágenes en esta etapa.
 */

import {
  NEWS_PROVIDERS,
  fetchAllActiveSources,
  generateSlug
} from "./sources/index.js";

import {
  processEditorialDrafts
} from "./editorial/index.js";

import {
  DEFAULT_GEMINI_MODEL,
  FALLBACK_GEMINI_MODEL
} from "./editorial/gemini.js";

// Definición editorial de los 9 slots de noticias de Linea Abierta
export const EDITORIAL_NEWS_SLOTS = [
  {
    slot: 1,
    role: "lead_story",
    placement: "Portada - Principal Destacada",
    category_slug: "politica",
    category_id: 1,
    category_name: "Política",
    description: "Acontecimiento político o institucional nacional de mayor relevancia del día."
  },
  {
    slot: 2,
    role: "featured_sub1",
    placement: "Portada - Secundaria Destacada 1",
    category_slug: "economia",
    category_id: 4,
    category_name: "Economía",
    description: "Análisis económico nacional, tipo de cambio, mercados, inversión, agroexportación o minería."
  },
  {
    slot: 3,
    role: "featured_sub2",
    placement: "Portada - Secundaria Destacada 2",
    category_slug: "actualidad",
    category_id: 2,
    category_name: "Actualidad",
    description: "Noticia de alto interés ciudadano, infraestructura, transporte o servicios públicos."
  },
  {
    slot: 4,
    role: "feed_story",
    placement: "Feed de Noticias - Regiones",
    category_slug: "regiones",
    category_id: 3,
    category_name: "Regiones",
    description: "Noticia del interior del país (Arequipa, Cusco, La Libertad, Piura, Junín, etc.)."
  },
  {
    slot: 5,
    role: "feed_story",
    placement: "Feed de Noticias - Política",
    category_slug: "politica",
    category_id: 1,
    category_name: "Política",
    description: "Actividad legislativa del Congreso, reformas o agenda del Ejecutivo y Poder Judicial."
  },
  {
    slot: 6,
    role: "feed_story",
    placement: "Feed de Noticias - Economía",
    category_slug: "economia",
    category_id: 4,
    category_name: "Economía",
    description: "Comercio exterior, emprendimiento, empleo, mypes o innovación financiera en el Perú."
  },
  {
    slot: 7,
    role: "feed_story",
    placement: "Feed de Noticias - Deportes",
    category_slug: "deportes",
    category_id: 5,
    category_name: "Deportes",
    description: "Fútbol profesional peruano (Liga 1), Selección Nacional de Fútbol o atletas polideportivos."
  },
  {
    slot: 8,
    role: "feed_story",
    placement: "Feed de Noticias - Tendencias",
    category_slug: "tendencias",
    category_id: 7,
    category_name: "Tendencias",
    description: "Innovación científica, tecnología, cultura, medio ambiente o sociedad digital en Perú."
  },
  {
    slot: 9,
    role: "feed_story",
    placement: "Feed de Noticias - Opinión",
    category_slug: "opinion",
    category_id: 6,
    category_name: "Opinión",
    description: "Columna o análisis editorial de fondo sobre los retos contemporáneos del Perú."
  }
];

/**
 * Obtiene la fecha y hora formateada en la zona horaria de Perú (America/Lima, UTC-5).
 */
export function getPeruTimeInfo() {
  const now = new Date();
  
  const peruTimeString = now.toLocaleString("es-PE", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const peruDateString = now.toLocaleDateString("es-PE", {
    timeZone: "America/Lima",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  return {
    utc_iso: now.toISOString(),
    peru_time: peruTimeString,
    peru_date_readable: peruDateString,
    timezone: "America/Lima (UTC-5)"
  };
}

/**
 * Selecciona y balancea hasta un máximo de 9 noticias candidatas para cubrir los slots editoriales.
 */
export function selectDailyNewsCandidates(candidates, existingSlugsSet, maxLimit = 9) {
  const selected = [];
  const seenSlugs = new Set(existingSlugsSet);

  // Agrupar candidatos no duplicados por categoría
  const byCategory = new Map();
  for (const item of candidates) {
    if (seenSlugs.has(item.slug)) continue;
    seenSlugs.add(item.slug);

    const catId = item.category_id || 2;
    if (!byCategory.has(catId)) {
      byCategory.set(catId, []);
    }
    byCategory.get(catId).push(item);
  }

  // 1. Ronda 1: Seleccionar al menos 1 noticia representativa de cada categoría detectada
  const preferredCategoryOrder = [1, 4, 2, 3, 5, 7, 6]; // Política, Economía, Actualidad, Regiones, Deportes, Tendencias, Opinión
  for (const catId of preferredCategoryOrder) {
    if (selected.length >= maxLimit) break;
    const catList = byCategory.get(catId);
    if (catList && catList.length > 0) {
      selected.push(catList.shift());
    }
  }

  // 2. Ronda 2: Si aún no llegamos a 9, completar con las noticias restantes más recientes
  for (const catId of preferredCategoryOrder) {
    if (selected.length >= maxLimit) break;
    const catList = byCategory.get(catId);
    while (catList && catList.length > 0 && selected.length < maxLimit) {
      selected.push(catList.shift());
    }
  }

  return selected;
}

/**
 * Detecta dinámicamente las columnas disponibles en la tabla 'articles' de Cloudflare D1
 * para máxima compatibilidad y tolerancia a variaciones de esquema.
 */
export async function getArticleTableColumns(db) {
  try {
    const { results } = await db.prepare("PRAGMA table_info(articles)").all();
    if (results && Array.isArray(results) && results.length > 0) {
      return new Set(results.map(r => r.name.toLowerCase()));
    }
  } catch (err) {
    console.warn("No se pudo obtener información de columnas de articles vía PRAGMA:", err?.message || err);
  }
  return new Set();
}

/**
 * Ejecutor del ciclo diario de ingesta y guardado en D1 (FASE 6.4 - Almacenamiento Real).
 * @param {object} env - Variables de entorno y bindings de Cloudflare Workers
 * @param {string} triggerSource - Identificador de origen ('cron', 'http', etc.)
 * @param {boolean} dryRun - Si es true, solo consulta fuentes sin guardar en D1
 */
export async function runDailyScheduler(env, triggerSource = "scheduled", dryRun = false) {
  const startTime = Date.now();
  const timeInfo = getPeruTimeInfo();

  let dbStatus = {
    connected: false,
    message: "Base de datos D1 no vinculada.",
    total_articles: 0
  };

  const existingSlugsSet = new Set();
  const existingTitlesSet = new Set();

  let todayArticlesCount = 0;

  // 1. Verificar conexión a D1 y obtener artículos existentes para evitar duplicados
  if (env && env.DB) {
    try {
      const articleCount = await env.DB.prepare("SELECT COUNT(*) AS total FROM articles").first();
      dbStatus = {
        connected: true,
        message: "Conexión con Cloudflare D1 (linea-abierta-db) activa.",
        total_articles: articleCount ? articleCount.total : 0
      };

      // Contar noticias registradas hoy para respetar la cuota estricta de 9 por día
      try {
        const todayPrefix = timeInfo.utc_iso.slice(0, 10);
        const todayCountRow = await env.DB.prepare(
          "SELECT COUNT(*) AS total FROM articles WHERE created_at LIKE ?"
        ).bind(`${todayPrefix}%`).first();
        todayArticlesCount = todayCountRow ? Number(todayCountRow.total || 0) : 0;
      } catch {
        todayArticlesCount = 0;
      }

      // Cargar títulos y slugs recientes para deduplicación estricta
      const recentRows = await env.DB.prepare("SELECT title, slug FROM articles ORDER BY id DESC LIMIT 300").all();
      if (recentRows && Array.isArray(recentRows.results)) {
        recentRows.results.forEach(r => {
          if (r.slug) existingSlugsSet.add(r.slug);
          if (r.title) existingTitlesSet.add(r.title.toLowerCase().trim());
        });
      }
    } catch (err) {
      dbStatus = {
        connected: false,
        message: `Error al consultar D1: ${err.message}`,
        total_articles: 0
      };
    }
  }

  // 2. Ingesta de fuentes informativas gratuitas (RPP Noticias y estructura extensible)
  const sourcesResult = await fetchAllActiveSources();
  const allCandidates = sourcesResult.candidates || [];

  // 3. Filtrar candidatos ya registrados en D1
  const freshCandidates = allCandidates.filter(c => {
    const isSlugDuplicate = existingSlugsSet.has(c.slug);
    const isTitleDuplicate = existingTitlesSet.has(c.title.toLowerCase().trim());
    return !isSlugDuplicate && !isTitleDuplicate;
  });

  const dailyQuotaLimit = 9;
  const isForced = typeof triggerSource === "string" && triggerSource.includes("force");
  const remainingQuota = isForced ? dailyQuotaLimit : Math.max(0, dailyQuotaLimit - todayArticlesCount);

  // 4. Seleccionar hasta un máximo de 9 noticias balanceadas para el día (respetando cuota restante)
  const selectedToStore = remainingQuota > 0
    ? selectDailyNewsCandidates(freshCandidates, existingSlugsSet, remainingQuota)
    : [];

  const insertedArticles = [];
  const insertErrors = [];

  // 5. Guardar en D1 únicamente si la base de datos está disponible y no es dryRun
  if (env && env.DB && !dryRun && selectedToStore.length > 0) {
    const nowIso = timeInfo.utc_iso;
    const availableCols = await getArticleTableColumns(env.DB);

    for (const item of selectedToStore) {
      try {
        // Garantizar slug único
        let finalSlug = item.slug;
        if (existingSlugsSet.has(finalSlug)) {
          finalSlug = `${finalSlug}-${Date.now().toString(36)}`;
        }
        existingSlugsSet.add(finalSlug);

        // Formatear contenido crudo preservando metadatos para la fase de procesamiento IA
        const rawContentWithMeta = `<!-- FUENTE: ${item.source_name} | URL: ${item.source_url} | DETECTADO: ${nowIso} -->\n\n${item.raw_content}`;

        const insertData = {};
        const setCol = (colName, val) => {
          if (availableCols.size === 0 || availableCols.has(colName.toLowerCase())) {
            insertData[colName] = val;
          }
        };

        setCol("title", item.title);
        setCol("slug", finalSlug);

        // Resumen / Bajada
        if (availableCols.size === 0 || availableCols.has("summary")) {
          insertData["summary"] = item.summary || "";
        } else if (availableCols.has("lead")) {
          insertData["lead"] = item.summary || "";
        } else if (availableCols.has("excerpt")) {
          insertData["excerpt"] = item.summary || "";
        }

        // Contenido
        if (availableCols.size === 0 || availableCols.has("content")) {
          insertData["content"] = rawContentWithMeta;
        } else if (availableCols.has("body")) {
          insertData["body"] = rawContentWithMeta;
        }

        // Imagen
        if (availableCols.size === 0 || availableCols.has("image_url")) {
          insertData["image_url"] = item.image_url || "";
        } else if (availableCols.has("cover_image")) {
          insertData["cover_image"] = item.image_url || "";
        } else if (availableCols.has("image")) {
          insertData["image"] = item.image_url || "";
        }

        // Autor
        const authorVal = `${item.source_name} (Fuente Detectada)`;
        if (availableCols.size === 0 || availableCols.has("author_name")) {
          insertData["author_name"] = authorVal;
        } else if (availableCols.has("author")) {
          insertData["author"] = authorVal;
        }

        setCol("category_id", item.category_id || 2);
        setCol("status", "draft");

        // Fechas: status='draft' y published_at=null asegura 100% que NO se publica en la web pública
        if (availableCols.size === 0 || availableCols.has("published_at")) {
          insertData["published_at"] = null;
        } else if (availableCols.has("publish_date")) {
          insertData["publish_date"] = null;
        }

        if (availableCols.size === 0 || availableCols.has("created_at")) {
          insertData["created_at"] = nowIso;
        }
        if (availableCols.size === 0 || availableCols.has("updated_at")) {
          insertData["updated_at"] = nowIso;
        }

        const colNames = Object.keys(insertData);
        const placeholders = colNames.map(() => "?").join(", ");
        const values = colNames.map(k => insertData[k]);
        const insertSql = `INSERT INTO articles (${colNames.join(", ")}) VALUES (${placeholders})`;

        const result = await env.DB.prepare(insertSql).bind(...values).run();

        insertedArticles.push({
          id: result.meta?.last_row_id || result.lastRowId,
          title: item.title,
          slug: finalSlug,
          category_id: item.category_id,
          category_name: item.category_name,
          source_url: item.source_url,
          status: "draft"
        });
      } catch (err) {
        insertErrors.push({
          title: item.title,
          error: err.message
        });
      }
    }
  }

  return {
    success: true,
    task: "linea_abierta_source_ingestion",
    phase: "FASE 6.4 — Almacenamiento Real de Borradores en D1",
    mode: dryRun ? "read_only_dry_run" : "real_storage",
    trigger_source: triggerSource,
    execution_time_ms: Date.now() - startTime,
    time_info: timeInfo,
    dry_run: dryRun,
    d1_database: dbStatus,
    providers: NEWS_PROVIDERS,
    ingest_metrics: {
      candidates_detected: allCandidates.length,
      duplicates_skipped: allCandidates.length - freshCandidates.length,
      fresh_candidates_available: freshCandidates.length,
      daily_quota_limit: dailyQuotaLimit,
      articles_created_today: todayArticlesCount,
      remaining_daily_quota: remainingQuota,
      candidates_selected: selectedToStore.length,
      saved_in_d1: insertedArticles.length,
      failed_inserts: insertErrors.length
    },
    saved_drafts: insertedArticles,
    errors: insertErrors,
    editorial_ai: {
      provider: "Google Gemini",
      tier: "free_tier (Google AI Studio)",
      billing_active: false,
      google_search_grounding: false,
      nano_banana: false,
      model_primary: env?.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
      model_fallback: FALLBACK_GEMINI_MODEL,
      api_key_configured: Boolean(env && (env.GEMINI_API_KEY || env.GOOGLE_API_KEY))
    },
    security: {
      manual_execution_endpoint: "/run",
      manual_execution_protected: true,
      cron_secret_configured: Boolean(env && (env.CRON_SECRET || env.ADMIN_SECRET)),
      automatic_cron_isolated: true // El Cron diario se ejecuta de forma interna sin requerir cabeceras HTTP
    }
  };
}

/**
 * Comparación de cadenas en tiempo constante (timing-safe) para mitigar ataques de temporización.
 */
export function timingSafeEqualStr(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.byteLength !== bBytes.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.byteLength; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

/**
 * Valida la autorización para la ejecución manual del endpoint /run.
 * Métodos aceptados:
 * 1. Cabecera Authorization: Bearer <token>
 * 2. Cabecera X-Cron-Key: <token>
 * 3. Parámetro en la URL ?key=<token> o ?token=<token>
 */
export function checkManualExecutionAuth(request, env) {
  if (!env) {
    return { authorized: false, reason: "Entorno no disponible." };
  }

  const secret = env.CRON_SECRET || env.ADMIN_SECRET;
  if (!secret || typeof secret !== "string" || secret.trim().length === 0) {
    return {
      authorized: false,
      reason: "La variable de entorno secreta CRON_SECRET no está configurada en Cloudflare Workers."
    };
  }

  const trimmedSecret = secret.trim();

  // 1. Cabecera Authorization: Bearer <token>
  const authHeader = request.headers.get("Authorization") || "";
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch && timingSafeEqualStr(bearerMatch[1].trim(), trimmedSecret)) {
    return { authorized: true, method: "bearer_header" };
  }

  // 2. Cabecera personalizada X-Cron-Key: <token>
  const headerKey = request.headers.get("X-Cron-Key") || "";
  if (headerKey && timingSafeEqualStr(headerKey.trim(), trimmedSecret)) {
    return { authorized: true, method: "x_cron_key_header" };
  }

  // 3. Parámetro en la URL: ?key=<token> o ?token=<token>
  const url = new URL(request.url);
  const queryKey = url.searchParams.get("key") || url.searchParams.get("token") || "";
  if (queryKey && timingSafeEqualStr(queryKey.trim(), trimmedSecret)) {
    return { authorized: true, method: "query_parameter" };
  }

  return {
    authorized: false,
    reason: "Clave secreta no proporcionada o inválida."
  };
}

export default {
  /**
   * Listener de eventos programados (Cron Trigger).
   * Se ejecuta automáticamente a las 06:00 a. m. hora de Perú (11:00 UTC).
   * El Cron automático es 100% interno y no depende de llamadas HTTP externas ni de claves secretas.
   */
  async scheduled(event, env, ctx) {
    console.log(`[Cron Trigger Iniciado] ${event.cron} | ${new Date(event.scheduledTime).toISOString()}`);
    
    ctx.waitUntil((async () => {
      try {
        const result = await runDailyScheduler(env, `cron:${event.cron}`, false);
        console.log(`[Cron Ingesta Exitosa] Resumen:`, JSON.stringify({
          time_peru: result.time_info.peru_time,
          candidatos_detectados: result.ingest_metrics.candidates_detected,
          guardados_en_d1: result.ingest_metrics.saved_in_d1,
          articulos: result.saved_drafts.map(a => a.title)
        }));
        // FASE 6.5: Procesar redacción editorial con Gemini si la API key está configurada
        if (env && (env.GEMINI_API_KEY || env.GOOGLE_API_KEY)) {
          const editorialRes = await processEditorialDrafts(env, { limit: 9 });
          console.log(`[Cron Redacción Editorial] Resumen:`, JSON.stringify({
            procesados: editorialRes.processed_count,
            omitidos: editorialRes.skipped_count
          }));
        }
      } catch (err) {
        console.error(`[Cron Ingesta Error]:`, err);
      }
    })());
  },

  /**
   * Listener HTTP (Fetch).
   * Proporciona diagnóstico seguro (/status), ejecución manual protegida (/run)
   * y redacción editorial con Gemini (/rewrite).
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. Estado y diagnóstico general seguro (dry-run: nunca modifica D1)
    if (url.pathname === "/" || url.pathname === "/status") {
      try {
        const result = await runDailyScheduler(env, `http:${request.method}`, true);
        return new Response(JSON.stringify(result, null, 2), {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store"
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json; charset=utf-8" }
        });
      }
    }

    // 2. Vista previa en vivo de las fuentes (solo lectura, sin tocar D1)
    if (url.pathname === "/sources") {
      try {
        const sources = await fetchAllActiveSources();
        return new Response(JSON.stringify(sources, null, 2), {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store"
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json; charset=utf-8" }
        });
      }
    }

    // 3. Ejecución activa manual (guarda borradores en D1) - PROTEGIDO CON CLAVE SECRETA
    if (url.pathname === "/run") {
      const auth = checkManualExecutionAuth(request, env);

      if (!auth.authorized) {
        return new Response(JSON.stringify({
          success: false,
          error: "Acceso no autorizado al endpoint de ejecución manual (/run).",
          reason: auth.reason,
          help: "Configura la variable secreta CRON_SECRET en Cloudflare Workers (Settings > Variables) y envía la clave en la cabecera Authorization (Bearer), X-Cron-Key o parámetro ?key=..."
        }, null, 2), {
          status: 401,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "WWW-Authenticate": "Bearer realm='linea-abierta-cron'"
          }
        });
      }

      const force = url.searchParams.get("force") === "true" || url.searchParams.get("force") === "1";
      const sourceTag = `http_auth:${request.method}:${auth.method}${force ? ":force" : ""}`;

      try {
        const result = await runDailyScheduler(env, sourceTag, false);
        return new Response(JSON.stringify(result, null, 2), {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store"
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json; charset=utf-8" }
        });
      }
    }

    // 4. Redacción editorial manual con Gemini API (PROTEGIDO CON CLAVE SECRETA)
    if (url.pathname === "/rewrite" || url.pathname === "/editorial/rewrite") {
      const auth = checkManualExecutionAuth(request, env);

      if (!auth.authorized) {
        return new Response(JSON.stringify({
          success: false,
          error: "Acceso no autorizado al endpoint de redacción editorial (/rewrite).",
          reason: auth.reason,
          help: "Configura la variable secreta CRON_SECRET en Cloudflare Workers y envía la clave en Authorization (Bearer), X-Cron-Key o parámetro ?key=..."
        }, null, 2), {
          status: 401,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "WWW-Authenticate": "Bearer realm='linea-abierta-cron'"
          }
        });
      }

      const limit = parseInt(url.searchParams.get("limit") || "1", 10);
      const articleId = url.searchParams.get("id");

      try {
        const result = await processEditorialDrafts(env, { limit, articleId });
        return new Response(JSON.stringify(result, null, 2), {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store"
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json; charset=utf-8" }
        });
      }
    }

    return new Response(JSON.stringify({
      error: "Ruta no encontrada.",
      endpoints_disponibles: [
        { path: "/", description: "Diagnóstico general seguro (dry-run, lectura segura)" },
        { path: "/status", description: "Estado, hora de Perú y fuentes configuradas" },
        { path: "/sources", description: "Vista previa en vivo del feed RPP (solo lectura)" },
        { path: "/run", description: "Ejecutar ingesta activa y guardar borradores en D1 (PROTEGIDO con CRON_SECRET)" },
        { path: "/rewrite", description: "Redactar versiones originales con Gemini API (PROTEGIDO con CRON_SECRET, ?limit=1)" }
      ]
    }, null, 2), {
      status: 404,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }
};
