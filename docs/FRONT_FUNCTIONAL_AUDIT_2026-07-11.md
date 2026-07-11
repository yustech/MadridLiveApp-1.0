# Auditoria funcional front - staging

Fecha: 2026-07-11  
Entorno revisado: staging `https://staging.inmosubastas.top`  
Metodo: recorrido funcional asistido con Playwright en desktop 1440x1000 y mobile 390x844.

Evidencias locales:

- Capturas: `test-results/front-audit-2026-07-11/`
- Hoja de contacto: `test-results/front-audit-2026-07-11/contact-sheet.jpg`
- Resumen de captura: `test-results/front-audit-2026-07-11/audit-run.json`

Nota: `test-results/` esta ignorado por git; las capturas quedan como evidencia local, no como artefactos versionados.

## Resumen ejecutivo

La app esta funcionalmente mucho mejor que en la auditoria anterior:

- Login server-side: OK.
- Logout y `/api/auth/session`: OK.
- Navegacion principal desktop/mobile: OK.
- Alta de colaborador desde `Plantilla`: OK.
- Alta de evento y colaborador desde `Explorador BD`: OK.
- Scanner manual: valida errores y permite entrada/salida en tests E2E.
- Export CSV desde historial: OK.
- `init` y `reset-initial` sin auth: devuelven `401`.
- `init` y `reset-initial` con admin: OK en staging.
- Playwright E2E contra staging: 11 passed, 0 skipped.
- Captura visual: 20 pantallas, 0 errores de consola, 0 requests fallidas.

Los problemas actuales ya no son de acceso basico, sino de coherencia operativa y UX:

- Se usan eventos futuros como foco operativo.
- Turnos futuros aparecen como activos ahora.
- Perfil muestra fechas imposibles como `28 oct 2001`.
- En mobile, el dock inferior tapa contenido.
- Hay avatares rotos y algunos controles nativos en ingles.

## Hallazgos prioritarios

### P1 - Evento futuro usado como evento activo operativo

Pantallas: Dashboard, Scanner, KPIs, modal de evento.

Estado observado:

- Dashboard muestra `Indie Rock Showcase` como foco activo.
- El evento esta marcado como `Futuro` y fechado `12 Octubre 26`.
- Aun asi, Dashboard calcula `Pendientes ahora`, deficit y cobertura sobre ese evento.
- Scanner muestra `Entradas bloqueadas: solo se inician turnos en eventos de hoy`, pero mantiene ese evento futuro como selector principal.
- Modal de evento ofrece `Hacer registro QR en este evento` para el evento futuro.

Impacto:

- El operador ve un evento futuro como si fuese la operacion del momento.
- Los KPIs y pendientes pueden parecer una incidencia real cuando solo es planificacion futura.
- Hay friccion: se invita a escanear en un evento que luego bloquea entradas.

Recomendacion:

- Separar claramente `evento foco` de `evento operable hoy`.
- Si no hay evento de hoy, mostrar un estado vacio: `No hay evento operativo hoy`.
- Deshabilitar o cambiar el CTA de escaneo para eventos futuros: `Preparar evento` / `Ver detalle`.
- Permitir override manual solo con confirmacion admin visible.

### P1 - Turnos futuros se contabilizan como activos ahora

Pantallas: Historial, Dashboard, KPIs, Perfil, Scanner.

Estado observado:

- Historial muestra turnos `ACTIVO` en fechas de octubre de 2026.
- KPIs indican `Turnos activos ahora: 3`.
- Dashboard muestra `Presentes: 3`.
- Scanner permite cerrar turnos abiertos de personas que aparecen dentro.

Impacto:

- `Activo ahora`, `Presentes` y `Cobertura` dejan de representar el estado real del dia.
- La herramienta puede inducir a cerrar turnos que pertenecen a otra fecha o a datos de fixture.
- Los calculos de duracion y horas acumuladas quedan poco confiables.

Recomendacion:

- Definir `turno activo ahora` como `status=Active` y `startedAt` dentro de una ventana razonable.
- Marcar turnos activos con `startedAt` futuro/pasado extremo como `Revisar`.
- Anadir un endpoint o job de integridad para detectar activos fuera de rango.
- En UI, separar `turnos abiertos historicos` de `personas presentes ahora`.

### P1 - Perfil muestra fechas imposibles por parseo de `dateString`

Pantalla: Perfil del Colaborador.

