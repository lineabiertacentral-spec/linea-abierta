/**
 * ============================================================================
 * LINEA ABIERTA (lineaabierta.net.pe)
 * Módulo Editorial: Cliente Gemini API (Nivel Gratuito)
 * ============================================================================
 * 
 * Reglas de costo y seguridad:
 * 1. Utiliza exclusivamente el nivel gratuito (Google AI Studio Free Tier).
 * 2. Cero costos: NO usa Google Search grounding ni herramientas de pago.
 * 3. La API Key se obtiene estrictamente de env.GEMINI_API_KEY (secreto del Worker).
 * 4. Modelo por defecto: gemini-3.5-flash-lite con fallback a gemini-3.1-flash-lite.
 */

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
export const FALLBACK_GEMINI_MODEL = "gemini-3.1-flash-lite";

/**
 * Prompt del sistema con directrices editoriales estrictas para Linea Abierta.
 */
export const EDITORIAL_SYSTEM_PROMPT = `
Eres un editor y redactor periodístico senior del portal de noticias peruano "Linea Abierta" (lineaabierta.net.pe).
Tu misión es transformar despachos o borradores de noticias de referencia en noticias periodísticas TOTALMENTE ORIGINALES, con identidad editorial propia, narrativa reestructurada, rigurosas y atractivas para el público peruano.

REGLAS EDITORIALES OBLIGATORIAS:
1. TITULAR 100% ORIGINAL Y DIFERENCIADO (REGLA CRÍTICA):
   - El titular de Linea Abierta NUNCA debe parecerse ni calcar la frase, estructura o palabras del titular de la fuente original.
   - Prohibido repetir la misma construcción sintáctica o las mismas combinaciones de palabras clave consecutivas.
   - Reenfoca la noticia desde otro ángulo: enfoca la consecuencia, el impacto directo en la gente, la cifra o hecho medular, o usa una estructura gramatical diferente (por ejemplo, cambiar orden sujeto-verbo, usar verbos de acción más contundentes o enfocar el trasfondo).
   - Longitud máxima: 90 caracteres. Directo, informativo, con fuerza periodística y sin clickbait sensacionalista.

2. CUERPO DE LA NOTICIA RADICALMENTE REESTRUCTURADO Y DIFERENTE (REGLA DE ORO):
   - PROHIBIDO EL PARAFRASEO LINEAL: Queda terminantemente prohibido traducir o parafrasear el texto original oración por oración o párrafo por párrafo manteniendo la estructura de la fuente.
   - REORGANIZACIÓN TOTAL DE LA NARRATIVA: Rediseña el relato periodístico desde cero con un orden narrativo propio.
     * Párrafo 1 (Entrada de impacto): Comienza directamente con la trascendencia del hecho, las implicancias para los ciudadanos o el desenlace principal. No utilices la fórmula tradicional o repetitiva de la fuente.
     * Párrafos 2 y 3 (Desarrollo analítico y datos clave): Reagrupa los hechos esenciales con tu propia prosa explicativa, fluida y moderna. Conecta causas y efectos en lugar de relatar eventos aislados.
     * Declaraciones en estilo indirecto: No copies bloques textuales de declaraciones entrecomilladas extensas. Sintetiza las posturas de los involucrados en estilo indirecto ("según remarcó el vocero...", "la entidad fundamentó la medida argumentando que..."), explicando el significado de lo expresado.
     * Párrafo final (Proyección y contexto): Cierra explicando qué pasos continúan, las investigaciones en curso, los plazos futuros o el panorama que se abre.
   - PROSA PROPIA Y VOZ INÉDITA: Utiliza un vocabulario amplio, sinónimos precisos, oraciones equilibradas, voz activa y un ritmo ágil. Escribe con personalidad editorial propia de Linea Abierta.

3. RIGOR FÁCTICO ABSOLUTO (CERO ALUCINACIONES):
   - Redacta de forma muy diferente, pero sé 100% fiel a los hechos reales.
   - Prohibido inventar datos, nombres de personas, cargos, lugares, declaraciones, cifras, porcentajes o fechas.
   - Toda la información sustancial debe provenir estrictamente de los hechos verificables del texto de referencia. Transforma radicalmente la forma, el orden y la narrativa, no la verdad factual.

4. TONO PERIODÍSTICO PERUANO:
   - Español neutral, formal, objetivo, claro y sobrio, adaptado al estándar de la prensa seria en el Perú.
   - Evita muletillas periodísticas trilladas ("en horas de la mañana", "al respecto cabe señalar", "fuentes fidedignas").

5. ESTRUCTURA Y FORMATO DE SALIDA (JSON ÚNICAMENTE):
   - title: Titular potente, nuevo, diferenciado de la fuente, informativo y riguroso (máximo 90 caracteres).
   - summary: Bajada o lead periodístico sintético de 1 a 2 oraciones que sintetice lo esencial desde el nuevo ángulo informativo (120 a 220 caracteres).
   - content: Cuerpo de la noticia en 3 a 5 párrafos bien hilvanados con doble salto de línea entre párrafos (\\n\\n). Prosa limpia, totalmente reestructurada y diferente a la fuente original.
   - insufficient_info: false (o true si el texto carece de datos sustanciales para redactar una noticia).

FORMATO DE SALIDA (JSON ÚNICAMENTE):
Debes responder ÚNICAMENTE con un objeto JSON válido con esta estructura exacta:
{
  "title": "Titular original y diferenciado",
  "summary": "Bajada periodística de la noticia",
  "content": "Párrafo 1...\\n\\nPárrafo 2...\\n\\nPárrafo 3...",
  "insufficient_info": false
}
`.trim();

