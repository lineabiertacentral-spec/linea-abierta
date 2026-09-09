# Linea Abierta (lineaabierta.net.pe)

**Linea Abierta** es un portal informativo peruano moderno, ligero, accesible y 100% responsivo, diseñado bajo los más altos estándares del periodismo digital y la web moderna.

---

## 🎨 Identidad Visual y Paleta de Colores

Inspirada en la identidad oficial de **Linea Abierta**:
- **Verde Oscuro Profundo (`#041f16`)**: Color institucional base para cabeceras, barra de navegación, footer y contrastes editoriales.
- **Verde Esmeralda (`#0d7350`)**: Color secundario para insignias, etiquetas y acentos sutiles de sección.
- **Verde Brillante (`#00c07f`)**: Indicadores activos y detalles de transmisión en vivo.
- **Amarillo / Dorado (`#f59e0b` / `#fbbf24`)**: Color de acento para botones, cintillo de último minuto, ranking de lo más leído y llamadas a la acción.
- **Blanco Puro y Fondos Neutros Suaves**: Para garantizar máxima legibilidad tipográfica y una estética periodística limpia y profesional.

---

## 🚀 Características Principales

- **Velocidad y Cero Dependencias**: Construido con HTML5 semántico, CSS3 modular y Vanilla JavaScript. No requiere Node.js, PHP ni librerías pesadas para funcionar.
- **Contexto e Identidad Peruana**:
  - Reloj en tiempo real sincronizado con la **Hora Oficial de Lima (UTC-5)**.
  - Barra superior compacta con cotización referencial del **Dólar SBS / Ocoña**.
  - Secciones periodísticas clave: *Portada, Política, Actualidad, Regiones, Economía, Deportes, Opinión y Tendencias*.
- **Diseño Editorial Responsivo**:
  - Grilla jerárquica con noticia principal calibrada y sin espacios vacíos innecesarios.
  - Cintillo interactivo de **Último Minuto** (Breaking News Ticker).
  - Menú lateral deslizante (*Drawer*) optimizado para celulares y tablets.
  - Modo Noche / Modo Día integrado con memoria local segura (`localStorage`).
  - Buscador modal rápido accesible con atajos y tecla Escape.
- **Preparado para SEO y Redes Sociales**:
  - Metadatos Open Graph y Twitter Cards preconfigurados.
  - Datos estructurados JSON-LD (`NewsMediaOrganization` y `NewsArticle`).
  - Archivos `sitemap.xml` y `robots.txt` listos para indexación en Google Noticias.
- **Configuración para Producción y Cloudflare Pages**:
  - Cabeceras de seguridad HTTP y caché óptima predefinidas en `_headers`.
  - Página de error `404.html` personalizada con la línea gráfica del portal.
  - Cumplimiento informativo con enlaces a *Libro de Reclamaciones*, *Código de Ética* y aviso legal.

---

## 📁 Estructura del Proyecto

```text
linea-abierta/
│
├── index.html                  # Portada principal completa del portal
├── articulo.html               # Plantilla editorial para lectura de noticia individual
├── categoria.html              # Plantilla para listado de noticias por sección
├── 404.html                    # Página de error 404 personalizada con buscador y retorno
├── _headers                    # Cabeceras de seguridad y caché HTTP para Cloudflare Pages
├── robots.txt                  # Instrucciones para motores de búsqueda y Google News
├── sitemap.xml                 # Mapa del sitio canónico para lineaabierta.net.pe
├── .gitignore                  # Exclusiones estándar para repositorio Git / GitHub
│
├── css/
│   ├── main.css                # Variables de diseño (verdes y dorados), reset y tipografía
│   ├── components.css          # Estilos de encabezado, ticker, tarjetas y pie de página
│   └── article.css             # Estilos de lectura (citas, autor, destacados, callouts)
│
├── js/
│   └── main.js                 # Reloj de Lima en vivo, menú móvil, modal y modo oscuro
│
├── assets/
│   └── images/                 # Recursos vectoriales SVG con la paleta oficial
│       ├── emblem-linea-abierta.svg   # Isotipo oficial y favicon
│       ├── logo-linea-abierta.svg     # Logotipo completo vectorizado
│       ├── noticia-principal.svg
│       ├── noticia-economia.svg
│       ├── noticia-regiones.svg
│       ├── noticia-deportes.svg
│       ├── avatar-1.svg
│       └── avatar-2.svg
│
└── README.md                   # Documentación técnica del proyecto
```

---

## 🌐 Cómo probar el sitio en local

1. Haz doble clic en `index.html` para abrirlo directamente en cualquier navegador web.
2. Si prefieres un servidor local:
   ```bash
   # En terminal (PowerShell o Bash) dentro de la carpeta:
   npx serve .
   # o con Python:
   python -m http.server 8000
   ```
   Luego abre `http://localhost:8000`.

---

## ☁️ Guía de Despliegue en Cloudflare Pages

1. **Subir a GitHub**:
   - Inicializa el repositorio en tu carpeta local:
     ```bash
     git init
     git add .
     git commit -m "Initial commit: Linea Abierta v1.0"
     git branch -M main
     git remote add origin https://github.com/TU-USUARIO/linea-abierta.git
     git push -u origin main
     ```
2. **Conectar a Cloudflare Pages**:
   - Ingresa a tu panel en [Cloudflare Dashboard](https://dash.cloudflare.com/) > **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
   - Selecciona tu repositorio `linea-abierta`.
   - **Build settings**:
     - **Framework preset**: `None`
     - **Build command**: *(Dejar en blanco / vacío)*
     - **Build output directory**: `/` *(O dejar en blanco para tomar la raíz)*
   - Haz clic en **Save and Deploy**.
3. **Asignar Dominio Personalizado**:
   - En la pestaña **Custom domains** del proyecto en Cloudflare Pages, añade `lineaabierta.net.pe` y `www.lineaabierta.net.pe`.
   - Cloudflare configurará el certificado SSL gratuito automáticamente.