Estado observado:

- Perfil de Javier Rodriguez muestra un turno activo como `28 oct 2001`.
- La misma app en Historial normaliza mejor las fechas.
- Causa probable: `ProfileScreen.tsx` usa `new Date(dateString)` directamente, mientras `ShiftsScreen.tsx` tiene un parser mas robusto con `startedAt`, `updatedAt` e ID.

Impacto:

- El historial individual pierde credibilidad.
- Puede parecer que hay datos corruptos de hace 25 anos.
- Dificulta revisar horas reales de un trabajador.

Recomendacion:

- Reutilizar una unica utilidad compartida para formatear fechas de turnos.
- Priorizar `startedAt`/`endedAt`; usar `dateString` solo como fallback legacy.
- Mostrar estado `Fecha no normalizada` si no hay datos suficientes.

### P1 - Mobile: el dock inferior tapa contenido

Pantallas: Dashboard, Scanner, Staff, Historial, KPIs.

Estado observado:

- Dashboard: el dock tapa parte de la alerta de salida pendiente.
- Scanner: el dock tapa el bloque central del lector.
- Staff: el dock queda sobre una card de personal.
- Historial: el dock tapa filtros.
- KPIs: el dock tapa la zona de metricas superiores.

Impacto:

- Lectura interrumpida.
- Riesgo de tap accidental.
- Sensacion de interfaz menos fiable en movil, justo donde puede usarse en puerta.

Recomendacion:

- Aumentar `padding-bottom` real del contenido mobile.
- Reservar espacio vertical para el dock en cada pantalla o usar layout con dock fuera del flujo.
- Validar screenshots mobile con Playwright como check visual recurrente.

### P2 - Inputs de fecha usan formato nativo en ingles

Pantallas: Historial.

Estado observado:

- Los campos `Desde` y `Hasta` muestran `mm/dd/yyyy`.

Impacto:

- Para usuarios en Espana, el formato esperado es `dd/mm/yyyy`.
- Puede provocar errores al filtrar rangos.

Recomendacion:

- Usar labels visibles `Desde (dd/mm/aaaa)` y `Hasta (dd/mm/aaaa)`.
- O usar un date picker custom/localizado.
- Mostrar el valor seleccionado formateado en espanol junto al input nativo.

### P2 - Avatares rotos en varias pantallas

Pantallas: Scanner, Historial, Staff.

Estado observado:

- Elena Rostova aparece con imagen rota o fallback inconsistente.
- En Historial desktop, el avatar roto comprime el nombre en la primera fila.

Impacto:

- Baja calidad percibida.
- En mobile/historial se reduce legibilidad.

Recomendacion:

- Aplicar fallback de avatar en todos los componentes, no solo en Perfil.
- Considerar guardar avatar local/base64 o usar imagenes generadas/controladas.
- Anadir `object-fit`, placeholder y `onError` comun.

### P2 - KPIs globales poco utiles para operacion pequena

Pantallas: KPIs.

Estado observado:

- `Cobertura personal` muestra `1%` y `3/485 personas`.
- El valor suma necesidades de todos los eventos, incluidos futuros.
- Para una empresa de 3 usuarios, la metrica global puede sonar alarmante sin contexto.

Impacto:

- El dashboard ejecutivo parece peor de lo que esta la operacion actual.
- Dificulta saber que hay que hacer ahora.

Recomendacion:

- Por defecto, KPIs deben enfocarse en `evento de hoy` o `evento seleccionado`.
- Dejar el global como modo secundario: `Planificacion total`.
- Mostrar formula simple: `Presentes / requeridos del evento foco`.

### P2 - Control de subida de archivo aparece en ingles

Pantalla: Staff > Registrar colaborador.

Estado observado:

- El input nativo muestra `Choose File` / `No file chosen`.

Impacto:

- Pequena inconsistencia de idioma en un formulario por lo demas bastante claro.

Recomendacion:

- Ocultar input nativo y usar boton custom `Subir foto`.
- Mantener texto `Ningun archivo seleccionado`.

## Resultado por pantalla

### Login

Estado: OK.

- Login real con credenciales admin: OK.
- Error por login invalido cubierto en E2E: OK.
- No se observo boton demo en staging.

Mejora:

- Mensajes de error mas humanos y menos tecnicos.
- Considerar bloqueo suave tras intentos fallidos si se expone fuera de staging.

### Dashboard

