import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import {
  initializeApp as initializeAdminApp,
  applicationDefault,
  cert,
  getApps as getAdminApps,
} from "firebase-admin/app";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { initializeApp as initializeClientApp } from "firebase/app";
import { getFirestore as getClientFirestore, collection, getDocs } from "firebase/firestore";

dotenv.config();

type FirestoreReader = {
  mode: "admin" | "client";
  fetchCollection: (name: string) => Promise<Array<Record<string, unknown>>>;
};

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function loadClientFirebaseConfig() {
  const configPath = process.env.FIREBASE_CONFIG_PATH || path.join(process.cwd(), "firebase-applet-config.json");
  const raw = fs.readFileSync(configPath, "utf8");
  const baseConfig = JSON.parse(raw);

  return {
    apiKey: process.env.VITE_FIREBASE_API_KEY || baseConfig.apiKey,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || baseConfig.authDomain,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || baseConfig.projectId,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || baseConfig.storageBucket,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || baseConfig.messagingSenderId,
    appId: process.env.VITE_FIREBASE_APP_ID || baseConfig.appId,
    measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || baseConfig.measurementId,
    firestoreDatabaseId:
      process.env.VITE_FIREBASE_DATABASE_ID || process.env.FIREBASE_DATABASE_ID || baseConfig.firestoreDatabaseId,
  };
}

function buildAdminReader(): FirestoreReader {
  let adminApp = getAdminApps()[0];
  if (!adminApp) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const projectId = process.env.FIREBASE_PROJECT_ID;

    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      adminApp = initializeAdminApp({
        credential: cert(serviceAccount),
        projectId: projectId || serviceAccount.project_id,
      });
    } else {
      adminApp = initializeAdminApp({
        credential: applicationDefault(),
        projectId,
      });
    }
  }

  const dbId = process.env.FIREBASE_DATABASE_ID || "(default)";
  const fsDb = getAdminFirestore(adminApp, dbId);

  return {
    mode: "admin",
    async fetchCollection(name: string) {
      const snap = await fsDb.collection(name).get();
      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    },
  };
}

function buildClientReader(): FirestoreReader {
  const cfg = loadClientFirebaseConfig();
  const app = initializeClientApp(cfg);
  const fsDb = getClientFirestore(app, cfg.firestoreDatabaseId);

  return {
    mode: "client",
    async fetchCollection(name: string) {
      const snap = await getDocs(collection(fsDb, name));
      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    },
  };
}

async function loadCollections(reader: FirestoreReader) {
  const [staff, events, shifts, alerts] = await Promise.all([
    reader.fetchCollection("staff"),
    reader.fetchCollection("events"),
    reader.fetchCollection("shifts"),
    reader.fetchCollection("alerts"),
  ]);

  return { staff, events, shifts, alerts };
}

