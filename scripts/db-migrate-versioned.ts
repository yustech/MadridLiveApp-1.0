import dotenv from "dotenv";
import { MIGRATIONS } from "../server/mysql/migrations/index";
import { runVersionedMigrations } from "../server/mysql/migrations/runner";
import { getPool } from "../server/mysql/pool";

dotenv.config();

async function main() {
  const pool = getPool();

  try {
    const summary = await runVersionedMigrations(pool, MIGRATIONS);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    if (typeof pool.end === "function") {
      await pool.end();
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
