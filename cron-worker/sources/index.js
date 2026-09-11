/**
 * ============================================================================
 * LINEA ABIERTA (lineaabierta.net.pe)
 * Módulo de Ingesta de Fuentes Gratuitas (FASE 6.4 - Primera Etapa)
 * ============================================================================
 * 
 * Gestiona la lectura y normalización de noticias desde fuentes abiertas y oficiales:
 * 1. RPP Noticias (RSS público activo)
 * 2. MEF (Ministerio de Economía y Finanzas - Estructura preparada)
 * 3. BCRP (Banco Central de Reserva del Perú - Estructura preparada)
 * 4. Congreso de la República (Estructura preparada)
 */

export const NEWS_PROVIDERS = [
  {
    id: "rpp",
    name: "RPP Noticias",
    type: "rss",
    status: "active",
    primary_url: "https://rpp.pe/rss-titulares.xml",
    fallback_url: "https://rpp.pe/rss",
    default_category_id: 2 // Actualidad
  },
  {
    id: "mef",
    name: "Ministerio de Economía y Finanzas",
    type: "official_feed",
    status: "prepared", // Listo para activar en la siguiente etapa
    url: "https://www.mef.gob.pe/es/noticias-comunicados",
    default_category_id: 4 // Economía
  },
  {
    id: "bcrp",
    name: "Banco Central de Reserva del Perú",
    type: "official_feed",
    status: "prepared", // Listo para activar en la siguiente etapa
    url: "https://www.bcrp.gob.pe/noticias.html",
    default_category_id: 4 // Economía
  },
  {
    id: "congreso",
    name: "Congreso de la República",
    type: "official_feed",
    status: "prepared", // Listo para activar en la siguiente etapa
    url: "https://comunicaciones.congreso.gob.pe/",
    default_category_id: 1 // Política
  }
];

/**
 * Decodifica entidades HTML y XML comunes y limpia fragmentos CDATA.
 */
export function cleanXmlText(text) {
  if (!text) return "";
  let clean = text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ") // Quitar etiquetas HTML internas
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean;
}

/**
 * Clasificador inteligente de categorías según palabras clave peruanas y ruta URL.
 * Mapeo oficial de Linea Abierta:
 * 1: Política, 2: Actualidad, 3: Regiones, 4: Economía, 5: Deportes, 6: Opinión, 7: Tendencias
 */
export function classifyCategory(title, description = "", link = "") {
  const text = `${title} ${description} ${link}`.toLowerCase();

  // Deportes (ID 5)
  if (
    /futbol|liga 1|alianza lima|universitario|sporting cristal|seleccion peruana|conmebol|copa libertadores|champions|partido|gol|atleta|torneo|dt |fifa/.test(text) ||
    link.includes("/futbol/") ||
    link.includes("/deportes/")
  ) {
    return { id: 5, slug: "deportes", name: "Deportes" };
  }

  // Economía (ID 4)
  if (
    /dolar|tipo de cambio|inflacion|bcrp|mef|sunat|pbi|arancel|tributari|agroexport|mineria|cobre|inversion|bonos|banco|sueldo|empleo|remuneracion|bolsa de valores|exportacion|importacion|credito/.test(text) ||
    link.includes("/economia/")
  ) {
    return { id: 4, slug: "economia", name: "Economía" };
  }

  // Política (ID 1)
  if (
    /congreso|parlament|legislad|pleno|comision|ministr|presidente|gobierno|palacio|fiscalia|corte suprema|tc |tribunal constitucional|jne|onpe|eleccion|reforma|partido politico|censura|interpelac/.test(text) ||
    link.includes("/politica/")
  ) {
    return { id: 1, slug: "politica", name: "Política" };
  }

  // Regiones (ID 3)
  if (
    /arequipa|cusco|la libertad|trujillo|piura|lambayeque|chiclayo|puno|juliaca|iquitos|loreto|ucayali|pucallpa|junin|huancayo|ayacucho|ancash|chimbote|cajamarca|tacna|moquegua|tumbes|amazonas|san martin|tarapoto|pasco|huanuco|madre de dios|ica|chincha/.test(text) ||
    link.includes("/regiones/") ||
    link.includes("/peru/")
  ) {
    return { id: 3, slug: "regiones", name: "Regiones" };
  }

  // Tendencias y Ciencia (ID 7)
  if (
    /tecnologia|ciencia|innovacion|celular|smartphone|inteligencia artificial|nasa|espacio|asteroide|medio ambiente|cambio climatico|salud|medicina|viral|redes sociales|streaming|estreno/.test(text) ||
    link.includes("/tecnologia/") ||
    link.includes("/ciencia/") ||
    link.includes("/vital/")
  ) {
    return { id: 7, slug: "tendencias", name: "Tendencias" };
  }

  // Opinión (ID 6)
  if (
    /editorial|columna|analisis|tribuna|opinion|punto de vista|reflexion/.test(text) ||
    link.includes("/columnistas/") ||
    link.includes("/opinion/")
  ) {
    return { id: 6, slug: "opinion", name: "Opinión" };
  }

  // Actualidad Nacional por defecto (ID 2)
  return { id: 2, slug: "actualidad", name: "Actualidad" };
}

/**
 * Generador de slug seguro y limpio para URLs
 */
