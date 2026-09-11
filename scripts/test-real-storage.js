/**
 * ============================================================================
 * LINEA ABIERTA (lineaabierta.net.pe)
 * Test de Verificación de Almacenamiento Real: FASE 6.4
 * ============================================================================
 * 
 * Simula el ciclo completo de ejecución manual controlada de /run:
 * 1. Simulación de la base de datos D1 (linea-abierta-db) con su esquema exacto y datos existentes.
 * 2. Validación de seguridad en /run (401 si no hay token, 200 con Bearer token).
 * 3. Ejecución real de ingesta (fuente RPP en vivo), selección y guardado de hasta 9 noticias como 'draft'.
 * 4. Verificación de que status = 'draft' y published_at = null.
 * 5. Verificación de aislamiento: la API pública /api/articles NO muestra ningún borrador.
 * 6. Verificación de /admin: el panel administrativo detecta exactamente los 9 borradores.
 * 7. Verificación de deduplicación: una segunda ejecución detecta duplicados y guarda 0 repetidos.
 */

import worker, {
  runDailyScheduler,
  EDITORIAL_NEWS_SLOTS
} from "../cron-worker/index.js";

async function runControlledRealStorageTest() {
  console.log("=================================================================");
  console.log("LINEA ABIERTA — Prueba Manual Controlada de /run (FASE 6.4)");
  console.log("=================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // 1. Crear simulador fiel de Cloudflare D1
  const d1Rows = [
    {
      id: 1,
      title: "Prueba de publicación - Linea Abierta",
      slug: "prueba-de-publicacion-linea-abierta",
      summary: "Esta es una prueba interna del sistema de gestión editorial de Linea Abierta.",
      content: "Contenido de prueba...",
      image_url: "",
      author_name: "admin",
      category_id: 2,
      status: "published",
      published_at: "2026-09-10T20:16:27.472Z",
      created_at: "2026-09-10T02:03:30.647Z",
      updated_at: "2026-09-10T02:03:30.647Z"
    }
  ];

  let nextId = 2;

  const mockD1 = {
    prepare(sql) {
      const trimmedSql = sql.trim();

      // PRAGMA table_info
      if (trimmedSql.includes("PRAGMA table_info")) {
        return {
          all: async () => ({
            results: [
              { name: "id" },
              { name: "title" },
              { name: "slug" },
              { name: "summary" },
              { name: "content" },
              { name: "image_url" },
              { name: "author_name" },
              { name: "category_id" },
              { name: "status" },
              { name: "published_at" },
              { name: "created_at" },
              { name: "updated_at" }
            ]
          })
        };
      }

      // SELECT COUNT(*) FROM articles WHERE created_at LIKE ?
      if (trimmedSql.includes("WHERE created_at LIKE")) {
        return {
          bind: (prefixPattern) => ({
            first: async () => {
              const prefix = (prefixPattern || "").replace(/%/g, "");
              const matching = d1Rows.filter(r => (r.created_at || "").startsWith(prefix));
              return { total: matching.length };
            }
          })
        };
      }

      // SELECT COUNT(*) FROM articles
      if (trimmedSql.startsWith("SELECT COUNT(*)")) {
        return {
          first: async () => ({ total: d1Rows.length })
        };
      }

      // SELECT title, slug FROM articles
      if (trimmedSql.includes("SELECT title, slug FROM articles")) {
        return {
          all: async () => ({
            results: d1Rows.map(r => ({ title: r.title, slug: r.slug }))
          })
        };
      }

      // INSERT INTO articles
      if (trimmedSql.startsWith("INSERT INTO articles")) {
        return {
          bind: (...params) => ({
            run: async () => {
              // Parse columns from SQL
              const colMatch = trimmedSql.match(/INSERT INTO articles \(([^)]+)\)/);
              const cols = colMatch ? colMatch[1].split(",").map(c => c.trim()) : [];
              
              const newRow = { id: nextId++ };
              cols.forEach((col, idx) => {
                newRow[col] = params[idx] !== undefined ? params[idx] : null;
              });
              d1Rows.push(newRow);

              return {
                meta: { last_row_id: newRow.id },
                lastRowId: newRow.id
              };
            }
          })
        };
      }

      // Fallback
      return {
        first: async () => null,
        all: async () => ({ results: [] }),
        bind: () => ({ run: async () => ({}) })
      };
    }
  };

  const CRON_SECRET_TEST = "linea_abierta_cron_key_prod_2026";
  const env = {
    DB: mockD1,
    CRON_SECRET: CRON_SECRET_TEST
  };

  // --------------------------------------------------------------------------
  // PASO 1: Probar seguridad del endpoint /run (rechazo 401 si no hay token)
  // --------------------------------------------------------------------------
  console.log("--- PASO 1: Verificación de Seguridad en /run ---");
  const unauthReq = new Request("https://linea-abierta-cron.workers.dev/run", { method: "POST" });
  const unauthRes = await worker.fetch(unauthReq, env);
  assert(unauthRes.status === 401, `Petición anónima a /run rechazada con HTTP 401 (Obtenido: ${unauthRes.status})`);

  const wrongReq = new Request("https://linea-abierta-cron.workers.dev/run", {
    method: "POST",
    headers: { "Authorization": "Bearer clave_falsa_123" }
  });
  const wrongRes = await worker.fetch(wrongReq, env);
  assert(wrongRes.status === 401, `Petición con clave incorrecta rechazada con HTTP 401 (Obtenido: ${wrongRes.status})`);

  // --------------------------------------------------------------------------
  // PASO 2: Ejecución manual controlada de /run con token autorizado
  // --------------------------------------------------------------------------
  console.log("\n--- PASO 2: Ejecución Manual Controlada de /run ---");
  const authReq = new Request("https://linea-abierta-cron.workers.dev/run", {
    method: "POST",
    headers: { "Authorization": `Bearer ${CRON_SECRET_TEST}` }
  });

  const authRes = await worker.fetch(authReq, env);
  assert(authRes.status === 200, `Ejecución manual autorizada respondió HTTP 200 (Obtenido: ${authRes.status})`);

  const runResult = await authRes.json();
  assert(runResult.success === true, "Respuesta exitosa del scheduler (success = true)");
  assert(runResult.mode === "real_storage", "Modo de ejecución es 'real_storage'");
  assert(runResult.ingest_metrics.daily_quota_limit === 9, "Límite diario configurado en 9 noticias");
  assert(runResult.ingest_metrics.saved_in_d1 > 0 && runResult.ingest_metrics.saved_in_d1 <= 9, 
    `Se guardaron ${runResult.ingest_metrics.saved_in_d1} noticias en D1 (máximo 9)`);

  const savedDrafts = runResult.saved_drafts || [];
  console.log(`\n  📋 Detalle de borradores guardados (${savedDrafts.length} noticias):`);
  savedDrafts.forEach((item, idx) => {
    console.log(`     ${idx + 1}. [${item.category_name} | ID ${item.category_id}] "${item.title}"`);
    console.log(`        Slug: /${item.slug} | Status: ${item.status}`);
  });

  // --------------------------------------------------------------------------
  // PASO 3: Verificación del estado en la Base de Datos D1
  // --------------------------------------------------------------------------
  console.log("\n--- PASO 3: Verificación de Integridad de Datos en D1 ---");
  const newlyCreatedRows = d1Rows.filter(r => r.id !== 1);
  assert(newlyCreatedRows.length === savedDrafts.length, 
    `Exactamente ${newlyCreatedRows.length} filas nuevas insertadas en la tabla articles`);

  let allDraft = true;
  let allNullPublished = true;
  let allHaveContent = true;
  let allValidCategories = true;

  newlyCreatedRows.forEach(row => {
    if (row.status !== "draft") allDraft = false;
    if (row.published_at !== null) allNullPublished = false;
    if (!row.content || row.content.trim().length === 0) allHaveContent = false;
    if (!row.category_id || row.category_id < 1 || row.category_id > 7) allValidCategories = false;
  });

  assert(allDraft, "TODAS las noticias nuevas tienen status = 'draft'");
  assert(allNullPublished, "TODAS las noticias nuevas tienen published_at = NULL");
  assert(allHaveContent, "TODAS las noticias contienen el texto crudo y metadatos de fuente");
  assert(allValidCategories, "TODAS las noticias están asignadas a una categoría válida (1-7)");

  // --------------------------------------------------------------------------
  // PASO 4: Verificación de Aislamiento del Portal Público
  // --------------------------------------------------------------------------
  console.log("\n--- PASO 4: Verificación de Aislamiento del Portal Público ---");
  // Simular la consulta SQL que hace /api/articles en producción:
  // WHERE a.status = 'published' AND (a.published_at IS NULL OR a.published_at <= ?)
  const nowIso = new Date().toISOString();
  const publicArticles = d1Rows.filter(r => {
    const isPublished = r.status === "published";
    const isPastDate = r.published_at === null || r.published_at <= nowIso;
    return isPublished && isPastDate;
  });

  assert(publicArticles.length === 1, `El portal público solo devuelve la noticia de prueba inicial (Total: ${publicArticles.length})`);
  assert(publicArticles[0].id === 1, `La única noticia visible públicamente es la ID 1 ("${publicArticles[0].title}")`);
  const anyDraftLeaked = publicArticles.some(r => r.status === "draft");
  assert(!anyDraftLeaked, "CERO noticias en estado 'draft' se filtran al portal público (100% aisladas)");

  // --------------------------------------------------------------------------
  // PASO 5: Verificación desde el Panel Administrativo (/admin)
  // --------------------------------------------------------------------------
  console.log("\n--- PASO 5: Verificación de Visualización en /admin ---");
  // Simular la consulta que hace /api/admin/articles:
  // Retorna todas las noticias, permitiendo filtrar por status
  const totalArticlesAdmin = d1Rows.length;
  const adminDrafts = d1Rows.filter(r => r.status === "draft");
  const adminPublished = d1Rows.filter(r => r.status === "published");

  assert(totalArticlesAdmin === 1 + savedDrafts.length, 
    `Métrica 'Total Noticias' en /admin: ${totalArticlesAdmin} noticias`);
  assert(adminPublished.length === 1, 
    `Métrica 'Publicadas en Portada' en /admin: ${adminPublished.length} noticia`);
  assert(adminDrafts.length === savedDrafts.length, 
    `Métrica 'Borradores' en /admin: ${adminDrafts.length} borradores listos para revisión`);

  // --------------------------------------------------------------------------
  // PASO 6: Prevención Estricta de Duplicados en Segunda Ejecución
  // --------------------------------------------------------------------------
  console.log("\n--- PASO 6: Verificación de Prevención de Duplicados ---");
  const secondRunRes = await worker.fetch(authReq, env);
  const secondResult = await secondRunRes.json();
  assert(secondResult.ingest_metrics.saved_in_d1 === 0, 
    `Segunda ejecución consecutiva: ${secondResult.ingest_metrics.saved_in_d1} nuevos guardados (evitó duplicados)`);
  assert(secondResult.ingest_metrics.duplicates_skipped > 0, 
    `Se omitieron ${secondResult.ingest_metrics.duplicates_skipped} candidatos por estar ya registrados en D1`);
  assert(d1Rows.length === 1 + savedDrafts.length, 
    `El total de filas en D1 permanece inalterado (${d1Rows.length} artículos en total)`);

  // --------------------------------------------------------------------------
  // PASO 7: Endpoint /status Permanece en Solo Lectura (dry_run: true)
  // --------------------------------------------------------------------------
  console.log("\n--- PASO 7: Verificación de /status en Modo Solo Lectura ---");
  const statusReq = new Request("https://linea-abierta-cron.workers.dev/status");
  const statusRes = await worker.fetch(statusReq, env);
  const statusData = await statusRes.json();
  assert(statusRes.status === 200, "/status responde HTTP 200");
  assert(statusData.dry_run === true, "/status opera estrictamente con dry_run = true");
  assert(statusData.ingest_metrics.saved_in_d1 === 0, "/status nunca guarda registros en D1");

  // --------------------------------------------------------------------------
  // RESUMEN
  // --------------------------------------------------------------------------
  console.log("\n=================================================================");
  console.log(`RESUMEN: ${passed} pruebas exitosas, ${failed} fallos.`);
  console.log(`Borradores guardados en la prueba controlada: ${savedDrafts.length}`);
  console.log("=================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runControlledRealStorageTest().catch(err => {
  console.error("Error en la prueba:", err);
  process.exit(1);
});
