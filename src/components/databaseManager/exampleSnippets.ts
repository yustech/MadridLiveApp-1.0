import { MariaDbConfig } from './types';

export const MYSQL_SCHEMA_DDL = `-- Esquema real Madrid Live App.
-- Tablas de negocio: staff, events, shifts, alerts.
-- schema_migrations es metadata técnica del runner versionado, no una tabla de negocio.

CREATE TABLE IF NOT EXISTS staff (
  id VARCHAR(96) PRIMARY KEY,
  idCode VARCHAR(20) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(64) NOT NULL,
  roleLabel VARCHAR(96) NOT NULL,
  status VARCHAR(16) NOT NULL,
  checkedInTime VARCHAR(32) NULL,
  lastSeen VARCHAR(128) NULL,
  avatar TEXT NOT NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(32) NULL,
  totalHours DECIMAL(10,2) NOT NULL DEFAULT 0,
  currentShiftHours INT NOT NULL DEFAULT 0,
  currentShiftMins INT NOT NULL DEFAULT 0,
  location VARCHAR(255) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS events (
  id VARCHAR(96) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  location VARCHAR(255) NOT NULL,
  dateDay VARCHAR(8) NOT NULL,
  dateMonth VARCHAR(16) NOT NULL,
  dateYear VARCHAR(8) NULL,
  doorsOpen VARCHAR(32) NOT NULL,
  required_staff INT NOT NULL,
  active_staff INT NOT NULL,
  total_staff_needed INT NOT NULL,
  scan_rate INT NOT NULL,
  load_in_percent INT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shifts (
  id VARCHAR(96) PRIMARY KEY,
  worker_id VARCHAR(96) NOT NULL,
  date_string VARCHAR(64) NOT NULL,
  timespan VARCHAR(128) NOT NULL,
  duration_label VARCHAR(64) NOT NULL,
  event_id VARCHAR(96) NULL,
  event_title VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL,
  started_at DATETIME NULL,
  ended_at DATETIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_shifts_worker (worker_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS alerts (
  id VARCHAR(96) PRIMARY KEY,
  message TEXT NOT NULL,
  zone VARCHAR(128) NOT NULL,
  timestamp_label VARCHAR(64) NOT NULL,
  severity VARCHAR(16) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(32) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  checksum CHAR(64) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  execution_ms INT NOT NULL DEFAULT 0,
  app_version VARCHAR(64) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;

export function buildNodeBridgeSnippet(config: MariaDbConfig) {
  return `// 1. Instalar dependencias en tu proyecto Node.js:
// npm install express mysql2 dotenv

const express = require('express');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();
app.use(express.json());

const pool = mysql.createPool({
  host: '${config.host}',
  port: ${config.port},
  user: '${config.user}',
  password: '${config.password}',
  database: '${config.name}',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
});

function requireAdminToken(req, res, next) {
  const expectedToken = process.env.ADMIN_API_TOKEN || '';
  const receivedToken = req.header('x-admin-token') || '';

  if (!expectedToken || receivedToken !== expectedToken) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  next();
}

// Lectura publica minima de salud: solo conteos, sin datos personales.
app.get('/api/mysql/health-count', async (_req, res) => {
  const [rows] = await pool.query(\`
    SELECT
      (SELECT COUNT(*) FROM staff) AS staffCount,
      (SELECT COUNT(*) FROM events) AS eventsCount,
      (SELECT COUNT(*) FROM shifts) AS shiftsCount,
      (SELECT COUNT(*) FROM alerts) AS alertsCount
  \`);

  res.json({ success: true, counts: rows[0] });
});

// Lecturas de negocio protegidas por token admin.
app.get('/api/mysql/staff', requireAdminToken, async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM staff ORDER BY name ASC');
  res.json(rows);
});

app.get('/api/mysql/events', requireAdminToken, async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM events ORDER BY title ASC');
  res.json(rows);
});

app.listen(3000, () => {
  console.log('Bridge MySQL iniciado en puerto 3000');
});`;
}

export function buildNodeBridgePreview(config: MariaDbConfig) {
  return `// Servidor Express Bridge de Producción
const express = require('express');
const mysql = require('mysql2/promise');

const app = express();
app.use(express.json());

const pool = mysql.createPool({
  host: '${config.host}',
  port: ${config.port},
  user: '${config.user}',
  password: '${config.password}',
  database: '${config.name}',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4'
});

function requireAdminToken(req, res, next) {
  const expectedToken = process.env.ADMIN_API_TOKEN || '';
  const receivedToken = req.header('x-admin-token') || '';

  if (!expectedToken || receivedToken !== expectedToken) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  next();
}

app.get('/api/mysql/health-count', async (_req, res) => {
  const [rows] = await pool.query(\`
    SELECT
      (SELECT COUNT(*) FROM staff) AS staffCount,
      (SELECT COUNT(*) FROM events) AS eventsCount,
      (SELECT COUNT(*) FROM shifts) AS shiftsCount,
      (SELECT COUNT(*) FROM alerts) AS alertsCount
  \`);
  res.json({ success: true, counts: rows[0] });
});

app.get('/api/mysql/staff', requireAdminToken, async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM staff ORDER BY name ASC');
  res.json(rows);
});`;
}
