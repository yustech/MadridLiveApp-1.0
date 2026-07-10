# Auditoria funcional front - app en vivo

Fecha: 2026-07-09  
Entorno revisado: produccion `https://inmosubastas.top`  
Metodo: recorrido manual asistido con Playwright en desktop 1440x1000 y mobile 390x844. No se ejecutaron acciones destructivas.

## Limitaciones

- No se probo camara fisica real ni envio real por WhatsApp.
- No se pulso `Restablecer BD` ni `Eliminar`.
- Las capturas se guardaron temporalmente fuera del repo en `/tmp/madridlive-front-audit*`.

## Hallazgos principales

### P0 - Acceso demo activo en produccion

Pantalla: Login.

La pantalla publica de login muestra `Rellenar Credenciales Demo` y permite entrar en la app de produccion. Esto deja accesible el panel operativo sin credenciales reales.

Riesgo:

- Acceso no controlado al dashboard, staff, historial, KPIs y Explorador BD.
- Aumenta el riesgo de operaciones accidentales si los endpoints admin estan protegidos de forma incompleta.

Recomendacion:

- Deshabilitar el acceso demo en produccion.
- Usar auth server-side con cookie HTTP-only y RBAC.
- Mantener cualquier modo demo solo en staging/local con flag explicito.

### P0 - Explorador BD expone configuracion sensible y acciones destructivas

Pantalla: Explorador BD > Seguridad & MySQL.

El panel muestra campos precargados de conexion de base de datos, incluyendo host, usuario y nombre de base. La password aparece enmascarada, pero el resto de metadatos siguen siendo sensibles. En el mismo modal aparecen `Restablecer BD` y botones `Eliminar`.

Riesgo:

- Exposicion innecesaria de infraestructura.
- Acciones destructivas demasiado cerca de vistas de consulta/edicion.
- El texto de seguridad habla de JWT en `localStorage`, una practica que no deberia ser el modelo final de produccion.

Recomendacion:

- Ocultar configuracion de infraestructura en frontend.
- Separar herramientas destructivas en una zona admin con confirmacion fuerte, permisos granulares y auditoria.
- No mostrar cuentas de guardia ni metadatos internos salvo a roles autorizados.

### P1 - El front intenta inicializar MySQL y recibe 401

Pantallas: Login/carga inicial, Dashboard, Mobile.

En cada carga se detecto:

- `POST /api/mysql/init` -> `401 Unauthorized`.
- Error de consola: `Error while seeding MySQL database`.

Impacto:

- Ruido permanente en consola.
- Si el seed fuese necesario, fallaria silenciosamente para el usuario.
- Indica que el frontend esta intentando ejecutar una operacion admin.

Recomendacion:

- Mover seed/init a backend, deploy o tarea admin.
- El frontend no deberia llamar `/api/mysql/init` en runtime normal.
- Mostrar errores operativos en un banner controlado solo cuando afecten al usuario.

### P1 - Evento activo en pasado aparece como produccion en vivo

Pantallas: Dashboard, Scanner, KPIs.

El evento activo mostrado es `Concierto TEST` con fecha `6 Julio 26`, pero la auditoria se hizo el 2026-07-09. Aun asi aparece como `PRODUCCION EN VIVO` y alimenta Scanner/KPIs.

Impacto:

- Operacion puede fichar personal contra un evento pasado.
- KPIs y pendientes quedan asociados al evento incorrecto.
- Confunde el estado real de produccion.

Recomendacion:

- Definir regla clara de evento activo: manual con expiracion, o automatico por fecha/hora.
- Bloquear check-ins contra eventos pasados/futuros salvo override admin.
- Mostrar estado `Pasado`, `Hoy`, `Futuro` de forma consistente.

### P1 - Historial y Perfil muestran datos temporales inconsistentes

Pantallas: Historial de Registros, Perfil.

Evidencias observadas:

- Perfil con turnos fechados en `08 jul 2001` y `06 jul 2001`.
- Turnos marcados como `COMPLETADO` con rango `16:48 - Presente`.
- Registros duplicados repetidos para el mismo trabajador y rango.
- En Historial hay rangos largos como `00:00 - 23:52` con duraciones mostradas de pocos minutos.

Impacto:

- Las horas acumuladas y KPIs dejan de ser confiables.
- El operador no puede distinguir fichaje real, duplicado o dato corrupto.

Recomendacion:

- Normalizar `startedAt`, `endedAt`, `dateString` y `durationLabel` desde un unico calculo backend.
- Crear reporte de integridad: fechas fuera de rango, completados con `Presente`, solapes y duplicados.
- En UI, marcar registros sospechosos con estado `Revisar`.

### P1 - Roles fuera de catalogo rompen filtros y KPIs

Pantallas: Staff, KPIs.

La plantilla muestra roles como `ELECTRICIAN` y `TECHNICIAN`, pero los filtros visibles solo contemplan `Auxiliar`, `Auxiliar Plus` y `Coordinacion`. En KPIs, `Staff Activo por Rol` suma 9 personas, mientras `Turnos activos ahora` muestra 15.

Impacto:

- Filtros incompletos.
- KPIs por rol subestiman personal activo.
- Mezcla de catalogos antiguos/nuevos.

Recomendacion:

- Definir un catalogo unico de roles.
- Migrar o mapear roles legacy a categorias operativas.
- Anadir categoria `Otros` si se permiten roles libres.

