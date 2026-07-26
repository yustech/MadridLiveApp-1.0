# Guion del ensayo general

Guion para pasar un evento completo por la app **en producción**, con personas y
teléfonos reales, antes de usarla en un concierto de verdad.

Todo lo de este documento está verificado contra el código en `main` a fecha
**2026-07-26**. Lo que no esté aquí, no lo des por supuesto.

## Por qué hace falta

La app está desplegada, con los 901 trabajadores reales cargados, y todo lo
técnico está verificado: tests, e2e nocturnos, copias de seguridad restaurables.
Pero **nunca ha pasado un evento de principio a fin en producción**: cero
eventos completados, cero fichajes reales.

Lo que este ensayo busca no es saber si el código funciona —eso ya lo cubren las
pruebas— sino lo que solo aparece con gente delante:

- La cámara del móvil leyendo un QR en la luz real de un acceso.
- Qué pasa cuando la cobertura del recinto falla a mitad de un fichaje.
- Un trabajador que no aparece en la convocatoria, con cola detrás.
- Gente que no ha visto la app nunca recibiendo su QR por WhatsApp.

## Antes de empezar

### Lo que NO hay que hacer, en ningún momento

| No hagas | Por qué |
|---|---|
| Pulsar **"Vaciar BD"** (pantalla Usuarios) | Borra colecciones enteras de producción. |
| Ejecutar `npm run reset:mysql:initial` | Apunta a producción por defecto; siembra la semilla demo de 6 trabajadores. Está gateado, pero no lo tientes. |
| Ejecutar `npm run deploy:staging-first` | Resiembra **staging** a 6 trabajadores. |
| Borrar trabajadores del roster | Son los 901 reales. El watchdog avisa por debajo de 800. |

### Preparación (el día antes)

1. **Copia de seguridad de producción**, aunque el ensayo no borre nada:
   ```bash
   bash scripts/backup-mysql.sh
   ```
2. **Decide el equipo**: 5 o 6 personas reales que vayan a estar presentes. Que
   tengan móvil y estén en el roster.
3. **Comprueba sus teléfonos**. El reparto por WhatsApp solo funciona con móviles
   españoles (9 dígitos empezando por 6 o 7). A fecha de hoy, **894 de los 901**
   tienen uno válido; los 7 restantes no recibirán nada y hay que darles el
   código a mano.
4. **Cuentas de acceso**: decide quién escanea. Basta rol `operator`, que puede
   fichar pero no crear ni borrar eventos. Reserva el `admin` para ti.
5. **Título del evento reconocible**, del estilo `ENSAYO GENERAL 27-jul`, para
   distinguirlo sin dudas de un concierto real y poder borrarlo después.

## Guion

### Fase 1 — Crear el evento (5 min, rol admin)

En **Panel** → botón **`+ Nuevo evento`** en la cabecera de la lista de conciertos.

| Campo | Qué poner |
|---|---|
| Título | `ENSAYO GENERAL <fecha>` |
| Sitio | El recinto real |
| Fecha | **La de hoy** ⚠️ |
| Apertura de puertas | La hora real prevista |
| Personal requerido | El número de personas del ensayo |

> ⚠️ **La fecha tiene que ser la de hoy.** Un evento con fecha futura **no admite
> fichajes**: el servidor los rechaza (`Cannot activate shifts for future event`).
> El día se calcula en horario de Madrid, no en UTC.

**Qué comprobar**: el evento aparece en "Próximos", con su fecha bien escrita en
la tarjeta.

### Fase 2 — Convocar al equipo (10 min, rol admin)

Abre el evento → **Gestionar equipo** → añade a las personas del ensayo. Si ya
tienes una plantilla guardada, aplícala.

> ⚠️ **Esto cambia quién puede fichar.** Si el evento tiene **al menos una**
> persona convocada, **solo esas** pueden fichar; al resto el escáner les
> responde `NOT_ASSIGNED` y abre el diálogo de **acceso excepcional**. Si el
> evento **no tiene a nadie convocado**, cualquiera del roster puede fichar.
>
> Las dos situaciones son válidas, pero conviene ensayar **con convocatoria**,
> que es el caso real, y provocar a propósito el rechazo (fase 4).

**Qué comprobar**: el contador de la tarjeta pasa a `N/N`.

### Fase 3 — Repartir los QR (15 min)

Desde **Plantilla** → ficha de cada persona → compartir por WhatsApp. El mensaje
lleva su nombre, su puesto, su código de credencial y un enlace al QR.

