# Guía de Despliegue en Producción 🚀
### Sistema de Control de Accesos y Registro QR de Personal - Madrid Live Access

Esta guía resume el flujo real de producción actual: nginx proxya todo al backend Node/Express, que sirve la API y el frontend compilado desde `dist/`; MySQL/MariaDB es la persistencia activa. `public_html` está retirado del flujo normal.

---

## 📋 Arquitectura de la Aplicación

*   **Frontend:** React (Vite + TypeScript + Tailwind CSS). Se compila a `dist/`.
*   **API / Backend:** Node.js + Express (`server.ts`) con endpoints de salud, versión y CRUD para personal, eventos, turnos y alertas.
*   **Base de Datos:** MySQL/MariaDB como persistencia activa.
*   **Publicación web:** nginx proxya todo al proceso Node; Node sirve `dist/` y las rutas `/api/*`.
*   **Lector QR:** `html5-qrcode` integrado directamente en la cámara del navegador móvil.

---

## 🛠️ Requisitos de Infraestructura

1. Un host Linux o panel de hosting capaz de ejecutar Node/Express y servir archivos estáticos.
2. Acceso a MySQL/MariaDB para el backend de producción.
3. Un usuario de despliegue con permisos para copiar `dist/` y reiniciar el servicio.
4. El servicio `madridlive-app.service` debe cargar variables con `EnvironmentFile=/opt/madridlive-app/.env` (drop-in de systemd).
5. El watchdog de producción vive como `madridlive-watchdog.service` + `madridlive-watchdog.timer`, ejecutándose cada 5 minutos para validar `/api/health` y `/api/mysql/staff`.
6. El script `scripts/deploy.sh` soporta `DEPLOY_RESTART_STRATEGY=auto|systemd|signal`. En `auto`, si `madridlive-app.service` corre bajo el mismo usuario que despliega, usa reinicio por señal (`pkill`) en vez de depender de `sudo systemctl restart`.

---

## 🏁 Despliegue Manual

1. Compila la aplicación:
   ```bash
   npm run build
   ```
2. Despliega staging primero y producción después (flujo único soportado):
   ```bash
   npm run deploy:staging-first:prod
   ```
   > `deploy:full` y `deploy:frontend:public` están **retirados**: desde 2026-07-13
   > nginx proxya todo al Node (full-proxy) y `public_html` ya no forma parte del
   > deploy. Ambos comandos fallan a propósito con un mensaje explicativo.
3. Verifica el estado de producción:
   ```bash
   npm run smoke:prod
   ```
4. Comprueba la salud y la versión públicas:
   ```bash
   curl -fsS https://madridliveapp.top/api/health
   curl -fsS https://madridliveapp.top/api/version
   curl -fsS https://madridliveapp.top/api/mysql/staff
   ```

---

## ⚙️ Despliegue Automático desde GitHub Actions

Si prefieres publicar cada cambio automáticamente desde `main`, usa el workflow `.github/workflows/deploy.yml`.

1. Crea estos secretos en GitHub -> Settings -> Secrets and variables -> Actions:
   - `DEPLOY_HOST`
   - `DEPLOY_USER`
   - `DEPLOY_SSH_KEY`
   - `DEPLOY_PORT` opcional, por defecto `22`
   - `DEPLOY_PATH` opcional, por defecto `/opt/madridlive-app`
   - `DEPLOY_URL` opcional, por defecto `https://madridliveapp.top`
   - `DEPLOY_SERVICE_NAME` opcional, por defecto `madridlive-app.service`
   - `KEEP_RELEASES` opcional, por defecto `8`
   - `PUBLIC_HTML_PATH` opcional, por defecto `/home/netiadmin/web/madridliveapp.top/public_html`
   - `PUBLIC_FRONTEND_BACKUP_BASE` opcional, por defecto `/home/opsadmin/MadridLiveApp-1.0/deploy_backups_local`
   - `SMTP_HOST` opcional para email
   - `SMTP_PORT` opcional para email
   - `SMTP_USERNAME` opcional para email
   - `SMTP_PASSWORD` opcional para email
   - `SMTP_FROM` opcional para email
   - `DEPLOY_ALERT_WEBHOOK` opcional, URL de webhook compatible con JSON `{"text":"..."}`
