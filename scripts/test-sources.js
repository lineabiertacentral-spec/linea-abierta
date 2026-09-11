/**
 * ============================================================================
 * LINEA ABIERTA (lineaabierta.net.pe)
 * Pruebas Unitarias Automatizadas: FASE 6.4 (Primera Etapa)
 * ============================================================================
 * 
 * Verifica:
 * 1. Registro de proveedores (RPP activo, MEF/BCRP/Congreso preparados).
 * 2. Limpieza de texto XML y decodificación de entidades.
 * 3. Parser nativo de XML RSS 2.0.
 * 4. Clasificador temático a las 7 categorías de Linea Abierta.
 * 5. Generación de slugs únicos y limpios.
 * 6. Algoritmo de selección balanceada con cuota estricta de máximo 9 noticias.
 * 7. Inserción segura en D1 con status='draft' y published_at=null.
 */

import {
  NEWS_PROVIDERS,
  cleanXmlText,
  classifyCategory,
  generateSlug,
  parseRssXml
} from "../cron-worker/sources/index.js";

import {
  selectDailyNewsCandidates,
  runDailyScheduler
} from "../cron-worker/index.js";

async function runTests() {
  console.log("=================================================================");
  console.log("LINEA ABIERTA — Test de Verificación: FASE 6.4 (Primera Etapa)");
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

  // 1. Registro de proveedores
  console.log("--- 1. Verificación de Proveedores de Noticias ---");
  assert(NEWS_PROVIDERS.length === 4, "Se configuraron 4 proveedores");
  
  const rpp = NEWS_PROVIDERS.find(p => p.id === "rpp");
  assert(rpp && rpp.status === "active", "RPP Noticias está configurado como activo");
  assert(rpp.primary_url === "https://rpp.pe/rss-titulares.xml", "URL primaria de RPP: https://rpp.pe/rss-titulares.xml");
  assert(rpp.fallback_url === "https://rpp.pe/rss", "URL fallback de RPP: https://rpp.pe/rss");

  const mef = NEWS_PROVIDERS.find(p => p.id === "mef");
  assert(mef && mef.status === "prepared", "MEF preparado para siguiente etapa");

  const bcrp = NEWS_PROVIDERS.find(p => p.id === "bcrp");
  assert(bcrp && bcrp.status === "prepared", "BCRP preparado para siguiente etapa");

  const congreso = NEWS_PROVIDERS.find(p => p.id === "congreso");
  assert(congreso && congreso.status === "prepared", "Congreso preparado para siguiente etapa");

  // 2. Limpieza de texto XML y CDATA
  console.log("\n--- 2. Limpieza de Texto XML / CDATA ---");
  const sampleCdata = "<![CDATA[<b>Titular</b> de prueba &amp; noticias]]>";
  const cleaned = cleanXmlText(sampleCdata);
  assert(cleaned === "Titular de prueba & noticias", `Texto limpiado correctamente: "${cleaned}"`);

  // 3. Parser RSS XML
  console.log("\n--- 3. Parser de RSS XML Nativo ---");
  const sampleXml = `
    <rss version="2.0">
      <channel>
        <title>Canal de Prueba</title>
        <item>
          <title><![CDATA[Congreso debate ley de presupuesto 2027]]></title>
          <description><![CDATA[El pleno del Congreso analiza dictamen económico.]]></description>
          <link>https://rpp.pe/politica/congreso/debate-noticia-1</link>
          <pubDate>Fri, 11 Sep 2026 08:00:00 -0500</pubDate>
          <media:content url="https://f.rpp.pe/img/noticia-1.jpg" type="image/jpeg" />
        </item>
        <item>
          <title>Dólar retrocede tras intervención del BCRP</title>
          <description>El tipo de cambio cerró a la baja en el mercado interbancario.</description>
          <link>https://rpp.pe/economia/mercados/tipo-cambio-noticia-2</link>
          <pubDate>Fri, 11 Sep 2026 08:30:00 -0500</pubDate>
        </item>
      </channel>
    </rss>
  `;
  const parsedItems = parseRssXml(sampleXml);
  assert(parsedItems.length === 2, `Se parsearon correctamente 2 items (Total: ${parsedItems.length})`);
  assert(parsedItems[0].title === "Congreso debate ley de presupuesto 2027", "Extracción correcta de título con CDATA");
  assert(parsedItems[0].image_url === "https://f.rpp.pe/img/noticia-1.jpg", "Extracción correcta de imagen media:content");
  assert(parsedItems[1].title === "Dólar retrocede tras intervención del BCRP", "Extracción correcta de título simple");

  // 4. Clasificador de categorías
  console.log("\n--- 4. Clasificación Temática de Categorías ---");
  const catPol = classifyCategory("Pleno del Congreso aprueba reforma del sistema de justicia", "", "/politica/");
  assert(catPol.id === 1 && catPol.slug === "politica", `Clasificación Política correcta (ID ${catPol.id})`);

  const catEcon = classifyCategory("Tipo de cambio: Dólar sube ante expectativa por tasas del BCRP", "", "/economia/");
  assert(catEcon.id === 4 && catEcon.slug === "economia", `Clasificación Economía correcta (ID ${catEcon.id})`);

  const catReg = classifyCategory("Arequipa: Culminan obras en represa tras dos años de espera", "", "/regiones/");
  assert(catReg.id === 3 && catReg.slug === "regiones", `Clasificación Regiones correcta (ID ${catReg.id})`);

  const catDep = classifyCategory("Selección Peruana confirma alineación para duelo por eliminatorias", "", "/futbol/");
  assert(catDep.id === 5 && catDep.slug === "deportes", `Clasificación Deportes correcta (ID ${catDep.id})`);

  const catTen = classifyCategory("Nasa confirma lanzamiento de nuevo satélite para monitoreo climático", "", "/ciencia/");
  assert(catTen.id === 7 && catTen.slug === "tendencias", `Clasificación Tendencias correcta (ID ${catTen.id})`);

  // 5. Generación de slug
  console.log("\n--- 5. Generación de Slugs ---");
  const testSlug = generateSlug("¡Perú clasifica a la final tras vencer 2-0 en Lima!");
  assert(testSlug === "peru-clasifica-a-la-final-tras-vencer-2-0-en-lima", `Slug limpio generado: "${testSlug}"`);

  // 6. Selección y límite de 9 noticias
  console.log("\n--- 6. Límite Diario Estricto de 9 Noticias ---");
  const mockCandidates = [];
  for (let i = 1; i <= 25; i++) {
    mockCandidates.push({
      title: `Noticia de prueba ${i}`,
      slug: `noticia-de-prueba-${i}`,
      category_id: (i % 7) + 1, // distribuidas del 1 al 7
      summary: `Resumen de prueba ${i}`
    });
  }
  const selected9 = selectDailyNewsCandidates(mockCandidates, new Set(), 9);
  assert(selected9.length === 9, `Se seleccionaron exactamente 9 noticias de las 25 disponibles (Total: ${selected9.length})`);

  // Verificar que respete slugs ya existentes
  const existingSet = new Set(["noticia-de-prueba-1", "noticia-de-prueba-2"]);
  const selectedWithExisting = selectDailyNewsCandidates(mockCandidates, existingSet, 9);
  assert(!selectedWithExisting.some(item => existingSet.has(item.slug)), "Ninguna noticia seleccionada coincide con los slugs existentes");

  // 7. Simulación de Inserción en D1 con status='draft'
  console.log("\n--- 7. Inserción Segura en D1 (Cero Publicación Prematura) ---");
  const insertedInMock = [];
  const mockDb = {
    prepare(sql) {
      return {
        first: async () => ({ total: 1 }),
        all: async () => ({ results: [] }),
        bind: (...params) => ({
          run: async () => {
            insertedInMock.push(params);
            return { meta: { last_row_id: insertedInMock.length } };
          }
        })
      };
    }
  };

  const schedulerResult = await runDailyScheduler({ DB: mockDb }, "test_suite", false);
  assert(schedulerResult.success === true, "Ejecución del scheduler completada con éxito");
  assert(schedulerResult.phase.includes("FASE 6.4"), "Fase 6.4 identificada en la respuesta");

  // Comprobar que todas las inserciones tengan status='draft' y published_at=null
  if (insertedInMock.length > 0) {
    insertedInMock.forEach((params, idx) => {
      const statusParam = params[7]; // status está en la posición 7
      const publishedAtParam = params[8]; // published_at está en la posición 8
      assert(statusParam === "draft", `Noticia ${idx + 1}: status = 'draft' (NUNCA 'published')`);
      assert(publishedAtParam === null, `Noticia ${idx + 1}: published_at = null (NO publicado en portal)`);
    });
  }

  // --------------------------------------------------------------------------
  // RESUMEN
  // --------------------------------------------------------------------------
  console.log("\n=================================================================");
  console.log(`RESUMEN: ${passed} pruebas exitosas, ${failed} fallos.`);
  console.log("=================================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("¡Todas las verificaciones de la FASE 6.4 pasaron satisfactoriamente!\n");
  }
}

runTests().catch(err => {
  console.error("Error en las pruebas:", err);
  process.exit(1);
});
