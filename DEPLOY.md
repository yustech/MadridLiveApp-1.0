# Guía de Despliegue en Producción 🚀
### Sistema de Control de Accesos y Registro QR de Personal - Madrid Live Access

Esta guía detalla, paso a paso, los requisitos y el procedimiento completo para desplegar esta aplicación en un entorno productivo real para tu cliente (hasta 200 trabajadores).

---

## 📋 Arquitectura de la Aplicación
La aplicación utiliza una arquitectura **Serverless / JAMstack**, lo que significa que es extremadamente eficiente, rápida de cargar, barata de mantener y escala automáticamente sin necesidad de gestionar servidores tradicionales.

*   **Frontend:** React (Vite + TypeScript + Tailwind CSS). Se compila en archivos estáticos (HTML, JS, CSS) que pueden servirse desde cualquier red de distribución de contenidos (CDN).
*   **Base de Datos y Tiempo Real:** Google Cloud Firestore (Base de datos NoSQL serverless en la nube, con suscripciones en tiempo real).
*   **Autenticación:** Firebase Authentication (Manejo de logins y accesos autorizados).
*   **Generación de QR:** Se consumen mediante llamadas directas rápidas a un servicio CDN público (`api.qrserver.com`), eliminando la necesidad de lógica de backend costosa.
*   **Lector QR:** `html5-qrcode` integrado directamente en la cámara del navegador móvil del supervisor.

---

## 🛠️ Requisitos de Infraestructura y Servidor

Al ser serverless, **NO necesitas alquilar ni administrar un servidor dedicado VPS** (como AWS EC2 o un hosting Linux tradicional) a menos que tu cliente lo exija. Esto reduce los costes mensuales de mantenimiento a **$0 USD/mes** para el volumen de su cliente.

### Requisitos Recomendados (Solución Cloud Nativa - Gratis/Céntimos al mes)
1.  **Alojamiento del Frontend (Servidor de Archivos):**
    *   **Opción A (Firebase Hosting):** Recomendada al 100% porque se integra directamente con la base de datos Firestore y permite desplegar todo el proyecto con un solo comando.
    *   **Opción B (Vercel / Netlify / Cloudflare Pages):** Excelentes alternativas gratuitas con integraciones automáticas desde un repositorio de GitHub.
2.  **Base de Datos y Back-end:**
    *   **Google Firebase (Plan Spark - Gratis):** Incluye hasta 50,000 lecturas y 20,000 escrituras en Firestore al día, lo cual es más que suficiente para un concierto con 200 trabajadores.

---

## 🏁 Paso a Paso para el Despliegue

Sigue estos 5 pasos sencillos para lanzar la aplicación de tu cliente a producción:

