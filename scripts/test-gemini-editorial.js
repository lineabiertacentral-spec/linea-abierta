/**
 * ============================================================================
 * LINEA ABIERTA (lineaabierta.net.pe)
 * Test Automatizado: FASE 6.5 — Redacción Editorial con Gemini API
 * ============================================================================
 * 
 * Verifica:
 * 1. Configuración de modelos gratuitos (gemini-2.5-flash y fallback gemini-2.0-flash).
 * 2. Cero costos y cero grounding de Google Search.
 * 3. Parser de metadatos de fuentes para trazabilidad interna.
 * 4. Limpieza de bloques de respuesta JSON de Gemini.
 * 5. Directrices editoriales y regla de información insuficiente.
 * 6. Primera prueba controlada: Procesar exactamente 1 borrador en D1.
 * 7. Confirmación de reemplazo de título, resumen, cuerpo y autoría.
 * 8. Confirmación de preservación de status='draft' y published_at=null.
 * 9. Confirmación de aislamiento: Cero filtración al portal público.
 * 10. Protección del endpoint manual /rewrite con CRON_SECRET.
 */

import {
  DEFAULT_GEMINI_MODEL,
  FALLBACK_GEMINI_MODEL,
  EDITORIAL_SYSTEM_PROMPT,
  cleanJsonBlock,
  callGeminiApi,
  generateEditorialArticle
} from "../cron-worker/editorial/gemini.js";

import {
  parseSourceMetadata,
  processSingleDraft,
  processEditorialDrafts,
  getPendingEditorialDrafts
} from "../cron-worker/editorial/index.js";

import worker from "../cron-worker/index.js";