> ℹ️ **Dependencia externa**: la imagen del QR la genera `api.qrserver.com`. Si
> ese servicio no responde o el móvil no tiene datos, la persona se queda sin
> imagen. **Plan B: el código de credencial vale igual**, se puede teclear a mano
> en el escáner. Que el que escanea lo sepa.
>
> ℹ️ El QR contiene **solo el código de credencial**, sin firma. Quien conozca un
> código puede presentarlo. Es asumible para control de personal, pero tenlo
> presente.

**Qué comprobar**: al menos una persona recibe el mensaje, abre el enlace y
guarda la imagen **sin ayuda**. Si no lo consigue sola, ahí tienes un problema
que en un concierto se multiplica por cien.

### Fase 4 — Entradas (el núcleo del ensayo)

Con el escáner abierto (**Escáner**, evento del ensayo seleccionado):

1. **ACTIVAR CÁMARA** y escanear el QR de cada persona.
2. Confirmar con **INICIO TURNO 1 CLIC**. Debe aparecer **ENTRADA REGISTRADA** y
   la persona pasar a **EN EL RECINTO**.

**Provoca a propósito estos cuatro casos**, que son los que van a pasar de verdad:

| Caso | Qué debe ocurrir |
|---|---|
| Alguien **no convocado** intenta entrar | Rechazo `NOT_ASSIGNED` y diálogo de **acceso excepcional**. Decide en el momento si se le deja pasar y **anota cuánto se tarda en decidir**. |
| Alguien ficha **dos veces** | El segundo intento se rechaza: solo puede haber un turno abierto por persona. |
| Un QR **no lee** (pantalla rota, sol, poca luz) | Usar la búsqueda por nombre o código. **Cronometra este camino**, es el que salva la cola. |
| **Sin cobertura** a mitad del fichaje | Pon el móvil en modo avión un momento. Comprueba qué ve el operador y si al recuperar la red el fichaje queda registrado **una sola vez**. |

**Qué medir**: segundos por fichaje con QR, segundos por fichaje manual, y
cuántos de cada tipo.

### Fase 5 — Durante el evento (rol admin o operator)

- En **Panel**, la tarjeta del evento muestra la cobertura y los fichajes por
  minuto de los últimos 5 minutos.
- En **Plantilla**, quién está dentro y quién fuera.
- Prueba la **puntuación por estrellas** de alguien desde su ficha.

**Qué comprobar**: los números cuadran con la gente que hay realmente dentro.

### Fase 6 — Salidas

Escanea de nuevo a cada persona y confirma con **CERRAR TURNO GUIADO**. Debe
aparecer **SALIDA REGISTRADA** y la persona volver a **FUERA DEL RECINTO**.

> ⚠️ **Nada cierra los turnos automáticamente.** No hay ningún proceso que cierre
> fichajes olvidados: el watchdog de turnos activos solo **informa**, a las 07:00
> y 08:00 UTC. Un turno que quede abierto seguirá abierto indefinidamente, y esa
> persona figurará dentro del recinto para siempre.
>
> **Antes de dar por terminado el ensayo, comprueba en Plantilla que no queda
> nadie DENTRO.**

### Fase 7 — Revisión (al día siguiente)

- **Historial** y **KPIs**: duraciones de turno, cobertura, exportación a CSV.
- Comprueba que las horas cuadran con la realidad, incluida la franja horaria.

## Limpieza posterior

Cuando el ensayo esté revisado y no necesites los datos:

**Panel** → abre el evento → **Borrar evento** → escribe el título exacto para
confirmar.

Eso borra el evento, su convocatoria y **todos los fichajes asociados**, dejando
el roster de 901 intacto. Verificado. Si prefieres conservar el histórico como
referencia, no borres nada: un evento pasado no molesta.

## Qué anotar durante el ensayo

Hoja de observación mínima:

- Personas convocadas / que aparecieron / que ficharon.
- Segundos por fichaje: mejor, peor, sensación general.
- Fichajes por QR vs a mano, y por qué falló el QR cuando falló.
- Accesos excepcionales concedidos y cuánto costó decidir.
- Qué preguntó la gente que no había visto la app nunca.
- Cualquier cosa que obligara a llamarte a ti para resolverla — eso es lo que no
  escala a un concierto.

## Comprobación técnica al terminar

```bash
npm run smoke:prod                          # app viva, 901 trabajadores
curl -s https://www.madridliveapp.top/api/mysql/health-count
```

El conteo de `staff` debe seguir siendo **901**. `events` y `shifts` reflejarán
el ensayo hasta que borres el evento.

## Resultado del ensayo

_(Rellenar después. Si algo falló, anótalo aquí antes de que se olvide.)_

| Fecha | Personas | Fichajes OK | Incidencias | Decisión |
|---|---|---|---|---|
|  |  |  |  |  |
