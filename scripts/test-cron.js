/**
 * ============================================================================
 * LINEA ABIERTA (lineaabierta.net.pe)
 * Script de Verificación de Cron Trigger y Scheduler Diario (FASE 6.3)
 * ============================================================================
 * 
 * Ejecuta pruebas unitarias sobre:
 * 1. Cálculo y formateo de hora Perú (America/Lima, UTC-5).
 * 2. Integridad de los 9 slots de noticias editoriales.
 * 3. Ejecución del orquestador en modo diagnóstico (dry-run).
 * 4. Verificación de lectura segura en Cloudflare D1 sin mutaciones.
 */

import {
  EDITORIAL_NEWS_SLOTS,
  getPeruTimeInfo,
  runDailyScheduler
} from "../cron-worker/index.js";

async function main() {
  console.log("=================================================================");
  console.log("LINEA ABIERTA — Test de Verificación: Programador Diario (FASE 6.3)");
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

  // --------------------------------------------------------------------------
  // TEST 1: Zona horaria y hora local de Perú
  // --------------------------------------------------------------------------
  console.log("--- 1. Verificación de Zona Horaria (Perú UTC-5) ---");
  const timeInfo = getPeruTimeInfo();
  console.log(`  Hora actual en Perú: ${timeInfo.peru_time} (${timeInfo.peru_date_readable})`);
  console.log(`  Timestamp UTC:      ${timeInfo.utc_iso}`);
  
  assert(timeInfo.timezone.includes("America/Lima"), "Zona horaria configurada en America/Lima (UTC-5)");
  assert(typeof timeInfo.peru_time === "string" && timeInfo.peru_time.length > 0, "Hora de Perú calculada correctamente");
  assert(typeof timeInfo.utc_iso === "string" && timeInfo.utc_iso.endsWith("Z"), "Timestamp UTC en formato ISO 8601 válido");

  // --------------------------------------------------------------------------
  // TEST 2: Integridad de los 9 Slots de Noticias
  // --------------------------------------------------------------------------
  console.log("\n--- 2. Verificación de los 9 Slots Editoriales ---");
  assert(EDITORIAL_NEWS_SLOTS.length === 9, `Se definieron exactamente 9 slots (Total: ${EDITORIAL_NEWS_SLOTS.length})`);

  const validCategories = new Set([
    "politica",
    "actualidad",
    "regiones",
    "economia",
    "deportes",
    "opinion",
    "tendencias"
  ]);

  EDITORIAL_NEWS_SLOTS.forEach((slot, idx) => {
    assert(slot.slot === idx + 1, `Slot ${idx + 1}: Identificador correlativo correcto`);
    assert(validCategories.has(slot.category_slug), `Slot ${idx + 1}: Categoría válida (${slot.category_slug})`);
    assert(slot.description && slot.description.length > 10, `Slot ${idx + 1}: Descripción editorial presente`);
    assert(slot.prompt_guideline && slot.prompt_guideline.length > 10, `Slot ${idx + 1}: Pauta para IA presente`);
  });

  // --------------------------------------------------------------------------
  // TEST 3: Simulación de ejecución con Mock D1 (Lectura segura sin mutación)
  // --------------------------------------------------------------------------
  console.log("\n--- 3. Verificación de Ejecución del Scheduler con D1 Mock ---");
  
  let d1PrepareCalled = false;
  let d1MutateAttempted = false;

  const mockDb = {
    prepare(sql) {
      d1PrepareCalled = true;
      const lower = sql.toLowerCase();
      if (lower.includes("insert") || lower.includes("update") || lower.includes("delete") || lower.includes("drop")) {
        d1MutateAttempted = true;
      }
      return {
        first: async () => ({ total: 1 }), // Simula la noticia de prueba existente
        all: async () => ({ results: [] })
      };
    }
  };

  const executionResult = await runDailyScheduler({ DB: mockDb }, "test_runner");

  assert(executionResult.success === true, "La ejecución del scheduler retornó status exitoso");
  assert(executionResult.cron_target === "0 11 * * *", "Expresión Cron confirmada: 0 11 * * * (06:00 AM Perú / 11:00 UTC)");
  assert(executionResult.d1_database.connected === true, "Conexión mock D1 reportada como conectada");
  assert(executionResult.d1_database.total_articles === 1, "Detectó correctamente el conteo de artículos existentes");
  assert(d1PrepareCalled === true, "Consultó D1 para verificar estado");
  assert(d1MutateAttempted === false, "SEGURIDAD: CERO mutaciones en D1 (modo dry-run respetado)");
  assert(executionResult.plan.mode === "dry_run", "Modo dry-run confirmado en la respuesta");
  assert(executionResult.plan.total_news_planned === 9, "9 noticias programadas en la respuesta");

  // --------------------------------------------------------------------------
  // RESUMEN FINAL
  // --------------------------------------------------------------------------
  console.log("\n=================================================================");
  console.log(`RESUMEN: ${passed} pruebas exitosas, ${failed} fallos.`);
  console.log("=================================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("¡Todas las verificaciones de la FASE 6.3 pasaron satisfactoriamente!\n");
  }
}

main().catch(err => {
  console.error("Error fatal en las pruebas:", err);
  process.exit(1);
});
