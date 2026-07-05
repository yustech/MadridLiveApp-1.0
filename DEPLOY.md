# Guía de Despliegue en Producción 🚀
### Sistema de Control de Accesos y Registro QR de Personal - Madrid Live Access

Esta guía resume el flujo real de producción actual: frontend estático, backend Node/Express, MySQL/MariaDB y publicación opcional del frontend público.

---

## 📋 Arquitectura de la Aplicación

*   **Frontend:** React (Vite + TypeScript + Tailwind CSS). Se compila a `dist/`.
*   **API / Backend:** Node.js + Express (`server.ts`) con endpoints de salud, versión y CRUD para personal, eventos, turnos y alertas.
*   **Base de Datos:** MySQL/MariaDB como persistencia activa.
*   **Publicación web:** `dist/` se sirve desde `public_html` o la ruta estática equivalente de tu host.
*   **Lector QR:** `html5-qrcode` integrado directamente en la cámara del navegador móvil.

---

## 🛠️ Requisitos de Infraestructura

1. Un host Linux o panel de hosting capaz de ejecutar Node/Express y servir archivos estáticos.
2. Acceso a MySQL/MariaDB para el backend de producción.
3. Un usuario de despliegue con permisos para copiar `dist/` y reiniciar el servicio.
4. El servicio `madridlive-app.service` debe cargar variables con `EnvironmentFile=/opt/madridlive-app/.env` (drop-in de systemd).
5. El watchdog de producción vive como `madridlive-watchdog.service` + `madridlive-watchdog.timer`, ejecutándose cada 5 minutos para validar `/api/health` y `/api/mysql/staff`.

---

## 🏁 Despliegue Manual

1. Compila la aplicación:
   ```bash
   npm run build
   ```
2. Despliega backend + frontend público en una sola orden:
   ```bash
   npm run deploy:full
   ```
3. Si solo quieres actualizar los estáticos públicos:
   ```bash
   npm run deploy:frontend:public
   ```
4. Verifica el estado de producción:
   ```bash
   npm run smoke:prod
   ```
5. Comprueba la salud y la versión públicas:
   ```bash
   curl -fsS https://inmosubastas.top/api/health
   curl -fsS https://inmosubastas.top/api/version
   curl -fsS https://inmosubastas.top/api/mysql/staff
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
   - `DEPLOY_URL` opcional, por defecto `https://inmosubastas.top`
   - `DEPLOY_SERVICE_NAME` opcional, por defecto `madridlive-app.service`
   - `KEEP_RELEASES` opcional, por defecto `8`
   - `PUBLIC_HTML_PATH` opcional, por defecto `/home/netiadmin/web/inmosubastas.top/public_html`
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

1. Deploy completo:
   ```bash
   npm run deploy:full
   ```
2. Smoke test de producción:
   ```bash
   npm run smoke:prod
   ```
3. Rollback inmediato a la versión anterior:
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
   curl -fsS https://inmosubastas.top/api/health
   curl -fsS https://inmosubastas.top/api/version
   curl -fsS https://inmosubastas.top/api/mysql/staff
   ```
   ```
6. En producción, evita `npm run dev` en el mismo host del servicio para no ocupar el puerto 3000. Si necesitas depurar puntualmente, usa `ALLOW_PROD_DEV=1 PORT=5173 npm run dev`.
7. Health/version/staff rápidos:
   ```bash
   curl -fsS https://inmosubastas.top/api/health
   curl -fsS https://inmosubastas.top/api/version
   curl -fsS https://inmosubastas.top/api/mysql/staff
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
4. URL: `https://inmosubastas.top/api/health`.
5. Intervalo: 5 minutos.
6. Añade `cyuste@gmail.com` como contacto.

### Prueba rápida del monitor
1. Verifica que detecta estado UP con el endpoint de health.
2. Simula una caída controlada en ventana de prueba.
3. Confirma que llega email de DOWN y luego de UP.