### Paso 1: Configurar el Proyecto de Firebase en Producción
1.  Entra en la consola de Firebase: [https://console.firebase.google.com](https://console.firebase.google.com) con una cuenta de Google (preferiblemente de tu cliente).
2.  Haz clic en **Agregar proyecto** y ponle un nombre (ej. `madrid-live-access`).
3.  Desactiva o activa Google Analytics (según prefieras) y crea el proyecto.
4.  Una vez creado, haz clic en el icono de **Web (`</>`)** para registrar una aplicación web. Ponle un nombre (ej. `app-live`) y haz clic en "Registrar app".
5.  Copia las credenciales de configuración de Firebase que aparecerán en pantalla. Se verán así:
    ```json
    {
      "apiKey": "AIzaSy...",
      "authDomain": "...",
      "projectId": "...",
      "storageBucket": "...",
      "messagingSenderId": "...",
      "appId": "..."
    }
    ```

### Paso 2: Activar Servicios en Firebase
En el menú izquierdo de la consola de Firebase:
1.  **Firestore Database:**
    *   Haz clic en "Crear base de datos".
    *   Selecciona la ubicación geográfica más cercana a tus conciertos (ej. `europe-west3` para Madrid / Europa, o `us-east1` para América).
    *   Selecciona **Iniciar en modo producción** (es más seguro; luego subiremos las reglas de seguridad personalizadas).
2.  **Authentication:**
    *   Haz clic en "Comenzar".
    *   En la pestaña **Método de inicio de sesión**, activa **Correo electrónico/contraseña**.

### Paso 3: Vincular las Credenciales de Producción al Código
1.  Abre el archivo `firebase-applet-config.json` en la raíz de la aplicación de tu cliente.
2.  Reemplaza los valores con los datos que copiaste de tu nuevo proyecto de producción de Firebase en el **Paso 1**.
3.  Si prefieres usar variables de entorno de producción, configura los `VITE_FIREBASE_*` en tu hosting. La app los prioriza desde `src/firebase.ts`, así que las regeneraciones futuras de AI Studio no romperán el despliegue.
4.  Mantén `firebase-applet-config.json` como fallback por compatibilidad con futuras exportaciones.

### Paso 4: Configurar Reglas de Seguridad de Firestore
Para evitar que un tercero malintencionado intente escribir o borrar datos de la base de datos de los trabajadores, debes subir las reglas de seguridad.
1.  Abre el archivo `firestore.rules` que se encuentra en la raíz de esta aplicación.
2.  Copia todo su contenido.
3.  Ve a la Consola de Firebase -> **Firestore Database** -> pestaña **Reglas**.
4.  Pega el contenido del archivo allí y haz clic en **Publicar**.
    *   *Nota:* Estas reglas garantizan de forma estricta que los datos de trabajadores, turnos y alertas cumplan con el formato de datos requerido y no admitan valores corruptos o inyecciones de código.

### Paso 5: Compilar y Desplegar el Frontend (Hosting)

#### Opción Rápida: Despliegue en Firebase Hosting (Recomendado)
Si tienes el CLI de Firebase instalado en tu máquina de desarrollo local:
1.  Abre un terminal en la carpeta raíz del proyecto.
2.  Ejecuta la compilación de producción:
    ```bash
    npm run build
    ```
    *(Esto creará una carpeta llamada `dist` con los archivos ultra-optimizados de la aplicación).*
3.  Instala las herramientas de Firebase (si no las tienes):
    ```bash
    npm install -g firebase-tools
    ```
4.  Inicia sesión en Firebase desde tu terminal:
    ```bash
    firebase login
    ```
5.  Inicializa el hosting en el proyecto:
    ```bash
    firebase init hosting
    ```
    *   Selecciona tu proyecto de Firebase creado en el Paso 1.
    *   ¿Directorio público? Escribe: **`dist`**
    *   ¿Configurar como aplicación de una sola página (SPA)? Elige: **`Sí`** (Y selecciona "No" para no sobrescribir el archivo `index.html` existente).
6.  Despliega la aplicación con un solo comando:
    ```bash
    firebase deploy
    ```
7.  **¡Listo!** Firebase te proporcionará una URL pública segura (con certificado SSL `https://`) del tipo `https://tu-proyecto.web.app` que podrás enviar al cliente y a los supervisores.

---

## 📱 Requisitos Operativos el Día del Concierto

Para que el día del concierto todo funcione a la perfección, ten en cuenta las siguientes recomendaciones operativas:

1.  **Cámara y Permisos:**
    *   El navegador de los teléfonos móviles de los supervisores (iOS Safari o Android Chrome) les pedirá permiso para acceder a la cámara la primera vez que entren en la sección "Escanear QR". **Es obligatorio aceptar los permisos de cámara.**
2.  **Calidad de Conexión:**
    *   Al ser una base de datos en tiempo real, el escáner necesita conexión de datos móviles (4G/5G) o red Wi-Fi para guardar la entrada y salida de los trabajadores al instante.
    *   La cantidad de datos móviles que consume es extremadamente baja (solo unos pocos bytes por escaneo).
3.  **Compartición vía WhatsApp:**
    *   El botón "Compartir por WhatsApp" abre un enlace directo para enviar el código QR al trabajador. Este enlace utiliza la API oficial de WhatsApp Web/App, por lo que el supervisor solo necesita tener WhatsApp instalado en su teléfono.

---

## 💡 Cómo Descargar el Código Listo para Desplegar
Puedes exportar este proyecto completo en cualquier momento utilizando las opciones de AI Studio:
*   Ve al menú **Settings (Configuración)** en la esquina superior/barra lateral de la interfaz.
*   Selecciona la opción **Download as ZIP** (Descargar como archivo comprimido) o **Export to GitHub** (Exportar a tu cuenta de GitHub para realizar una integración continua).

### Paso 6: Despliegue Automático desde GitHub Actions
Si prefieres publicar cada cambio automáticamente desde `main`, usa el workflow `.github/workflows/deploy.yml`.

1. Crea estos secretos en GitHub -> Settings -> Secrets and variables -> Actions:
   - `DEPLOY_HOST`
   - `DEPLOY_USER`
   - `DEPLOY_SSH_KEY`
   - `DEPLOY_PORT` opcional, por defecto `22`
   - `DEPLOY_PATH` opcional, por defecto `/opt/madridlive-app`
   - `DEPLOY_URL` opcional, por defecto `https://inmosubastas.top`
   - `DEPLOY_SERVICE_NAME` opcional, por defecto `madridlive-app.service`
   - `KEEP_RELEASES` opcional, por defecto `8`
   - `SMTP_HOST` obligatorio para email (ej: `smtp.gmail.com`)
   - `SMTP_PORT` obligatorio para email (normalmente `587`)
   - `SMTP_USERNAME` obligatorio para email
   - `SMTP_PASSWORD` obligatorio para email (en Gmail, App Password)
   - `SMTP_FROM` obligatorio para email (ej: `alertas@tu-dominio.com` o tu Gmail)
   - `DEPLOY_ALERT_WEBHOOK` opcional, URL de webhook (Slack/Discord/Teams compatible con payload JSON {"text":"..."})
2. El workflow compila el proyecto con `npm run build`.
3. Copia `dist/` al servidor y reinicia `madridlive-app.service`.
4. El despliegue termina haciendo una petición a `${DEPLOY_URL}/api/health`; si no responde `{"status":"ok"}`, el workflow falla.
5. Si los secretos SMTP están configurados, GitHub Actions envía email a `cyuste@gmail.com` cuando el deploy termina (éxito o fallo).
6. Si el secreto `DEPLOY_ALERT_WEBHOOK` está configurado, GitHub Actions envía una alerta automática al webhook cuando el deploy falla.
7. Cada despliegue guarda snapshots en `${DEPLOY_PATH}/releases` y conserva las últimas `${KEEP_RELEASES}` versiones.
8. Para volver a la versión anterior, ejecuta `npm run rollback` con las mismas variables `DEPLOY_*` en tu terminal de despliegue.
9. Si quieres volver a una snapshot concreta, añade `ROLLBACK_RELEASE=release-YYYYMMDDTHHMMSSZ-... npm run rollback`.
10. En el servidor, permite reinicio sin password para el usuario de despliegue:
    - `opsadmin ALL=NOPASSWD: /bin/systemctl restart madridlive-app.service, /bin/systemctl is-active madridlive-app.service`
    - Guarda la regla en `/etc/sudoers.d/madridlive-deploy` con permisos `440`.

## 🧭 Runbook Rápido (Operación)
Usa estos comandos como referencia operativa durante un incidente o antes de un evento.

1. Deploy normal:
   ```bash
   npm run deploy
   ```
2. Verificar salud y versión pública:
   ```bash
   curl -fsS https://inmosubastas.top/api/health
   curl -fsS https://inmosubastas.top/api/version
   ```
3. Rollback inmediato a la versión anterior:
   ```bash
   npm run rollback
   ```
4. Rollback a una release específica:
   ```bash
   ROLLBACK_RELEASE=release-YYYYMMDDTHHMMSSZ-... npm run rollback
   ```
5. Ver logs del servicio:
   ```bash
   sudo journalctl -u madridlive-app.service --since '30 min ago' --no-pager | tail -n 200
   ```

¡Ya tienes un sistema robusto, escalable a coste prácticamente nulo y sumamente profesional para tu cliente!
