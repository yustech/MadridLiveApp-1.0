# DR Restore Runbook — MadridLiveApp

Runbook de recuperación ante desastre de la base de datos, validado con un drill real
el **2026-07-23** (restauración completa desde la copia de Google Drive a una BD limpia,
con verificación de datos). Mantener este documento al día si cambia la cadena de backup.

## Cadena de backup (estado verificado 2026-07-23)

| Paso | Cuándo (UTC) | Qué | Destino |
|---|---|---|---|
| Dump prod | 03:10 diario (cron) | `scripts/backup-mysql.sh` (mysqldump gzip) | `/opt/madridlive-app/backups/db-<db>-<ts>.sql.gz` |
| Sync prod → Drive | 03:25 diario (cron) | `scripts/backup-sync-gdrive.sh` (rclone copy) | `gdrive:Backups/MadridLiveApp-1.0/` |
| Dump staging | 03:40 diario (cron) | ídem con `ENV_FILE`/`BACKUP_DIR` de staging | `/opt/madridlive-app-staging/backups/` |
| Sync staging → Drive | 03:55 diario (cron) | ídem | `gdrive:Backups/MadridLiveApp-1.0-staging/` |

- Retención local: `KEEP_DAILY=14` (rotación en el propio script).
- Retención en Drive: **ilimitada a propósito** (`rclone copy` no borra el remoto) — da
  más histórico offsite; cada dump ocupa ~40 KB.
- Los `.env` están **excluidos** del sync a Drive desde 2026-07-13 (PR #35) por contener
  secretos en claro.

## Procedimiento de restauración (validado en el drill)

Caso peor asumido: la caja se ha perdido; solo existe la copia de Drive.

1. **Descargar el último dump desde Drive** (desde cualquier máquina con el rclone
   configurado contra la cuenta de Drive):
   ```bash
   rclone lsl gdrive:Backups/MadridLiveApp-1.0/ | sort -k2 | tail -5   # elegir el último db-*.sql.gz
   rclone copy gdrive:Backups/MadridLiveApp-1.0/db-<db>-<ts>.sql.gz ./
   ```
2. **Verificar integridad antes de restaurar**:
   ```bash
   gunzip -t db-<db>-<ts>.sql.gz                      # gzip íntegro
   zcat db-<db>-<ts>.sql.gz | tail -2                  # debe acabar en "-- Dump completed on ..."
   ```
3. **Crear la BD destino** (Hestia → DB → Add Database, o `mysql -e "CREATE DATABASE ..."`).
4. **Restaurar**:
   ```bash
   zcat db-<db>-<ts>.sql.gz | mysql -h 127.0.0.1 -u <user> -p <db_destino>
   ```
   El dump incluye `CREATE TABLE` + datos + índices; no requiere esquema previo.
5. **Validar** (checklist mínimo, valores esperados a fecha del drill):
   - Conteos por tabla coherentes con el último `/api/mysql/health-count` conocido
     (drill: staff 901, users 1 admin/active).
   - `SELECT version, name, SUBSTRING(checksum,1,8) FROM schema_migrations ORDER BY version;`
     → todas las migraciones (`0000`…`0005` a fecha del drill) con sus checksums.
   - Índices de la 0001 presentes: `SHOW INDEX FROM shifts;` → `idx_shifts_worker_status_started`,
     `idx_shifts_worker_started_ended`, `idx_shifts_status_worker`.
   - Unicode intacto: `SELECT COUNT(*) FROM staff WHERE name LIKE BINARY '%ü%';` (drill: 2,
     ML-0461 y ML-0653).
6. **Apuntar la app a la BD restaurada** (`MYSQL_DATABASE` en `.env`) y reiniciar el servicio.

### Resultado del drill 2026-07-23

- Copia de Drive **byte-idéntica** a la local (sha256 verificado).
- Restauración del dump: **< 1 s** (BD pequeña); validación completa: todos los checks
  anteriores en verde a la primera.
- BD y usuario del drill eliminados al terminar.

## Recuperación completa de la caja (más allá de la BD)

La BD es lo único con backup automatizado offsite. Para una pérdida total de la caja
hace falta además:

1. **Repo**: `git clone` de `yustech/MadridLiveApp-1.0` (GitHub es el origen; nada que
   restaurar).
2. **`.env` de prod y staging**: ⚠️ **NO tienen copia offsite** (excluidos del sync por
   secretos). Deben poder reconstruirse desde el gestor de contraseñas del owner:
   credenciales MySQL, `ADMIN_API_TOKEN`, `ADMIN_LOGIN_EMAIL`/`_PASSWORD`,
   `ADMIN_SESSION_SECRET`, bloque `MAIL_*` (buzón `hola@`), `WATCHDOG_MIN_STAFF_COUNT`,
   `EXPECTED_STAFF_COUNT`. Mantener el gestor al día con cualquier cambio de `.env`.
3. **Infra**: Hestia (dominios web + mail + certs LE), systemd units
   (`madridlive-app`, `madridlive-app-staging`, `madridlive-watchdog`), sudoers rule de
   restart, node_modules (`npm ci`), crons de backup (este documento, tabla de arriba).
4. **Deploy**: build desde main + patrón de deploy manual documentado en el repo
   (`docs/` y scripts de `scripts/`).

## Hallazgos del drill (2026-07-23) y estado

- ✅ Cadena dump→Drive funcionando y verificada end-to-end.
- ⚠️ **Snapshots `env-*.tar.gz` antiguos en Drive** (previos a la exclusión de PR #35),
  con secretos en claro de julio de 2026 → **borrarlos de Drive** y, si se quiere
  defensa extra, rotar los secretos que contenían. (Acción registrada el mismo día.)
- ⚠️ **`.env` sin copia offsite**: mitigado solo si el gestor de contraseñas del owner
  está completo y al día (ver sección anterior). Alternativa futura: snapshot cifrado
  (age/gpg) antes del sync.
- ℹ️ Drive acumula dumps sin límite (retención extra deliberada; ~40 KB/día).