2. El workflow compila el proyecto con `npm run build`.
3. Copia `dist/` al servidor y reinicia `madridlive-app.service`.
4. Si eliges `publish_public_frontend = true` en el manual trigger, además publica `dist/` en `PUBLIC_HTML_PATH`, hace backup local y valida que el bundle público use `/api/mysql`.
5. El despliegue termina haciendo una petición a `${DEPLOY_URL}/api/health`; si no responde `{"status":"ok"}`, el workflow falla.
6. Cada despliegue guarda snapshots en `${DEPLOY_PATH}/releases` y conserva las últimas `${KEEP_RELEASES}` versiones.
7. Si los secretos SMTP están configurados, GitHub Actions envía email a `cyuste@gmail.com` cuando el deploy termina (éxito o fallo).
8. Si el secreto `DEPLOY_ALERT_WEBHOOK` está configurado, GitHub Actions envía una alerta automática al webhook cuando el deploy falla.
9. Para volver a la versión anterior, ejecuta `npm run rollback` con las mismas variables `DEPLOY_*` en tu terminal de despliegue.
10. Si quieres volver a una snapshot concreta, añade `ROLLBACK_RELEASE=release-YYYYMMDDTHHMMSSZ-... npm run rollback`.

---

## 🧭 Runbook Rápido (Operación)

1. Deploy completo (staging primero, luego producción):
   ```bash
   npm run deploy:staging-first:prod
   ```
2. Smoke test de producción:
   ```bash
   npm run smoke:prod
   ```
3. Reinicio limpio de un servicio (systemd, con verificación de salud):
   ```bash
   npm run restart:staging   # o restart:prod
   ```
   > **Estrategia de reinicio (desde 2026-07-13, tarea #6 del audit):** existe una
   > regla sudoers acotada (`/etc/sudoers.d/madridlive-restart`) que permite a
   > `opsadmin` ejecutar sin contraseña **solo** `systemctl restart` de los dos
   > servicios de la app. Todos los flujos (helper, `deploy.sh`) usan systemd
   > como estrategia preferente; el reinicio por señal al MainPID queda solo
   > como fallback de emergencia, porque tiene una condición de carrera
   > conocida (`EADDRINUSE`, incidente del 2026-07-08).
4. Rollback inmediato a la versión anterior:
   ```bash
   npm run rollback
   ```
4. Ver logs del servicio:
   ```bash
   sudo journalctl -u madridlive-app.service --since '30 min ago' --no-pager | tail -n 200
   ```
5. Confirmar configuración de entorno activa en systemd:
   ```bash
   sudo systemctl show madridlive-app.service -p EnvironmentFiles
6. Ver estado del watchdog:
   ```bash
   sudo systemctl status madridlive-watchdog.timer --no-pager
   sudo systemctl status madridlive-watchdog.service --no-pager
   ```
7. En producción, evita `npm run dev` en el mismo host del servicio para no ocupar el puerto 3000. Si necesitas depurar puntualmente, usa `ALLOW_PROD_DEV=1 PORT=5173 npm run dev`.
8. Health/version/staff rápidos:
   ```bash
   curl -fsS https://madridliveapp.top/api/health
   curl -fsS https://madridliveapp.top/api/version
   curl -fsS https://madridliveapp.top/api/mysql/staff
   ```
   ```
6. En producción, evita `npm run dev` en el mismo host del servicio para no ocupar el puerto 3000. Si necesitas depurar puntualmente, usa `ALLOW_PROD_DEV=1 PORT=5173 npm run dev`.
7. Health/version/staff rápidos:
   ```bash
   curl -fsS https://madridliveapp.top/api/health
   curl -fsS https://madridliveapp.top/api/version
   curl -fsS https://madridliveapp.top/api/mysql/staff
   ```

---

## 📱 Requisitos Operativos el Día del Concierto

1. **Cámara y permisos:** el navegador móvil debe permitir acceso a cámara la primera vez.
2. **Conexión:** el escaneo necesita 4G/5G o Wi-Fi estable para reflejar cambios al instante.
3. **Compartición vía WhatsApp:** el botón de compartir abre el enlace directo del código QR.

---

## 📡 Monitor Externo (Uptime)

Configura un monitor HTTP externo para detectar caídas aunque no haya despliegues.

### Opción recomendada: UptimeRobot (gratis)
1. Crea cuenta en UptimeRobot.
2. Add New Monitor -> Monitor Type: `HTTP(s)`.
3. Friendly Name: `Madrid Live Production Health`.
4. URL: `https://madridliveapp.top/api/health`.
5. Intervalo: 5 minutos.
6. Añade `cyuste@gmail.com` como contacto.

### Prueba rápida del monitor
1. Verifica que detecta estado UP con el endpoint de health.
2. Simula una caída controlada en ventana de prueba.
3. Confirma que llega email de DOWN y luego de UP.
