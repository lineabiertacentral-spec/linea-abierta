# Linea Abierta — Worker Dedicado para Programador Diario (Cron)

Worker independiente para la ejecución diaria de tareas automatizadas en **Linea Abierta** (`lineaabierta.net.pe`).

## 🕒 Horario de Ejecución
- **Expresión Cron**: `0 11 * * *`
- **Hora Perú**: 06:00 a. m. (America/Lima, UTC-5).
- **Hora UTC**: 11:00 UTC.
- **Frecuencia**: Exactamente una vez al día.

---

## 🗄️ Conexión con Cloudflare D1
El Worker se conecta a la misma base de datos D1 del portal (`linea-abierta-db`) a través del binding `DB`.

---

## 🚀 Opciones de Despliegue

### Opción 1: Mediante el Panel de Cloudflare (Sin comandos)
1. Inicia sesión en el panel de [Cloudflare](https://dash.cloudflare.com/).
2. Ve a **Compute (Workers) > Workers y Pages**.
3. Haz clic en **Crear aplicación** > pestaña **Workers** > botón **Crear Worker**.
4. Nombra el Worker `linea-abierta-cron` y pulsa **Implementar**.
5. Abre la pestaña **Configuración (Settings)** del Worker:
   - En **Variables y enlaces (Bindings)** > **Base de datos D1**:
     - Variable: `DB`
     - Base de datos D1: `linea-abierta-db`
   - En **Desencadenadores (Triggers)** > **Desencadenadores Cron**:
     - Añadir desencadenador Cron: `0 11 * * *`
6. Pulsa en **Editar código**, copia y pega el contenido de `cron-worker/index.js` y pulsa **Guardar e implementar**.

### Opción 2: Mediante Wrangler CLI
Desde la carpeta raíz del proyecto o dentro de `cron-worker/`:
```bash
cd cron-worker
npx wrangler deploy
```

---

## 🧪 Endpoints para Pruebas y Diagnóstico
Puedes probar el funcionamiento del Worker en cualquier momento realizando una petición HTTP a su URL:
- `GET /status` — Diagnóstico seguro del Worker, hora de Perú, métricas de D1 y estado de protección (dry-run, solo lectura).
- `GET /sources` — Vista previa en vivo de las noticias detectadas desde RPP Noticias sin guardar en D1 (solo lectura).
- `POST /run` o `GET /run` — Ejecución activa manual del ciclo: lee fuentes, filtra duplicados, respeta la cuota diaria estricta de máximo 9 noticias y las guarda en D1 como borrador (`status = 'draft'` y `published_at = NULL`). **PROTEGIDO**: Requiere autenticación mediante la variable secreta `CRON_SECRET` configurada en el Worker.
- `POST /rewrite` o `GET /rewrite` — Redacción editorial con **Gemini API** (nivel gratuito) para los borradores en D1. Soporta `?limit=1` (primera prueba controlada) o `?limit=9`. **PROTEGIDO**: Requiere autenticación mediante `CRON_SECRET`.

### 🔒 Autenticación para Ejecución Manual (`/run` y `/rewrite`)
Para invocar `/run` o `/rewrite` de forma manual, envía el token mediante cualquiera de estas 3 formas:
1. **Cabecera Bearer**: `Authorization: Bearer <TU_CRON_SECRET>`
2. **Cabecera personalizada**: `X-Cron-Key: <TU_CRON_SECRET>`
3. **Parámetro URL**: `https://linea-abierta-cron.<tu-subdominio>.workers.dev/run?key=<TU_CRON_SECRET>`

> [!NOTE]
> - El **Cron automático** diario (06:00 a. m. Perú) se ejecuta internamente dentro del runtime de Cloudflare Workers y **no requiere cabeceras HTTP ni intervención manual**.
> - Para forzar una ejecución manual que ignore la cuota de noticias ya guardadas hoy (por ejemplo durante pruebas), puedes añadir `?force=true` a la URL de `/run`.

---

## 🤖 Redacción Editorial con Gemini API (FASE 6.5)

El Worker cuenta con un motor de redacción periodística que toma los borradores de fuentes abiertas y redacta versiones 100% originales para **Linea Abierta**.

### ⚙️ Configuración del Secreto en Cloudflare Workers:
1. En el panel de Cloudflare, abre tu Worker `linea-abierta-cron`.
2. Ve a **Configuración (Settings) > Variables y secretos (Variables and Secrets)**.
3. En **Secretos del entorno (Environment Secrets)**, pulsa **Añadir (Add)**:
   - **Nombre del secreto:** `GEMINI_API_KEY` (exacto)
   - **Valor:** Tu API Key gratuita de [Google AI Studio](https://aistudio.google.com/).
4. Pulsa **Implementar / Guardar**.

### 💸 Control de Costos y Nivel Gratuito:
- **Modelo Principal:** `gemini-3.5-flash-lite` (Google AI Studio Free Tier: 15 RPM, 1,500 RPD).
- **Modelo Fallback:** `gemini-3.1-flash-lite` (Google AI Studio Free Tier: 15 RPM, 1,500 RPD).
- **Cero Costos:** No se usa Google Search grounding (que tiene tarifas por búsqueda), no se usa Nano Banana ni APIs externas de pago.
- **Trazabilidad:** Cada noticia redactada conserva internamente en su código la fuente y URL de origen en un comentario HTML invisible para los lectores pero auditable en `/admin`.

---

## 🛡️ Aislamiento y Verificación desde `/admin`
1. **Aislamiento Total del Portal Público**: Todos los artículos guardados por el Worker tienen `status = 'draft'` y `published_at = NULL`. La API pública (`/api/articles`) solo retorna noticias con `status = 'published'`, por lo que los borradores son **100% invisibles** en la portada, categorías y artículos individuales.
2. **Verificación en el Panel `/admin`**:
   - Inicia sesión en `https://lineaabierta.net.pe/admin/login.html`.
   - En la tarjeta **Borradores** del panel verás el conteo exacto de noticias detectadas.
   - En la tabla de noticias, filtra por el selector **Borradores** para ver la lista completa con títulos, categorías asignadas y el distintivo "Borrador".
   - Puedes hacer clic en **Editar** para revisar el contenido crudo preservado con los metadatos de la fuente original.

---

## 📡 Fuentes Configuradas (FASE 6.4)
- **RPP Noticias**: Activa (RSS público `https://rpp.pe/rss-titulares.xml` con fallback a `https://rpp.pe/rss`).
- **MEF**: Preparada para siguiente etapa.
- **BCRP**: Preparada para siguiente etapa.
- **Congreso de la República**: Preparada para siguiente etapa.
