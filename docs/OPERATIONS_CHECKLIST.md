# Operations Checklist

Checklist operativa ligera para MadridLive App (equipo pequeño).

## Mensual (3 minutos)

1. Verificar que el timer del watchdog está activo.
   ```bash
   sudo systemctl status madridlive-watchdog.timer --no-pager
   ```
2. Revisar últimas ejecuciones del watchdog.
   ```bash
   sudo journalctl -u madridlive-watchdog.service --since "30 days ago" --no-pager | tail -n 50
   ```
3. Lanzar prueba manual del webhook de Teams.
   ```bash
   python3 - <<'PY'
   import json, urllib.request
   from pathlib import Path

   kv = {}
   for line in Path('/opt/madridlive-app/.env').read_text().splitlines():
       if '=' in line and not line.strip().startswith('#'):
           k, v = line.split('=', 1)
           kv[k.strip()] = v.strip()

   url = kv.get('WATCHDOG_ALERT_WEBHOOK', '')
   payload = json.dumps({"text": "[MadridLive] Test mensual watchdog OK"}).encode()
   req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")

   with urllib.request.urlopen(req, timeout=12) as r:
       print("HTTP", r.getcode())
   PY
   ```
4. Confirmar que el mensaje aparece en Teams.

## Post-Deploy (2 minutos)

1. Ejecutar smoke test público.
   ```bash
   cd /home/opsadmin/MadridLiveApp-1.0 && npm run smoke:prod
   ```
2. Confirmar health endpoint público.
   ```bash
   curl -fsS https://inmosubastas.top/api/health
   ```
3. Confirmar que watchdog sigue activo.
   ```bash
   sudo systemctl status madridlive-watchdog.timer --no-pager
   ```

## Respuesta ante fallo

1. Revisar logs del servicio principal.
   ```bash
   sudo journalctl -u madridlive-app.service --since "30 min ago" --no-pager | tail -n 200
   ```
2. Revisar logs del watchdog.
   ```bash
   sudo journalctl -u madridlive-watchdog.service --since "30 min ago" --no-pager | tail -n 100
   ```
3. Si el problema apareció tras deploy, ejecutar rollback.

## Seguridad

1. Mantener `WATCHDOG_ALERT_WEBHOOK` solo en `/opt/madridlive-app/.env`.
2. Regenerar webhook si se comparte fuera de canales seguros.
