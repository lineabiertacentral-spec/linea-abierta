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

## 🧪 Pruebas y Verificación
Puedes probar el funcionamiento del Worker en cualquier momento realizando una petición HTTP a su URL (o mediante `scripts/test-cron.js`):
- `GET /status` — Devuelve el estado de conexión con D1, zona horaria de Perú y los 9 slots editoriales configurados.
