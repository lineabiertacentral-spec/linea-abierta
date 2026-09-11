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
- `POST /run` o `GET /run` — Ejecución activa manual del ciclo: lee fuentes, filtra duplicados, selecciona hasta un máximo de 9 noticias y las guarda en D1 como borrador (`status = 'draft'`). **PROTEGIDO**: Requiere autenticación mediante la variable secreta `CRON_SECRET` configurada en el Worker.

### 🔒 Autenticación para Ejecución Manual (`/run`)
Para invocar `/run` de forma manual, envía el token mediante cualquiera de estas 3 formas:
1. **Cabecera Bearer**: `Authorization: Bearer <TU_CRON_SECRET>`
2. **Cabecera personalizada**: `X-Cron-Key: <TU_CRON_SECRET>`
3. **Parámetro URL**: `https://linea-abierta-cron.<tu-subdominio>.workers.dev/run?key=<TU_CRON_SECRET>`

> [!NOTE]
> El **Cron automático** diario (06:00 a. m. Perú) se ejecuta internamente dentro del runtime de Cloudflare Workers y **no requiere cabeceras HTTP ni intervención manual**.

---

## 📡 Fuentes Configuradas (FASE 6.4)
- **RPP Noticias**: Activa (RSS público `https://rpp.pe/rss-titulares.xml` con fallback a `https://rpp.pe/rss`).
- **MEF**: Preparada para siguiente etapa.
- **BCRP**: Preparada para siguiente etapa.
- **Congreso de la República**: Preparada para siguiente etapa.
