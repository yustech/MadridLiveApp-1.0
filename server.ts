import fs from "fs";
import crypto from "crypto";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import path from "path";
import { createServer as createViteServer } from "vite";
import mysql from "mysql2/promise";
import { registerMysqlApi } from "./mysqlApi";
import { formatMadridTime } from "./src/utils/madridTime";

dotenv.config();

const DB_TEST_WINDOW_MS = 60_000;
const DB_TEST_MAX_REQUESTS = 10;
const LOGIN_WINDOW_MS = 15 * 60_000;
const LOGIN_MAX_FAILED_ATTEMPTS = 5;
const AUTH_COOKIE_NAME = "ml_admin_session";
const AUTH_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const dbTestRateLimits = new Map<string, { count: number; windowStart: number }>();
const loginFailureTracker = new Map<string, { count: number; windowStart: number }>();
const historyFilterTelemetry = new Map<string, number>();

// Requires app.set("trust proxy", ...) so req.ip reflects the real client
// (nginx-forwarded) address instead of a client-spoofable X-Forwarded-For value.
function getClientIp(req: express.Request) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function isRateLimited(
  store: Map<string, { count: number; windowStart: number }>,
  key: string,
  windowMs: number,
  maxRequests: number,
) {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return false;
  }

  entry.count += 1;
  return entry.count > maxRequests;
}

// Only failed attempts count against the login lockout -- repeated
// successful logins (e.g. multiple e2e tests, multiple browser tabs) must
// never trip this, only actual brute-force guessing should.
function isLoginLocked(ip: string) {
  const entry = loginFailureTracker.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.windowStart > LOGIN_WINDOW_MS) return false;
  return entry.count >= LOGIN_MAX_FAILED_ATTEMPTS;
}

function recordFailedLogin(ip: string) {
  const now = Date.now();
  const entry = loginFailureTracker.get(ip);
  if (!entry || now - entry.windowStart > LOGIN_WINDOW_MS) {
    loginFailureTracker.set(ip, { count: 1, windowStart: now });
    return;
  }
  entry.count += 1;
}

function clearLoginFailures(ip: string) {
  loginFailureTracker.delete(ip);
}

function getCookieValue(req: express.Request, name: string) {
  const cookieHeader = req.headers.cookie || "";
  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
  const prefix = `${name}=`;
  const match = cookies.find((cookie) => cookie.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : "";
}

function getSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_API_TOKEN || "";
}

