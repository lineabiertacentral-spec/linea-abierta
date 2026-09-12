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
 * 4. Modelo por defecto: gemini-2.5-flash con fallback a gemini-1.5-flash.
 */

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
export const FALLBACK_GEMINI_MODEL = "gemini-1.5-flash";

/**
 * Prompt del sistema con directrices editoriales estrictas para Linea Abierta.
 */
export const EDITORIAL_SYSTEM_PROMPT = `
Eres un editor y redactor periodístico senior del portal de noticias peruano "Linea Abierta" (lineaabierta.net.pe).
Tu misión es transformar un despacho o borrador de noticias de referencia en una noticia periodística ORIGINAL, rigurosa y de alta calidad para el público peruano.

REGLAS EDITORIALES OBLIGATORIAS:
1. REDACCIÓN 100% ORIGINAL: No copies ni calques oraciones o párrafos de la fuente de referencia. Redacta desde cero usando tu propia prosa periodística.
2. CERO ALUCINACIONES: No inventes datos, nombres de personas, cargos, lugares, declaraciones entrecomilladas, cifras ni fechas. Limítate ESTRICTAMENTE a los hechos verificables contenidos en la información de referencia.
3. TONO PERIODÍSTICO PERUANO: Español neutral, formal, objetivo, claro y sobrio, adaptado al estándar de la prensa seria en el Perú.
4. ESTRUCTURA:
   - title: Titular directo, informativo, preciso y atractivo (máximo 95 caracteres), sin clickbait sensacionalista.
   - summary: Bajada o lead periodístico sintético de 1 a 2 oraciones que resuma lo esencial de la noticia (120 a 220 caracteres).
   - content: Cuerpo de la noticia en 3 a 5 párrafos bien hilvanados (pirámide invertida: hecho principal, contexto y antecedentes, repercusiones o situación actual). Usa texto plano con doble salto de línea entre párrafos.
5. INFORMACIÓN INSUFICIENTE: Si el texto de referencia contiene menos de dos oraciones informativas o carece de datos fácticos sustanciales para redactar una noticia completa sin inventar, establece "insufficient_info": true y deja los demás campos vacíos.

FORMATO DE SALIDA (JSON ÚNICAMENTE):
Debes responder ÚNICAMENTE con un objeto JSON válido con esta estructura exacta:
{
  "title": "Titular de la noticia",
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
 * @param {string} model - Nombre del modelo (ej. 'gemini-2.5-flash')
 */
export async function callGeminiApi(prompt, apiKey, model = DEFAULT_GEMINI_MODEL) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          { text: `${EDITORIAL_SYSTEM_PROMPT}\n\nINFORMACIÓN DE REFERENCIA PARA REDACTAR:\n"""\n${prompt}\n"""` }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      topP: 0.85,
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

  // Intento 1: Modelo principal (ej. gemini-2.5-flash)
  try {
    const editorialJson = await callGeminiApi(referenceText, apiKey.trim(), preferredModel);
    return {
      success: true,
      model_used: preferredModel,
      data: editorialJson
    };
  } catch (primaryErr) {
    console.warn(`[Gemini Editorial] Falló modelo ${preferredModel} (${primaryErr.message}). Intentando fallback a ${FALLBACK_GEMINI_MODEL}...`);
    
    // Intento 2: Fallback (ej. gemini-1.5-flash)
    try {
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
