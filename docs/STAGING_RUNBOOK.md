# Staging Runbook

Staging debe estar separado de produccion en tres capas:

- Base de datos: `netiadmin_madrid_live_staging`
- Servicio systemd: `madridlive-app-staging.service`
- Puerto interno: `3001`
- Bind interno: `127.0.0.1`

Produccion se mantiene en:

- Base de datos: `netiadmin_madrid_live_production`
- Servicio systemd: `madridlive-app.service`
- Puerto interno: `3000`

## Estado Inicial

Antes de aplicar:

```bash
npm run ops:staging:plan
```

El plan debe confirmar que el puerto `3001` esta libre.

## Aplicar Staging Interno

Requiere root porque crea base de datos, grant MySQL y servicio systemd:

```bash
npm run build
sudo npm run ops:staging:apply
npm run smoke:staging
```

El script:

- Crea la DB staging si no existe.
- Concede permisos al usuario MySQL actual solo sobre la DB staging.
- Crea `/opt/madridlive-app-staging`.
- Copia `dist/`.
- Reutiliza `node_modules` mediante symlink a `/opt/madridlive-app/node_modules`.
- Genera `/opt/madridlive-app-staging/.env` desde produccion, cambiando `MYSQL_DATABASE`, `PORT` y `HOST`.
- Crea y arranca `madridlive-app-staging.service`.
- Ejecuta `/api/mysql/reset-initial` contra staging para poblar datos iniciales.

No borra ni modifica datos de produccion.

## Smoke

```bash
npm run smoke:staging
SITE_URL=http://127.0.0.1:3001 npm run smoke:staging
```

Debe devolver:

```text
staging_smoke=ok
staff_count=6
```

## URL Publica

Actualmente `staging.inmosubastas.top` no resuelve. Para exponer staging publicamente falta:

1. Crear DNS `staging.inmosubastas.top -> 82.223.139.217`.
2. Crear vhost/proxy HTTPS hacia `http://127.0.0.1:3001`.
3. Emitir certificado TLS.
4. Ejecutar smoke:

```bash
SITE_URL=https://staging.inmosubastas.top npm run smoke:staging
```

Hasta tener HTTPS, el login UI en navegador puede fallar contra `http://127.0.0.1:3001` porque las cookies de sesion se marcan como `Secure` cuando `NODE_ENV=production`.

## Rollback

Parar staging:

```bash
sudo systemctl disable --now madridlive-app-staging.service
```

Eliminar staging completo solo si se acepta borrar datos de staging:

```bash
sudo systemctl disable --now madridlive-app-staging.service
sudo rm -f /etc/systemd/system/madridlive-app-staging.service
sudo systemctl daemon-reload
sudo rm -rf /opt/madridlive-app-staging
sudo mariadb -e "DROP DATABASE IF EXISTS \`netiadmin_madrid_live_staging\`;"
```

Produccion no debe verse afectada por estas acciones.
