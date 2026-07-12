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

1. Crear DNS externo `staging.inmosubastas.top -> 82.223.139.217`.
   - El dominio usa AliDNS (`ns7.alidns.com`, `ns8.alidns.com`), asi que crear registros DNS en Hestia local no basta.
2. Crear vhost/proxy hacia `http://127.0.0.1:3001`.
3. Emitir certificado TLS cuando el DNS ya resuelva.
4. Ejecutar smoke:

```bash
SITE_URL=https://staging.inmosubastas.top npm run smoke:staging
```

Hasta tener HTTPS, el login UI en navegador puede fallar contra `http://127.0.0.1:3001` porque las cookies de sesion se marcan como `Secure` cuando `NODE_ENV=production`.

Plan del proxy publico:

```bash
npm run ops:staging-public:plan
```

Aplicar proxy HTTP publico:

```bash
sudo npm run ops:staging-public:apply
```

Mientras el DNS no exista, se puede probar el proxy con resolucion local forzada:

```bash
curl --resolve staging.inmosubastas.top:80:82.223.139.217 \
  -fsS http://staging.inmosubastas.top/api/health
```

Cuando el DNS ya resuelva, emitir el certificado TLS:

```bash
npm run ops:staging-cert:plan
sudo npm run ops:staging-cert:issue
```

Opcionalmente se puede pasar un email de contacto a Let's Encrypt:

```bash
sudo LETSENCRYPT_EMAIL=admin@example.com npm run ops:staging-cert:issue
```

El script instala `certbot` si falta, emite el certificado por `webroot` en
`/var/www/letsencrypt` y vuelve a aplicar el proxy publico para activar HTTPS.

Verificacion publica tras TLS:

```bash
curl -I https://staging.inmosubastas.top
SITE_URL=https://staging.inmosubastas.top npm run smoke:staging
```

El plan distingue ahora entre certificado ausente y ruta inaccesible por
permisos. Si se ejecuta sin root y `/etc/letsencrypt/live` no es atravesable,
puede mostrar:

```text
tls_status=certificate_inaccessible
public_tls_status=serving_valid_certificate
```

Ese estado significa que nginx esta sirviendo TLS correctamente, aunque el
usuario actual no pueda leer la ruta local del certificado.

## Deploy Staging-First

Para validar una release en staging antes de tocar produccion:

```bash
npm run deploy:staging-first
```

El comando:

- Exige worktree limpio por defecto.
- Ejecuta `npm run build`.
- Genera `dist/build-info.json` con el SHA exacto de Git.
- Aplica staging con `scripts/setup-staging.sh --apply`.
- Ejecuta smoke local y publico contra staging con `EXPECTED_COMMIT_SHA`.
- No despliega produccion.

Para desplegar produccion solo despues de que staging este verde:

```bash
npm run deploy:staging-first:prod
```

Este modo requiere las variables `DEPLOY_*` fuera del repo y reutiliza
`scripts/deploy.sh`. Tras produccion, `npm run smoke:prod` tambien valida
`EXPECTED_COMMIT_SHA`.

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
