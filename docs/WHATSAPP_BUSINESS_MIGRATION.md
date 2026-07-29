# WhatsApp: envío actual y migración futura a Business API

## Comportamiento actual

MadridLiveApp no envía mensajes en segundo plano. Genera enlaces dirigidos a
`https://api.whatsapp.com/send` con el teléfono del trabajador y el texto
precargado. El operador revisa la conversación y pulsa **Enviar** en WhatsApp.

- Salida individual: después de cerrar el turno se abre un mensaje con evento,
  hora de entrada y hora de salida.
- Salida conjunta: el servidor cierra en una transacción todos los turnos
  `Active` cuyo `event_id` coincide con el concierto. La interfaz presenta un
  enlace individual por trabajador; no abre múltiples pestañas automáticamente.
- Los trabajadores sin móvil español válido quedan identificados como
  `Sin teléfono` y su salida se registra igualmente.

La composición del texto y la normalización del destinatario viven en
`src/utils/whatsappShare.ts`. La UI no debe volver a construir esos mensajes por
su cuenta.

## Frontera preparada para WhatsApp Business

Cuando haya una cuenta y credenciales aprobadas, el enlace de navegador debe
sustituirse por un proveedor del lado servidor. La mutación de turnos no debe
depender de que WhatsApp responda: primero se confirma la salida y después se
encola la notificación.

Interfaz recomendada:

```ts
interface CheckoutNotification {
  workerId: string;
  phone: string;
  workerName: string;
  eventId: string;
  eventTitle: string;
  startedAt: string;
  endedAt: string;
  shiftId: string;
}

interface WhatsAppProvider {
  sendCheckout(notification: CheckoutNotification): Promise<{
    providerMessageId: string;
  }>;
}
```

## Configuración futura

Variables previstas, sin valores reales en el repositorio:

```dotenv
WHATSAPP_PROVIDER=meta
WHATSAPP_BUSINESS_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCESS_TOKEN=
WHATSAPP_CHECKOUT_TEMPLATE_NAME=
WHATSAPP_GRAPH_API_VERSION=
```

El token debe permanecer exclusivamente en el backend y en el gestor de
secretos del despliegue. Nunca debe exponerse como variable `VITE_*`.

## Trabajo necesario para activar el envío automático

1. Aprobar en Meta una plantilla transaccional con nombre, evento, entrada y
   salida como parámetros.
2. Crear una cola/outbox persistente con estados `pending`, `sent`, `failed`,
   número de intentos y `provider_message_id`.
3. Insertar la notificación en la misma transacción que cierra el turno; un
   worker separado realiza el envío con reintentos e idempotencia por `shiftId`.
4. Añadir webhook firmado para estados de entrega y lectura.
5. Definir retención, consentimiento, auditoría y tratamiento de teléfonos
   conforme a protección de datos.
6. Mantener el enlace manual actual como fallback cuando el proveedor esté
   degradado o el teléfono no admita entrega.

No se debe enviar un mensaje por cada reintento de la API de salida. La clave
idempotente del futuro proveedor será el identificador único del turno cerrado.
