# Instrucciones y Guía del Proyecto (AGENTS.md)

Este archivo sirve como referencia e instrucciones persistentes para cualquier agente de IA o desarrollador que trabaje en esta aplicación en el futuro. Detalla la arquitectura, las directrices de diseño visual, la estructura de datos y las reglas del sistema.

---

## 1. Visión General del Proyecto

Esta aplicación es un **Sistema de Acreditación, Control de Acceso y Gestión de Personal en Tiempo Real** diseñado específicamente para producciones de eventos en vivo, festivales y operaciones técnicas. Permite el escaneo simulado por código QR, control de horas de entrada/salida por zonas, visualización de KPIs interactivos, y exportación de datos de asistencia.

### Tecnologías Clave:
- **Framework:** React 19 con TypeScript y Vite.
- **Base de Datos / Persistencia:** MySQL/MariaDB mediante el backend Express (`mysqlApi.ts`) y el módulo `dbService.ts` para polling, CRUD, seed y reset.
- **Estilos:** Tailwind CSS de alta densidad con un tema futurista cyberpunk/HUD de producción.
- **Iconos:** Únicamente `lucide-react`.
- **Gráficos:** SVG interactivo puro personalizado (para asegurar un rendimiento impecable y consistencia visual con el tema oscuro).

---

## 2. Pautas de Diseño Visual y Experiencia de Usuario (UX)

La aplicación utiliza un tema oscuro altamente personalizado denominado **Cyberpunk Slate / Production HUD**. Sigue estas directrices estrictamente en cualquier componente nuevo:

- **Fondo General:** Oscuro profundo (`#0A051A` o `#120f26`), con gradientes sutiles y efectos HUD.
- **Glasticismo (Glassmorphism):** Las tarjetas y paneles deben usar fondos semi-transparentes con bordes sutiles y desenfoque:
  `bg-white/5 backdrop-blur-lg border border-white/10 rounded-3xl shadow-hud-glow`
- **Tipografía:**
  - Títulos de exhibición / visuales: Sans-serif moderno o Space Grotesk con pesos gruesos (`font-black tracking-tight text-white`).
  - Datos del sistema, etiquetas secundarias, IDs y tiempos: Monoespaciado elegante (`font-mono text-xs uppercase tracking-wider`).
- **Estados de Acción e Interacción:**
  - No uses cuadros de diálogo nativos del navegador (`window.confirm` o `window.alert`), ya que se rompen o lucen mal dentro de la interfaz sandbox / iframe de la plataforma.
  - Implementa siempre **Modales de Confirmación Customizados** creados con Tailwind CSS y controlados por estados de React (ej: el modal de eliminación de registros en `ShiftsScreen` o el modal de detalles de eventos en `DashboardScreen`).
- **Botones y Elementos Interactivos:**
  - Añade estados hover marcados (`hover:bg-white/10 hover:border-indigo-400/30 transition-all`).
  - Usa cursores apropiados (`cursor-pointer`).

---

## 3. Estructura y Pantallas del Sistema

El sistema se divide en las siguientes vistas modulares que se controlan mediante el estado `activeScreen` en `App.tsx`:

1. **Dashboard (`dashboard`):** 
   - Panel principal tipo Bento que muestra el evento activo (Producción en Vivo) y una lista de eventos futuros.
   - Cuenta con un modal detallado interactivo para cada evento que permite establecerlo como principal o iniciar escaneos en él.
2. **Scanner (`scanner`):**
   - Simulador de escáner QR de alta tecnología con controles de linterna, selector de cámara frontal/trasera, y buscador rápido de personal.
   - Permite registrar entradas o salidas asociándolas directamente al evento activo seleccionado mediante un selector superior dinámico.
3. **Personal Roster (`staff` / `profile`):**
   - Listado y administración de todo el personal (creación, edición de rol, estado y eliminación).
   - Vista detallada del perfil del especialista (`ProfileScreen.tsx`) donde se aprecia su código QR único descargable y su historial individual de turnos.
4. **Historial de Registros (`shifts`):**
   - Registro unificado de entradas y salidas de todo el personal.
   - Filtros dinámicos por nombre/ID, evento específico, fecha del calendario, rol del especialista y estado del turno (activo o completado).
   - Métricas de total de fichajes, personal en turno activo, salidas registradas e historial de horas acumuladas de trabajo real.
   - Función para **Exportar en CSV** con saneamiento automático de delimitadores para garantizar su correcta lectura en hojas de cálculo.
5. **KPIs y Estadísticas (`kpis`):**
   - Panel de Business Intelligence interactivo.
   - Indicador de Cobertura en formato circular de SVG nativo que compara el personal presente vs. el requerido.
   - Gráfico de área interactivo animado por SVG para analizar la evolución temporal de la asistencia en tiempo real, con tooltips dinámicos HTML al pasar el cursor sobre los nodos.
   - Métricas de mix por especialidades y ranking de zonas físicas con mayor presencia acumulada.

---

## 4. Reglas Críticas para Futuros Desarrollos