export function generateSlug(text) {
  return text
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Quitar acentos
    .replace(/[^a-z0-9\s-]/g, "")   // Quitar caracteres especiales
    .trim()
    .replace(/\s+/g, "-")          // Espacios a guiones
    .replace(/-+/g, "-");          // Evitar guiones consecutivos
}

/**
 * Parser de XML RSS 2.0 tolerante para Cloudflare Workers runtime (V8 Edge).
 */
export function parseRssXml(xmlString) {
  const items = [];
  if (!xmlString || typeof xmlString !== "string") return items;

  // Extraer bloques <item>...</item>
  const itemMatches = xmlString.match(/<item>([\s\S]*?)<\/item>/gi) || [];

  for (const itemBlock of itemMatches) {
    // Título
    const titleMatch = itemBlock.match(/<title>([\s\S]*?)<\/title>/i);
    const rawTitle = titleMatch ? cleanXmlText(titleMatch[1]) : "";

    // Enlace
    const linkMatch = itemBlock.match(/<link>([\s\S]*?)<\/link>/i);
    const rawLink = linkMatch ? cleanXmlText(linkMatch[1]) : "";

    // Descripción / Bajada
    const descMatch = itemBlock.match(/<description>([\s\S]*?)<\/description>/i);
    const rawDesc = descMatch ? cleanXmlText(descMatch[1]) : "";

    // Contenido extendido
    const contentMatch = itemBlock.match(/<content:encoded>([\s\S]*?)<\/content:encoded>/i);
    const rawContent = contentMatch ? cleanXmlText(contentMatch[1]) : rawDesc;

    // Fecha de publicación
    const pubDateMatch = itemBlock.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    const rawPubDate = pubDateMatch ? cleanXmlText(pubDateMatch[1]) : "";

    // GUID
    const guidMatch = itemBlock.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i);
    const rawGuid = guidMatch ? cleanXmlText(guidMatch[1]) : rawLink;

    // Imagen destacada (media:content url="...")
    const mediaMatch = itemBlock.match(/<media:content[^>]+url=["']([^"']+)["']/i);
    const imageUrl = mediaMatch ? mediaMatch[1].trim() : "";

    if (rawTitle && rawLink) {
      items.push({
        title: rawTitle,
        link: rawLink,
        guid: rawGuid,
        description: rawDesc,
        content: rawContent,
        pubDate: rawPubDate,
        image_url: imageUrl
      });
    }
  }

  return items;
}

/**
 * Lee el feed RSS de RPP (con fallback automático) y normaliza los candidatos.
 */
export async function fetchRppNews() {
  const provider = NEWS_PROVIDERS.find(p => p.id === "rpp");
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 (LineaAbiertaBot/1.0)",
    "Accept": "application/rss+xml, application/xml, text/xml, */*"
  };

  let xmlText = "";
  let usedUrl = "";

  // 1. Intentar con la URL primaria (rss-titulares.xml)
  try {
    const res = await fetch(provider.primary_url, { headers });
    if (res.ok) {
      const text = await res.text();
      // Verificar si devolvió XML válido con items
      if (text.includes("<item>") || text.includes("<rss")) {
        xmlText = text;
        usedUrl = provider.primary_url;
      }
    }
  } catch (err) {
    console.warn(`[RPP Ingest] Falló URL primaria ${provider.primary_url}: ${err.message}`);
  }

  // 2. Si la primaria devolvió HTML o falló, usar el fallback oficial confirmado (/rss)
  if (!xmlText && provider.fallback_url) {
    try {
      const res = await fetch(provider.fallback_url, { headers });
      if (res.ok) {
        xmlText = await res.text();
        usedUrl = provider.fallback_url;
      }
    } catch (err) {
      console.error(`[RPP Ingest] Falló URL secundaria ${provider.fallback_url}: ${err.message}`);
    }
  }

  if (!xmlText) {
    return {
      provider: "rpp",
      success: false,
      items: [],
      error: "No se pudo obtener XML válido desde RPP Noticias."
    };
  }

  const rawItems = parseRssXml(xmlText);

  // Normalizar y enriquecer los items
  const normalized = rawItems.map(item => {
    const category = classifyCategory(item.title, item.description, item.link);
    const slug = generateSlug(item.title);

    let publishedIso = null;
    if (item.pubDate) {
      try {
        const d = new Date(item.pubDate);
        if (!isNaN(d.getTime())) {
          publishedIso = d.toISOString();
        }
      } catch {}
    }

    return {
      source_id: "rpp",
      source_name: "RPP Noticias",
      source_url: item.link,
      guid: item.guid,
      title: item.title,
      slug,
      summary: item.description || item.title,
      raw_content: item.content || item.description,
      image_url: item.image_url || "",
      category_id: category.id,
      category_name: category.name,
      category_slug: category.slug,
      source_published_at: publishedIso
    };
  });

  return {
    provider: "rpp",
    success: true,
    feed_url_used: usedUrl,
    total_found: normalized.length,
    items: normalized
  };
}

/**
 * Consulta todas las fuentes activas y devuelve la lista consolidada de candidatos.
 */
export async function fetchAllActiveSources() {
  const results = {
    timestamp: new Date().toISOString(),
    providers_configured: NEWS_PROVIDERS,
    candidates: []
  };

  // Por ahora ejecutamos RPP (fuente activa en esta etapa)
  const rppResult = await fetchRppNews();
  if (rppResult.success) {
    results.candidates.push(...rppResult.items);
  }

  return results;
}