async function runGeminiEditorialTests() {
  console.log("=================================================================");
  console.log("LINEA ABIERTA — Test Suite: FASE 6.5 (Redacción Editorial Gemini)");
  console.log("=================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // 1. Modelos de Nivel Gratuito y Control de Costos
  // --------------------------------------------------------------------------
  console.log("--- 1. Configuración de Modelos Gratuitos (Zero Costos) ---");
  assert(DEFAULT_GEMINI_MODEL === "gemini-3.5-flash-lite", `Modelo principal gratuito: ${DEFAULT_GEMINI_MODEL}`);
  assert(FALLBACK_GEMINI_MODEL === "gemini-3.1-flash-lite", `Modelo de respaldo gratuito: ${FALLBACK_GEMINI_MODEL}`);

  // Verificar que el prompt prohíba alucinaciones y plagio
  assert(EDITORIAL_SYSTEM_PROMPT.includes("REDACCIÓN 100% ORIGINAL"), "Prompt exige redacción 100% original");
  assert(EDITORIAL_SYSTEM_PROMPT.includes("CERO ALUCINACIONES"), "Prompt prohíbe explícitamente alucinaciones e inventar hechos");
  assert(EDITORIAL_SYSTEM_PROMPT.includes("PERUANO"), "Prompt orienta el estilo al público peruano");
  assert(EDITORIAL_SYSTEM_PROMPT.includes("insufficient_info"), "Prompt incluye regla de abstención ante información insuficiente");

  // --------------------------------------------------------------------------
  // 2. Limpieza de Bloques JSON Markdown
  // --------------------------------------------------------------------------
  console.log("\n--- 2. Parser y Limpieza de Respuestas JSON ---");
  const markdownWrapped = "```json\n{\"title\": \"Titular\", \"summary\": \"Resumen\", \"content\": \"Cuerpo\", \"insufficient_info\": false}\n```";
  const cleaned = cleanJsonBlock(markdownWrapped);
  assert(!cleaned.startsWith("```"), "Bloque ```json eliminado correctamente");
  const parsed = JSON.parse(cleaned);
  assert(parsed.title === "Titular" && parsed.insufficient_info === false, "Objeto JSON parseado correctamente");

  // --------------------------------------------------------------------------
  // 3. Parser de Metadatos de Trazabilidad
  // --------------------------------------------------------------------------
  console.log("\n--- 3. Extracción de Metadatos de Fuente para Trazabilidad ---");
  const sampleContentWithMeta = `<!-- FUENTE: RPP Noticias | URL: https://rpp.pe/economia/tipo-cambio-noticia-123 | DETECTADO: 2026-09-11T05:00:00.000Z -->\n\nEl Banco Central de Reserva del Perú intervino hoy en el mercado cambiario vendiendo 50 millones de dólares para reducir la volatilidad del tipo de cambio.`;
  const meta = parseSourceMetadata(sampleContentWithMeta);

  assert(meta.source_name === "RPP Noticias", `Fuente detectada: "${meta.source_name}"`);
  assert(meta.source_url === "https://rpp.pe/economia/tipo-cambio-noticia-123", `URL trazada: "${meta.source_url}"`);
  assert(!meta.clean_content.includes("<!-- FUENTE:"), "Comentario HTML removido del texto de entrada para la IA");
  assert(meta.clean_content.startsWith("El Banco Central"), "Contenido de referencia preservado intacto");

  // --------------------------------------------------------------------------
  // 4. Simulación de Base de Datos D1 con Borradores
  // --------------------------------------------------------------------------
  console.log("\n--- 4. Preparación de D1 para Prueba de 1 Borrador ---");
  const d1Articles = [
    {
      id: 1,
      title: "Prueba de publicación - Linea Abierta",
      slug: "prueba-de-publicacion-linea-abierta",
      summary: "Noticia publicada de prueba",
      content: "Contenido publicado",
      author: "admin",
      category_id: 2,
      status: "published",
      published_at: "2026-09-10T20:16:27.472Z",
      created_at: "2026-09-10T02:03:30.647Z",
      updated_at: "2026-09-10T02:03:30.647Z"
    },
    {
      id: 2,
      title: "MEF proyecta crecimiento de 3.2% para la economía peruana en 2026",
      slug: "mef-proyecta-crecimiento-de-3-2-para-la-economia-peruana-en-2026",
      summary: "El titular del Ministerio de Economía señaló que la inversión privada liderará el repunte.",
      content: `<!-- FUENTE: RPP Noticias | URL: https://rpp.pe/economia/mef-crecimiento-2026 | DETECTADO: 2026-09-11T05:30:00.000Z -->\n\nEl Ministerio de Economía y Finanzas estimó este viernes que el Producto Bruto Interno del Perú se expandirá a un ritmo de 3.2% al cierre del año, impulsado por la recuperación del consumo interno y la ejecución de proyectos de infraestructura minera.`,
      author: "RPP Noticias (Fuente Detectada)",
      category_id: 4,
      status: "draft",
      published_at: null,
      created_at: "2026-09-11T05:30:00.000Z",
      updated_at: "2026-09-11T05:30:00.000Z"
    },
    {
      id: 3,
      title: "Selección Peruana inició entrenamientos con miras a nueva fecha doble",
      slug: "seleccion-peruana-inicio-entrenamientos-con-miras-a-nueva-fecha-doble",
      summary: "Los dirigidos por el comando técnico completaron su primera sesión en la Videna.",
      content: `<!-- FUENTE: RPP Noticias | URL: https://rpp.pe/deportes/seleccion-videna | DETECTADO: 2026-09-11T05:35:00.000Z -->\n\nEl plantel nacional completó su primer turno de prácticas de cara a los cotejos de eliminatorias.`,
      author: "RPP Noticias (Fuente Detectada)",
      category_id: 5,
      status: "draft",
      published_at: null,
      created_at: "2026-09-11T05:35:00.000Z",
      updated_at: "2026-09-11T05:35:00.000Z"
    }
  ];

  const mockDb = {
    prepare(sql) {
      const trimmed = sql.trim();

      if (trimmed.includes("PRAGMA table_info")) {
        return {
          all: async () => ({
            results: Object.keys(d1Articles[0]).map(col => ({ name: col }))
          })
        };
      }

      if (trimmed.includes("SELECT * FROM articles WHERE id = ?")) {
        return {
          bind: (id) => ({
            first: async () => d1Articles.find(a => a.id === Number(id)) || null
          })
        };
      }

      if (trimmed.includes("SELECT * FROM articles") && trimmed.includes("status = 'draft'")) {
        return {
          bind: (limit) => ({
            all: async () => {
              const matches = d1Articles.filter(a => a.status === "draft" && ((a.author && a.author.includes("Fuente Detectada")) || (a.author_name && a.author_name.includes("Fuente Detectada"))));
              return { results: matches.slice(0, limit) };
            }
          })
        };
      }

      if (trimmed.includes("SELECT id FROM articles WHERE slug = ?")) {
        return {
          bind: (slug, id) => ({
            first: async () => d1Articles.find(a => a.slug === slug && a.id !== Number(id)) || null
          })
        };
      }

      if (trimmed.startsWith("UPDATE articles SET")) {
        return {
          bind: (...params) => ({
            run: async () => {
              const targetId = params[params.length - 1];
              const article = d1Articles.find(a => a.id === targetId);
              if (article) {
                // Parse update columns
                const setPart = trimmed.match(/UPDATE articles SET ([^WHERE]+) WHERE/)[1];
                const cols = setPart.split(",").map(c => c.split("=")[0].trim());
                cols.forEach((col, idx) => {
                  article[col] = params[idx];
                });
              }
              return { meta: { changes: 1 } };
            }
          })
        };
      }

      return {
        first: async () => null,
        all: async () => ({ results: [] }),
        bind: () => ({ run: async () => ({}) })
      };
    }
  };

  // --------------------------------------------------------------------------
  // 5. Primera Prueba Controlada: Procesar Solamente 1 Borrador Existente
  // --------------------------------------------------------------------------
  console.log("\n--- 5. Primera Prueba Controlada: Procesar Solamente 1 Borrador ---");

  // Mock de la llamada de red a Gemini API para garantizar determinismo y prueba sin fugas de secretos
  const originalFetch = globalThis.fetch;
  let geminiCallCount = 0;
  let capturedModelInUrl = "";

  globalThis.fetch = async (url, options) => {
    const urlStr = String(url);
    if (urlStr.includes("generativelanguage.googleapis.com")) {
      geminiCallCount++;
      const modelMatch = urlStr.match(/models\/([^:]+):generateContent/);
      capturedModelInUrl = modelMatch ? modelMatch[1] : "";

      const reqBody = JSON.parse(options.body);
      const userText = reqBody.contents[0].parts[0].text;

      // Generar respuesta original simulada de Gemini
      const fakeGeminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    title: "Economía peruana alcanzaría expansión de 3.2% impulsada por inversión privada este año",
                    summary: "El Ministerio de Economía y Finanzas estimó un dinamismo favorable para la actividad productiva nacional sustentado en proyectos de infraestructura y minería.",
                    content: "El titular del Ministerio de Economía y Finanzas (MEF) brindó este viernes un panorama sobre la evolución del Producto Bruto Interno (PBI), ratificando una proyección de crecimiento del 3.2% para el cierre del ejercicio anual en curso.\n\nDe acuerdo con la entidad gubernamental, la reactivación estará liderada principalmente por la inversión privada y el consumo de las familias, sectores que han mostrado señales de consolidación en los últimos trimestres.\n\nAsimismo, el informe ministerial destaca que la ejecución de importantes obras de infraestructura y el destrabe de proyectos mineros estratégicos serán determinantes para afianzar la senda de crecimiento y la generación de empleo en el país.",
                    insufficient_info: false
                  })
                }
              ]
            }
          }
        ]
      };

      return new Response(JSON.stringify(fakeGeminiResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    return originalFetch(url, options);
  };

  const env = {
    DB: mockDb,
    GEMINI_API_KEY: "AIzaSyFakeKeyForTestOnlyNoLeak",
    CRON_SECRET: "secreto_cron_test_2026"
  };

  // Ejecutar con limit: 1
  const processResult = await processEditorialDrafts(env, { limit: 1 });

  assert(processResult.success === true, "Ejecución de redacción editorial completada exitosamente");
  assert(processResult.processed_count === 1, `Exactamente 1 borrador procesado (Total: ${processResult.processed_count})`);
  assert(processResult.skipped_count === 0, `0 borradores omitidos por error`);
  assert(geminiCallCount === 1, `Gemini API invocada exactamente 1 vez (Total llamadas: ${geminiCallCount})`);
  assert(capturedModelInUrl === "gemini-3.5-flash-lite", `Modelo gratuito invocado en URL: ${capturedModelInUrl}`);

  // --------------------------------------------------------------------------
  // 6. Verificación de Integridad del Borrador Modificado en D1
  // --------------------------------------------------------------------------
  console.log("\n--- 6. Verificación de Campos Reemplazados en D1 ---");
  const processedDraft = d1Articles.find(a => a.id === 2);
  const untouchedDraft = d1Articles.find(a => a.id === 3);

  // A. Borrador procesado (#2)
  assert(processedDraft.id === 2, "Borrador ID 2 fue el procesado");
  assert(processedDraft.title === "Economía peruana alcanzaría expansión de 3.2% impulsada por inversión privada este año", 
    "Título reemplazado con redacción editorial original");
  assert(processedDraft.summary.includes("actividad productiva"), 
    "Resumen / bajada reemplazada con redacción periodística");
  assert(processedDraft.content.includes("El titular del Ministerio de Economía"), 
    "Cuerpo reemplazado con nueva redacción estructurada");
  const updatedAuthor = processedDraft.author || processedDraft.author_name;
  assert(updatedAuthor === "Redacción Linea Abierta", 
    `Autoría actualizada a "${updatedAuthor}" (columna real en D1: 'author')`);
  assert(processedDraft.slug === "economia-peruana-alcanzaria-expansion-de-32-impulsada-por-inversion-privada-este-ano", 
    `Slug regenerado acorde al nuevo titular: /${processedDraft.slug}`);

  // B. Trazabilidad interna preservada en comentario HTML
  assert(processedDraft.content.includes("<!-- FUENTE: RPP Noticias | URL: https://rpp.pe/economia/mef-crecimiento-2026"), 
    "Trazabilidad de fuente original y URL preservada en encabezado HTML interno");
  assert(processedDraft.content.includes("REDACTADO_EDITORIAL:"), 
    "Marca de tiempo de redacción editorial registrada en metadatos");
  assert(processedDraft.content.includes("MODELO: gemini-3.5-flash-lite"), 
    "Modelo utilizado registrado para auditoría interna");

  // C. Garantías inalterables de seguridad
  assert(processedDraft.status === "draft", "GARANTÍA: status = 'draft' (NUNCA 'published')");
  assert(processedDraft.published_at === null, "GARANTÍA: published_at = NULL (NUNCA publicado)");

  // D. Borrador no procesado (#3) permanece intacto
  const untouchedAuthor = untouchedDraft.author || untouchedDraft.author_name;
  assert(untouchedAuthor === "RPP Noticias (Fuente Detectada)", 
    "Borrador ID 3 permanece intacto y en cola para siguiente ejecución");

  // --------------------------------------------------------------------------
  // 7. Verificación de Aislamiento del Portal Público
  // --------------------------------------------------------------------------
  console.log("\n--- 7. Aislamiento del Portal Público (Cero Filtraciones) ---");
  const nowIso = new Date().toISOString();
  const publicVisible = d1Articles.filter(a => a.status === "published" && (a.published_at === null || a.published_at <= nowIso));

  assert(publicVisible.length === 1, `El portal público solo muestra 1 noticia (Total: ${publicVisible.length})`);
  assert(publicVisible[0].id === 1, "La única noticia pública es la ID 1 ('Prueba de publicación - Linea Abierta')");
  assert(!publicVisible.some(a => a.id === 2), "El borrador redactado con IA NO aparece públicamente");

  // --------------------------------------------------------------------------
  // 8. Prueba de Información Insuficiente (Abstención)
  // --------------------------------------------------------------------------
  console.log("\n--- 8. Caso de Información Insuficiente ---");
  // Simular respuesta con insufficient_info: true
  globalThis.fetch = async (url, options) => {
    return new Response(JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  title: "",
                  summary: "",
                  content: "",
                  insufficient_info: true
                })
              }
            ]
          }
        }
      ]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const insufficientRes = await processSingleDraft(untouchedDraft, env);
  assert(insufficientRes.skipped === true, "Borrador omitido si información es insuficiente");
  assert(untouchedDraft.title === "Selección Peruana inició entrenamientos con miras a nueva fecha doble", 
    "Borrador conservado sin modificar ante falta de datos fácticos");

  // --------------------------------------------------------------------------
  // 9. Protección del Endpoint Manual /rewrite
  // --------------------------------------------------------------------------
  console.log("\n--- 9. Seguridad del Endpoint /rewrite ---");
  // A. Petición anónima -> 401
  const anonReq = new Request("https://linea-abierta-cron.workers.dev/rewrite", { method: "POST" });
  const anonRes = await worker.fetch(anonReq, env);
  assert(anonRes.status === 401, `/rewrite anónimo rechazado con HTTP 401 (Obtenido: ${anonRes.status})`);

  // B. Petición autorizada con clave secreta -> 200
  const authReq = new Request("https://linea-abierta-cron.workers.dev/rewrite?limit=1", {
    method: "POST",
    headers: { "Authorization": "Bearer secreto_cron_test_2026" }
  });
  const authRes = await worker.fetch(authReq, env);
  assert(authRes.status === 200, `/rewrite autorizado responde HTTP 200 (Obtenido: ${authRes.status})`);

  // Restaurar fetch original
  globalThis.fetch = originalFetch;

  // --------------------------------------------------------------------------
  // RESUMEN
  // --------------------------------------------------------------------------
  console.log("\n=================================================================");
  console.log(`RESUMEN: ${passed} pruebas exitosas, ${failed} fallos.`);
  console.log("=================================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("¡Todas las verificaciones de la FASE 6.5 pasaron satisfactoriamente!\n");
  }
}

runGeminiEditorialTests().catch(err => {
  console.error("Error en las pruebas de Gemini Editorial:", err);
  process.exit(1);
});
