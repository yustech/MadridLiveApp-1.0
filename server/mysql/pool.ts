import mysql from "mysql2/promise";

export function isMysqlConfigured() {
  return Boolean(process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE);
}

let pool: any = null;

export function getPool() {
  if (!pool) {
    if (!isMysqlConfigured()) {
      throw new Error("MySQL is not configured. Set MYSQL_HOST, MYSQL_USER and MYSQL_DATABASE.");
    }

    pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD || "",
      database: process.env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: "utf8mb4",
      timezone: "Z",
    });
  }
  return pool;
}