- **Regla del Linter:** Mantén el código estrictamente tipado. Evita usar `any` si es posible. No utilices importaciones destructuradas de tipos (`import type` con enums).
- **Evitar bucles de renderizado:** Al usar `useEffect`, asegura que las dependencias sean tipos primitivos estables. No incluyas objetos, arrays o funciones sin memoizar (`useMemo`, `useCallback`).
- **Persistencia en MySQL:** Los datos no se simulan; se guardan directamente en las tablas `staff`, `shifts`, `events` y `alerts` a través de los helpers de `dbService.ts` y los endpoints `/api/mysql/*`. Al registrar un turno (`shift`), asegúrate de que esté enlazado con el id de staff correspondiente y con `eventId/eventTitle` para que se refleje correctamente tanto en el historial global como en el perfil individual del trabajador.
- **Lecturas MySQL protegidas:** las lecturas con datos de negocio (`/api/mysql/staff`, `/events`, `/shifts`, `/alerts`) y endpoints administrativos (`/status`, `/schema-check`) requieren sesión admin o `x-admin-token`. La única lectura pública de MySQL es `/api/mysql/health-count`, que expone solo conteos y estado de esquema sin filas ni datos personales; smokes/watchdogs públicos deben usar esa ruta.
- **Esquema real = 5 tablas (`staff`, `events`, `event_staff`, `shifts`, `alerts`):** las crea automáticamente `initSchema()` en `mysqlApi.ts` al arrancar. `event_staff` es la relación versionada añadida por la migración `0002` para convocar un subconjunto del roster a cada concierto; no incluye `created_by` hasta que exista identidad multiusuario (backlog #18). NO existe ni debe existir una tabla `supervisors` — es un residuo de un diseño de auth abandonado que llegó a producción por error (alguien copió el SQL de ejemplo de `DatabaseManagerScreen.tsx`) y se eliminó el 2026-07-12 junto con una vista huérfana `STAFF COMPLETO`. La autenticación de admin NO usa base de datos: es por `ADMIN_LOGIN_EMAIL`/`ADMIN_LOGIN_PASSWORD` del `.env` con cookies firmadas en `server.ts`. No recrees `supervisors` ni añadas otras tablas/vistas sin una razón real y documentada. Backups de los objetos eliminados: `/opt/madridlive-app/backups/pre-drop-*` (también en Google Drive).
- **Portabilidad:** Todas las dependencias deben instalarse mediante la configuración del archivo `package.json` utilizando las herramientas del sistema de AI Studio.
- **Binding de red (CRÍTICO, incidente 2026-07-12):** el `.env` de producción **debe** definir `HOST=127.0.0.1` explícitamente. `server.ts` ahora usa `HOST = process.env.HOST || "127.0.0.1"` (el default se corrigió como defensa en profundidad tras el incidente), pero eso no exime de fijarlo en cada `.env` real — si faltara y alguien revirtiera el default a `0.0.0.0`, el backend quedaría expuesto sin TLS en la IP pública del puerto 3000, saltándose nginx por completo (incluye `/api/auth/login`). Nunca elimines esa línea de `/opt/madridlive-app/.env` ni de `.env.example`, y no vuelvas a cambiar el default de `server.ts` a `0.0.0.0`. Detalle completo en `docs/PRODUCTION_OBSERVABILITY.md` → "Deploy Incident Closure 2026-07-12".
- **Cabeceras de seguridad (helmet) y CORS explícito (no los quites ni relajes a la ligera):** `server.ts` aplica `helmet` con una CSP **solo en producción** (`NODE_ENV=production`); en dev se desactiva a propósito porque el HMR de Vite necesita scripts inline/eval/websockets — no "arregles" eso activándola en dev. La CSP es una allowlist cerrada: si añades un recurso externo nuevo al frontend (CDN, imágenes, fuentes), debes añadir su origen a la directiva correspondiente en `server.ts` o producción lo bloqueará silenciosamente (revisa la consola del navegador). Orígenes ya permitidos: Google Fonts (styles/fonts), Unsplash + lh3.googleusercontent.com + api.qrserver.com (imágenes demo/QR), y `blob:` en `worker-src`/`media-src`/`img-src` porque html5-qrcode y la cámara lo requieren. El CORS de `/api` está restringido a los orígenes reales (`CORS_ALLOWED_ORIGINS` en `.env`, con default a los dos dominios de prod/staging); las peticiones sin cabecera `Origin` (same-origin, curl, CI) pasan sin restricción — por eso los smoke tests no necesitan configuración. No añadas `*` ni reflejes el `Origin` entrante sin allowlist. **Arquitectura nginx (desde 2026-07-13):** tanto prod como staging proxyean TODO al Node — prod vía la plantilla Hestia `scripts/hestia-templates/madridlive.tpl` (→ 127.0.0.1:3000), staging vía `/etc/nginx/conf.d/madridlive-staging.conf` (→ :3001) — precisamente para que estas cabeceras lleguen al navegador. El `public_html` del dominio de prod está retirado; no vuelvas a servir el frontend estático desde nginx ni reactives `DEPLOY_PUBLIC_FRONTEND`.
- **Rate-limit de login y `trust proxy` (no los quites):** `POST /api/auth/login` bloquea una IP tras `LOGIN_MAX_FAILED_ATTEMPTS` (5) intentos **fallidos** dentro de `LOGIN_WINDOW_MS` (15 min) — sin esto, el login de admin no tenía ningún freno de fuerza bruta. Cuenta solo los fallos (`recordFailedLogin`), no cada petición; un login válido limpia el contador (`clearLoginFailures`). Esto es intencional: la primera versión contaba *todos* los intentos (`isRateLimited` genérico) y rompió el CI de e2e, porque varios specs hacen login válido de forma independiente contra la misma instancia y superaban el límite sin que hubiera ningún ataque real. Si tocas este código, no vuelvas a contar logins exitosos contra el límite. La derivación de IP (`getClientIp`) depende de `app.set("trust proxy", 1)`; si se quita ese `trust proxy`, `req.ip` deja de reflejar al cliente real detrás de nginx y el rate-limit (tanto de login como del ya existente en `/api/test-mariadb`) se puede saltar falseando `X-Forwarded-For`. Si se despliega detrás de más de un proxy (ej. se añade un CDN delante de nginx), ajusta el número de hops en `trust proxy` en vez de quitarlo.
