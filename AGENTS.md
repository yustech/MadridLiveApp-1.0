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
- **Portabilidad:** Todas las dependencias deben instalarse mediante la configuración del archivo `package.json` utilizando las herramientas del sistema de AI Studio.
- **Rate-limit de login y `trust proxy` (no los quites):** `POST /api/auth/login` está limitado a `LOGIN_MAX_ATTEMPTS` (5) intentos por `LOGIN_WINDOW_MS` (15 min) por IP — sin esto, el login de admin no tenía ningún freno de fuerza bruta. La derivación de IP (`getClientIp`) depende de `app.set("trust proxy", 1)`; si se quita ese `trust proxy`, `req.ip` deja de reflejar al cliente real detrás de nginx y el rate-limit (tanto de login como del ya existente en `/api/test-mariadb`) se puede saltar falseando `X-Forwarded-For`. Si se despliega detrás de más de un proxy (ej. se añade un CDN delante de nginx), ajusta el número de hops en `trust proxy` en vez de quitarlo.