### P1 - Modal de registro de personal bloquea la pantalla

Pantalla: Staff > Registrar Miembro de Personal.

El modal abre, pero:

- No hay boton `Cancelar` visible.
- `Escape` no cierra el modal.
- El boton de envio queda parcialmente cortado en desktop 1440x1000.
- El boton de cierre es icon-only y tiene baja descubribilidad.

Impacto:

- El usuario puede quedar atrapado en el modal.
- En pantallas pequenas el formulario puede impedir completar o cancelar con comodidad.

Recomendacion:

- Anadir `Cancelar`, cierre por `Escape`, click fuera opcional y focus trap.
- Hacer footer sticky dentro del modal.
- Garantizar altura maxima con scroll interno y boton visible.

### P1 - Mobile: la barra inferior tapa contenido

Pantallas: Dashboard, Scanner, Staff.

En mobile, la barra inferior flotante queda sobre tarjetas de alerta, lista de credenciales y cards de personal durante scroll.

Impacto:

- Lectura interrumpida.
- Riesgo de tap accidental.
- Botones o informacion quedan tapados.

Recomendacion:

- Anadir `padding-bottom` suficiente al contenido movil.
- Usar `safe-area-inset-bottom`.
- Validar capturas mobile por pantalla en Playwright.

## Hallazgos por pantalla

### Login

- P0: boton demo activo en produccion.
- Copy dice `DEMO PASSKEY` y promueve uso de clave maestra predefinida.
- Mejora: sustituir por login real, mensajes de error neutros y bloqueo tras intentos fallidos.

### Dashboard

- P1: evento en pasado marcado como produccion en vivo.
- Mobile: el chip `PRODUCCION EN VIVO` y `ID` se pisan visualmente.
- Alertas quedan parcialmente tapadas por bottom nav en mobile.
- Mejora: selector/estado de evento activo mas explicito, tarjetas con estado temporal y modo compacto mobile.

### Scanner

- P1: permite operar contra evento activo pasado.
- Selector de evento contiene nombres duplicados y meses mezclados (`15 7`, `15 SEP`).
- CTA `Enviar QR por WhatsApp` aparece operativo dentro de un flujo simulado.
- No se pudo verificar camara fisica real en esta auditoria.
- Mejora: ordenar eventos por fecha, mostrar estado temporal, deduplicar titulos y confirmar acciones externas.

### Staff

- P1: roles fuera de catalogo no encajan con filtros.
- P1: modal de registro queda atrapado/no se cierra con Escape.
- Cards muestran `Entrada: Sin registro` para personal `DENTRO`.
- Descubribilidad de perfil: el acceso principal observado fue avatar de cabecera; en cards destaca `VER QR`, no perfil completo.
- Mejora: filtros dinamicos por roles reales, accesos separados `Ver perfil` y `Ver QR`, formulario con cierre robusto.

### Perfil

- P1: historial con fechas imposibles, duplicados y completados con `Presente`.
- `Horas totales` y `Turno actual` no cuadran con historial mostrado.
- Accion `Salida manual` esta muy visible; requiere confirmacion y permisos claros.
- Mejora: seccion de integridad del historial, confirmacion custom para acciones manuales y calculo backend de horas.

### Historial

- P1: duraciones no cuadran con algunos rangos horarios.
- Inputs de fecha usan placeholder del navegador `mm/dd/yyyy`, no formato local espanol.
- Eventos largos se truncaron sin ver detalle completo en tabla.
- Mejora: formato `dd/mm/yyyy`, tooltip/expand de evento, validacion de duracion y export con filtros visibles.

### KPIs

- P1: desglose por rol no suma el total de activos por roles legacy.
- Cobertura global `15/584` y foco `Concierto TEST` pueden confundir si el evento activo esta mal seleccionado.
- Eventos duplicados aparecen en rankings.
- Mejora: mostrar formula de cada KPI, categoria `Otros`, deduplicacion de eventos y selector de foco persistente.

### Explorador BD

- P0: datos de conexion visibles en frontend.
- P0/P1: acciones destructivas visibles en el mismo modal.
- No cierra con `Escape`; hay que encontrar el boton icon-only.
- Mejora: ocultar en produccion o mover a consola admin con RBAC, auditoria y confirmaciones fuertes.

## Mejoras recomendadas por prioridad

1. Desactivar demo login en produccion y proteger Explorador BD por rol.
2. Eliminar llamadas frontend a `/api/mysql/init`.
3. Corregir seleccion/estado de evento activo antes de operar Scanner/KPIs.
4. Ejecutar limpieza de datos: fechas 2001, completados con `Presente`, duplicados y duraciones corruptas.
5. Unificar catalogo de roles y recalcular KPIs incluyendo legacy/otros.
6. Reparar modales: cancelar, Escape, focus trap, footer visible.
7. Ajustar layout mobile con padding inferior y pruebas visuales.
8. Anadir suite E2E visual/funcional por pantalla: login, dashboard, scanner, staff, profile, historial, KPIs y Explorador BD.

## Checks sugeridos

- Test E2E que falle si hay respuestas 4xx/5xx inesperadas durante login/dashboard.
- Test mobile screenshot para detectar bottom nav tapando contenido.
- Test de integridad API para fechas fuera de rango y duraciones inconsistentes.
- Test de permisos: usuario sin rol admin no ve Explorador BD ni acciones destructivas.
