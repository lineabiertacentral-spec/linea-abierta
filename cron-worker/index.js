/**
 * ============================================================================
 * LINEA ABIERTA (lineaabierta.net.pe)
 * Cloudflare Worker Dedicado: linea-abierta-cron
 * ============================================================================
 * 
 * Cron Trigger: "0 11 * * *" (Una vez al día a las 11:00 UTC = 06:00 a. m. Perú UTC-5)
 * Conexión: Base de datos Cloudflare D1 existente (linea-abierta-db) vía binding "DB".
 * 
 * FASE 6.3: Estructura del programador diario preparada para la orquestación
 * de 9 noticias editoriales. En esta fase NO se conecta Gemini ni APIs externas,
 * y NO se publica ningún artículo nuevo todavía (modo diagnóstico / dry-run).
 */

// Definición editorial de los 9 slots de noticias de Linea Abierta
export const EDITORIAL_NEWS_SLOTS = [
  {
    slot: 1,
    role: "lead_story",
    placement: "Portada - Principal Destacada",
    category_slug: "politica",
    category_name: "Política",
    description: "Acontecimiento político o institucional nacional de mayor relevancia del día.",
    prompt_guideline: "Profundidad, rigurosidad institucional, enfoque plural y equilibrado sin sesgo partidario."
  },
  {
    slot: 2,
    role: "featured_sub1",
    placement: "Portada - Secundaria Destacada 1",
    category_slug: "economia",
    category_name: "Economía",
    description: "Análisis económico nacional, tipo de cambio, mercados, inversión, agroexportación o minería.",
    prompt_guideline: "Cifras oficiales (BCRP, MEF, INEI), impacto en bolsillos ciudadanos y empresas."
  },
  {
    slot: 3,
    role: "featured_sub2",
    placement: "Portada - Secundaria Destacada 2",
    category_slug: "actualidad",
    category_name: "Actualidad",
    description: "Noticia de alto interés ciudadano, infraestructura, transporte o servicios públicos.",
    prompt_guideline: "Información útil, veraz y de servicio para la comunidad."
  },
  {
    slot: 4,
    role: "feed_story",
    placement: "Feed de Noticias - Regiones",
    category_slug: "regiones",
    category_name: "Regiones",
    description: "Noticia del interior del país (Arequipa, Cusco, La Libertad, Piura, Junín, etc.).",
    prompt_guideline: "Visión descentralizada, desarrollo regional, desafíos locales y proyectos."
  },
  {
    slot: 5,
    role: "feed_story",
    placement: "Feed de Noticias - Política",
    category_slug: "politica",
    category_name: "Política",
    description: "Actividad legislativa del Congreso, reformas o agenda del Ejecutivo y Poder Judicial.",
    prompt_guideline: "Seguimiento riguroso de proyectos de ley y decisiones estatales."
  },
  {
    slot: 6,
    role: "feed_story",
    placement: "Feed de Noticias - Economía",
    category_slug: "economia",
    category_name: "Economía",
    description: "Comercio exterior, emprendimiento, empleo, mypes o innovación financiera en el Perú.",
    prompt_guideline: "Datos verificables, análisis técnico accesible y tendencias productivas."
  },
  {
    slot: 7,
    role: "feed_story",
    placement: "Feed de Noticias - Deportes",
    category_slug: "deportes",
    category_name: "Deportes",
    description: "Fútbol profesional peruano (Liga 1), Selección Nacional de Fútbol o atletas polideportivos.",
    prompt_guideline: "Crónica deportiva constructiva, rendimiento de atletas peruanos y calendario competitivo."
  },
  {
    slot: 8,
    role: "feed_story",
    placement: "Feed de Noticias - Tendencias",
    category_slug: "tendencias",
    category_name: "Tendencias",
    description: "Innovación científica, tecnología, cultura, medio ambiente o sociedad digital en Perú.",
    prompt_guideline: "Avances tecnológicos, ciencia aplicada, patrimonio cultural y tendencias ciudadanas."
  },
  {
    slot: 9,
    role: "feed_story",
    placement: "Feed de Noticias - Opinión",
    category_slug: "opinion",
    category_name: "Opinión",
    description: "Columna o análisis editorial de fondo sobre los retos contemporáneos del Perú.",
    prompt_guideline: "Perspectiva analítica, balanceada y constructiva orientada al debate cívico alturado."
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
 * Ejecutor del ciclo diario de generación (FASE 6.3 - Modo Estructura / Diagnóstico)
 */
export async function runDailyScheduler(env, triggerSource = "scheduled") {
  const startTime = Date.now();
  const timeInfo = getPeruTimeInfo();

  let dbStatus = {
    connected: false,
    message: "Base de datos D1 no vinculada.",
    total_articles: 0
  };

  // Verificar conexión con la base de datos D1 existente (si el binding está configurado)
  if (env && env.DB) {
    try {
      const articleCount = await env.DB.prepare("SELECT COUNT(*) AS total FROM articles").first();
      dbStatus = {
        connected: true,
        message: "Conexión con Cloudflare D1 (linea-abierta-db) verificada con éxito.",
        total_articles: articleCount ? articleCount.total : 0
      };
    } catch (err) {
      dbStatus = {
        connected: false,
        message: `Error al consultar D1: ${err.message}`,
        total_articles: 0
      };
    }
  }

  const executionLog = {
    success: true,
    task: "linea_abierta_daily_scheduler",
    trigger_source: triggerSource,
    cron_target: "0 11 * * *",
    cron_description: "06:00 a. m. hora de Perú (UTC-5) / 11:00 UTC",
    phase: "FASE 6.3 — Estructura del Programador Diario",
    execution_time_ms: Date.now() - startTime,
    time_info: timeInfo,
    d1_database: dbStatus,
    plan: {
      total_news_planned: EDITORIAL_NEWS_SLOTS.length,
      mode: "dry_run",
      notice: "Fase 6.3 completada. No se crearon ni publicaron noticias en D1. La estructura de los 9 slots está lista para la FASE 6.4.",
      slots: EDITORIAL_NEWS_SLOTS
    }
  };

  return executionLog;
}

export default {
  /**
   * Listener de eventos programados (Cron Trigger).
   * Se ejecuta automáticamente según la expresión configurada en wrangler.toml:
   * "0 11 * * *" (11:00 UTC = 06:00 a. m. Perú).
   */
  async scheduled(event, env, ctx) {
    console.log(`[Cron Trigger Iniciado] Cron: ${event.cron} | Timestamp: ${new Date(event.scheduledTime).toISOString()}`);
    
    // ctx.waitUntil garantiza que el Worker no termine hasta completar las promesas
    ctx.waitUntil((async () => {
      try {
        const result = await runDailyScheduler(env, `cron:${event.cron}`);
        console.log(`[Cron Ejecución Exitosa] Resumen:`, JSON.stringify({
          time_peru: result.time_info.peru_time,
          d1_status: result.d1_database.message,
          total_articles_in_db: result.d1_database.total_articles,
          slots_planned: result.plan.total_news_planned
        }));
      } catch (err) {
        console.error(`[Cron Error]:`, err);
      }
    })());
  },

  /**
   * Listener HTTP (Fetch).
   * Permite consultar el estado del Worker y probar la lógica bajo demanda
   * desde cualquier navegador o terminal sin esperar a las 06:00 a. m.
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Endpoint de prueba y diagnóstico del Cron
    if (url.pathname === "/" || url.pathname === "/status" || url.pathname === "/run") {
      try {
        const result = await runDailyScheduler(env, `http:${request.method}`);
        return new Response(JSON.stringify(result, null, 2), {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store, no-cache, must-revalidate"
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({
          success: false,
          error: err.message
        }, null, 2), {
          status: 500,
          headers: { "Content-Type": "application/json; charset=utf-8" }
        });
      }
    }

    return new Response(JSON.stringify({
      error: "Ruta no encontrada.",
      available_endpoints: ["/", "/status", "/run"]
    }), {
      status: 404,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }
};
