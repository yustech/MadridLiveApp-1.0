import fs from "fs";
import dotenv from "dotenv";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import mysql from "mysql2/promise";
import { registerMysqlApi } from "./mysqlApi";

dotenv.config();

const DB_TEST_WINDOW_MS = 60_000;
const DB_TEST_MAX_REQUESTS = 10;
const dbTestRateLimits = new Map<string, { count: number; windowStart: number }>();
const historyFilterTelemetry = new Map<string, number>();

function getClientIp(req: express.Request) {
  const forwarded = req.headers["x-forwarded-for"];
  const firstForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
  return (firstForwarded || req.socket.remoteAddress || "unknown").trim();
}

function isRateLimited(ip: string) {
  const now = Date.now();
  const entry = dbTestRateLimits.get(ip);
  if (!entry || now - entry.windowStart > DB_TEST_WINDOW_MS) {
    dbTestRateLimits.set(ip, { count: 1, windowStart: now });
    return false;
  }

  entry.count += 1;
  return entry.count > DB_TEST_MAX_REQUESTS;
}

function isDbTestAuthorized(req: express.Request) {
  const expectedToken = process.env.ADMIN_API_TOKEN;
  if (!expectedToken) {
    return true;
  }

  const providedToken = req.header("x-admin-token");
  return providedToken === expectedToken;
}

function isValidHost(host: string) {
  return /^[a-zA-Z0-9.-]+$/.test(host);
}

function isValidDatabaseName(name: string) {
  return /^[a-zA-Z0-9_-]+$/.test(name);
}


function readBuildInfo() {
  const fallback = {
    commitSha: process.env.GIT_COMMIT_SHA || "unknown",
    generatedAt: null,
    source: "runtime-fallback",
  };

  try {
    const buildInfoPath = path.join(process.cwd(), "dist", "build-info.json");
    const raw = fs.readFileSync(buildInfoPath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ...fallback,
      ...parsed,
      source: parsed.source || "build-info.json",
    };
  } catch {
    return fallback;
  }
}


async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  // Middleware to parse JSON
  app.use(express.json());

  // Phase 1 migration: MySQL business CRUD API (kept in parallel with Firestore frontend)
  registerMysqlApi(app);

  // API Route: Test MariaDB Connection
  app.post("/api/test-mariadb", async (req, res) => {
    const { host, port, user, password, database, name } = req.body;
    const dbName = database || name;
    const clientIp = getClientIp(req);

    if (isRateLimited(clientIp)) {
      return res.status(429).json({
        success: false,
        message: "Demasiadas solicitudes. Inténtalo de nuevo en un minuto.",
      });
    }

    if (!isDbTestAuthorized(req)) {
      return res.status(401).json({
        success: false,
        message: "No autorizado para usar esta operación.",
      });
    }

    if (!host || !user) {
      return res.status(400).json({
        success: false,
        message: "Faltan parámetros obligatorios de conexión (Host o Usuario).",
      });
    }

    if (!isValidHost(host)) {
      return res.status(400).json({
        success: false,
        message: "Host inválido.",
      });
    }

    const parsedPort = port ? parseInt(String(port), 10) : 3306;
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      return res.status(400).json({
        success: false,
        message: "Puerto inválido.",
      });
    }

    if (dbName && !isValidDatabaseName(dbName)) {
      return res.status(400).json({
        success: false,
        message: "Nombre de base de datos inválido.",
      });
    }

    const logMessages: string[] = [];
    logMessages.push(`[${new Date().toLocaleTimeString()}] Iniciando prueba de conexión hacia ${host}:${parsedPort}...`);

    let connection: any = null;
    try {
      logMessages.push(`[${new Date().toLocaleTimeString()}] Intentando establecer socket TCP (timeout: 5s)...`);

      connection = await mysql.createConnection({
        host,
        port: parsedPort,
        user,
        password: password || "",
        database: dbName || undefined,
        connectTimeout: 5000,
      });

      logMessages.push(`[${new Date().toLocaleTimeString()}] ¡Conexión TCP establecida correctamente!`);
      logMessages.push(`[${new Date().toLocaleTimeString()}] Ejecutando consulta de verificación: SELECT VERSION();`);

      const [rows] = await connection.execute("SELECT VERSION() as version");
      const version = (rows as any[])[0]?.version || "Desconocida";

      logMessages.push(`[${new Date().toLocaleTimeString()}] Versión del servidor detectada: ${version}`);

      if (dbName) {
        logMessages.push(`[${new Date().toLocaleTimeString()}] Verificando acceso a la base de datos: "${dbName}"...`);
        await connection.query("USE ??", [dbName]);
        logMessages.push(`[${new Date().toLocaleTimeString()}] ¡Acceso a "${dbName}" confirmado!`);
      }

      logMessages.push(`[${new Date().toLocaleTimeString()}] Conexión verificada correctamente.`);
      return res.json({
        success: true,
        message: "¡Conexión exitosa a tu base de datos MariaDB!",
        version,
        logs: logMessages,
      });
    } catch (err: any) {
      logMessages.push(`[${new Date().toLocaleTimeString()}] ❌ ERROR: ${err.message}`);

      let clientAdvice = "Verifica los parámetros y que la base de datos esté activa.";
      if (err.code === "ETIMEDOUT" || err.code === "ENOTFOUND") {
        clientAdvice = "El servidor no responde. Asegúrate de que el puerto 3306 esté abierto en el firewall de tu hosting/servidor y que MariaDB escuche en 0.0.0.0 (bind-address).";
      } else if (err.code === "ER_ACCESS_DENIED_ERROR") {
        clientAdvice = "Acceso denegado. Comprueba que el usuario y la contraseña sean correctos y que tenga permisos para conectarse desde cualquier host ('%').";
      } else if (err.code === "ER_BAD_DB_ERROR") {
        clientAdvice = "La base de datos especificada no existe en el servidor.";
      }

      return res.status(500).json({
        success: false,
        message: err.message,
        code: err.code,
        advice: clientAdvice,
        logs: logMessages,
      });
    } finally {
      if (connection) {
        await connection.end().catch(() => undefined);
      }
    }
  });

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/version", (req, res) => {
    const buildInfo = readBuildInfo();
    res.json({
      status: "ok",
      app: "Madrid Live Access",
      ...buildInfo,
    });
  });

  app.post('/api/telemetry/history-filters', (req, res) => {
    const payload = req.body || {};
    const filters = payload.filters || {};

    const keys = [
      `timeScope:${filters.selectedTimeScope || 'All'}`,
      `sortMode:${filters.sortMode || 'Newest'}`,
      `pageSize:${String(filters.pageSize || 10)}`,
      filters.selectedDate && filters.selectedDate !== 'All' ? `datePreset:custom` : 'datePreset:none',
      filters.customDateFrom || filters.customDateTo ? 'dateRange:custom' : 'dateRange:none',
    ];

    for (const key of keys) {
      historyFilterTelemetry.set(key, (historyFilterTelemetry.get(key) || 0) + 1);
    }

    return res.json({ success: true });
  });

  app.get('/api/telemetry/history-filters', (_req, res) => {
    const summary = Array.from(historyFilterTelemetry.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([metric, count]) => ({ metric, count }));
    return res.json({ summary });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
