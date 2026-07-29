# Release 2026-07-29: operación de eventos y salidas

Estado: desplegada y verificada en staging y producción. Versión funcional:
`aed5fa0`.

## Resumen operativo

### Trabajadores sin foto

**Foto de perfil** es opcional al editar un trabajador. Si no se carga archivo
ni URL, el registro se guarda con `avatar=''` y `StaffAvatar` muestra el fondo
determinista con sus iniciales. No se guarda una imagen artificial en MySQL.

### Creación de eventos

`admin` y `operator` ven **+ Nuevo evento** en Eventos / Control. `viewer` no
puede crear eventos. El operador sigue sin poder editar o borrar un evento.

El autofocus del formulario se ejecuta solo al abrirlo. Los refrescos del
Dashboard ya no desplazan el cursor desde Sitio, Fecha, Apertura de puertas o
Personal requerido hacia Título.

### Convocatorias

Para cargar una convocatoria:

1. Abrir el evento en Eventos / Control.
2. Pulsar **Gestionar equipo**.
3. Seleccionar trabajadores de la plantilla disponible.
4. Añadirlos y ajustar, si procede, su rol asignado.
5. Retirar a quien no corresponda.

`admin` y `operator` pueden gestionar convocatorias. La relación se guarda en
`event_staff` y no modifica el rol global de `staff`. Si la convocatoria está
vacía, el evento permite fichaje libre y lo indica en el lector.

### Salida individual y WhatsApp

Al registrar una salida individual:

1. El backend cierra el turno y devuelve `startedAt` y `endedAt`.
2. La UI actualiza trabajador e historial.
3. Si existe un móvil español válido, abre una conversación dirigida de
   WhatsApp con nombre, concierto y horas de entrada/salida en horario Madrid.

El texto queda precargado; todavía hay que pulsar **Enviar** en WhatsApp.

### Salida conjunta

El detalle de un evento con turnos activos muestra **Dar salida a todos · N**
para `admin` y `operator`.

- Requiere confirmación.
- `POST /api/mysql/events/:eventId/checkout-all` cierra únicamente turnos
  `Active` cuyo `event_id` coincide.
- La operación es transaccional: no deja un cierre parcial.
- No modifica turnos de otros conciertos.
- Al terminar muestra un WhatsApp individual por trabajador.
- Un trabajador sin teléfono aparece como `Sin teléfono`, pero su turno se
  cierra igualmente.

## Matriz de permisos

| Acción | Admin | Operador | Lectura |
|---|---:|---:|---:|
| Consultar datos de negocio | Sí | Sí | Sí |
| Registrar entrada/salida | Sí | Sí | No |
| Salida conjunta | Sí | Sí | No |
| Crear evento | Sí | Sí | No |
| Gestionar convocatoria | Sí | Sí | No |
| Editar o borrar evento | Sí | No | No |
| Mutar plantilla global | Sí | No | No |
| Usuarios / Explorador BD / esquema | Sí | No | No |

Los permisos se aplican en frontend y backend. Los guards relevantes son
`CHECKIN_ROLES`, `EVENT_CREATE_ROLES` y `EVENT_STAFF_ROLES`.

## Contratos técnicos

- Salida individual: `POST /api/mysql/checkout` con `{ workerId }`.
- Salida conjunta: `POST /api/mysql/events/:eventId/checkout-all`.
- Crear evento: `POST /api/mysql/events`.
- Convocatoria:
  - `GET /api/mysql/events/:eventId/staff`
  - `POST /api/mysql/events/:eventId/staff`
  - `PATCH /api/mysql/events/:eventId/staff/:staffId`
  - `DELETE /api/mysql/events/:eventId/staff/:staffId`
- Teléfonos y mensajes: `src/utils/whatsappShare.ts`.

## Cobertura incorporada

- Avatar vacío y fallback de iniciales.
- Operador crea eventos sin obtener edición/borrado.
- El foco permanece en el campo activo durante el polling.
- Operador abre y gestiona convocatorias.
- Salida conjunta genera enlaces individuales.
- Mensaje de salida contiene evento y horas de Madrid.
- Normalización y rechazo de móviles españoles.

## Preparación para WhatsApp Business

La migración futura, variables previstas, outbox, reintentos, idempotencia,
webhooks y secretos se documenta en `docs/WHATSAPP_BUSINESS_MIGRATION.md`.
Hasta activarla, el comportamiento oficial es el enlace manual precargado.

## Despliegue

- Staging: `aed5fa0`, smoke correcto, 901 trabajadores.
- Producción: `aed5fa0`, smoke correcto, 901 trabajadores.
- Las promociones conservaron las bases de datos y crearon snapshots previos.