function timingSafeEqualString(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function signSessionPayload(email: string, expiresAt: number) {
  const secret = getSessionSecret();
  if (!secret) return "";
  return crypto
    .createHmac("sha256", secret)
    .update(`${email}.${expiresAt}`)
    .digest("base64url");
}

function buildSessionValue(email: string, expiresAt: number) {
  const normalizedEmail = email.trim().toLowerCase();
  const signature = signSessionPayload(normalizedEmail, expiresAt);
  if (!signature) return "";
  return `${Buffer.from(normalizedEmail).toString("base64url")}.${expiresAt}.${signature}`;
}

function verifyAdminSession(req: express.Request) {
  const rawSession = getCookieValue(req, AUTH_COOKIE_NAME);
  if (!rawSession) return false;

  const [encodedEmail, expiresAtRaw, signature] = rawSession.split(".");
  const expiresAt = Number(expiresAtRaw);
  if (!encodedEmail || !Number.isFinite(expiresAt) || !signature || expiresAt <= Date.now()) {
    return false;
  }

  let email = "";
  try {
    email = Buffer.from(encodedEmail, "base64url").toString("utf8").trim().toLowerCase();
  } catch {
    return false;
  }

  const expectedSignature = signSessionPayload(email, expiresAt);
  return Boolean(expectedSignature) && timingSafeEqualString(signature, expectedSignature);
}

function buildSessionCookie(value: string, maxAgeSeconds: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${AUTH_COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

function clearSessionCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

function isAdminTokenAuthorized(req: express.Request) {
  const expectedToken = process.env.ADMIN_API_TOKEN;
  if (!expectedToken) return false;

  const providedToken = req.header("x-admin-token");
  return providedToken === expectedToken;
}

function isDbTestAuthorized(req: express.Request) {
  const expectedToken = process.env.ADMIN_API_TOKEN;
  if (!expectedToken) {
    return verifyAdminSession(req);
  }

  return isAdminTokenAuthorized(req) || verifyAdminSession(req);
}

function isAdminRequestAuthorized(req: express.Request) {
  return isAdminTokenAuthorized(req) || verifyAdminSession(req);
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
  const HOST = process.env.HOST || "127.0.0.1";

  // Trust exactly one hop (nginx on this box) so req.ip / req.secure reflect
  // the real client instead of a spoofable X-Forwarded-For header.
  app.set("trust proxy", 1);

  const isProduction = process.env.NODE_ENV === "production";

  // Security headers. The CSP is only enforced in production: the Vite dev
  // middleware needs inline scripts, eval and websockets for HMR.
  app.use(
    helmet({
      contentSecurityPolicy: isProduction
        ? {
            useDefaults: false,
            directives: {
              "default-src": ["'self'"],
              "script-src": ["'self'"],
              // 'unsafe-inline' covers React/Tailwind style attributes;
              // Google Fonts is @import-ed from src/index.css.
              "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
              "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
              // Demo avatars (Unsplash / Google) + QR images (api.qrserver.com);
              // blob:/data: for camera frames and generated previews.
              "img-src": [
                "'self'",
                "data:",
                "blob:",
                "https://images.unsplash.com",
                "https://lh3.googleusercontent.com",
                "https://api.qrserver.com",
              ],
              "connect-src": ["'self'"],
              // html5-qrcode decodes camera frames in blob: workers.
              "worker-src": ["'self'", "blob:"],
              "media-src": ["'self'", "blob:"],
              "object-src": ["'none'"],
              "base-uri": ["'self'"],
              "form-action": ["'self'"],
              "frame-ancestors": ["'self'"],
            },
          }
        : false,
    })
  );

  // Explicit CORS for the API: only the real browser origins may do
  // cross-origin calls. Same-origin and non-browser requests (curl, CI
  // smoke tests) carry no Origin header and pass through untouched.
  const corsAllowlist = (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (corsAllowlist.length === 0) {
    corsAllowlist.push(
      "https://madridliveapp.top",
      "https://www.madridliveapp.top",
      "https://staging.madridliveapp.top"
    );
  }
  app.use(
    "/api",
    cors({
      origin: (origin, callback) => {
        callback(null, !origin || corsAllowlist.includes(origin));
      },
      credentials: true,
    })
  );

  // Middleware to parse JSON
  app.use(express.json());

  app.post("/api/auth/login", (req, res) => {
    const clientIp = getClientIp(req);
    if (isLoginLocked(clientIp)) {
      return res.status(429).json({
        success: false,
        message: "Demasiados intentos. Inténtalo de nuevo más tarde.",
      });
    }

    const configuredEmail = process.env.ADMIN_LOGIN_EMAIL?.trim().toLowerCase();
    const configuredPassword = process.env.ADMIN_LOGIN_PASSWORD || "";
    const sessionSecret = getSessionSecret();

    if (!configuredEmail || !configuredPassword || !sessionSecret) {
      return res.status(503).json({
        success: false,
        message: "Admin authentication is not configured.",
      });
    }

    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const emailMatches = timingSafeEqualString(email, configuredEmail);
    const passwordMatches = timingSafeEqualString(password, configuredPassword);

    if (!emailMatches || !passwordMatches) {
      recordFailedLogin(clientIp);
      return res.status(401).json({
        success: false,
        message: "Invalid credentials.",
      });
    }

    clearLoginFailures(clientIp);
    const expiresAt = Date.now() + AUTH_SESSION_TTL_MS;
    const sessionValue = buildSessionValue(email, expiresAt);
    if (!sessionValue) {
      return res.status(503).json({
        success: false,
        message: "Admin session signing is not configured.",
      });
    }

    res.setHeader("Set-Cookie", buildSessionCookie(sessionValue, Math.floor(AUTH_SESSION_TTL_MS / 1000)));
    res.setHeader("Cache-Control", "no-store");
    return res.json({ success: true, expiresAt });
  });

  app.get("/api/auth/session", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    return res.json({ authenticated: verifyAdminSession(req) });
  });

  app.post("/api/auth/logout", (_req, res) => {
    res.setHeader("Set-Cookie", clearSessionCookie());
    res.setHeader("Cache-Control", "no-store");
    return res.json({ success: true });
  });

  // MySQL business CRUD API. Browser admin uses signed cookies; scripts/CI can still use x-admin-token.
  registerMysqlApi(app, { isAdminAuthorized: isAdminRequestAuthorized });

  // API Route: Test MariaDB Connection
  app.post("/api/test-mariadb", async (req, res) => {
    const { host, port, user, password, database, name } = req.body;
    const dbName = database || name;
    const clientIp = getClientIp(req);

    if (isRateLimited(dbTestRateLimits, clientIp, DB_TEST_WINDOW_MS, DB_TEST_MAX_REQUESTS)) {
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
    const clockLabel = () => formatMadridTime(new Date());
    logMessages.push(`[${clockLabel()}] Iniciando prueba de conexión hacia ${host}:${parsedPort}...`);

    let connection: any = null;
    try {
      logMessages.push(`[${clockLabel()}] Intentando establecer socket TCP (timeout: 5s)...`);

      connection = await mysql.createConnection({
        host,
        port: parsedPort,
        user,
        password: password || "",
        database: dbName || undefined,
        connectTimeout: 5000,
        timezone: "Z",
      });

      logMessages.push(`[${clockLabel()}] ¡Conexión TCP establecida correctamente!`);
      logMessages.push(`[${clockLabel()}] Ejecutando consulta de verificación: SELECT VERSION();`);

      const [rows] = await connection.execute("SELECT VERSION() as version");
      const version = (rows as any[])[0]?.version || "Desconocida";

      logMessages.push(`[${clockLabel()}] Versión del servidor detectada: ${version}`);

      if (dbName) {
        logMessages.push(`[${clockLabel()}] Verificando acceso a la base de datos: "${dbName}"...`);
        await connection.query("USE ??", [dbName]);
        logMessages.push(`[${clockLabel()}] ¡Acceso a "${dbName}" confirmado!`);
      }

      logMessages.push(`[${clockLabel()}] Conexión verificada correctamente.`);
      return res.json({
        success: true,
        message: "¡Conexión exitosa a tu base de datos MariaDB!",
        version,
        logs: logMessages,
      });
    } catch (err: any) {
      logMessages.push(`[${clockLabel()}] ❌ ERROR: ${err.message}`);

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

  app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  });
}

startServer();