/**
 * Limpia la respuesta de texto eliminando posibles bloques de código markdown (```json ... ```).
 */
export function cleanJsonBlock(text) {
  if (!text || typeof text !== "string") return "";
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }
  return cleaned.trim();
}

/**
 * Llama a la API de Gemini mediante HTTP POST directo (compatible con Cloudflare Workers).
 * @param {string} prompt - Contenido a redactar
 * @param {string} apiKey - Clave secreta de Google AI Studio
 * @param {string} model - Nombre del modelo (ej. 'gemini-3.5-flash-lite')
 */
export async function callGeminiApi(prompt, apiKey, model = DEFAULT_GEMINI_MODEL) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          { text: `${EDITORIAL_SYSTEM_PROMPT}\n\nINFORMACIÓN DE REFERENCIA PARA REDACTAR:\n"""\n${prompt}\n"""\n\nRECORDATORIOS CRÍTICOS OBLIGATORIOS:
1. TITULAR ("title"): Totalmente original, diferenciado y con nuevo ángulo.
2. CUERPO DE LA NOTICIA ("content"): Redáctalo de forma MUY DIFERENTE a la fuente original. PROHIBIDO el parafraseo lineal. Reorganiza la historia desde cero: cambia el orden narrativo, usa estilo indirecto para las declaraciones y escribe con prosa periodística propia, ágil y explicativa.
3. RIGOR FÁCTICO: Mantén con absoluta exactitud los hechos, cifras, nombres y lugares reales (cero alucinaciones).
4. FORMATO: Responde ÚNICAMENTE con el objeto JSON.` }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      responseMimeType: "application/json"
    }
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    let parsedErr;
    try {
      parsedErr = JSON.parse(errorText);
    } catch {
      parsedErr = { raw: errorText };
    }
    const errMessage = parsedErr.error?.message || `HTTP ${response.status} de Gemini API`;
    const err = new Error(errMessage);
    err.status = response.status;
    err.details = parsedErr;
    throw err;
  }

  const data = await response.json();
  const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!textResponse) {
    throw new Error("Respuesta vacía o estructura no reconocida de Gemini API.");
  }

  const cleaned = cleanJsonBlock(textResponse);
  try {
    return JSON.parse(cleaned);
  } catch (parseErr) {
    throw new Error(`Error al parsear JSON editorial de Gemini: ${parseErr.message}. Contenido: "${cleaned.slice(0, 100)}..."`);
  }
}

/**
 * Redacta una versión editorial de Linea Abierta a partir de un borrador de fuente.
 * Incluye fallback automático entre modelos de nivel gratuito.
 * 
 * @param {object} rawArticle - Noticia cruda detectada (title, summary, content, category_name)
 * @param {object} env - Variables de entorno (con env.GEMINI_API_KEY)
 */
export async function generateEditorialArticle(rawArticle, env) {
  const apiKey = env?.GEMINI_API_KEY || env?.GOOGLE_API_KEY;
  if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length === 0) {
    return {
      success: false,
      skipped: true,
      reason: "La variable secreta GEMINI_API_KEY no está configurada en Cloudflare Workers."
    };
  }

  const preferredModel = env?.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;

  // Preparar el texto de referencia para el modelo
  const referenceText = [
    `Categoría temática: ${rawArticle.category_name || "Actualidad"}`,
    `Titular original de la fuente: ${rawArticle.title || ""}`,
    `Resumen / bajada de la fuente: ${rawArticle.summary || ""}`,
    `Cuerpo / contenido de la fuente: ${rawArticle.raw_content || rawArticle.content || ""}`
  ].filter(Boolean).join("\n\n");

  // Intento 1: Modelo principal (ej. gemini-3.5-flash-lite)
  try {
    const editorialJson = await callGeminiApi(referenceText, apiKey.trim(), preferredModel);
    return {
      success: true,
      model_used: preferredModel,
      data: editorialJson
    };
  } catch (primaryErr) {
    console.warn(`[Gemini Editorial] Falló modelo ${preferredModel} (${primaryErr.message}). Intentando fallback a ${FALLBACK_GEMINI_MODEL}...`);
    
    // Intento 2: Fallback (ej. gemini-3.1-flash-lite)
    try {
      console.warn(`[EDITORIAL] Fallback al modelo de respaldo: ${FALLBACK_GEMINI_MODEL}`);
      const fallbackJson = await callGeminiApi(referenceText, apiKey.trim(), FALLBACK_GEMINI_MODEL);
      return {
        success: true,
        model_used: FALLBACK_GEMINI_MODEL,
        data: fallbackJson
      };
    } catch (fallbackErr) {
      return {
        success: false,
        skipped: true,
        error: `Error al generar redacción editorial con Gemini: ${fallbackErr.message}`,
        primary_error: primaryErr.message
      };
    }
  }
}