Estado: funcional, con incoherencia operativa.

- Render desktop/mobile: OK.
- Modal de evento: OK.
- Problema principal: evento futuro tratado como foco de operacion.
- Mobile: dock tapa alertas.

Mejoras:

- Estado vacio cuando no haya evento de hoy.
- CTA distinto para evento futuro.
- Separar planificacion futura de control en vivo.

### Scanner

Estado: funcional, con seleccion de evento confusa.

- Manual ID invalido: OK.
- Entrada/salida inmediata: OK en E2E.
- Seleccion de evento: OK.
- Problema principal: evento futuro seleccionado por defecto aunque bloquea entradas.
- Mobile: dock tapa contenido.

Mejoras:

- Banner mas claro: `No puedes abrir entradas en eventos futuros`.
- Deshabilitar input manual si el evento elegido no es operable, salvo salida de turnos abiertos.
- Fallback de avatar en lista de credenciales.

### Staff / Plantilla

Estado: funcional.

- Alta desde pantalla Plantilla: OK.
- Modal de alta: usable.
- Filtros y paginacion: OK con dataset pequeno.
- Mobile: dock tapa una card.
- Control de archivo en ingles.

Mejoras:

- Boton de alta mas visible arriba en mobile.
- Fallback comun para avatares.
- Localizar control de subida.

### Perfil

Estado: funcional, pero con fecha incorrecta.

- Vista de perfil: OK.
- QR visible: OK.
- Historial individual: muestra `28 oct 2001`.
- `Turno Actual` se muestra activo aunque el registro no representa claramente el presente.

Mejoras:

- Reutilizar parser de fechas de Historial.
- Mostrar advertencias de integridad en turnos activos anormales.
- Boton `Salida manual` deberia explicar si cerrara un turno de hoy o un turno historico abierto.

### Historial

Estado: funcional.

- Filtros: OK.
- Export CSV: OK, descarga `registros_personal_2026-07-11.csv`.
- Tabla desktop: OK.
- Cards mobile: legibles, pero primera fila sufre por avatar roto/nombre truncado.
- Inputs fecha en ingles.
- Dock tapa filtros en mobile.

Mejoras:

- Localizar fechas.
- Avisar cuando hay turnos activos fuera de fecha actual.
- Fallback avatar.

### KPIs

Estado: funcional, pero las metricas necesitan contexto.

- Render desktop/mobile: OK.
- Graficos SVG: OK.
- Cobertura global `3/485` no es buena metrica por defecto.
- Mobile: dock tapa metricas superiores.

Mejoras:

- Default por evento foco/operable.
- Modo global explicito.
- Tooltip/formula de cada KPI.

### Explorador BD

Estado: funcional en staging.

- Crear evento desde UI: OK.
- Crear colaborador desde UI: OK.
- Confirmacion custom de reset: OK.
- Reset requiere auth: OK.

Mejoras:

- Mantenerlo habilitado solo en staging/admin.
- Separar acciones destructivas en una seccion con doble confirmacion si se usa en produccion.

## Validaciones ejecutadas

- Captura visual desktop/mobile: 20 screenshots.
- Consola durante captura: 0 errores/warnings registrados.
- Requests fallidas durante captura: 0.
- `SITE_URL=https://staging.inmosubastas.top npm run smoke:staging`: OK.
- Alta de colaborador desde `Plantilla`: OK, limpieza posterior por API.
- Export CSV desde `Historial`: OK.
- E2E staging reciente: 11 passed, 0 skipped.

## Limitaciones

- No se probo camara fisica real.
- No se envio WhatsApp real.
- No se pulso confirmacion destructiva de `Eliminar` en datos reales; solo se uso limpieza controlada de datos temporales por API.
- Las capturas full-page de Playwright pueden mostrar contenido por debajo de overlays `fixed`; solo se han contado como bugs los problemas visibles en viewport.

## Recomendacion de siguiente iteracion

Orden sugerido:

1. Corregir criterio de `evento operativo hoy` y CTAs de eventos futuros.
2. Normalizar concepto de `turno activo ahora` y marcar activos fuera de rango.
3. Unificar formateo de fechas entre Historial y Perfil.
4. Arreglar dock mobile para que no tape contenido.
5. Aplicar fallback de avatar comun.
6. Localizar inputs/controles nativos en espanol.
7. Ajustar KPIs para una empresa pequena: evento foco primero, global despues.