async function ensureMysqlSchema(db: any) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS staff (
      id VARCHAR(96) PRIMARY KEY,
      id_code VARCHAR(96) NOT NULL,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(64) NOT NULL,
      role_label VARCHAR(96) NOT NULL,
      status VARCHAR(16) NOT NULL,
      checked_in_time VARCHAR(32) NULL,
      last_seen VARCHAR(128) NULL,
      avatar TEXT NOT NULL,
      total_hours DECIMAL(10,2) NOT NULL DEFAULT 0,
      current_shift_hours INT NOT NULL DEFAULT 0,
      current_shift_mins INT NOT NULL DEFAULT 0,
      location VARCHAR(255) NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS events (
      id VARCHAR(96) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      location VARCHAR(255) NOT NULL,
      date_day VARCHAR(8) NOT NULL,
      date_month VARCHAR(16) NOT NULL,
      doors_open VARCHAR(32) NOT NULL,
      required_staff INT NOT NULL,
      active_staff INT NOT NULL,
      total_staff_needed INT NOT NULL,
      scan_rate INT NOT NULL,
      load_in_percent INT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS shifts (
      id VARCHAR(96) PRIMARY KEY,
      worker_id VARCHAR(96) NOT NULL,
      date_string VARCHAR(64) NOT NULL,
      timespan VARCHAR(128) NOT NULL,
      duration_label VARCHAR(64) NOT NULL,
      location VARCHAR(255) NOT NULL,
      status VARCHAR(32) NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_shifts_worker (worker_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS alerts (
      id VARCHAR(96) PRIMARY KEY,
      message TEXT NOT NULL,
      zone VARCHAR(128) NOT NULL,
      timestamp_label VARCHAR(64) NOT NULL,
      severity VARCHAR(16) NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

function asNumber(value: unknown, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

async function main() {
  const db = mysql.createPool({
    host: requireEnv("MYSQL_HOST"),
    port: Number(process.env.MYSQL_PORT || 3306),
    user: requireEnv("MYSQL_USER"),
    password: process.env.MYSQL_PASSWORD || "",
    database: requireEnv("MYSQL_DATABASE"),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  console.log("[migrate] Starting Firestore -> MySQL migration");
  await ensureMysqlSchema(db);

  let data: {
    staff: Array<Record<string, unknown>>;
    events: Array<Record<string, unknown>>;
    shifts: Array<Record<string, unknown>>;
    alerts: Array<Record<string, unknown>>;
  };

  try {
    const adminReader = buildAdminReader();
    data = await loadCollections(adminReader);
    console.log("[migrate] Firestore source mode: admin");
  } catch (adminError: any) {
    console.warn(`[migrate] Admin reader failed: ${adminError?.message || adminError}`);
    console.warn("[migrate] Retrying with client SDK + firebase-applet-config.json...");

    const clientReader = buildClientReader();
    data = await loadCollections(clientReader);
    console.log("[migrate] Firestore source mode: client");
  }

  const { staff, events, shifts, alerts } = data;
  console.log(`[migrate] Loaded Firestore docs: staff=${staff.length}, events=${events.length}, shifts=${shifts.length}, alerts=${alerts.length}`);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    for (const s of staff) {
      await conn.execute(
        `INSERT INTO staff (id, id_code, name, role, role_label, status, checked_in_time, last_seen, avatar, total_hours, current_shift_hours, current_shift_mins, location)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           id_code = VALUES(id_code), name = VALUES(name), role = VALUES(role), role_label = VALUES(role_label),
           status = VALUES(status), checked_in_time = VALUES(checked_in_time), last_seen = VALUES(last_seen),
           avatar = VALUES(avatar), total_hours = VALUES(total_hours), current_shift_hours = VALUES(current_shift_hours),
           current_shift_mins = VALUES(current_shift_mins), location = VALUES(location)`,
        [
          String(s.id), String((s as any).idCode || ""), String((s as any).name || ""),
          String((s as any).role || "Auxiliar"), String((s as any).roleLabel || "AUXILIAR"),
          String((s as any).status || "OUT"), (s as any).checkedInTime || null, (s as any).lastSeen || null,
          String((s as any).avatar || ""), asNumber((s as any).totalHours, 0), asNumber((s as any).currentShiftHours, 0),
          asNumber((s as any).currentShiftMins, 0), String((s as any).location || "")
        ]
      );
    }

    for (const e of events) {
      await conn.execute(
        `INSERT INTO events (id, title, location, date_day, date_month, doors_open, required_staff, active_staff, total_staff_needed, scan_rate, load_in_percent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           title = VALUES(title), location = VALUES(location), date_day = VALUES(date_day), date_month = VALUES(date_month),
           doors_open = VALUES(doors_open), required_staff = VALUES(required_staff), active_staff = VALUES(active_staff),
           total_staff_needed = VALUES(total_staff_needed), scan_rate = VALUES(scan_rate), load_in_percent = VALUES(load_in_percent)`,
        [
          String(e.id), String((e as any).title || ""), String((e as any).location || ""),
          String((e as any).dateDay || ""), String((e as any).dateMonth || ""), String((e as any).doorsOpen || ""),
          asNumber((e as any).requiredStaff, 0), asNumber((e as any).activeStaff, 0), asNumber((e as any).totalStaffNeeded, 0),
          asNumber((e as any).scanRate, 0), asNumber((e as any).loadInPercent, 0)
        ]
      );
    }


      // Ensure FK integrity for historical shifts whose workers no longer exist in current staff snapshot
      const knownWorkerIds = new Set(staff.map((s) => String((s as any).id)));
      const missingWorkerIds = Array.from(
        new Set(
          shifts
            .map((sh) => String((sh as any).workerId || ""))
            .filter((id) => id && !knownWorkerIds.has(id))
        )
      );

      for (const missingId of missingWorkerIds) {
        await conn.execute(
          `INSERT INTO staff (id, id_code, name, role, role_label, status, checked_in_time, last_seen, avatar, total_hours, current_shift_hours, current_shift_mins, location)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE id = id`,
          [
            missingId,
            `MIG-${missingId}`.slice(0, 20),
            `Migrated Worker ${missingId}`.slice(0, 100),
            "Auxiliar",
            "AUXILIAR",
            "OUT",
            null,
            null,
            "",
            0,
            0,
            0,
            "Unknown",
          ]
        );
      }

      if (missingWorkerIds.length > 0) {
        console.log(`[migrate] Inserted placeholder staff rows for ${missingWorkerIds.length} historical worker IDs.`);
      }
    for (const sh of shifts) {
      await conn.execute(
        `INSERT INTO shifts (id, worker_id, date_string, timespan, duration_label, location, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           worker_id = VALUES(worker_id), date_string = VALUES(date_string), timespan = VALUES(timespan),
           duration_label = VALUES(duration_label), location = VALUES(location), status = VALUES(status)`,
        [
          String(sh.id), String((sh as any).workerId || ""), String((sh as any).dateString || ""),
          String((sh as any).timespan || ""), String((sh as any).durationLabel || ""),
          String((sh as any).location || ""), String((sh as any).status || "Completed")
        ]
      );
    }

    for (const a of alerts) {
      await conn.execute(
        `INSERT INTO alerts (id, message, zone, timestamp_label, severity)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           message = VALUES(message), zone = VALUES(zone), timestamp_label = VALUES(timestamp_label), severity = VALUES(severity)`,
        [
          String(a.id), String((a as any).message || ""), String((a as any).zone || ""),
          String((a as any).timestamp || ""), String((a as any).severity || "info")
        ]
      );
    }

    await conn.commit();
    console.log("[migrate] Migration finished successfully.");
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
    await db.end();
  }
}

main().catch((error) => {
  console.error("[migrate] Failed:", error);
  process.exit(1);
});
