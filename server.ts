import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import mysql from "mysql2/promise";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware to parse JSON
  app.use(express.json());

  // API Route: Test MariaDB Connection
  app.post("/api/test-mariadb", async (req, res) => {
    const { host, port, user, password, database, name } = req.body;
    const dbName = database || name;

    if (!host || !user) {
      return res.status(400).json({
        success: false,
        message: "Faltan parámetros obligatorios de conexión (Host o Usuario).",
      });
    }

    const logMessages: string[] = [];
    logMessages.push(`[${new Date().toLocaleTimeString()}] Iniciando prueba de conexión hacia ${host}:${port || 3306}...`);

    try {
      logMessages.push(`[${new Date().toLocaleTimeString()}] Intentando establecer socket TCP (timeout: 5s)...`);
      
      const connection = await mysql.createConnection({
        host,
        port: port ? parseInt(port, 10) : 3306,
        user,
        password: password || "",
        database: dbName || undefined,
        connectTimeout: 5000, // 5 segundos de timeout para evitar cuelgues
      });

      logMessages.push(`[${new Date().toLocaleTimeString()}] ¡Conexión TCP establecida correctamente!`);
      logMessages.push(`[${new Date().toLocaleTimeString()}] Ejecutando consulta de verificación: SELECT VERSION();`);
      
      const [rows] = await connection.execute("SELECT VERSION() as version");
      const version = (rows as any[])[0]?.version || "Desconocida";
      
      logMessages.push(`[${new Date().toLocaleTimeString()}] Versión del servidor detectada: ${version}`);
      
      // Let's also check if database exists or can be accessed
      if (dbName) {
        logMessages.push(`[${new Date().toLocaleTimeString()}] Verificando acceso a la base de datos: "${dbName}"...`);
        await connection.query(`USE \`${dbName}\``);
        logMessages.push(`[${new Date().toLocaleTimeString()}] ¡Acceso a "${dbName}" confirmado!`);
      }

      await connection.end();
      logMessages.push(`[${new Date().toLocaleTimeString()}] Conexión cerrada limpiamente.`);

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
    }
  });

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
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
